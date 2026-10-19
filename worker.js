// ═══════════════════════════════════════════════════════════════
// OREGANO DASHBOARD WORKER
// Handles authentication, session tracking with IP logging, and
// admin endpoints (kick/ban). Static assets served via env.ASSETS.
//
// KV namespace required: SESSIONS  (configured in wrangler.toml)
// Key conventions:
//   session:<sessionId>   → JSON of session details, TTL refreshed by heartbeat
//   event:<ts>:<rand>     → JSON of historical event (login_success, login_failed,
//                           logout, admin_kick, admin_ban, admin_unban)
//   banned:<user>         → JSON of ban metadata (reason, who, when)
//   orderdata:<agg>       → JSON {metadata, records, updatedAt, updatedBy} of the parsed
//                           aggregator order upload (keeta/careem/talabat/deliveroo/noon).
//                           Written by ADMIN uploads only; read by every logged-in user so
//                           all users see identical exact-order data. No TTL — persists until
//                           replaced by a newer upload or explicitly cleared (which clears
//                           for everyone, by design).
//   forecast:<ts>:<rand>  → JSON of a SAVED Campaign Forecaster snapshot (only written when
//                           the user explicitly clicks "Save this forecast" — never on every
//                           Run Forecast click, to keep the log meaningful and quota-cheap).
//                           Tagged with the dashboard's BUILD_VERSION at save time so a future
//                           algorithm change never gets silently misread as "what the model
//                           predicted" under different logic.
//   pos:creds             → JSON {user, pass, setBy, setAt} — Microsys (Kull ERP) login used by
//                           POS Sync. Entered once from the dashboard; never sent back to any
//                           browser (only "is it set / who set it / when").
//   pos:msys              → JSON {cookies, ts} — cached Microsys login session (15 min TTL) so
//                           a multi-day pull doesn't sign in again for every step.
//   pos:log:<ts>:<rand>   → JSON of one POS Sync run/test (who, what, result). 180-day TTL.
// ═══════════════════════════════════════════════════════════════

// User directory. Edit here to add/remove users — these passwords are NEVER
// shipped to clients (this code only runs on Cloudflare's edge).
const AUTH_USERS = {
  "nikhil":   { password: "oregano2020", displayName: "Nikhil",   initials: "N",  admin: true },
  "biju":     { password: "oregano2021", displayName: "Biju",     initials: "B" },
  "tony":     { password: "oregano2022", displayName: "Tony",     initials: "T" },
  "rijeesh":  { password: "oregano2023", displayName: "Rijeesh",  initials: "R" },
  "nicole":   { password: "oregano2024", displayName: "Nicole",   initials: "N" },
  "arun":     { password: "oregano2025", displayName: "Arun",     initials: "A" },
  "admin":    { password: "admin2026",       displayName: "Admin",    initials: "A" },
  "bd":       { password: "oregano2027", displayName: "BD Team",  initials: "BD" }
};

const SESSION_TTL_SECONDS = 86400; // 24 hours — refreshed by 60s heartbeats. Was 300 (5 min) which caused frequent logouts when tab was backgrounded or phone screen turned off.

// ─── helpers ─────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function clientIP(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function clientUA(request) {
  return (request.headers.get("User-Agent") || "unknown").slice(0, 200);
}

async function logEvent(env, ev) {
  const ts = new Date().toISOString();
  ev.ts = ts;
  // Use ISO timestamp + random suffix as key so sorted descending gives most recent first
  const key = `event:${ts}:${crypto.randomUUID().slice(0, 8)}`;
  // Keep event log for 90 days then auto-delete (KV TTL)
  await env.SESSIONS.put(key, JSON.stringify(ev), { expirationTtl: 60 * 60 * 24 * 90 });
}

async function isBanned(env, user) {
  const v = await env.SESSIONS.get(`banned:${user}`);
  return v != null;
}

// v580: which system a login comes from (Windows / macOS / iPhone / iPad / Android …) and which browser
function deviceOf(ua) {
  ua = String(ua || "");
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows NT/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux" : "Unknown";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  return { os, browser };
}
// v580: one system per login — the newest sign-in wins and the older system is signed out within a minute.
// Nikhil may stay signed in on his phone and laptop at the same time.
const MULTI_DEVICE_USERS = new Set(["nikhil"]);
async function replaceOtherSessions(env, userKey, newSession, request) {
  let ids = [];
  const known = await env.SESSIONS.get(`usersess:${userKey}`);
  if (known) ids = [known];
  else { // first login since this went live, or the pointer expired: look the user's sessions up once
    const list = await env.SESSIONS.list({ prefix: "session:", limit: 1000 });
    const raws = await Promise.all(list.keys.map(k => env.SESSIONS.get(k.name)));
    raws.forEach((raw, i) => { if (raw) { try { if (JSON.parse(raw).user === userKey) ids.push(list.keys[i].name.slice(8)); } catch {} } });
  }
  for (const id of ids) {
    if (!id || id === newSession.sessionId) continue;
    const raw = await env.SESSIONS.get(`session:${id}`);
    if (!raw) continue;
    const old = JSON.parse(raw);
    await env.SESSIONS.delete(`session:${id}`);
    const by = { os: newSession.os, browser: newSession.browser, ip: newSession.ip, ts: newSession.loginTs };
    await env.SESSIONS.put(`replaced:${id}`, JSON.stringify(by), { expirationTtl: 60 * 60 * 48 });
    const sameSystem = old.ua === newSession.ua && old.ip === newSession.ip;
    const info = { user: userKey, event: "session_replaced", ip: newSession.ip, ua: newSession.ua,
      oldIp: old.ip, oldOs: old.os || deviceOf(old.ua).os, oldBrowser: old.browser || deviceOf(old.ua).browser,
      newOs: newSession.os, newBrowser: newSession.browser, sameSystem };
    await logEvent(env, info);
    if (!sameSystem) {
      const ts = new Date().toISOString();
      await env.SESSIONS.put(`alert:${ts}:${crypto.randomUUID().slice(0, 6)}`, JSON.stringify(Object.assign({ ts }, info)), { expirationTtl: 60 * 60 * 24 * 90 });
    }
  }
}

async function getSession(env, sessionId) {
  if (!sessionId) return null;
  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

// ─── auth endpoints ──────────────────────────────────────────────────────────
async function handleLogin(request, env) {
  const { user, password } = await readBody(request);
  const ip = clientIP(request);
  const ua = clientUA(request);

  if (!user || !password) {
    return json({ error: "Missing credentials" }, 400);
  }

  const userKey = String(user).trim().toLowerCase();
  const u = AUTH_USERS[userKey];

  if (!u || u.password !== password) {
    await logEvent(env, {
      user: userKey,
      event: "login_failed",
      ip, ua,
      reason: !u ? "unknown_user" : "wrong_password"
    });
    return json({ error: "Invalid username or password" }, 401);
  }

  if (await isBanned(env, userKey)) {
    await logEvent(env, { user: userKey, event: "login_blocked_banned", ip, ua });
    return json({ error: "Your account has been suspended. Contact the admin." }, 403);
  }

  const sessionId = crypto.randomUUID();
  const ts = new Date().toISOString();
  const session = {
    sessionId, user: userKey,
    displayName: u.displayName, initials: u.initials,
    admin: !!u.admin,
    ip, ua, loginTs: ts, lastSeen: ts,
    ...deviceOf(ua)
  };

  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });

  if (!MULTI_DEVICE_USERS.has(userKey)) {
    await replaceOtherSessions(env, userKey, session, request);
    await env.SESSIONS.put(`usersess:${userKey}`, sessionId, { expirationTtl: SESSION_TTL_SECONDS });
  }
  await logEvent(env, { user: userKey, event: "login_success", ip, ua, sessionId, ...deviceOf(ua) });

  return json({
    sessionId,
    user: userKey,
    displayName: u.displayName,
    initials: u.initials,
    admin: !!u.admin
  });
}

async function handleHeartbeat(request, env) {
  const sessionId = request.headers.get("X-Session-Id");
  const session = await getSession(env, sessionId);
  if (!session) {
    const rep = sessionId ? await env.SESSIONS.get(`replaced:${sessionId}`) : null;
    if (rep) return json({ error: "replaced", by: JSON.parse(rep) }, 401);
    return json({ error: "no_session" }, 401);
  }

  if (await isBanned(env, session.user)) {
    await env.SESSIONS.delete(`session:${sessionId}`);
    return json({ error: "banned" }, 403);
  }

  // ── KV write throttling ──
  // The client pings this endpoint every 60s. Writing to KV on every single ping
  // burns through Cloudflare's free-tier daily write quota (1,000/day) extremely
  // fast — with several users active for hours at a time, 60s heartbeats alone can
  // hit 4,000-5,000 writes/day, blowing the quota and causing EVERY KV write
  // (including brand new logins trying to create a session) to fail with
  // "KV put() limit exceeded for the day" for the rest of that day.
  //
  // Since the session TTL is 24 hours, we don't need to refresh it every 60
  // seconds — refreshing every 5 minutes is more than enough headroom. This cuts
  // heartbeat-driven KV writes by ~5x without changing the 60s client-side ping
  // interval (still checks for kick/ban promptly), and still updates lastSeen
  // in the RESPONSE for the client even on ticks where we skip the KV write.
  const HEARTBEAT_WRITE_THROTTLE_SECONDS = 300; // 5 minutes
  const now = new Date();
  const lastSeenDate = new Date(session.lastSeen);
  const secondsSinceLastWrite = (now - lastSeenDate) / 1000;

  if (secondsSinceLastWrite < HEARTBEAT_WRITE_THROTTLE_SECONDS) {
    // Too soon since the last KV write — skip it, just confirm the session is
    // still valid (kick/ban checks above already ran). Report the CURRENT time
    // as lastSeen in the response so the client UI still looks live, without
    // actually writing to KV.
    return json({ ok: true, lastSeen: now.toISOString(), throttled: true });
  }

  session.lastSeen = now.toISOString();
  // IP may have changed during the session (mobile networks etc.); refresh it too
  const newIp = clientIP(request);
  if (newIp !== session.ip) session.ip = newIp;
  if (!session.os) Object.assign(session, deviceOf(session.ua));

  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });
  // keep the one-system pointer alive as long as the session (rewritten at most every 5 min, like the session)
  if (!MULTI_DEVICE_USERS.has(session.user)) await env.SESSIONS.put(`usersess:${session.user}`, sessionId, { expirationTtl: SESSION_TTL_SECONDS });
  return json({ ok: true, lastSeen: session.lastSeen });
}

