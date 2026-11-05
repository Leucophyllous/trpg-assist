const ORIGINS = ["https://leucophyllous.github.io", "http://localhost:8080", "http://127.0.0.1:8080"];
const SYSTEMS = ["Cthulhu", "Cthulhu7th", "SwordWorld2.5", "ShinobiGami", "Emoklore", "Other"];
const LIM = { tables: 5000, perIpPerDay: 10, members: 30, body: 65536, dice: 1000 };
const COLL = {
  rules: { cols: { title: 100, body: 20000 }, max: 300 },
  sheets: { cols: { name: 100, data: 30000 }, max: 100 },
  logs: { cols: { title: 100, body: 30000, played_on: 20 }, max: 300 }
};
const enc = new TextEncoder();
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function rnd(n) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function clip(v, n) {
  return String(v ?? "").trim().slice(0, n);
}
function corsHeaders(req) {
  const o = req.headers.get("Origin");
  const h = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type", "Access-Control-Max-Age": "86400" };
  if (o && ORIGINS.includes(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function readBody(req) {
  const text = await req.text();
  if (text.length > LIM.body) throw new HttpError(413, "too large");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid json");
  }
}
async function authMember(env, req, tableId) {
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "unauthorized");
  const row = await env.DB.prepare("SELECT id, table_id, name, role FROM members WHERE token_hash = ?").bind(await sha(m[1])).first();
  if (!row || row.table_id !== tableId) throw new HttpError(403, "forbidden");
  return row;
}
function requireGm(me) {
  if (me.role !== "gm") throw new HttpError(403, "gm only");
}
async function createTable(env, req) {
  const b = await readBody(req);
  const name = clip(b.name, 60);
  const displayName = clip(b.displayName, 30);
  const system = SYSTEMS.includes(b.system) ? b.system : "Other";
  if (!name || !displayName) throw new HttpError(400, "name and displayName required");
  const ipHash = await sha(req.headers.get("CF-Connecting-IP") || "unknown");
  const now = Date.now();
  const total = await env.DB.prepare("SELECT COUNT(*) AS c FROM tables").first();
  if (total.c >= LIM.tables) throw new HttpError(503, "capacity reached");
  const recent = await env.DB.prepare("SELECT COUNT(*) AS c FROM tables WHERE creator_hash = ? AND created_at > ?").bind(ipHash, now - 86400000).first();
  if (recent.c >= LIM.perIpPerDay) throw new HttpError(429, "too many tables created");
  const tableId = rnd(9);
  const memberId = rnd(9);
  const memberToken = rnd(24);
  const inviteToken = rnd(18);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tables (id, name, system, description, invite_token, creator_hash, created_at) VALUES (?,?,?,?,?,?,?)").bind(tableId, name, system, clip(b.description, 500), inviteToken, ipHash, now),
    env.DB.prepare("INSERT INTO members (id, table_id, name, role, token_hash, created_at) VALUES (?,?,?,?,?,?)").bind(memberId, tableId, displayName, "gm", await sha(memberToken), now)
  ]);
  return { tableId, memberToken, inviteToken };
}
async function joinTable(env, req) {
  const b = await readBody(req);
  const displayName = clip(b.displayName, 30);
  if (!displayName || !b.inviteToken) throw new HttpError(400, "inviteToken and displayName required");
  const t = await env.DB.prepare("SELECT id, name, system FROM tables WHERE invite_token = ?").bind(clip(b.inviteToken, 64)).first();
  if (!t) throw new HttpError(404, "invalid invite");
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM members WHERE table_id = ?").bind(t.id).first();
  if (cnt.c >= LIM.members) throw new HttpError(409, "table is full");
  const memberToken = rnd(24);
  await env.DB.prepare("INSERT INTO members (id, table_id, name, role, token_hash, created_at) VALUES (?,?,?,?,?,?)").bind(rnd(9), t.id, displayName, "player", await sha(memberToken), Date.now()).run();
  return { tableId: t.id, tableName: t.name, memberToken };
}
async function previewInvite(env, token) {
  const t = await env.DB.prepare("SELECT name, system FROM tables WHERE invite_token = ?").bind(clip(token, 64)).first();
  if (!t) throw new HttpError(404, "invalid invite");
  return { name: t.name, system: t.system };
}
async function getTable(env, me, id) {
  const t = await env.DB.prepare("SELECT id, name, system, description, invite_token, created_at FROM tables WHERE id = ?").bind(id).first();
  const members = await env.DB.prepare("SELECT id, name, role FROM members WHERE table_id = ? ORDER BY created_at").bind(id).all();
  const out = { table: { id: t.id, name: t.name, system: t.system, description: t.description, created_at: t.created_at }, me: { id: me.id, name: me.name, role: me.role }, members: members.results };
  if (me.role === "gm") out.inviteToken = t.invite_token;
  return out;
}
async function patchTable(env, me, id, req) {
  requireGm(me);
  const b = await readBody(req);
  const name = clip(b.name, 60);
  if (!name) throw new HttpError(400, "name required");
  const system = SYSTEMS.includes(b.system) ? b.system : "Other";
  await env.DB.prepare("UPDATE tables SET name = ?, description = ?, system = ? WHERE id = ?").bind(name, clip(b.description, 500), system, id).run();
  return { ok: true };
}
async function rotateInvite(env, me, id) {
  requireGm(me);
  const inviteToken = rnd(18);
  await env.DB.prepare("UPDATE tables SET invite_token = ? WHERE id = ?").bind(inviteToken, id).run();
  return { inviteToken };
}
async function removeMember(env, me, id, memberId) {
  const target = await env.DB.prepare("SELECT id, role FROM members WHERE id = ? AND table_id = ?").bind(memberId, id).first();
  if (!target) throw new HttpError(404, "not found");
  if (target.role === "gm") throw new HttpError(400, "cannot remove gm");
  if (me.role !== "gm" && me.id !== memberId) throw new HttpError(403, "forbidden");
  await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(memberId).run();
  return { ok: true };
}
async function deleteTable(env, me, id) {
  requireGm(me);
  await env.DB.batch(["rules", "sheets", "logs", "dice", "members", "tables"].map(t =>
    env.DB.prepare(t === "tables" ? "DELETE FROM tables WHERE id = ?" : "DELETE FROM " + t + " WHERE table_id = ?").bind(id)));
  return { ok: true };
}
function pickCols(spec, b) {
  const out = {};
  for (const [k, max] of Object.entries(spec.cols)) out[k] = clip(b[k], max);
  const first = Object.keys(spec.cols)[0];
  if (!out[first]) throw new HttpError(400, first + " required");
  return out;
}
async function collection(env, me, id, name, rid, req) {
  const spec = COLL[name];
  const method = req.method;
  const colNames = Object.keys(spec.cols);
  if (method === "GET" && !rid) {
    const rows = await env.DB.prepare("SELECT x.id, " + colNames.map(c => "x." + c).join(", ") + ", x.author_id, x.updated_at, m.name AS author_name FROM " + name + " x LEFT JOIN members m ON m.id = x.author_id WHERE x.table_id = ? ORDER BY x.updated_at DESC").bind(id).all();
    return { items: rows.results };
  }
  if (method === "POST" && !rid) {
    const vals = pickCols(spec, await readBody(req));
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM " + name + " WHERE table_id = ?").bind(id).first();
    if (cnt.c >= spec.max) throw new HttpError(409, "limit reached");
    const newId = rnd(9);
    await env.DB.prepare("INSERT INTO " + name + " (id, table_id, " + colNames.join(", ") + ", author_id, updated_at) VALUES (?, ?, " + colNames.map(() => "?").join(", ") + ", ?, ?)").bind(newId, id, ...colNames.map(c => vals[c]), me.id, Date.now()).run();
    return { id: newId };
  }
  if (rid) {
    const row = await env.DB.prepare("SELECT author_id FROM " + name + " WHERE id = ? AND table_id = ?").bind(rid, id).first();
    if (!row) throw new HttpError(404, "not found");
    if (me.role !== "gm" && row.author_id !== me.id) throw new HttpError(403, "forbidden");
    if (method === "PUT") {
      const vals = pickCols(spec, await readBody(req));
      await env.DB.prepare("UPDATE " + name + " SET " + colNames.map(c => c + " = ?").join(", ") + ", updated_at = ? WHERE id = ?").bind(...colNames.map(c => vals[c]), Date.now(), rid).run();
      return { ok: true };
    }
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM " + name + " WHERE id = ?").bind(rid).run();
      return { ok: true };
    }
  }
  throw new HttpError(405, "method not allowed");
}
async function diceList(env, id, url) {
  const after = parseInt(url.searchParams.get("after") || "0", 10) || 0;
  if (after > 0) {
    const r = await env.DB.prepare("SELECT id, member_id, member_name, system, command, result, created_at FROM dice WHERE table_id = ? AND id > ? ORDER BY id LIMIT 100").bind(id, after).all();
    return { items: r.results };
  }
  const r = await env.DB.prepare("SELECT id, member_id, member_name, system, command, result, created_at FROM dice WHERE table_id = ? ORDER BY id DESC LIMIT 50").bind(id).all();
  return { items: r.results.reverse() };
}
async function diceAdd(env, me, id, req) {
  const b = await readBody(req);
  const command = clip(b.command, 200);
  const result = clip(b.result, 2000);
  if (!command || !result) throw new HttpError(400, "command and result required");
  const r = await env.DB.prepare("INSERT INTO dice (table_id, member_id, member_name, system, command, result, created_at) VALUES (?,?,?,?,?,?,?)").bind(id, me.id, me.name, clip(b.system, 30), command, result, Date.now()).run();
  await env.DB.prepare("DELETE FROM dice WHERE table_id = ? AND id <= (SELECT id FROM dice WHERE table_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)").bind(id, id, LIM.dice).run();
  return { id: r.meta.last_row_id };
}
async function route(env, req) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, "");
  const method = req.method;
  if (p === "/api/tables" && method === "POST") return createTable(env, req);
  if (p === "/api/join" && method === "POST") return joinTable(env, req);
  let m = /^\/api\/invite\/([\w-]+)$/.exec(p);
  if (m && method === "GET") return previewInvite(env, m[1]);
  m = /^\/api\/t\/([\w-]+)(?:\/([a-z]+)(?:\/([\w-]+))?)?$/.exec(p);
  if (!m) throw new HttpError(404, "not found");
  const [, id, sub, subId] = m;
  const me = await authMember(env, req, id);
  if (!sub) {
    if (method === "GET") return getTable(env, me, id);
    if (method === "PATCH") return patchTable(env, me, id, req);
    if (method === "DELETE") return deleteTable(env, me, id);
  }
  if (sub === "invite" && method === "POST") return rotateInvite(env, me, id);
  if (sub === "members" && subId && method === "DELETE") return removeMember(env, me, id, subId);
  if (sub === "dice" && !subId) {
    if (method === "GET") return diceList(env, id, url);
    if (method === "POST") return diceAdd(env, me, id, req);
  }
  if (COLL[sub]) return collection(env, me, id, sub, subId, req);
  throw new HttpError(404, "not found");
}
export default {
  async fetch(req, env) {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const origin = req.headers.get("Origin");
    if (origin && !ORIGINS.includes(origin)) return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    try {
      const data = await route(env, req);
      return new Response(JSON.stringify(data), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e && e.stack || e);
      return new Response(JSON.stringify({ error: status === 500 ? "internal error" : e.message }), { status, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }
};
