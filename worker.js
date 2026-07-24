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
// ═══════════════════════════════════════════════════════════════

// User directory. Edit here to add/remove users — these passwords are NEVER
// shipped to clients (this code only runs on Cloudflare's edge).
const AUTH_USERS = {
  "nikhil":   { password: "oregano2026", displayName: "Nikhil",   initials: "N",  admin: true },
  "biju":     { password: "oregano2027", displayName: "Biju",     initials: "B" },
  "tony":     { password: "oregano2028", displayName: "Tony",     initials: "T" },
  "rijeesh":  { password: "oregano2029", displayName: "Rijeesh",  initials: "R" },
  "nicole":   { password: "oregano2030", displayName: "Nicole",   initials: "N" },
  "arun":     { password: "oregano2025", displayName: "Arun",     initials: "A" },
  "admin":    { password: "admin2020",       displayName: "Admin",    initials: "A" },
  "bd":       { password: "oregano2022", displayName: "BD Team",  initials: "BD" }
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
    ip, ua, loginTs: ts, lastSeen: ts
  };

  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });

  await logEvent(env, { user: userKey, event: "login_success", ip, ua, sessionId });

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
  if (!session) return json({ error: "no_session" }, 401);

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

  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS
  });
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
const ORDERDATA_AGGS = ["keeta", "careem", "talabat", "deliveroo", "noon"];
const ORDERDATA_MAX_BYTES = 5 * 1024 * 1024; // hard guard — parsed aggregates run ~50-350KB in practice

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
  const required = ["brand", "agg", "discPct", "cap", "start", "end", "scenarios"];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) return json({ error: `missing_${k}` }, 400);
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

  // Active sessions
  const sList = await env.SESSIONS.list({ prefix: "session:", limit: 1000 });
  const active = [];
  for (const k of sList.keys) {
    const raw = await env.SESSIONS.get(k.name);
    if (raw) active.push(JSON.parse(raw));
  }

  // Recent events (last 200)
  const eList = await env.SESSIONS.list({ prefix: "event:", limit: 200 });
  const sorted = eList.keys.sort((a, b) => b.name.localeCompare(a.name)).slice(0, 200);
  const events = [];
  for (const k of sorted) {
    const raw = await env.SESSIONS.get(k.name);
    if (raw) events.push(JSON.parse(raw));
  }

  // Bans
  const bList = await env.SESSIONS.list({ prefix: "banned:", limit: 100 });
  const bans = [];
  for (const k of bList.keys) {
    const raw = await env.SESSIONS.get(k.name);
    bans.push({
      user: k.name.slice("banned:".length),
      meta: raw ? JSON.parse(raw) : null
    });
  }

  return json({ active, events, bans, serverTime: new Date().toISOString() });
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
    } catch (e) {
      return json({ error: "server_error", detail: String(e.message || e) }, 500);
    }

    // Anything else: serve static assets (index.html, dashboard.js, version.txt, _headers, etc.)
    return env.ASSETS.fetch(request);
  }
};