async function handleLogout(request, env) {
  const sessionId = request.headers.get("X-Session-Id");
  const session = await getSession(env, sessionId);
  if (session) {
    await env.SESSIONS.delete(`session:${sessionId}`);
    await logEvent(env, {
      user: session.user, event: "logout",
      ip: clientIP(request), ua: clientUA(request), sessionId
    });
  }
  return json({ ok: true });
}

// ─── shared order-data endpoints ─────────────────────────────────────────────
const ORDERDATA_AGGS = ["keeta", "careem", "talabat", "deliveroo", "noon", "feedback"];
const ORDERDATA_MAX_BYTES = 20 * 1024 * 1024; // v178: was 5MB, based on an early estimate of
// ~50-350KB parsed payloads. That estimate didn't account for the merge strategy — every upload
// accumulates on top of prior ones forever (records/orderDetail/cancellations are never pruned,
// per mergeOrdersData's "cumulative, never blown away" design) — so a high-volume, long-running
// aggregator's payload only ever grows. Keeta specifically (near-continuous campaigns across
// 50+ outlets, many months of accumulated history) is the most likely to have quietly outgrown
// the original 5MB guess and been silently rejected on push (visible now via the client's new
// showSyncWarning toast, but wasn't before). Workers KV supports values up to 25MiB, so 20MB
// leaves comfortable headroom without removing the guard entirely.

async function handleOrderDataSave(request, env, agg) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "forbidden_admin_only" }, 403);
  if (!ORDERDATA_AGGS.includes(agg)) return json({ error: "unknown_aggregator" }, 400);

  const raw = await request.text();
  if (raw.length > ORDERDATA_MAX_BYTES) return json({ error: "payload_too_large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (!body || !Array.isArray(body.records) || !body.metadata) return json({ error: "missing_records_or_metadata" }, 400);

  const record = {
    metadata: body.metadata,
    records: body.records,
    updatedAt: new Date().toISOString(),
    updatedBy: admin.user
  };
  // v134: was silently dropping orderDetail (added in v131/v132 for the Finance CSV export) —
  // this whitelist predates that field and nobody updated it, so every push to the shared
  // server wiped it even though the client was sending it correctly.
  if (Array.isArray(body.orderDetail)) record.orderDetail = body.orderDetail;
  // v172: same fix as v134's orderDetail whitelist above — cancellations was being silently
  // dropped on every push since this endpoint only ever copied whitelisted fields into the
  // stored record. Confirmed directly in the code before fixing, not assumed.
  if (Array.isArray(body.cancellations)) record.cancellations = body.cancellations;
  await env.SESSIONS.put(`orderdata:${agg}`, JSON.stringify(record)); // no TTL — lives until replaced/cleared
  return json({ ok: true, agg, records: body.records.length, updatedAt: record.updatedAt });
}

async function handleOrderDataList(request, env) {
  const sessionId = request.headers.get("X-Session-Id");
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: "no_session" }, 401);

  const out = {};
  for (const agg of ORDERDATA_AGGS) {
    const raw = await env.SESSIONS.get(`orderdata:${agg}`);
    if (raw) out[agg] = JSON.parse(raw);
  }
  return json({ data: out, serverTime: new Date().toISOString() });
}

async function handleOrderDataClear(request, env, agg) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "forbidden_admin_only" }, 403);
  if (!ORDERDATA_AGGS.includes(agg)) return json({ error: "unknown_aggregator" }, 400);
  await env.SESSIONS.delete(`orderdata:${agg}`);
  return json({ ok: true, agg, cleared: true });
}

// ─── forecast log endpoints ──────────────────────────────────────────────────
// Saved manually (one click per campaign the user actually plans to launch), so
// volume is naturally low — no throttling needed the way heartbeat writes required.
async function handleForecastSave(request, env) {
  const sessionId = request.headers.get("X-Session-Id");
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: "no_session" }, 401);

  const body = await readBody(request);
  // discPct and cap are legitimately null for BOGO campaigns — the cost is derived from
  // real historical data rather than a stated percentage. Exclude them from the null check
  // when type is bogo; every other type still requires them.
  const isBogo = body.type === "bogo";
  const required = ["brand", "agg", "start", "end", "scenarios"];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) return json({ error: `missing_${k}` }, 400);
  }
  if (!isBogo) {
    if (body.discPct === undefined || body.discPct === null) return json({ error: "missing_discPct" }, 400);
    if (body.cap === undefined || body.cap === null) return json({ error: "missing_cap" }, 400);
  }

  const ts = new Date().toISOString();
  const id = `${ts}:${crypto.randomUUID().slice(0, 8)}`;
  const record = {
    id,
    savedAt: ts,
    savedBy: session.user,
    savedByName: session.displayName,
    algoVersion: body.algoVersion || null, // dashboard BUILD_VERSION at the time of saving
    brand: body.brand, agg: body.agg,
    type: body.type || null, // v1: was read for the isBogo check above but never persisted — every
    // saved forecast came back from history with no type at all, so the display always fell back to
    // the generic "X% off" label. For BOGO specifically this showed literally "null% off" (discPct
    // is correctly null for BOGO, but the type that should have selected the "BOGO" label was
    // missing) — caught directly by Nikhil on a live screenshot of Forecast History.
    discPct: body.discPct, cap: body.cap,
    coFund: !!body.coFund, coFundPct: body.coFundPct || null,
    start: body.start, end: body.end,
    branches: Array.isArray(body.branches) ? body.branches : [],
    baseline: body.baseline || null,
    seasonality: body.seasonality || null,
    scenarios: body.scenarios, // {conservative, expected, optimistic} — already-computed uplift/orders/contribution/roi
    closestMatch: body.closestMatch || null, // the "reality check" match at save time, if any
    matchCount: body.matchCount || 0
  };

  // Keep the forecast log for 2 years — these are meant to be looked back on, not ephemeral.
  await env.SESSIONS.put(`forecast:${id}`, JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 730
  });

  return json({ ok: true, id });
}

async function handleForecastList(request, env) {
  const sessionId = request.headers.get("X-Session-Id");
  const session = await getSession(env, sessionId);
  if (!session) return json({ error: "no_session" }, 401);

  const list = await env.SESSIONS.list({ prefix: "forecast:", limit: 500 });
  const sorted = list.keys.sort((a, b) => b.name.localeCompare(a.name)); // most recent first
  const records = [];
  for (const k of sorted) {
    const raw = await env.SESSIONS.get(k.name);
    if (raw) records.push(JSON.parse(raw));
  }
  return json({ records, serverTime: new Date().toISOString() });
}

// ─── admin endpoints ─────────────────────────────────────────────────────────
async function requireAdmin(request, env) {
  const sessionId = request.headers.get("X-Session-Id");
  const session = await getSession(env, sessionId);
  if (!session || !session.admin) return null;
  return session;
}

async function handleAdminSessions(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "forbidden" }, 403);

  // FIX: these three sections used to fetch each key's value with a sequential `await` inside a
  // plain for-loop — one KV read at a time. With limits of up to 1000 sessions + 200 events + 100
  // bans, that's potentially 1300+ individual reads happening one after another. Even at a fast
  // ~20-30ms each, that adds up well past a reasonable timeout, and Workers have their own
  // wall-clock execution limit — if this ran long enough, Cloudflare could kill the Worker before
  // it ever sends a response, which looks like a silent, total hang from the browser's side (no
  // error, nothing — exactly what was reported). Parallelized with Promise.all so all the reads
  // for each section fire concurrently instead of queueing behind each other.

  // Active sessions
  const sList = await env.SESSIONS.list({ prefix: "session:", limit: 1000 });
  const activeRaw = await Promise.all(sList.keys.map(k => env.SESSIONS.get(k.name)));
  const active = activeRaw.filter(Boolean).map(raw => JSON.parse(raw));

  // Recent events (last 200)
  const eList = await env.SESSIONS.list({ prefix: "event:", limit: 200 });
  const sorted = eList.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 200);
  const eventsRaw = await Promise.all(sorted.map(k => env.SESSIONS.get(k.name)));
  const events = eventsRaw.filter(Boolean).map(raw => JSON.parse(raw));

  // Bans
  const bList = await env.SESSIONS.list({ prefix: "banned:", limit: 100 });
  const bansRaw = await Promise.all(bList.keys.map(k => env.SESSIONS.get(k.name)));
  const bans = bList.keys.map((k, i) => ({
    user: k.name.slice("banned:".length),
    meta: bansRaw[i] ? JSON.parse(bansRaw[i]) : null
  }));

  // v580: logins used on a second system (newest sign-in won, older system signed out)
  const aList = await env.SESSIONS.list({ prefix: "alert:", limit: 200 });
  const aSorted = aList.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 100);
  const alerts = (await Promise.all(aSorted.map(k => env.SESSIONS.get(k.name)))).filter(Boolean).map(r => JSON.parse(r));
  active.forEach(a => { if (!a.os) Object.assign(a, deviceOf(a.ua)); });
  return json({ active, events, bans, alerts, multiDevice: [...MULTI_DEVICE_USERS], serverTime: new Date().toISOString() });
}

