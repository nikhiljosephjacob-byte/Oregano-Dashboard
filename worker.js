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

// v616: Cloudflare's free plan allows 1,000 KV writes a day. Writes that are only a cache or a log no longer
// fail the request when that limit is hit (the feature keeps working, it just isn't cached/logged), and
// rewrites of data that hasn't changed are skipped.
async function kvPut(env, key, val, opt) {
  try { await env.SESSIONS.put(key, val, opt); return true; }
  catch (e) { console.log("KV put skipped (" + key.split(":").slice(0, 2).join(":") + "): " + String(e && e.message || e)); return false; }
}
async function kvPutChanged(env, key, val, opt) {
  try { if ((await env.SESSIONS.get(key)) === val) return true; } catch (e) {}
  return kvPut(env, key, val, opt);
}
async function logEvent(env, ev) {
  const ts = new Date().toISOString();
  ev.ts = ts;
  // Use ISO timestamp + random suffix as key so sorted descending gives most recent first
  const key = `event:${ts}:${crypto.randomUUID().slice(0, 8)}`;
  // Keep event log for 90 days then auto-delete (KV TTL)
  await kvPut(env, key, JSON.stringify(ev), { expirationTtl: 60 * 60 * 24 * 90 });
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
async function replaceOtherSessions(env, userKey, newSession, request, prevPointer) {
  let ids = [];const replaced = [];
  const known = prevPointer !== undefined ? prevPointer : await env.SESSIONS.get(`usersess:${userKey}`);
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
    await kvPut(env, `replaced:${id}`, JSON.stringify(by), { expirationTtl: 60 * 60 * 48 });
    const sameSystem = old.ua === newSession.ua && old.ip === newSession.ip;
    const info = { user: userKey, event: "session_replaced", ip: newSession.ip, ua: newSession.ua,
      oldIp: old.ip, oldOs: old.os || deviceOf(old.ua).os, oldBrowser: old.browser || deviceOf(old.ua).browser,
      newOs: newSession.os, newBrowser: newSession.browser, sameSystem };
    await logEvent(env, info);
    replaced.push({ os: info.oldOs, browser: info.oldBrowser, ip: old.ip, sameSystem });
    if (!sameSystem) {
      const ts = new Date().toISOString();
      await kvPut(env, `alert:${ts}:${crypto.randomUUID().slice(0, 6)}`, JSON.stringify(Object.assign({ ts }, info)), { expirationTtl: 60 * 60 * 24 * 90 });
    }
  }
  return replaced;
}

