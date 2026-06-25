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
// ═══════════════════════════════════════════════════════════════

// User directory. Edit here to add/remove users — these passwords are NEVER
// shipped to clients (this code only runs on Cloudflare's edge).
const AUTH_USERS = {
  "nikhil":   { password: "oregano2024", displayName: "Nikhil",   initials: "N",  admin: true },
  "biju":     { password: "oregano2025", displayName: "Biju",     initials: "B" },
  "tony":     { password: "oregano2023", displayName: "Tony",     initials: "T" },
  "rijeesh":  { password: "oregano2020", displayName: "Rijeesh",  initials: "R" },
  "nicole":   { password: "oregano2021", displayName: "Nicole",   initials: "N" },
  "arun":     { password: "oregano2028", displayName: "Arun",     initials: "A" },
  "admin":    { password: "admin3300",       displayName: "Admin",    initials: "A" },
  "bd":       { password: "oregano3377", displayName: "BD Team",  initials: "BD" }
};

const SESSION_TTL_SECONDS = 300; // 5 min — refreshed by 60s heartbeats

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

  session.lastSeen = new Date().toISOString();
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

    try {
      if (path === "/api/login"           && method === "POST") return handleLogin(request, env);
      if (path === "/api/heartbeat"       && method === "POST") return handleHeartbeat(request, env);
      if (path === "/api/logout"          && method === "POST") return handleLogout(request, env);
      if (path === "/api/admin/sessions"  && method === "GET")  return handleAdminSessions(request, env);
      if (path === "/api/admin/kick"      && method === "POST") return handleAdminKick(request, env);
      if (path === "/api/admin/ban"       && method === "POST") return handleAdminBan(request, env);
      if (path === "/api/admin/unban"     && method === "POST") return handleAdminUnban(request, env);
    } catch (e) {
      return json({ error: "server_error", detail: String(e.message || e) }, 500);
    }

    // Anything else: serve static assets (index.html, dashboard.js, version.txt, _headers, etc.)
    return env.ASSETS.fetch(request);
  }
};