async function handleAdminKick(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "forbidden" }, 403);
  const { sessionId: target, user } = await readBody(request);

  let kicked = 0;
  if (target) {
    const exists = await env.SESSIONS.get(`session:${target}`);
    if (exists) { await env.SESSIONS.delete(`session:${target}`); kicked = 1; }
  } else if (user) {
    const list = await env.SESSIONS.list({ prefix: "session:", limit: 1000 });
    for (const k of list.keys) {
      const raw = await env.SESSIONS.get(k.name);
      if (raw && JSON.parse(raw).user === user.toLowerCase()) {
        await env.SESSIONS.delete(k.name);
        kicked++;
      }
    }
  } else {
    return json({ error: "sessionId or user required" }, 400);
  }

  await logEvent(env, {
    user: admin.user, event: "admin_kick", ip: clientIP(request),
    target: target || user, kickedCount: kicked
  });
  return json({ ok: true, kicked });
}

async function handleAdminBan(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "forbidden" }, 403);
  const { user, reason } = await readBody(request);
  if (!user) return json({ error: "user required" }, 400);

  const userKey = user.toLowerCase();
  await env.SESSIONS.put(`banned:${userKey}`, JSON.stringify({
    reason: reason || "",
    bannedBy: admin.user,
    ts: new Date().toISOString()
  }));

  // Kick all of their existing sessions immediately
  const list = await env.SESSIONS.list({ prefix: "session:", limit: 1000 });
  let kicked = 0;
  for (const k of list.keys) {
    const raw = await env.SESSIONS.get(k.name);
    if (raw && JSON.parse(raw).user === userKey) {
      await env.SESSIONS.delete(k.name);
      kicked++;
    }
  }

  await logEvent(env, {
    user: admin.user, event: "admin_ban", ip: clientIP(request),
    target: userKey, reason: reason || "", kickedCount: kicked
  });
  return json({ ok: true, kicked });
}

async function handleAdminUnban(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "forbidden" }, 403);
  const { user } = await readBody(request);
  if (!user) return json({ error: "user required" }, 400);

  await env.SESSIONS.delete(`banned:${user.toLowerCase()}`);
  await logEvent(env, {
    user: admin.user, event: "admin_unban", ip: clientIP(request),
    target: user.toLowerCase()
  });
  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// POS SYNC (build 535 step 1 · build 538 step 2: delivery → brand tabs) — pulls Microsys "Kull ERP" reports and writes the
// "Virtual Brands Performance" Google Sheet directly, replacing the desktop POS Uploader.
// Step 1 = plumbing + a connection test only (sign in to Microsys, pull one small report,
// read the Google Sheet's tab list). Nothing is written to any sheet in this step.
//
// Secrets (Cloudflare → Worker → Settings → Variables and Secrets, type "Secret"):
//   GOOGLE_SA_JSON  → the full contents of the POS Uploader's credentials.json
// Microsys login is NOT a Cloudflare secret — it's entered from the dashboard the first time
// (KV pos:creds) so Nikhil/Nicole can update it without touching Cloudflare.
// ═══════════════════════════════════════════════════════════════════════════════
const POS_USERS = ["nikhil", "nicole"];
const POS_SHEETS = {
  test: "1089unJKCbXtwM42Jgemg-0rDS6qIGB86Q6s1KpHnEN4",
  live: "1-NXDz4mZIOqzCPf5zHz7w8cX8nUVSiTm_7T2QCUEcWU"
};
const MSYS = "https://erp.microsystc.com";
const MSYS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const MSYS_SESSION_TTL = 15 * 60;
const MSYS_TENANT = "ORE"; // TenantID cookie value the portal uses for Oregano Restaurants
// Report viewer (Stimulsoft 2020.5.2) parameters — copied from a real export made in the portal.
const STI_PARAMS = {"viewerId":"MvcViewer","routes":{"action":"Reports","controller":"AnalysisEMReportView"},"formValues":{},"cacheMode":"ObjectCache","cacheTimeout":10,"cacheItemPriority":"Default","pageNumber":0,"originalPageNumber":0,"reportType":"Report","zoom":100,"viewMode":"SinglePage","showBookmarks":true,"openLinksWindow":"_blank","chartRenderType":"AnimatedVector","reportDisplayMode":"Table","drillDownParameters":[],"editableParameters":null,"useRelativeUrls":true,"passQueryParametersForResources":true,"passQueryParametersToReport":false,"version":"2020.5.2","reportDesignerMode":false,"imagesQuality":"Normal","parametersPanelSortDataItems":true,"combineReportPages":false,"exportFormat":"Csv","exportSettings":{"CodePage":"Default","UseDefaultSystemEncoding":true,"SkipColumnHeaders":false,"TableName":null,"Separator":",","DataType":"Csv","ExportDataOnly":false,"PageRange":"All","Encoding":"65001","DataExportMode":"Data"}};

async function requirePosUser(request, env) {
  const session = await getSession(env, request.headers.get("X-Session-Id"));
  if (!session) return null;
  if (!session.admin && !POS_USERS.includes(session.user)) return null;
  return session;
}

// ── tiny cookie jar (Workers fetch has no jar of its own) ──
function jarAdd(jar, res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie()
    : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
  for (const c of list) {
    const first = c.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) jar[first.slice(0, i).trim()] = first.slice(i + 1).trim();
  }
}
const jarStr = jar => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
async function msysFetch(jar, path, opts = {}) {
  const headers = Object.assign({ "User-Agent": MSYS_UA, "Cookie": jarStr(jar) }, opts.headers || {});
  let res = await fetch(MSYS + path, { method: opts.method || "GET", headers, body: opts.body, redirect: "manual" });
  jarAdd(jar, res);
  let hops = 0;
  while (res.status >= 300 && res.status < 400 && hops < 5) {
    const loc = res.headers.get("location"); if (!loc) break;
    const next = loc.startsWith("http") ? loc : MSYS + (loc.startsWith("/") ? loc : "/" + loc);
    res = await fetch(next, { headers: { "User-Agent": MSYS_UA, "Cookie": jarStr(jar) }, redirect: "manual" });
    jarAdd(jar, res); hops++;
  }
  return res;
}

// Microsys login page encrypts username/password with AES-128-CBC, key = iv = "8080808080808080",
// PKCS7, base64 output (CryptoJS defaults) before sending. Reproduced exactly.
async function msysEnc(text) {
  const k = new TextEncoder().encode("8080808080808080");
  const key = await crypto.subtle.importKey("raw", k, { name: "AES-CBC" }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv: k }, key, new TextEncoder().encode(text));
  let s = ""; new Uint8Array(ct).forEach(b => s += String.fromCharCode(b));
  return btoa(s);
}