async function getSession(env, sessionId) {
  if (!sessionId) return null;
  if (sessionId.startsWith("auto:")) return await autoSession(env, sessionId); // v601: the 9 am auto-pull (Google Apps Script)
  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  if (!raw) return null;
  const sess = JSON.parse(raw);
  if (!AUTH_USERS[sess.user] && !sess.digest) { await env.SESSIONS.delete(`session:${sessionId}`); return null; } // v583: login removed (bd, admin)
  return sess;
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
    // pointer first, so the older system is caught by its next heartbeat even before the delete has spread across Cloudflare
    const prevPtr = await env.SESSIONS.get(`usersess:${userKey}`);
    await env.SESSIONS.put(`usersess:${userKey}`, sessionId, { expirationTtl: SESSION_TTL_SECONDS });
    const rep = (await replaceOtherSessions(env, userKey, session, request, prevPtr)).filter(x => !x.sameSystem);
    if (rep.length) await env.SESSIONS.put(`notice:${sessionId}`, JSON.stringify(rep), { expirationTtl: 60 * 60 });
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
  // v583: one system per login, checked on EVERY heartbeat (not only at sign-in) — a newer sign-in moved the pointer
  if (!MULTI_DEVICE_USERS.has(session.user)) {
    const ptr = await env.SESSIONS.get(`usersess:${session.user}`);
    if (ptr && ptr !== sessionId) {
      const nraw = await env.SESSIONS.get(`session:${ptr}`);
      if (nraw) {
        const n = JSON.parse(nraw);
        await env.SESSIONS.delete(`session:${sessionId}`);
        return json({ error: "replaced", by: { os: n.os, browser: n.browser, ip: n.ip, ts: n.loginTs } }, 401);
      }
    }
  }
  let notice = null;
  const nt = await env.SESSIONS.get(`notice:${sessionId}`);
  if (nt) { notice = JSON.parse(nt); await env.SESSIONS.delete(`notice:${sessionId}`); }

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
  const HEARTBEAT_WRITE_THROTTLE_SECONDS = 1800; // v616: 30 minutes (was 5) — the free plan's 1,000 writes/day ran out on 21 Oct
  const now = new Date();
  const lastSeenDate = new Date(session.lastSeen);
  const secondsSinceLastWrite = (now - lastSeenDate) / 1000;

  if (secondsSinceLastWrite < HEARTBEAT_WRITE_THROTTLE_SECONDS) {
    // Too soon since the last KV write — skip it, just confirm the session is
    // still valid (kick/ban checks above already ran). Report the CURRENT time
    // as lastSeen in the response so the client UI still looks live, without
    // actually writing to KV.
    return json({ ok: true, lastSeen: now.toISOString(), throttled: true, notice });
  }

  session.lastSeen = now.toISOString();
  // IP may have changed during the session (mobile networks etc.); refresh it too
  const newIp = clientIP(request);
  if (newIp !== session.ip) session.ip = newIp;
  if (!session.os) Object.assign(session, deviceOf(session.ua));

  // v616: the one-system pointer only needs refreshing every 6 h (it lives 24 h)
  const ptrDue = !MULTI_DEVICE_USERS.has(session.user) && (!session.ptrAt || (now - new Date(session.ptrAt)) / 1000 > 6 * 3600);
  if (ptrDue) session.ptrAt = now.toISOString();
  await kvPut(env, `session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });
  if (ptrDue) await kvPut(env, `usersess:${session.user}`, sessionId, { expirationTtl: SESSION_TTL_SECONDS });
  return json({ ok: true, lastSeen: session.lastSeen, notice });
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
  // v633: Platform costs fee rows (one per brand|outlet|day) — previously dropped by this whitelist.
  if (Array.isArray(body.fees)) record.fees = body.fees;
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
  if (!session.admin && !session.auto && !POS_USERS.includes(session.user)) return null;
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
  await kvPut(env, "pos:msys", JSON.stringify({ jar, ts: new Date().toISOString() }), { expirationTtl: MSYS_SESSION_TTL }); // v616: cache only
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
  const sa = typeof env.GOOGLE_SA_JSON === "string" ? JSON.parse(env.GOOGLE_SA_JSON) : env.GOOGLE_SA_JSON; // works whether stored as Secret (text) or JSON variable
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
  await kvPut(env, `pos:log:${ts}:${crypto.randomUUID().slice(0, 6)}`, JSON.stringify(Object.assign({ ts }, rec)), { expirationTtl: 60 * 60 * 24 * 180 });
}

// Google token cached in KV (~50 min) so repeated pull steps don't re-sign a JWT every call.
async function googleTokenCached(env) {
  const c = await env.SESSIONS.get("pos:gtoken");
  if (c) return JSON.parse(c);
  const t = await googleToken(env);
  await kvPut(env, "pos:gtoken", JSON.stringify(t), { expirationTtl: 3000 }); // v616: cache only
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
// v611: the dashboard's brand / campaign / ad tabs, fetched server-side from the published sheet — one more
// route next to the direct link and the public CORS proxies, so a flaky proxy no longer leaves a brand unloaded.
// Signed-in sessions only; only the dashboard's own published sheet; the body is streamed straight through.
const DASH_PUB = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2PpdGikWQBRBclmQCvw95Z_1RtbkQ8AmZiv2SQq3CX8SPDTGHj3wqCUnJahp-lLGQet8FnLaXQbMa/pub";
async function handleSheetCsv(request, env) {
  const session = await getSession(env, request.headers.get("X-Session-Id"));
  if (!session) return json({ error: "unauthorized" }, 401);
  const gid = new URL(request.url).searchParams.get("gid") || "";
  if (!/^\d{1,12}$/.test(gid)) return json({ error: "bad_request" }, 400);
  let last = "";
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`${DASH_PUB}?gid=${gid}&single=true&output=csv&_cb=${Date.now()}${i}`, { redirect: "follow", cf: { cacheTtl: 0, cacheEverything: false } });
      if (r.ok) return new Response(r.body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
      last = "HTTP " + r.status;
    } catch (e) { last = String(e && e.message || e); }
  }
  return json({ error: "upstream", detail: last }, 502);
}
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
  await kvPut(env, ck, String(t.sheetId), { expirationTtl: 86400 * 30 });
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
  { const strip = l => JSON.stringify(l.map(x => Object.assign({}, x, { at: 0, by: 0 }))); // v616: same flags as last time → no rewrite
    if (strip(prev) === strip(out)) return json({ ok: true, flags: prev, unchanged: true }); }
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
  // v598: never replace a good day with an incomplete Credit Sales read (platforms under 80% of the till's delivery buttons)
  const bad = r => r && +r.pos > 2000 && +r.agg < 0.8 * +r.pos;
  if (bad(rec) && prev && !bad(prev)) return json({ error: "incomplete_read", detail: "Credit Sales looks incomplete for this day — kept the earlier check" }, 409);
  const out = { date, pos: num(rec.pos), agg: num(rec.agg), by: s.user, at: new Date().toISOString(), ack: (prev && prev.ack) || {},
    rows: (Array.isArray(rec.rows) ? rec.rows : []).slice(0, 80).map(r => ({ loc: str(r.loc, 80), out: str(r.out, 40), rc: str(r.rc, 20), brand: str(r.brand, 20),
      pos: num(r.pos), agg: num(r.agg), gap: num(r.gap), unexpl: num(r.unexpl), other: (Array.isArray(r.other) ? r.other : []).slice(0, 8).map(o => [str(o[0], 60), num(o[1])]), orders: ordl(r.orders, 30) })),
    mis: (Array.isArray(rec.mis) ? rec.mis : []).slice(0, 40).map(m => ({ loc: str(m.loc, 80), out: str(m.out, 40), rc: str(m.rc, 20), till: str(m.till, 20), brand: str(m.brand, 20), amt: num(m.amt), orders: ordl(m.orders, 40) })),
    // v596: Keeta order values per brand|outlet (numbers only) for the minimum-commission estimate
    kt: (() => { if (!rec.kt || typeof rec.kt !== "object") return (prev && prev.kt) || {}; const o = {}; for (const [k, v] of Object.entries(rec.kt).slice(0, 80)) if (Array.isArray(v)) o[str(k, 60)] = v.slice(0, 600).map(num); return o; })(),
    // v617: wrong settlements (account vs how the bill was punched) + hand-settled clusters; an older dashboard that doesn't send them keeps the stored ones
    ws: Array.isArray(rec.ws) ? rec.ws.slice(0, 80).map(w => ({ kind: str(w.kind, 24), loc: str(w.loc, 80), out: str(w.out, 40), cust: str(w.cust, 60), suf: str(w.suf, 4), amt: num(w.amt), ref: str(w.ref, 30), inv: str(w.inv, 20), ord: str(w.ord, 20), should: str(w.should, 80), refOwner: str(w.refOwner, 20), accBrand: str(w.accBrand, 20), tillBrand: str(w.tillBrand, 20) })) : ((prev && prev.ws) || []),
    wsm: Array.isArray(rec.wsm) ? rec.wsm.slice(0, 30).map(w => ({ loc: str(w.loc, 80), out: str(w.out, 40), rc: str(w.rc, 20), brand: str(w.brand, 20), n: +w.n || 0, amt: num(w.amt), auto: +w.auto || 0 })) : ((prev && prev.wsm) || []) };
  { const strip = o => JSON.stringify(Object.assign({}, o, { at: 0, by: 0 })); // v616: same numbers as last time → no rewrite
    if (prev && strip(prev) === strip(out)) return json({ ok: true, unchanged: true, rec: prev }); }
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
// v596: Keeta order values from the till (Microsys Credit Sales) per day — for the minimum-commission estimate on days
// no Keeta statement covers yet. Numbers only; any signed-in user.
async function handlePosKeetaTill(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  if (!s) return json({ error: "no_session" }, 401);
  const u = new URL(request.url), from = u.searchParams.get("from") || "", to = u.searchParams.get("to") || "9999";
  const keys = [];let cursor;
  do { const l = await env.SESSIONS.list({ prefix: "pos:recon:", limit: 1000, cursor }); keys.push(...l.keys); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const want = keys.map(k => k.name).filter(n => { const d = n.slice(10); return d >= from && d <= to; }).sort().slice(-120);
  const days = {};
  for (const r of (await Promise.all(want.map(k => env.SESSIONS.get(k)))).filter(Boolean)) { const x = JSON.parse(r); if (x.kt && Object.keys(x.kt).length) days[x.date] = x.kt; }
  return json({ ok: true, days });
}
// v585: delivery-button sales the platforms don't account for (catering, direct deliveries, test orders, voids/timing),
// per outlet × button × day, from the daily reconciliation — so the dashboard's group total equals Finance's DSR.
// Read-only and compact; any signed-in user (the figures are totals, no customer details).
async function handlePosTillOnly(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  if (!s) return json({ error: "no_session" }, 401);
  const u = new URL(request.url), from = u.searchParams.get("from") || "", to = u.searchParams.get("to") || "9999";
  const keys = [];let cursor;
  do { const l = await env.SESSIONS.list({ prefix: "pos:recon:", limit: 1000, cursor }); keys.push(...l.keys); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const want = keys.map(k => k.name).filter(n => { const d = n.slice(10); return d >= from && d <= to; }).sort().slice(-400);
  const recs = (await Promise.all(want.map(k => env.SESSIONS.get(k)))).filter(Boolean).map(r => JSON.parse(r));
  const rows = [], days = [], dayPos = {};
  for (const rec of recs) {
    days.push(rec.date); dayPos[rec.date] = rec.pos;
    if (+rec.pos > 2000 && +rec.agg < 0.8 * +rec.pos) continue; // v598: incomplete Credit Sales read — its gaps aren't real
    for (const x of rec.rows || []) {
      const cat = (x.other || []).filter(o => /catering/i.test(o[0])).reduce((a, o) => a + o[1], 0);
      const test = (x.other || []).filter(o => /deliverect mp card/i.test(o[0])).reduce((a, o) => a + o[1], 0);
      const ack = (rec.ack || {})[x.loc + "|" + x.rc];
      rows.push({ d: rec.date, loc: x.loc, out: x.out, rc: x.rc, b: x.brand, g: x.gap, cat, test, ack: ack ? (ack.note || "explained") : null });
    }
  }
  return json({ ok: true, days, dayPos, rows });
}
// v589: Site P&L — Finance's monthly P&L (parsed in the browser), stored in KV "pl:data". Nikhil only.
const PL_USERS = ["nikhil"];
async function plSession(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  return s && PL_USERS.includes(String(s.user || "").toLowerCase()) ? s : null;
}
async function handlePLGet(request, env) {
  const s = await plSession(request, env);
  if (!s) return json({ error: "not_allowed" }, 403);
  const raw = await env.SESSIONS.get("pl:data");
  return json({ data: raw ? JSON.parse(raw) : null });
}
async function handlePLSave(request, env) {
  const s = await plSession(request, env);
  if (!s) return json({ error: "not_allowed" }, 403);
  const { data } = await readBody(request);
  if (!data || typeof data !== "object" || !data.outlets || !data.combined) return json({ error: "bad_data" }, 400);
  const str = JSON.stringify(data);
  if (str.length > 20 * 1024 * 1024) return json({ error: "too_large" }, 413);
  await env.SESSIONS.put("pl:data", str);
  await logEvent(env, { user: s.user, event: "pl_uploaded", target: String(data.file || "").slice(0, 120), ip: clientIP(request) });
  return json({ ok: true, bytes: str.length });
}
// v582: dine-in discount name → Customer / Internal, set by an admin; one small KV value read by every dashboard
async function handleDDClassGet(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  if (!s) return json({ error: "no_session" }, 401);
  return json({ map: JSON.parse((await env.SESSIONS.get("ddclass")) || "{}") });
}
async function handleDDClassSet(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Only an admin can change discount classifications" }, 403);
  const { name, cls } = await readBody(request);
  const k = String(name || "").trim().toUpperCase().slice(0, 120);
  if (!k || !["Customer", "Internal"].includes(cls)) return json({ error: "name and cls (Customer|Internal) required" }, 400);
  const map = JSON.parse((await env.SESSIONS.get("ddclass")) || "{}");
  map[k] = cls;
  await env.SESSIONS.put("ddclass", JSON.stringify(map));
  await logEvent(env, { user: admin.user, event: "discount_classified", target: k, reason: cls, ip: clientIP(request) });
  return json({ ok: true, map });
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
  await kvPutChanged(env, `pos:jt:${date}:${loc}`, raw, { expirationTtl: 60 * 60 * 24 * 450 }); // v616: skip identical re-pulls
  return json({ ok: true, bytes: raw.length });
}
async function handlePosJTList(request, env) {
  const session = await getSession(env, request.headers.get("X-Session-Id"));
  if (!session) return json({ error: "unauthorized" }, 401);
  const u = new URL(request.url), from = u.searchParams.get("from") || "", to = u.searchParams.get("to") || "9999", keysOnly = u.searchParams.get("keys") === "1";
  const keys = []; let cursor;
  do { const l = await env.SESSIONS.list({ prefix: "pos:jt:", limit: 1000, cursor }); keys.push(...l.keys.map(k => k.name)); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const locs = (u.searchParams.get("locs") || "").split(",").map(x => x.trim().toUpperCase()).filter(Boolean); // v583: e.g. REM,REF,NAD,ALF
  const want = keys.filter(n => { const d = n.slice(7, 17); if (!(d >= from && d <= to)) return false; return !locs.length || locs.includes(n.slice(18, 21)); }).sort().slice(0, 900);
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
// ═══════════════════════════════════════════════════════════════════════════════
// v601 MORNING AUTO-PULL + PHONE NOTIFICATIONS (free Cloudflare plan)
// The 9 am pull runs in Nikhil's own Google Apps Script (free, up to 6 min per run): it loads /autopull.js — the same
// POS Sync code the dashboard runs — and calls these same /api/pos/* endpoints with a token instead of a login session
// (X-Session-Id: "auto:<token>"). The token is made from the dashboard (POS Sync → Morning auto-pull), kept in KV,
// and can be replaced any time (the old one stops working at once).
// Notifications are standard Web Push to the dashboard in Chrome on the phone: VAPID keys are generated once and kept
// in KV; a push carries no data — the phone's service worker (/sw.js) fetches the message from /api/push/last.
// ═══════════════════════════════════════════════════════════════════════════════
async function autoSession(env, sid) {
  const tok = await env.SESSIONS.get("auto:token");
  if (tok && sid === "auto:" + tok) return { user: "autopull", admin: false, auto: true };
  return null;
}
function hex(bytes) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function sha(text) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).slice(0, 32); }
async function handleAutoToken(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  if (!s || s.auto || !(s.admin || s.user === "nikhil")) return json({ error: "forbidden" }, 403);
  const tok = hex(crypto.getRandomValues(new Uint8Array(24)));
  await env.SESSIONS.put("auto:token", tok);
  await env.SESSIONS.put("auto:tokenmeta", JSON.stringify({ by: s.user, at: new Date().toISOString() }));
  return json({ ok: true, token: tok });
}
async function handleAutoStatus(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const [last, meta, hour] = await Promise.all([env.SESSIONS.get("auto:last"), env.SESSIONS.get("auto:tokenmeta"), env.SESSIONS.get("auto:hour")]);
  const lk = (await env.SESSIONS.list({ prefix: "auto:log:", limit: 1000 })).keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 7);
  const log = (await Promise.all(lk.map(k => env.SESSIONS.get(k.name)))).filter(Boolean).map(x => JSON.parse(x));
  const subs = (await env.SESSIONS.list({ prefix: "push:sub:", limit: 1000 })).keys.length;
  const [lastmail, dcfg] = await Promise.all([env.SESSIONS.get("auto:lastmail"), env.SESSIONS.get("auto:digestcfg")]);
  return json({ ok: true, hasBR: !!(env.CF_BR_TOKEN && env.CF_ACCOUNT_ID), lastmail: lastmail ? JSON.parse(lastmail) : null, digest: dcfg ? JSON.parse(dcfg) : DIGEST_DEFAULT, hour: hour ? +hour : null, hasToken: !!meta, tokenMeta: meta ? JSON.parse(meta) : null, last: last ? JSON.parse(last) : null, log, subs });
}
async function handleAutoReport(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  if (b.hour) await kvPutChanged(env, "auto:hour", String(Math.max(0, Math.min(23, +b.hour || 0)))); // v616
  if (b.stage === "setup") return json({ ok: true }); // v603: setup only records the hour
  if (b.stage === "email") { // v606: the Daily Digest email has its own status line
    await env.SESSIONS.put("auto:lastmail", JSON.stringify({ ts: new Date().toISOString(), ok: !!b.ok, msg: String(b.msg || "").slice(0, 400), to: +b.to || 0 }));
    return json({ ok: true });
  }
  const rec = { ts: new Date().toISOString(), by: s.user, date: String(b.date || "").slice(0, 10), ok: !!b.ok, stage: String(b.stage || "").slice(0, 40), msg: String(b.msg || "").slice(0, 600), secs: +b.secs || 0 };
  await env.SESSIONS.put("auto:last", JSON.stringify(rec));
  await env.SESSIONS.put("auto:log:" + rec.ts, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 60 });
  return json({ ok: true });
}
// ── Web Push (VAPID, no payload) ──
async function pushVapid(env) {
  const raw = await env.SESSIONS.get("push:vapid");
  if (raw) return JSON.parse(raw);
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = b64url(await crypto.subtle.exportKey("raw", kp.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const v = { pub, jwk };
  await env.SESSIONS.put("push:vapid", JSON.stringify(v));
  return v;
}
async function handlePushKey(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  if (!s) return json({ error: "unauthorized" }, 401);
  return json({ ok: true, key: (await pushVapid(env)).pub });
}
async function handlePushSubscribe(request, env) {
  const s = await requirePosUser(request, env);
  if (!s || s.auto) return json({ error: "forbidden" }, 403);
  const b = await readBody(request), sub = b.sub || {};
  if (!sub.endpoint || !/^https:\/\//.test(sub.endpoint)) return json({ error: "bad_subscription" }, 400);
  await env.SESSIONS.put("push:sub:" + await sha(sub.endpoint), JSON.stringify({ endpoint: sub.endpoint, user: s.user, label: String(b.label || "").slice(0, 60), ts: new Date().toISOString() }));
  return json({ ok: true });
}
async function handlePushUnsubscribe(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  if (b.endpoint) await env.SESSIONS.delete("push:sub:" + await sha(b.endpoint));
  return json({ ok: true });
}
async function pushJWT(v, aud, sub) {
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(head + "." + claim));
  return head + "." + claim + "." + b64url(sig);
}
async function handlePushSend(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  const msg = { title: String(b.title || "Oregano Dashboard").slice(0, 120), body: String(b.body || "").slice(0, 900), url: String(b.url || "/").slice(0, 200), tag: String(b.tag || "dash").slice(0, 30), ts: new Date().toISOString() };
  if (!msg.url.startsWith("/")) msg.url = "/";
  await env.SESSIONS.put("push:msg", JSON.stringify(msg), { expirationTtl: 60 * 60 * 24 * 3 });
  const v = await pushVapid(env), origin = new URL(request.url).origin;
  const keys = (await env.SESSIONS.list({ prefix: "push:sub:", limit: 1000 })).keys.slice(0, 30);
  let sent = 0, failed = 0, removed = 0; const errs = [];
  for (const k of keys) {
    const raw = await env.SESSIONS.get(k.name); if (!raw) continue;
    const sub = JSON.parse(raw);
    if (b.onlyMe && !s.auto && sub.user !== s.user) continue;
    try {
      const jwt = await pushJWT(v, new URL(sub.endpoint).origin, origin);
      const r = await fetch(sub.endpoint, { method: "POST", headers: { TTL: "21600", Urgency: "high", Authorization: `vapid t=${jwt}, k=${v.pub}`, "Content-Length": "0" }, body: new Uint8Array(0) });
      if (r.status === 404 || r.status === 410) { await env.SESSIONS.delete(k.name); removed++; }
      else if (r.ok) sent++; else { failed++; errs.push(r.status + " " + (await r.text()).slice(0, 120)); }
    } catch (e) { failed++; errs.push(String(e.message || e).slice(0, 120)); }
  }
  return json({ ok: true, sent, failed, removed, errs: errs.slice(0, 3) });
}
// ── v606 Daily Digest by email ──
// The full Digest is built by the dashboard itself in a browser. Each morning the Apps Script asks for it here: the worker
// makes a one-time, 10-minute, read-only "digest" sign-in, has Cloudflare's headless browser (Browser Rendering, free plan:
// 10 browser-minutes a day) open the dashboard with it, waits for the Digest to be built and returns it as a PDF. The Apps
// Script then emails it from Nikhil's Gmail. Needs two Cloudflare secrets: CF_BR_TOKEN (API token with "Browser Rendering
// – Edit") and CF_ACCOUNT_ID.
// v624: logos and channel icons for the Board Brief email (email apps block embedded images, so the email links here).
// 96×96 JPEGs, public, cached for a week.
const MAIL_LOGOS={"deliveroo":"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","talabat":"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcYGRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wAARCABgAGADASIAAhEBAxEB/8QAGwABAQACAwEAAAAAAAAAAAAAAAcFBgIECAP/xAAsEAABAwQCAQQBAgcAAAAAAAABAAIDBAUGERIhBxMxQVEiCBQXYXGBkaHw/8QAGwEBAAIDAQEAAAAAAAAAAAAAAAQFAQIGCAP/xAAtEQABAwMEAgAFAwUAAAAAAAABAAIRAwQhBQYSMUFREyIyYYFCcfCRobHR8f/aAAwDAQACEQMRAD8A5IiLzavWiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiL70NBX3OuZRW2iqKupfvjDBGXvP9AF8Fdv09UuOC6VFXT3CqffjSuZPRvi1GyP1G6e12u9/j1v76VtounDULptAugH+Y9lUm4NWOl2T7preRHQzH5jof88qFyRyQzPhlY5kjHFr2OGi0g6IP91xP/FUe643hlz8uNt1rvl4q6Sd9RJW+hROkmilDieDGhvYJ63o6WeunhuyVWHXG64vcb3FV0MbpJKO8UhhLwG8tDbWkbAOiNj4UsbcuqhqGjDg0nojMelBO7LOkKQr8ml4By0wJxn1n/altZjl8t+P0d8rbZNT2+sdxp55NASnROwN71ob3pYxXPynG2bwZgMe3ak9Bu2t5HRg10B7n+S4UHhzDru82+iuuVUtaYy6KevtrooZNe+uTB/jYKlXG2ar65pWhmA05IEkicKFabxostRXvQRLnD5QSAGmMqRUGOXy6WSuu9DbZpaChbyqakaDI+tnsns670NrGL0dgGOMpfCGYYxe7hFQshr6qmqazW2xtDGbeN/Gu1p9R4pxK+YRX3zx9lNTc5qEEzQ1LA3npvIgDi0tJHY6IKzcbXqijTfRy4tJIJEyO4HmFi13lQNeqy4wwODWuAMQRguPiVIU+Rr5VFwfCcXvuMC6XufJxI6RzdWy3PlijaPZznhjt79+vZbHL4wxrDfJNlN4yGsdb6ySOS3SNgBc+ZsjT6UgAOgQW6cAPnelDobcuqrGVscDGZGJ9qfc7ss6NV9vDi9s44nJHYH86ypBXW25WuZkNzoKmilewSsZURmNzmn2do/HS6yu36gaPGZLsysnu9TFkDKWNsNCItxSR+o7ZLtdHt3z8eyhKi61po0+5dQDpA/b+/oqZt/VnapZsuXN4k9iDH4nsfdFvfiTMrfhWeOr7q2QUdTTmmkkjbyMX5Bwdr3I2NHX2tERQ7K8qWddtel9TTKn6hYUr+3fbVvpcIMK643mvjXD/KV3qrZcaue33aESOrTC537aX1HOcwDiHcDyB3o9jtdyj8m4laMYvtrqc3vmRz1MUnoTVdIQ0FzHAMZ112Rsnr6Xn5F0FPdlzSbxpsaBmO8cu/P+Vy9TY9nVdzq1Hkw2ZIzx6zxkfiFcJfKWJQ2jAGtM9XLZHx/vIvQI4apzGXNLunEOOxr6WwfxSwymz19/dn17qqGoj9MWhlG70IDxH5HY37j472fpeb0Snu68Zni3x78CPB9e1ipsSwfjk7ojx0TPlpjPkQVebb5N8fusWXW+9S10lNeLlPM2KGncHvhe1jQd+zT+JOj9LqUuZ+NsAwG60GFV9wutyuTC3lURubwJaWtLiWtADQSdDZJ/1EUWh3VcmHcG8gCA6Mie4yvqNlWYlvxH8CQS2RBjqcfZXaj8j4tXeJrNZWZddsTrbdHGyUUNMXum4N4kNIGiHH8vjv3WI8neSrBkNVitZj8tTVS2uc1M37iExEkcCASeiTxO9dKQdp8rWvui6q0fgkDoCc/p68wP6Le22ZY0LgXALjBcQMR8wg+JPeJKrflnJMBzS2UmQ2m51gvjGMgNE6JzQI+RceRI1sbPYPe1JERVWpag6/rGu9oDj3Hn7q60jS2aZbi2puLmiYnwPXjCIiKvVoiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIv/2Q==","noon":"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","careem":"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","keeta":"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","smiles":"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","instashop":"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","oregano":"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","lollorosso":"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","smokeys":"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REREREREREREREREREREREREREREX//Z","wicked-wings":"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","fyoozhen":"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","dine-in":"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","takeaway":"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"};
const DIGEST_DEFAULT = { on: true, to: ["nikhil@oreganorestaurants.com"] };
async function handleAutoKey(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  if (!s || s.auto || !(s.admin || s.user === "nikhil")) return json({ error: "forbidden" }, 403);
  return json({ ok: true, token: await env.SESSIONS.get("auto:token") });
}
async function handleDigestCfgGet(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  const c = await env.SESSIONS.get("auto:digestcfg");
  return json(Object.assign({ ok: true }, c ? JSON.parse(c) : DIGEST_DEFAULT));
}
async function handleDigestCfgSet(request, env) {
  const s = await getSession(env, request.headers.get("X-Session-Id"));
  if (!s || s.auto || !(s.admin || s.user === "nikhil")) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  const to = [...new Set((Array.isArray(b.to) ? b.to : []).map(x => String(x || "").trim().toLowerCase()).filter(x => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x)))].slice(0, 20);
  // v621: send from Outlook via a Power Automate relay — the morning script mails ONE copy to the relay inbox with the
  // recipients and a private code in the subject; Nikhil's flow forwards it from his Outlook address.
  let prev = {}; try { prev = JSON.parse((await env.SESSIONS.get("auto:digestcfg")) || "{}") || {}; } catch (e) { }
  const via = b.via === "outlook" ? "outlook" : (b.via === "gmail" ? "gmail" : (prev.via || "gmail"));
  const rl = String(b.relay || prev.relay || "nikhil@oreganorestaurants.com").trim().toLowerCase();
  const relay = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(rl) ? rl : "nikhil@oreganorestaurants.com";
  let key = prev.key;
  if (!key || b.newKey) { const a = new Uint8Array(6); crypto.getRandomValues(a); key = [...a].map(x => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join(""); }
  const c = { on: !!b.on, to, via, relay, key, by: s.user, at: new Date().toISOString() };
  await env.SESSIONS.put("auto:digestcfg", JSON.stringify(c));
  return json(Object.assign({ ok: true }, c));
}
async function handleDigestPdf(request, env) {
  const s = await requirePosUser(request, env);
  if (!s) return json({ error: "forbidden" }, 403);
  if (!env.CF_BR_TOKEN || !env.CF_ACCOUNT_ID) return json({ error: "no_browser_key", detail: "Add CF_BR_TOKEN and CF_ACCOUNT_ID as secrets on the worker" }, 400);
  const sid = hex(crypto.getRandomValues(new Uint8Array(20)));
  await env.SESSIONS.put(`session:${sid}`, JSON.stringify({ user: "digest", digest: true, displayName: "Daily Digest (automatic)", initials: "DD", admin: false, loginTs: new Date().toISOString() }), { expirationTtl: 600 });
  const origin = new URL(request.url).origin;
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`, {
      method: "POST", headers: { "Authorization": "Bearer " + env.CF_BR_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${origin}/?dsid=${sid}`, gotoOptions: { waitUntil: "domcontentloaded", timeout: 45000 },
        waitForSelector: { selector: "#digest-ready", timeout: 50000 }, viewport: { width: 1280, height: 900 },
        pdfOptions: { format: "a4", printBackground: true, preferCSSPageSize: true, timeout: 60000 } }) });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.includes("pdf")) { const t = (await r.text()).slice(0, 300); return json({ error: "browser_failed", detail: r.status + " " + t }, 502); }
    return new Response(r.body, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
  } finally { await env.SESSIONS.delete(`session:${sid}`); }
}
async function handlePushLast(request, env) {
  const ep = new URL(request.url).searchParams.get("ep") || "";
  if (!ep || !(await env.SESSIONS.get("push:sub:" + await sha(ep)))) return json({ error: "unknown_device" }, 403);
  const m = await env.SESSIONS.get("push:msg");
  return json(m ? JSON.parse(m) : { title: "Oregano Dashboard", body: "", url: "/", tag: "dash" });
}

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
      { const ml = path.match(/^\/mail-logo\/([a-z0-9-]+)\.jpg$/); // v624
        if (ml && method === "GET") { const b = MAIL_LOGOS[ml[1]]; if (!b) return new Response("not found", { status: 404 });
          const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0));
          return new Response(bin, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800", "Access-Control-Allow-Origin": "*" } }); } }
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
      if (path === "/api/sheet/csv"       && method === "GET")  return await handleSheetCsv(request, env); // v611
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
      if (path === "/api/pos/tillonly"    && method === "GET")  return await handlePosTillOnly(request, env);
      if (path === "/api/pos/keetatill"   && method === "GET")  return await handlePosKeetaTill(request, env);
      if (path === "/api/pos/recon/ack"   && method === "POST") return await handlePosReconAck(request, env);
      if (path === "/api/ddclass"         && method === "GET")  return await handleDDClassGet(request, env);
      if (path === "/api/ddclass"         && method === "POST") return await handleDDClassSet(request, env);
      if (path === "/api/pl"              && method === "GET")  return await handlePLGet(request, env);
      if (path === "/api/pl"              && method === "POST") return await handlePLSave(request, env);
    } catch (e) {
      return json({ error: "server_error", detail: String(e.message || e) }, 500);
    }

    // v601: morning auto-pull + phone notifications
    try {
      if (path === "/api/auto/token"      && method === "POST") return await handleAutoToken(request, env);
      if (path === "/api/auto/status"     && method === "GET")  return await handleAutoStatus(request, env);
      if (path === "/api/auto/report"     && method === "POST") return await handleAutoReport(request, env);
      if (path === "/api/push/key"        && method === "GET")  return await handlePushKey(request, env);
      if (path === "/api/push/subscribe"  && method === "POST") return await handlePushSubscribe(request, env);
      if (path === "/api/push/unsubscribe"&& method === "POST") return await handlePushUnsubscribe(request, env);
      if (path === "/api/push/send"       && method === "POST") return await handlePushSend(request, env);
      if (path === "/api/push/last"       && method === "GET")  return await handlePushLast(request, env);
      if (path === "/api/auto/key"        && method === "GET")  return await handleAutoKey(request, env);
      if (path === "/api/auto/digestcfg"  && method === "GET")  return await handleDigestCfgGet(request, env);
      if (path === "/api/auto/digestcfg"  && method === "POST") return await handleDigestCfgSet(request, env);
      if (path === "/api/digest/pdf"      && method === "POST") return await handleDigestPdf(request, env);
    } catch (e) {
      return json({ error: "server_error", detail: String(e.message || e) }, 500);
    }

    // Anything else: serve static assets (index.html, dashboard.js, version.txt, _headers, etc.)
    return env.ASSETS.fetch(request);
  }
};