async function msysLogin(env, force = false) {
  if (!force) {
    const cached = await env.SESSIONS.get("pos:msys");
    if (cached) return JSON.parse(cached).jar;
  }
  const credsRaw = await env.SESSIONS.get("pos:creds");
  if (!credsRaw) throw new Error("NO_CREDS");
  const { user, pass } = JSON.parse(credsRaw);
  // v536: Microsys is multi-tenant — the tenant comes from a "TenantID" cookie that the portal's
  // own browser login carries (value "ORE" for Oregano). Without it /Home/Login answers "4"
  // ("Invalid Tenant. Please check the URL") — exactly what build 535's first test returned.
  const jar = { TenantID: MSYS_TENANT };
  const steps = [];
  // 1) login page → cookies + anti-forgery tokens
  // v537: the tenant is fixed server-side when the login page is opened via /Home/Login?<tenant>
  // (the portal's own "session expired" redirect uses exactly this URL); it then redirects to
  // /Home/Index. Sending only the TenantID cookie (v536) wasn't enough — still code 4.
  const r1 = await msysFetch(jar, "/Home/Login?" + MSYS_TENANT);
  const html = await r1.text();
  steps.push("page " + r1.status);
  const reqTok = (html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) || html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/) || [])[1];
  const forgery = (html.match(/id="forgeryToken"[^>]*value="([^"]+)"/) || [])[1];
  if (!reqTok || !forgery) throw new Error("MSYS_LOGIN_PAGE_CHANGED (" + steps.join(", ") + ")");
  const eu = await msysEnc(user), ep = await msysEnc(pass);
  const ajax = { "Content-Type": "application/json", "VerificationToken": forgery, "X-Requested-With": "XMLHttpRequest", "Origin": MSYS, "Referer": MSYS + "/Home/Index" };
  steps.push("cookies " + Object.keys(jar).join(","));
  // 2) credentials check
  const r2 = await msysFetch(jar, "/Home/Login", { method: "POST", headers: ajax,
    body: `{'Username':'${eu}','Password':'${ep}', 'Company':'', 'Language':'EN', 'ChainID':'', 'LocationID':'' }` });
  const t2 = (await r2.text()).trim();
  steps.push("login " + r2.status + " " + t2.slice(0, 40));
  const code = t2.replace(/"/g, "");
  // Response codes from the portal's own Login.js: 1 ok · 2 "User already logged in" ·
  // 3 "Invalid username and password" · 4 "Invalid Tenant" · anything else "Invalid Login".
  if (code === "2") throw new Error("MSYS_ALREADY_LOGGED_IN — Microsys says this user is already logged in elsewhere (code 2)");
  if (code === "3") throw new Error("MSYS_BAD_LOGIN — Microsys rejected the username/password (code 3)");
  if (code === "4") throw new Error("MSYS_BAD_TENANT — Microsys said 'Invalid Tenant' (code 4) [" + steps.join(" | ") + "]");
  if (code !== "1") throw new Error("MSYS_LOGIN_FAILED — Microsys answered: " + t2.slice(0, 120));
  // 3) company/chain/location — reuse the user's last work location, else ORE/ORE/ALQ
  let company = "ORE", chain = "ORE", location = "ALQ";
  try {
    const r3 = await msysFetch(jar, "/Home/GetLastWorkLocation", { method: "POST", headers: ajax, body: `{'Username':'${eu}'}` });
    const d3 = JSON.parse(await r3.text());
    const row = Array.isArray(d3) ? d3[0] : (typeof d3 === "string" ? JSON.parse(d3)[0] : null);
    if (row && row.CompanyID) { company = row.CompanyID; chain = row.ChainID || chain; location = row.LocationID || location; }
  } catch (e) { steps.push("lastloc n/a"); }
  await msysFetch(jar, "/Home/SetCompanySession", { method: "POST", headers: ajax, body: `{'CompanyID':'${company}'}` });
  // 4) final form post (what the "Continue" button submits)
  const form = new URLSearchParams({ __RequestVerificationToken: reqTok, Username: user, Password: pass, hdLoginStatus: "true",
    LangID: "en", CompanyID: company, ChainID: chain, LocationID: location });
  const r4 = await msysFetch(jar, "/Home/Index", { method: "POST", body: form.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Origin": MSYS, "Referer": MSYS + "/Home/Index" } });
  steps.push("continue " + r4.status);
  await r4.text();
  await env.SESSIONS.put("pos:msys", JSON.stringify({ jar, ts: new Date().toISOString() }), { expirationTtl: MSYS_SESSION_TTL });
  return jar;
}

const pad2 = n => String(n).padStart(2, "0");
const toDMY = iso => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
function reportQuery(kind, isoDate) {
  const d = toDMY(isoDate);
  if (kind === "credit") return `MenuID=RPTEMANALYSISCREDITSALES&ArrayValueForChain=all&ArrayValueForlocation=all&ArrayValueForCustomer=all&EMCreditSalesFromDate=${d}&EMCreditSalesToDate=${d}`;
  if (kind === "disc")   return `MenuID=RPTEMANALYSISSALESDISDTLS&ArrayValueForChain=all&ArrayValueForlocation=all&EMSalesDiscountDetailsFromDate=${d}&EMSalesDiscountDetailsToDate=${d}`;
  if (kind === "summary")return `MenuID=RPTEMANALYSISSALESSUMMARYBYOUTLET-S-NEW&ArrayValueForChain=all&ArrayValueForlocation=all&EMSalesSummaryByOutletFromDate=${d}&EMSalesSummaryByOutletToDate=${d}&SalesByPayment=N`;
  throw new Error("unknown report " + kind);
}
function b64utf8(s) { const b = new TextEncoder().encode(s); let o = ""; b.forEach(x => o += String.fromCharCode(x)); return btoa(o); }

// v571: same viewer flow for any report query (used by the Journal Tape probe)
async function msysReportCSVQuery(env, query) {
  const q = query.replace(/\//g, "%2f");
  for (let attempt = 0; attempt < 2; attempt++) {
    const jar = await msysLogin(env, attempt > 0);
    const r = await msysFetch(jar, "/AnalysisEMReportView/Reports?" + q);
    const html = await r.text();
    const g = (html.match(/"clientGuid"\s*:\s*"([^"]+)"/) || [])[1];
    if (!g) { if (attempt === 0) continue; return { error: "MSYS_NO_VIEWER", page: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600) }; }
    const post = (action, act, extra) => msysFetch(jar, `/AnalysisEMReportView/${action}?` + q, { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ stiweb_component: "Viewer", stiweb_action: act,
        stiweb_parameters: b64utf8(JSON.stringify(Object.assign({}, STI_PARAMS, { clientGuid: g }, extra || {}))) }).toString() });
    const rb = await post("GetReportFromLocal", "GetReport", { action: "GetReport" }); await rb.text();
    const re = await post("ExportReport", "ExportReport");
    return { csv: await re.text() };
  }
}
// Pull one report for one day as CSV text. Retries once with a fresh Microsys login if the
// cached session has expired (the portal answers with its login page instead of the viewer).
async function msysReportCSV(env, kind, isoDate) {
  const q = reportQuery(kind, isoDate).replace(/\//g, "%2f");
  for (let attempt = 0; attempt < 2; attempt++) {
    const jar = await msysLogin(env, attempt > 0);
    const r = await msysFetch(jar, "/AnalysisEMReportView/Reports?" + q);
    const html = await r.text();
    const g = (html.match(/"clientGuid"\s*:\s*"([^"]+)"/) || [])[1];
    if (!g) { if (attempt === 0) continue; throw new Error("MSYS_NO_VIEWER (logged out or report page changed)"); }
    const post = (action, act, extra) => msysFetch(jar, `/AnalysisEMReportView/${action}?` + q, { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ stiweb_component: "Viewer", stiweb_action: act,
        stiweb_parameters: b64utf8(JSON.stringify(Object.assign({}, STI_PARAMS, { clientGuid: g }, extra || {}))) }).toString() });
    const rb = await post("GetReportFromLocal", "GetReport", { action: "GetReport" }); await rb.text();
    const re = await post("ExportReport", "ExportReport");
    const csv = await re.text();
    if (/^ServerError/.test(csv)) throw new Error("MSYS_EXPORT_ERROR " + csv.slice(0, 120));
    return csv;
  }
}

// ── Google service account → access token (RS256 JWT, WebCrypto) ──
function b64url(bytes) { let s = ""; new Uint8Array(bytes).forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function googleToken(env) {
  if (!env.GOOGLE_SA_JSON) throw new Error("NO_GOOGLE_SECRET — add GOOGLE_SA_JSON in Cloudflare");
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3300 })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + b64url(sig) }).toString() });
  const j = await res.json();
  if (!j.access_token) throw new Error("GOOGLE_AUTH_FAILED " + JSON.stringify(j).slice(0, 200));
  return { token: j.access_token, email: sa.client_email };
}

async function posLog(env, rec) {
  const ts = new Date().toISOString();
  await env.SESSIONS.put(`pos:log:${ts}:${crypto.randomUUID().slice(0, 6)}`, JSON.stringify(Object.assign({ ts }, rec)), { expirationTtl: 60 * 60 * 24 * 180 });
}

// Google token cached in KV (~50 min) so repeated pull steps don't re-sign a JWT every call.
async function googleTokenCached(env) {
  const c = await env.SESSIONS.get("pos:gtoken");
  if (c) return JSON.parse(c);
  const t = await googleToken(env);
  await env.SESSIONS.put("pos:gtoken", JSON.stringify(t), { expirationTtl: 3000 });
  return t;
}
const POS_TABS = ["Oregano", "Lollorosso", "Smokeys", "Wicked Wings", "Fyoozhen", "Dine-In & Takeaway", "Dine-In Discounts"];
const POS_INSTORE_TABS = ["Dine-In & Takeaway", "Dine-In Discounts"]; // v562: tabs POS Sync may create / grow
function posSheetId(sheet) { return POS_SHEETS[sheet === "live" ? "live" : "test"]; }
function posTabOfRange(range) { const m = String(range).match(/^'((?:[^']|'')+)'!/) || String(range).match(/^([^!]+)!/); return m ? m[1].replace(/''/g, "'") : null; }

// ── endpoints ──
async function handlePosStatus(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const raw = await env.SESSIONS.get("pos:creds");
  const c = raw ? JSON.parse(raw) : null;
  const logs = await env.SESSIONS.list({ prefix: "pos:log:", limit: 1000 });
  const recent = logs.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 15);
  const history = (await Promise.all(recent.map(k => env.SESSIONS.get(k.name)))).filter(Boolean).map(r => JSON.parse(r));
  const fk = (await env.SESSIONS.list({ prefix: "pos:flags:", limit: 1000 })).keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 60);
  const flags = [];
  (await Promise.all(fk.map(k => env.SESSIONS.get(k.name)))).forEach((raw, i) => { if (!raw) return; const date = fk[i].name.slice("pos:flags:".length); JSON.parse(raw).forEach(f => flags.push(Object.assign({ date }, f))); });
  return json({ ok: true, hasCreds: !!c, credsUser: c ? c.user : null, credsSetBy: c ? c.setBy : null, credsSetAt: c ? c.setAt : null,
    hasGoogle: !!env.GOOGLE_SA_JSON, history, flags });
}

async function handlePosCreds(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { user, pass } = await readBody(request);
  if (!user || !pass) return json({ error: "Enter both username and password" }, 400);
  await env.SESSIONS.put("pos:creds", JSON.stringify({ user: String(user).trim(), pass: String(pass), setBy: s.user, setAt: new Date().toISOString() }));
  await env.SESSIONS.delete("pos:msys");
  return json({ ok: true });
}

// v538: one report, one day → raw CSV (the browser does the Uploader-identical processing).
// v573: Microsys Journal Tape (Analysis → Journal Tape) — bill by bill, with employee, items and how each bill was paid.
// Its export has no outlet column, so it is run per outlet; Microsys identifies outlets here by an internal id.
const MSYS_JT_LOC = {
  "ALF - Khalifa City": "6e093555-1b6b-4e0b-85c6-ff28e1a8da32", "ALQ - Al Quoz": "11d7c5ed-f826-47d3-987a-9d849a3e0f45",
  "ALW - Jumeirah-Al Wasl": "6c382379-79c9-47d2-ba54-a9ca546fdf94", "DIP - Dubai Investment Park-ORE": "88cf792e-d068-44a0-84a3-e02a554a06fd",
  "DMC - Dubai Media City": "044a039e-2058-4f89-b0ee-01d3f8b02fee", "DMR - Dubai Marina": "027bd001-b4b3-448a-ac2a-9db9c245c4aa",
  "DSO - Dubai Silicon Oasis": "7a97eb87-c3d5-47d7-9a68-0c2fe514f606", "DSP - Dubai Safari Park": "7a306559-1f80-4111-b9c9-5630f8a2f0d1",
  "FUR - Al Furjan": "53d2d4c2-eaaf-4aa0-b984-ff1968bf6e40", "MIR - Mirdif": "5c77bc79-695a-4340-95ef-bdfd7801a51b",
  "MSS - Mirdif Sports Society": "afcfe8b1-a1f6-443b-8122-d463c3de77b0", "MTC - Motor City": "525b1f88-a049-4633-b4c9-0ccb66b7aeeb",
  "REF - AL Reef": "4a4f1198-258f-4c5b-a0b1-55d407a32168", "REM - Al Reem Island": "72599bf4-b1d8-4544-9d9e-403ee0c957d6",
  "TSQ - Town Square": "390de334-3044-4aaf-8291-c66dee1ed583", "VLA - The Villa": "da56f5da-0ddf-4cfa-bbb7-ab7732424c15",
  // v574: Fyoozhen chain (FYZ)
  "ALF - Khalifa City (Fyoozhen)": "cffae1ba-7af2-4c5e-b0c5-d324522ee09d", "DIP - Dubai Investment Park-FYZ": "36a41a58-7c6c-42c3-ae9d-991e20db3114",
  "NAD - Nad Al Sheba": "80f309a8-6046-41ab-8a32-20ff5163d471", "WTC - World Trade Center": "19f710fa-2feb-4c6f-8a20-4d5366af7744" };
async function handlePosReport(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { kind, date, loc } = await readBody(request);
  if (kind === "jt") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({ error: "bad_request" }, 400);
    const gid = MSYS_JT_LOC[loc];
    if (!gid) return json({ error: "Journal Tape isn't mapped for '" + loc + "' yet — tell Claude its Microsys location id" }, 400);
    const d = toDMY(date);
    const q = ["MenuID=RPTEMANALYSISJOURNALTAPE-L", "ArrayValueForChain=all", "ArrayValueForlocation=ms," + gid, "chkDetailListingForJournalTape=Y",
      "JournalTapeFromDate=" + d, "JournalTapeToDate=" + d, "ArrayValueForOrderNo=all", "ArrayValueForVoucherNo=all"].join("&");
    try { const r = await msysReportCSVQuery(env, q); if (r.error) return json({ error: r.error }, 502); return json({ ok: true, kind, date, loc, csv: r.csv }); }
    catch (e) { return json({ error: String(e.message || e) }, 502); }
  }
  if (!["credit", "disc", "summary"].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({ error: "bad_request" }, 400);
  try {
    const csv = await msysReportCSV(env, kind, date);
    return json({ ok: true, kind, date, csv });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
// v538: read header rows + Branch/Date columns of the brand tabs (read-only).
async function handlePosSheetRead(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet, tabs } = await readBody(request);
  const list = (Array.isArray(tabs) ? tabs : []).filter(t => POS_TABS.includes(t));
  if (!list.length) return json({ error: "no_tabs" }, 400);
  const { token } = await googleTokenCached(env);
  const id = posSheetId(sheet);
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`, { headers: { Authorization: "Bearer " + token } })).json();
  const existing = new Set(((meta && meta.sheets) || []).map(x => x.properties.title));
  const present = list.filter(t => existing.has(t));
  const out = {};
  list.forEach(t => { if (!existing.has(t)) out[t] = { missing: true }; });
  if (present.length) {
    const q = present.flatMap(t => { const n = "'" + t.replace(/'/g, "''") + "'"; return [`${n}!1:2`, `${n}!A:B`]; })
      .map(r => "ranges=" + encodeURIComponent(r)).join("&");
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${q}&valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: "Bearer " + token } });
    const raw = await r.text();
    if (!r.ok) { let m = "HTTP " + r.status; try { m = JSON.parse(raw).error.message; } catch (e) {} return json({ error: m }, 502); }
    // Pass Google's body straight through (no JSON.parse/stringify of ~45k rows here) — keeps the
    // Worker's CPU time tiny; the browser maps valueRanges[2i] → header, [2i+1] → A:B.
    return new Response(`{"ok":true,"sheet":"${sheet === "live" ? "LIVE" : "TEST"}","present":${JSON.stringify(present)},"tabs":${JSON.stringify(out)},"google":${raw}}`,
      { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  return json({ ok: true, sheet: sheet === "live" ? "LIVE" : "TEST", present: [], tabs: out });
}
// v538: write cells (contiguous runs) to the brand tabs. Only the 5 brand tabs + the new
// Dine-In & Takeaway tab are writable; anything else in the request is rejected outright.
async function handlePosSheetWrite(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet, data } = await readBody(request);
  if (!Array.isArray(data) || !data.length) return json({ error: "no_data" }, 400);
  for (const d of data) { const t = posTabOfRange(d.range); if (!POS_TABS.includes(t) || !Array.isArray(d.values)) return json({ error: "range_not_allowed: " + d.range }, 400); }
  const { token } = await googleTokenCached(env);
  // v546: a new tab has only 1,000 rows and Google refuses writes beyond the grid — grow the
  // Dine-In & Takeaway tab first when a write goes past its last row (history backfill, or simply
  // a few months of daily pulls at 20 rows a day).
  for (const tabName of POS_INSTORE_TABS) {
  const instoreMax = data.filter(d => posTabOfRange(d.range) === tabName)
    .reduce((m, d) => { const x = String(d.range).match(/!\$?[A-Z]+\$?(\d+)(?::\$?[A-Z]+\$?(\d+))?$/); return x ? Math.max(m, +(x[2] || x[1])) : m; }, 0);
  if (instoreMax) {
    const mr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${posSheetId(sheet)}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`, { headers: { Authorization: "Bearer " + token } });
    const mj = await mr.json();
    const t = ((mj && mj.sheets) || []).map(x => x.properties).find(p => p.title === tabName);
    if (t && instoreMax > (t.gridProperties.rowCount || 0)) {
      const add = instoreMax - t.gridProperties.rowCount + 500;
      const ar = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${posSheetId(sheet)}:batchUpdate`, { method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ appendDimension: { sheetId: t.sheetId, dimension: "ROWS", length: add } }] }) });
      if (!ar.ok) { const aj = await ar.json(); return json({ error: "Couldn't add rows to the " + tabName + " tab: " + ((aj.error && aj.error.message) || ar.status) }, 502); }
    }
  }
  }
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${posSheetId(sheet)}/values:batchUpdate`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }) });
  const j = await r.json();
  if (!r.ok) return json({ error: (j.error && j.error.message) || ("HTTP " + r.status) }, 502);
  return json({ ok: true, updatedCells: j.totalUpdatedCells || 0, updatedRanges: (j.responses || []).length });
}
// v562: gid of a POS Sync tab in the LIVE sheet, for any logged-in dashboard user (the published link reads tabs by gid).
async function handleSheetGid(request, env) {
  const session = await getSession(env, request.headers.get("X-Session-Id"));
  if (!session) return json({ error: "unauthorized" }, 401);
  const name = new URL(request.url).searchParams.get("name") || "";
  if (!POS_INSTORE_TABS.includes(name)) return json({ error: "bad_request" }, 400);
  const ck = "pos:gid:" + name, hit = await env.SESSIONS.get(ck);
  if (hit) return json({ ok: true, gid: hit });
  const { token } = await googleTokenCached(env);
  const mj = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${posSheetId("live")}?fields=sheets.properties(sheetId,title)`, { headers: { Authorization: "Bearer " + token } })).json();
  const t = ((mj && mj.sheets) || []).map(x => x.properties).find(p => p.title === name);
  if (!t) return json({ ok: true, gid: null });
  await env.SESSIONS.put(ck, String(t.sheetId), { expirationTtl: 86400 * 30 });
  return json({ ok: true, gid: String(t.sheetId) });
}
// v539: create the "Dine-In & Takeaway" tab on first use (only that exact tab — nothing else).
async function handlePosAddTab(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet, tab } = await readBody(request);
  const title = POS_INSTORE_TABS.includes(tab) ? tab : "Dine-In & Takeaway"; // v562: also the Dine-In Discounts tab
  const { token } = await googleTokenCached(env);
  const id = posSheetId(sheet);
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`, { headers: { Authorization: "Bearer " + token } })).json();
  if (((meta && meta.sheets) || []).some(x => x.properties.title === title)) return json({ ok: true, created: false });
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title, gridProperties: title === "Dine-In Discounts" ? { rowCount: 3000, columnCount: 8, frozenRowCount: 1 } : { rowCount: 2000, columnCount: 20, frozenRowCount: 2, frozenColumnCount: 3 } } } }] }) });
  const j = await r.json();
  if (!r.ok) return json({ error: (j.error && j.error.message) || ("HTTP " + r.status) }, 502);
  return json({ ok: true, created: true });
}
// v542: low-sales flags — one KV key per day (pos:flags:<date>) holding that day's flagged outlets.
// A re-pull replaces the day's list: outlets still low stay "open" (or "ok" if someone already
// confirmed them), outlets no longer low become "fixed".
async function handlePosFlags(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { date, flags } = await readBody(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Array.isArray(flags)) return json({ error: "bad_request" }, 400);
  const key = `pos:flags:${date}`;
  const prev = JSON.parse((await env.SESSIONS.get(key)) || "[]");
  const now = new Date().toISOString();
  const out = flags.slice(0, 40).map(f => {
    const old = prev.find(p => p.loc === f.loc);
    return { loc: String(f.loc).slice(0, 80), net: +f.net || 0, base: +f.base || 0, pct: +f.pct || 0,
      status: old && old.status === "ok" ? "ok" : "open", by: old && old.status === "ok" ? old.by : s.user, at: old && old.status === "ok" ? old.at : now };
  });
  prev.filter(p => !out.find(o => o.loc === p.loc) && p.status !== "fixed").forEach(p => out.push(Object.assign({}, p, { status: "fixed", by: s.user, at: now })));
  if (!out.length && !prev.length) return json({ ok: true, flags: [] }); // nothing to store — saves a KV write
  await env.SESSIONS.put(key, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 120 });
  return json({ ok: true, flags: out });
}
async function handlePosFlagOk(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { date, loc } = await readBody(request);
  const key = `pos:flags:${date}`;
  const list = JSON.parse((await env.SESSIONS.get(key)) || "[]");
  const f = list.find(x => x.loc === loc);
  if (!f) return json({ error: "flag_not_found" }, 404);
  f.status = "ok"; f.by = s.user; f.at = new Date().toISOString();
  await env.SESSIONS.put(key, JSON.stringify(list), { expirationTtl: 60 * 60 * 24 * 120 });
  return json({ ok: true });
}
// v564: daily reconciliation — POS till (revenue centres) vs what POS Sync writes to the sheet.
// One KV key per day (pos:recon:<date>) holding {date,pos,agg,rows,mis,by,at,ack}; "ack" keeps the
// "explained" marks people add (they survive a re-pull of the same day).
async function handlePosReconSave(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { date, rec } = await readBody(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !rec || typeof rec !== "object") return json({ error: "bad_request" }, 400);
  const key = `pos:recon:${date}`;
  const prev = JSON.parse((await env.SESSIONS.get(key)) || "null");
  const num = v => Math.round((+v || 0) * 100) / 100, str = (v, n) => String(v == null ? "" : v).slice(0, n);
  const ordl = (l, n) => (Array.isArray(l) ? l : []).slice(0, n).map(o => ({ cust: str(o.cust, 60), ord: str(o.ord, 20), inv: str(o.inv, 20), ref: str(o.ref, 30), amt: num(o.amt) })); // v565: order numbers
  const out = { date, pos: num(rec.pos), agg: num(rec.agg), by: s.user, at: new Date().toISOString(), ack: (prev && prev.ack) || {},
    rows: (Array.isArray(rec.rows) ? rec.rows : []).slice(0, 80).map(r => ({ loc: str(r.loc, 80), out: str(r.out, 40), rc: str(r.rc, 20), brand: str(r.brand, 20),
      pos: num(r.pos), agg: num(r.agg), gap: num(r.gap), unexpl: num(r.unexpl), other: (Array.isArray(r.other) ? r.other : []).slice(0, 8).map(o => [str(o[0], 60), num(o[1])]), orders: ordl(r.orders, 30) })),
    mis: (Array.isArray(rec.mis) ? rec.mis : []).slice(0, 40).map(m => ({ loc: str(m.loc, 80), out: str(m.out, 40), rc: str(m.rc, 20), till: str(m.till, 20), brand: str(m.brand, 20), amt: num(m.amt), orders: ordl(m.orders, 40) })) };
  await env.SESSIONS.put(key, JSON.stringify(out), { expirationTtl: 60 * 60 * 24 * 400 });
  return json({ ok: true, rec: out });
}
async function handlePosReconList(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const u = new URL(request.url), from = u.searchParams.get("from") || "", to = u.searchParams.get("to") || "9999";
  const keys = [];let cursor;
  do { const l = await env.SESSIONS.list({ prefix: "pos:recon:", limit: 1000, cursor }); keys.push(...l.keys); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const want = keys.map(k => k.name).filter(n => { const d = n.slice(10); return d >= from && d <= to; }).sort().slice(-120);
  const recs = (await Promise.all(want.map(k => env.SESSIONS.get(k)))).filter(Boolean).map(r => JSON.parse(r));
  return json({ ok: true, recs });
}
async function handlePosReconAck(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { date, id, note, clear } = await readBody(request);
  const key = `pos:recon:${date}`;
  const rec = JSON.parse((await env.SESSIONS.get(key)) || "null");
  if (!rec) return json({ error: "not_found" }, 404);
  rec.ack = rec.ack || {};
  if (clear) delete rec.ack[String(id).slice(0, 120)]; else rec.ack[String(id).slice(0, 120)] = { by: s.user, at: new Date().toISOString(), note: String(note || "").slice(0, 200) };
  await env.SESSIONS.put(key, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 400 });
  return json({ ok: true, ack: rec.ack });
}
// v565: read-only discovery of the Microsys report menu — lists the report MenuIDs this login can open, so
// a bill-by-bill report can be wired in (to name the cash / card / phone bills behind a reconciliation gap).
async function handlePosMsysMenu(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const jar = await msysLogin(env, false);
  const found = new Map(), seen = [], scripts = new Set();
  const scan = (txt, src) => {
    const re = /(RPT[A-Z0-9_\-]{4,})/g; let m;
    while ((m = re.exec(txt))) { const id = m[1]; if (found.has(id)) continue;
      const ctx = txt.slice(Math.max(0, m.index - 300), m.index + 300).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const lbl = (ctx.match(new RegExp(id + "[^>]{0,160}?>\\s*([^<]{3,80})<")) || [])[1] || "";
      found.set(id, { id, label: lbl.trim(), src, ctx: ctx.slice(200, 420) }); }
  };
  for (const path of ["/Home/Index", "/Home/Dashboard", "/Dashboard/Index", "/AnalysisEMReportView/Index"]) {
    try { const r = await msysFetch(jar, path); const t = await r.text(); seen.push(path + " " + r.status + " " + t.length); scan(t, path);
      for (const m of t.matchAll(/<script[^>]+src="([^"]+)"/g)) if (!/^https?:/.test(m[1]) || m[1].startsWith(MSYS)) scripts.add(m[1].replace(MSYS, "")); } catch (e) { seen.push(path + " ERR " + e.message); }
  }
  for (const src of [...scripts].filter(x => !/jquery|bootstrap|kendo|stimulsoft|\.min\.js/i.test(x)).slice(0, 12)) {
    try { const r = await msysFetch(jar, src.startsWith("/") ? src : "/" + src); const t = await r.text(); seen.push(src + " " + r.status + " " + t.length); scan(t, src); } catch (e) { seen.push(src + " ERR"); }
  }
  return json({ ok: true, seen, reports: [...found.values()].slice(0, 400) });
}
// v571: Journal Tape probe (read-only) — finds the report's MenuID and filter names on the Microsys menu/filter
// pages, runs it for one day, and returns the columns + first lines, so it can be wired into the reconciliation.
async function handlePosMsysProbe(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { menuId: mid0, date, match } = await readBody(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({ error: "bad_request" }, 400);
  const jar = await msysLogin(env, false);
  const log = [], want = new RegExp(match || "journal", "i");
  // a) candidate MenuIDs + the links that open them
  const cands = new Map(), pages = ["/Home/Index", "/Home/Dashboard", "/AnalysisEMReportView/Index"];
  const scan = (t, src) => {
    for (const m of t.matchAll(/(RPT[A-Z0-9_\-]{4,})/g)) {
      const id = m[1], ctx = t.slice(Math.max(0, m.index - 400), m.index + 400);
      const plain = ctx.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      if (!want.test(id) && !want.test(plain)) continue;
      const href = (ctx.match(/(?:href|data-url|url)\s*[=:]\s*["']([^"']*MenuID=[^"']*)["']/i) || [])[1] || "";
      if (!cands.has(id)) cands.set(id, { id, href, src, text: plain.slice(300, 520) });
    }
  };
  const scripts = new Set();
  for (const p of pages) { try { const r = await msysFetch(jar, p); const t = await r.text(); log.push(p + " " + r.status + " " + t.length); scan(t, p);
    for (const m of t.matchAll(/<script[^>]+src="([^"]+)"/g)) if (!/^https?:/.test(m[1])) scripts.add(m[1]); } catch (e) { log.push(p + " ERR " + e.message); } }
  for (const src of [...scripts].filter(x => !/jquery|bootstrap|kendo|stimulsoft|\.min\.js/i.test(x)).slice(0, 12)) {
    try { const r = await msysFetch(jar, src.startsWith("/") ? src : "/" + src); const t = await r.text(); scan(t, src); } catch (e) {} }
  const ids = mid0 ? [String(mid0).toUpperCase()] : [...cands.keys()];
  if (!ids.length) return json({ ok: false, error: "no report matching '" + (match || "journal") + "' found on the Microsys menu", log });
  // b) for each candidate: open its filter page, collect filter names, run it for the date
  const d = toDMY(date), out = [];
  for (const id of ids.slice(0, 4)) {
    const c = cands.get(id) || { id, href: "" }, names = new Set(), arrays = new Set(), tried = [];
    const paths = [c.href, `/AnalysisEM/Index?MenuID=${id}`, `/AnalysisEM/Reports?MenuID=${id}`, `/AnalysisEMReport/Index?MenuID=${id}`, `/Analysis/Index?MenuID=${id}`, `/Home/Report?MenuID=${id}`].filter(Boolean);
    for (const p of paths) { try { const r = await msysFetch(jar, p.startsWith("/") ? p : "/" + p); const t = await r.text(); tried.push(p + " " + r.status + " " + t.length);
      for (const m of t.matchAll(/\b(EM[A-Za-z0-9]*?(?:From|To)Date)\b/g)) names.add(m[1]);
      for (const m of t.matchAll(/\b(ArrayValueFor[A-Za-z0-9]+)\b/g)) arrays.add(m[1]);
      if (names.size) break; } catch (e) { tried.push(p + " ERR"); } }
    let from = [...names].find(n => /FromDate$/.test(n)), to = [...names].find(n => /ToDate$/.test(n));
    const guess = !from;
    if (!from) { const nm = "EM" + (c.text.match(/journal\s*tape/i) ? "JournalTape" : id.replace(/^RPTEMANALYSIS/, "")); from = nm + "FromDate"; to = nm + "ToDate"; }
    const q = [`MenuID=${id}`, ...(arrays.size ? [...arrays] : ["ArrayValueForChain", "ArrayValueForlocation"]).map(a => `${a}=all`), `${from}=${d}`, `${to}=${d}`].join("&");
    let res; try { res = await msysReportCSVQuery(env, q); } catch (e) { res = { error: e.message }; }
    const csv = res.csv || "", lines = csv.split(/\r?\n/).filter(Boolean);
    out.push({ id, href: c.href, text: c.text, filterPages: tried, filterNames: [...names], arrays: [...arrays], guessedDates: guess, query: q,
      error: res.error || (/^ServerError/.test(csv) ? csv.slice(0, 200) : null), page: res.page || null, lines: lines.length, head: lines.slice(0, 12).join("\n").slice(0, 4000) });
  }
  return json({ ok: true, log, candidates: [...cands.values()].slice(0, 20), results: out });
}
// v575: Journal Tape store — one KV key per outlet-day (pos:jt:<date>:<loc code>) with the compact delivery bills
// POS Sync collected: discounted bills (for item-level campaign attribution) and Smokeys-button bills at the
// Wicked Wings outlets (to split Wicked Wings from Smokeys by items). Written by POS users, read by any session.
async function handlePosJTSave(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { date, loc, data } = await readBody(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^[A-Z]{3}[A-Z0-9-]{0,8}$/.test(loc || "") || !data || typeof data !== "object") return json({ error: "bad_request" }, 400);
  const raw = JSON.stringify(data);
  if (raw.length > 900000) return json({ error: "too_large" }, 400);
  await env.SESSIONS.put(`pos:jt:${date}:${loc}`, raw, { expirationTtl: 60 * 60 * 24 * 450 });
  return json({ ok: true, bytes: raw.length });
}
async function handlePosJTList(request, env) {
  const session = await getSession(env, request.headers.get("X-Session-Id"));
  if (!session) return json({ error: "unauthorized" }, 401);
  const u = new URL(request.url), from = u.searchParams.get("from") || "", to = u.searchParams.get("to") || "9999", keysOnly = u.searchParams.get("keys") === "1";
  const keys = []; let cursor;
  do { const l = await env.SESSIONS.list({ prefix: "pos:jt:", limit: 1000, cursor }); keys.push(...l.keys.map(k => k.name)); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const want = keys.filter(n => { const d = n.slice(7, 17); return d >= from && d <= to; }).sort().slice(0, 900);
  if (keysOnly) return json({ ok: true, keys: want.map(n => n.slice(7)) });
  const vals = await Promise.all(want.map(k => env.SESSIONS.get(k)));
  return json({ ok: true, days: want.map((k, i) => ({ date: k.slice(7, 17), loc: k.slice(18), data: vals[i] ? JSON.parse(vals[i]) : null })).filter(x => x.data) });
}
// v544: formatting for the Dine-In & Takeaway tab, copied from the Oregano tab so it looks like the
// delivery tabs. /meta returns sheet ids, frozen rows/cols and Oregano's column widths; /batch runs
// formatting-only requests whose DESTINATION must be the Dine-In & Takeaway tab (nothing else is
// ever changed — the Oregano tab is only read from as the source).
async function posSheetMeta(env, sheet) {
  const { token } = await googleTokenCached(env);
  const id = posSheetId(sheet);
  // v545: two calls — asking for a `ranges` restricts the response to the sheets in those ranges, so
  // v544's single call never listed the Dine-In & Takeaway tab ("tab not found" on Nikhil's LIVE pull).
  const h = { headers: { Authorization: "Bearer " + token } };
  const [r, rw] = await Promise.all([
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId,title,gridProperties(frozenRowCount,frozenColumnCount)))`, h),
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?ranges=${encodeURIComponent("'Oregano'!A1:AZ1")}&fields=sheets(data(columnMetadata(pixelSize)))`, h)]);
  const j = await r.json(), jw = await rw.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || ("HTTP " + r.status));
  const widths = rw.ok ? ((((jw.sheets || [])[0] || {}).data || [])[0] || {}).columnMetadata || [] : [];
  return { token, id, sheets: (j.sheets || []).map(x => ({ title: x.properties.title, sheetId: x.properties.sheetId,
    frozenRows: (x.properties.gridProperties || {}).frozenRowCount || 0, frozenCols: (x.properties.gridProperties || {}).frozenColumnCount || 0,
    widths: x.properties.title === "Oregano" ? widths.map(c => c.pixelSize || 100) : undefined })) };
}
async function handlePosSheetMeta(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet } = await readBody(request);
  const m = await posSheetMeta(env, sheet);
  return json({ ok: true, sheets: m.sheets });
}
// v554: read the cell FORMATS (font, size, bold, alignment, number format) of a few rows of a POS tab, so the
// Dine-In & Takeaway tab can be given exactly the delivery tabs' look. Reading works even when a filter hides
// those rows (copying formats from hidden rows does not). Read-only; at most 10 rows.
async function handlePosSheetRowFmt(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet, tab, rows } = await readBody(request);
  if (!POS_TABS.includes(tab) || !Array.isArray(rows) || !rows.length || rows.length > 10 || !rows.every(r => Number.isInteger(r) && r >= 0 && r < 200000)) return json({ error: "bad_request" }, 400);
  const { token } = await googleTokenCached(env);
  const n = "'" + tab.replace(/'/g, "''") + "'";
  const q = rows.map(r => "ranges=" + encodeURIComponent(`${n}!A${r + 1}:BZ${r + 1}`)).join("&");
  const fields = "sheets.data(startRow,rowData.values.userEnteredFormat(textFormat(fontFamily,fontSize,bold),horizontalAlignment,verticalAlignment,numberFormat))";
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${posSheetId(sheet)}?includeGridData=true&${q}&fields=${encodeURIComponent(fields)}`, { headers: { Authorization: "Bearer " + token } });
  const j = await r.json();
  if (!r.ok) return json({ error: (j.error && j.error.message) || ("HTTP " + r.status) }, 502);
  const data = (((j.sheets || [])[0] || {}).data || []).map((d, i) => ({ row: rows[i], cells: (((d.rowData || [])[0] || {}).values || []).map(v => v.userEnteredFormat || null) }));
  return json({ ok: true, rows: data });
}
async function handlePosSheetBatch(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet, requests } = await readBody(request);
  if (!Array.isArray(requests) || !requests.length || requests.length > 400) return json({ error: "bad_requests" }, 400);
  const m = await posSheetMeta(env, sheet);
  const dst = (m.sheets.find(x => x.title === "Dine-In & Takeaway") || {}).sheetId;
  const ddId = (m.sheets.find(x => x.title === "Dine-In Discounts") || {}).sheetId; // v564: the discounts tab can be formatted too
  if (dst == null && ddId == null) return json({ error: "Dine-In & Takeaway tab not found" }, 400);
  const allowed = ["copyPaste", "mergeCells", "unmergeCells", "updateDimensionProperties", "updateSheetProperties", "repeatCell", "updateBorders", "insertDimension", "setBasicFilter", "sortRange"];
  for (const q of requests) {
    const k = Object.keys(q); if (k.length !== 1 || !allowed.includes(k[0])) return json({ error: "request_not_allowed: " + k.join(",") }, 400);
    const v = q[k[0]];
    const target = k[0] === "copyPaste" ? v.destination : k[0] === "updateSheetProperties" ? v.properties : k[0] === "setBasicFilter" ? (v.filter || {}).range : v.range;
    if (!target || (target.sheetId !== dst && !(ddId != null && target.sheetId === ddId))) return json({ error: "only the Dine-In & Takeaway and Dine-In Discounts tabs can be formatted" }, 400);
    if (k[0] === "insertDimension" && target.sheetId !== dst) return json({ error: "rows can only be inserted in Dine-In & Takeaway" }, 400);
    if (k[0] === "setBasicFilter" && target.sheetId !== ddId) return json({ error: "a filter can only be set on Dine-In Discounts" }, 400);
    if (k[0] === "sortRange" && (target.sheetId !== ddId || !(target.startRowIndex >= 1))) return json({ error: "only the Dine-In Discounts rows below the header can be sorted" }, 400);
    // v549: backfill may insert empty ROWS below the 2 header rows (to slot earlier days above later ones)
    if (k[0] === "insertDimension" && (v.range.dimension !== "ROWS" || !(v.range.startIndex >= 2) || !(v.range.endIndex - v.range.startIndex <= 400))) return json({ error: "only rows below the header may be inserted" }, 400);
    if (k[0] === "updateSheetProperties" && v.fields !== "gridProperties.frozenRowCount,gridProperties.frozenColumnCount") return json({ error: "only frozen rows/cols may change" }, 400);
  }
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${m.id}:batchUpdate`, { method: "POST",
    headers: { Authorization: "Bearer " + m.token, "Content-Type": "application/json" }, body: JSON.stringify({ requests }) });
  const j = await r.json();
  if (!r.ok) return json({ error: (j.error && j.error.message) || ("HTTP " + r.status) }, 502);
  return json({ ok: true, applied: requests.length });
}
// v546: backfill re-layout — clears the VALUES below the header of the Dine-In & Takeaway tab only
// (formatting stays), so history can be written in date order from 1 Jan 2025.
async function handlePosClearInstore(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet } = await readBody(request);
  const { token } = await googleTokenCached(env);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${posSheetId(sheet)}/values/${encodeURIComponent("'Dine-In & Takeaway'!A3:Q")}:clear`, { method: "POST", headers: { Authorization: "Bearer " + token } });
  const j = await r.json();
  if (!r.ok) return json({ error: (j.error && j.error.message) || ("HTTP " + r.status) }, 502);
  await posLog(env, { user: s.user, kind: "clear", sheet: sheet === "live" ? "LIVE" : "TEST", result: "Dine-In & Takeaway rows cleared for backfill" });
  return json({ ok: true });
}
async function handlePosLogWrite(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  await posLog(env, { user: s.user, kind: b.kind === "backfill" ? "backfill" : "pull", sheet: b.sheet === "live" ? "LIVE" : "TEST", dates: String(b.dates || "").slice(0, 80), result: String(b.result || "").slice(0, 200) });
  return json({ ok: true });
}

async function handlePosTest(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const { sheet } = await readBody(request);
  const out = { microsys: null, google: null };
  // Microsys: sign in fresh + pull yesterday's Sales Summary by Outlet (small report)
  const y = new Date(Date.now() + 4 * 3600 * 1000 - 86400000); // Dubai "yesterday"
  const iso = `${y.getUTCFullYear()}-${pad2(y.getUTCMonth() + 1)}-${pad2(y.getUTCDate())}`;
  try {
    const t0 = Date.now();
    await msysLogin(env, true);
    const csv = await msysReportCSV(env, "summary", iso);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    out.microsys = { ok: true, date: iso, outlets: Math.max(0, lines.length - 1), header: (lines[0] || "").slice(0, 120), ms: Date.now() - t0 };
  } catch (e) {
    out.microsys = { ok: false, error: String(e.message || e) };
  }
  // Google: token + read tab names of the chosen sheet (read-only)
  try {
    const { token, email } = await googleToken(env);
    const id = POS_SHEETS[sheet === "live" ? "live" : "test"];
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties.title`, { headers: { Authorization: "Bearer " + token } });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || ("HTTP " + r.status));
    out.google = { ok: true, sheet: sheet === "live" ? "LIVE" : "TEST", title: j.properties.title, tabs: j.sheets.map(x => x.properties.title), serviceAccount: email };
  } catch (e) {
    out.google = { ok: false, error: String(e.message || e) };
  }
  await posLog(env, { user: s.user, kind: "test", sheet: sheet === "live" ? "LIVE" : "TEST", microsysOk: !!(out.microsys && out.microsys.ok), googleOk: !!(out.google && out.google.ok) });
  return json(out);
}

// ─── main router ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight (harmless to allow; same-origin in practice)
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Session-Id"
        }
      });
    }

    // CRITICAL FIX: every handler call below now has `await` in front of it.
    // Without `await`, `return handleLogin(request, env)` returns the unfinished
    // Promise immediately, and the try block is considered "complete" before the
    // async function has actually run. Any error thrown LATER inside handleLogin
    // (e.g. a KV read/write failure) then becomes an uncaught rejection that
    // completely bypasses this catch block. Cloudflare's runtime then returns its
    // own raw error response instead of clean JSON — which is exactly what broke
    // login for every browser/device that didn't already have a saved session
    // (res.json() in the frontend fails to parse the malformed response, showing
    // "Network error — try again" instead of the real error).
    try {
      if (path === "/api/login"           && method === "POST") return await handleLogin(request, env);
      if (path === "/api/heartbeat"       && method === "POST") return await handleHeartbeat(request, env);
      if (path === "/api/logout"          && method === "POST") return await handleLogout(request, env);
      if (path === "/api/forecast/save"   && method === "POST") return await handleForecastSave(request, env);
      if (path === "/api/forecast/list"   && method === "GET")  return await handleForecastList(request, env);
      if (path === "/api/orderdata"       && method === "GET")  return await handleOrderDataList(request, env);
      {
        const odm = path.match(/^\/api\/orderdata\/([a-z]+)$/);
        if (odm && method === "POST")   return await handleOrderDataSave(request, env, odm[1]);
        if (odm && method === "DELETE") return await handleOrderDataClear(request, env, odm[1]);
      }
      if (path === "/api/admin/sessions"  && method === "GET")  return await handleAdminSessions(request, env);
      if (path === "/api/admin/kick"      && method === "POST") return await handleAdminKick(request, env);
      if (path === "/api/admin/ban"       && method === "POST") return await handleAdminBan(request, env);
      if (path === "/api/admin/unban"     && method === "POST") return await handleAdminUnban(request, env);
      if (path === "/api/pos/status"      && method === "GET")  return await handlePosStatus(request, env);
      if (path === "/api/sheet/gid"       && method === "GET")  return await handleSheetGid(request, env);
      if (path === "/api/pos/creds"       && method === "POST") return await handlePosCreds(request, env);
      if (path === "/api/pos/test"        && method === "POST") return await handlePosTest(request, env);
      if (path === "/api/pos/report"      && method === "POST") return await handlePosReport(request, env);
      if (path === "/api/pos/sheet/read"  && method === "POST") return await handlePosSheetRead(request, env);
      if (path === "/api/pos/sheet/write" && method === "POST") return await handlePosSheetWrite(request, env);
      if (path === "/api/pos/log"         && method === "POST") return await handlePosLogWrite(request, env);
      if (path === "/api/pos/sheet/addtab"&& method === "POST") return await handlePosAddTab(request, env);
      if (path === "/api/pos/flags"       && method === "POST") return await handlePosFlags(request, env);
      if (path === "/api/pos/sheet/meta"  && method === "POST") return await handlePosSheetMeta(request, env);
      if (path === "/api/pos/sheet/rowfmt" && method === "POST") return await handlePosSheetRowFmt(request, env);
      if (path === "/api/pos/sheet/clear-instore" && method === "POST") return await handlePosClearInstore(request, env);
      if (path === "/api/pos/sheet/batch" && method === "POST") return await handlePosSheetBatch(request, env);
      if (path === "/api/pos/flag/ok"     && method === "POST") return await handlePosFlagOk(request, env);
      if (path === "/api/pos/recon"       && method === "POST") return await handlePosReconSave(request, env);
      if (path === "/api/pos/jt"          && method === "POST") return await handlePosJTSave(request, env);
      if (path === "/api/pos/jt"          && method === "GET")  return await handlePosJTList(request, env);
      if (path === "/api/pos/msys/menu"   && method === "POST") return await handlePosMsysMenu(request, env);
      if (path === "/api/pos/msys/probe"  && method === "POST") return await handlePosMsysProbe(request, env);
      if (path === "/api/pos/recon"       && method === "GET")  return await handlePosReconList(request, env);
      if (path === "/api/pos/recon/ack"   && method === "POST") return await handlePosReconAck(request, env);
    } catch (e) {
      return json({ error: "server_error", detail: String(e.message || e) }, 500);
    }

    // Anything else: serve static assets (index.html, dashboard.js, version.txt, _headers, etc.)
    return env.ASSETS.fetch(request);
  }
};
