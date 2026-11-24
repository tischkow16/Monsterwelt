// Monsterwelt Online-Server (Cloudflare Worker + D1 + Durable Object)
import GAME from './gamedata.json';

const MAX_MONEY = 1000000000;
const SESSION_DAYS = 60;
const SPECIES = GAME.species;
const ITEMS = new Set(GAME.items);
const TP = new Set(GAME.tp);
const MAPS = new Set(GAME.maps);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json; charset=utf-8', ...CORS}});
const err = (msg, status = 400) => json({ok: false, error: msg}, status);

// ---------- Passwörter ----------
const enc = new TextEncoder();
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return toHex(a); }
async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000}, key, 256);
  return toHex(bits);
}
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

async function userFromReq(req, env) {
  const h = req.headers.get('Authorization') || '';
  const url = new URL(req.url);
  const token = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  if (!token || token.length !== 64) return null;
  const row = await env.DB.prepare('SELECT u.id, u.name, u.banned, u.created_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(token).first();
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}

// ---------- Anti-Cheat: Spielstand prüfen ----------
function expFor(L) { return L <= 1 ? 0 : Math.floor(0.8 * L * L * L); }
function stats(sp, L, b) {
  const s = SPECIES[sp];
  return {
    maxhp: Math.floor(s[0] * 2 * L / 100) + L + 10 + (b.kp || 0),
    atk: Math.floor(s[1] * 2 * L / 100) + 5 + (b.atk || 0),
    def: Math.floor(s[2] * 2 * L / 100) + 5 + (b.def || 0),
    spd: Math.floor(s[3] * 2 * L / 100) + 5 + (b.spd || 0)
  };
}
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function checkMon(m, where) {
  if (!m || typeof m !== 'object') return `${where}: ungültiges Monster`;
  if (!SPECIES[m.sp]) return `${where}: unbekanntes Monster "${String(m.sp).slice(0, 20)}"`;
  if (!isInt(m.level, 1, 100)) return `${where}: ungültiges Level`;
  const b = m.bonus || {};
  if (typeof b !== 'object') return `${where}: ungültige Boni`;
  for (const k of Object.keys(b)) { if (!['kp', 'atk', 'def', 'spd'].includes(k) || !isInt(b[k], 0, 25)) return `${where}: ungültige Boni`; }
  const s = stats(m.sp, m.level, b);
  for (const k of ['maxhp', 'atk', 'def', 'spd']) if (m[k] !== s[k]) return `${where}: manipulierte Werte bei ${m.sp}`;
  if (!isInt(m.hp, 0, m.maxhp)) return `${where}: ungültige KP`;
  if (typeof m.exp !== 'number' || m.exp < 0 || m.exp > expFor(101) + 1e6) return `${where}: ungültige EP`;
  if (m.extra !== undefined) { if (!Array.isArray(m.extra) || m.extra.length > 2 || m.extra.some(x => !TP.has(x))) return `${where}: ungültige TP-Attacken`; }
  if (m.nick !== undefined && m.nick !== null && (typeof m.nick !== 'string' || m.nick.length > 20)) return `${where}: ungültiger Spitzname`;
  return null;
}
function checkBag(bag, where) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return `${where}: ungültig`;
  for (const [k, v] of Object.entries(bag)) {
    if (!ITEMS.has(k)) return `${where}: unbekanntes Item "${k.slice(0, 30)}"`;
    if (!isInt(v, 0, 9999)) return `${where}: ungültige Anzahl bei ${k}`;
  }
  return null;
}
function validateSave(G, account, prev, now) {
  if (!G || typeof G !== 'object') return 'Spielstand ist kaputt';
  if (G.name !== account.name) return 'Name passt nicht zum Account';
  if (!Array.isArray(G.team) || G.team.length > 6) return 'Team ungültig';
  if (!Array.isArray(G.box) || G.box.length > 3000) return 'Box ungültig';
  for (let i = 0; i < G.team.length; i++) { const e = checkMon(G.team[i], 'Team'); if (e) return e; }
  for (let i = 0; i < G.box.length; i++) { const e = checkMon(G.box[i], 'Box'); if (e) return e; }
  if (!isInt(G.money, 0, MAX_MONEY)) return 'Coins ungültig';
  let e = checkBag(G.bag, 'Beutel'); if (e) return e;
  if (G.pc !== undefined) { e = checkBag(G.pc, 'PC'); if (e) return e; }
  if (!Array.isArray(G.badges) || G.badges.length > 20) return 'Orden ungültig';
  if (typeof G.map !== 'string' || !MAPS.has(G.map)) return 'Ort ungültig';
  // Fortschritt pro Zeit begrenzen (gegen Geld-/Monster-Cheats)
  const base = prev || {money: 500, mons: 0, badges: 0, updated_at: account.created_at};
  const minutes = Math.max(0, (now - base.updated_at) / 60000);
  const mons = G.team.length + G.box.length;
  const moneyUp = G.money - base.money;
  if (moneyUp > 300000 + 1500000 * minutes) return 'Zu viele Coins in zu kurzer Zeit';
  if (mons - base.mons > 6 + 8 * minutes) return 'Zu viele neue Monster in zu kurzer Zeit';
  if ((G.badges.length - base.badges) > 1 + Math.floor(minutes / 2)) return 'Zu viele Orden in zu kurzer Zeit';
  if (!prev && (G.money > 50000 || mons > 6 || G.badges.length > 1)) return 'Neuer Account mit fertigem Spielstand';
  return null;
}

// ---------- API ----------
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/' || p === '/api') return json({ok: true, game: 'Monsterwelt', online: true});

      if (p === '/api/register' && req.method === 'POST') {
        const {name, pass} = await req.json();
        if (typeof name !== 'string' || !/^[A-Za-z0-9ÄÖÜäöüß_\-]{3,12}$/.test(name)) return err('Name: 3–12 Zeichen, nur Buchstaben, Zahlen, _ und -');
        if (typeof pass !== 'string' || pass.length < 6 || pass.length > 64) return err('Passwort: mindestens 6 Zeichen');
        const exists = await env.DB.prepare('SELECT id FROM users WHERE name = ?').bind(name).first();
        if (exists) return err('Diesen Namen gibt es schon');
        const salt = randHex(16), hash = await hashPass(pass, salt), now = Date.now();
        const r = await env.DB.prepare('INSERT INTO users (name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)').bind(name, hash, salt, now).run();
        const id = r.meta.last_row_id, token = randHex(32);
        await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(token, id, now, now + SESSION_DAYS * 864e5).run();
        return json({ok: true, token, name});
      }

      if (p === '/api/login' && req.method === 'POST') {
        const {name, pass} = await req.json();
        if (typeof name !== 'string' || typeof pass !== 'string') return err('Name und Passwort angeben');
        const u = await env.DB.prepare('SELECT id, name, pass_hash, salt, banned FROM users WHERE name = ?').bind(name).first();
        if (!u || !safeEq(await hashPass(pass, u.salt), u.pass_hash)) return err('Name oder Passwort falsch', 401);
        if (u.banned) return err('Dieser Account ist gesperrt', 403);
        const token = randHex(32), now = Date.now();
        await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(token, u.id, now, now + SESSION_DAYS * 864e5).run();
        await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
        return json({ok: true, token, name: u.name});
      }

      const user = await userFromReq(req, env);
      if (!user) return err('Bitte neu einloggen', 401);
      if (user.banned) return err('Dieser Account ist gesperrt', 403);

      if (p === '/api/me') return json({ok: true, name: user.name});

      if (p === '/api/logout' && req.method === 'POST') {
        const token = (req.headers.get('Authorization') || '').slice(7);
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        return json({ok: true});
      }

      if (p === '/api/save' && req.method === 'GET') {
        const row = await env.DB.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').bind(user.id).first();
        return json({ok: true, save: row ? JSON.parse(row.data) : null, updatedAt: row ? row.updated_at : null});
      }

      if (p === '/api/save' && req.method === 'PUT') {
        const text = await req.text();
        if (text.length > 600000) return err('Spielstand zu groß');
        let G; try { G = JSON.parse(text); } catch (e) { return err('Spielstand ist kaputt'); }
        const prev = await env.DB.prepare('SELECT data, money, mons, badges, updated_at FROM saves WHERE user_id = ?').bind(user.id).first();
        const now = Date.now();
        const bad = validateSave(G, user, prev, now);
        if (bad) {
          await env.DB.prepare('INSERT INTO cheat_log (user_id, reason, at) VALUES (?, ?, ?)').bind(user.id, bad, now).run();
          return json({ok: false, rejected: true, error: bad, save: prev ? JSON.parse(prev.data) : null}, 409);
        }
        const mons = G.team.length + G.box.length;
        await env.DB.prepare('INSERT INTO saves (user_id, data, money, mons, badges, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, money = excluded.money, mons = excluded.mons, badges = excluded.badges, updated_at = excluded.updated_at, version = saves.version + 1')
          .bind(user.id, text, G.money, mons, G.badges.length, now).run();
        return json({ok: true, savedAt: now});
      }

      if (p === '/api/world') {
        if (req.headers.get('Upgrade') !== 'websocket') return err('WebSocket erwartet', 426);
        const id = env.WORLD.idFromName('welt');
        const h = new Headers(req.headers); h.set('X-User-Id', String(user.id)); h.set('X-User-Name', user.name);
        return env.WORLD.get(id).fetch(new Request(req.url, {headers: h}));
      }

      if (p === '/api/online') {
        const id = env.WORLD.idFromName('welt');
        const r = await env.WORLD.get(id).fetch(new Request('https://welt/list'));
        return json(await r.json());
      }

      return err('Nicht gefunden', 404);
    } catch (e) {
      return err('Serverfehler: ' + (e && e.message || e), 500);
    }
  }
};

// ---------- Welt: wer ist wo (Echtzeit) ----------
export class World {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  players() {
    return this.ctx.getWebSockets().map(ws => ({ws, p: ws.deserializeAttachment() || {}})).filter(o => o.p.id);
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/list') return Response.json({ok: true, players: this.players().map(o => ({name: o.p.name, map: o.p.map}))});
    const id = Number(req.headers.get('X-User-Id')), name = req.headers.get('X-User-Name');
    // gleicher Account doppelt? alte Verbindung schließen
    for (const o of this.players()) if (o.p.id === id) { try { o.ws.close(4000, 'Neu verbunden'); } catch (e) {} }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({id, name, map: null, x: 0, y: 0, dir: 'down', look: {}, last: 0});
    pair[1].send(JSON.stringify({t: 'hello', name, online: this.players().length}));
    return new Response(null, {status: 101, webSocket: pair[0]});
  }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const me = ws.deserializeAttachment(); if (!me) return;
    if (m.t === 'pos') {
      if (typeof m.map !== 'string' || m.map.length > 30 || !Number.isInteger(m.x) || !Number.isInteger(m.y)) return;
      const changedMap = me.map !== m.map, oldMap = me.map;
      Object.assign(me, {map: m.map, x: m.x, y: m.y, dir: ['up', 'down', 'left', 'right'].includes(m.dir) ? m.dir : 'down', ride: m.ride === 'bike' || m.ride === 'surf' ? m.ride : null});
      ws.serializeAttachment(me);
      const out = {t: 'pos', name: me.name, map: me.map, x: me.x, y: me.y, dir: me.dir, ride: me.ride};
      for (const o of this.players()) {
        if (o.ws === ws) continue;
        if (o.p.map === me.map) this.send(o.ws, out);
        else if (changedMap && o.p.map === oldMap) this.send(o.ws, {t: 'leave', name: me.name});
      }
      if (changedMap) this.send(ws, {t: 'here', players: this.players().filter(o => o.ws !== ws && o.p.map === me.map).map(o => ({name: o.p.name, map: o.p.map, x: o.p.x, y: o.p.y, dir: o.p.dir, ride: o.p.ride}))});
    } else if (m.t === 'emote' && typeof m.e === 'string' && m.e.length <= 4) {
      for (const o of this.players()) if (o.ws !== ws && o.p.map === me.map) this.send(o.ws, {t: 'emote', name: me.name, e: m.e});
    } else if (m.t === 'ping') this.send(ws, {t: 'pong', online: this.players().length});
  }
  async webSocketClose(ws) { this.left(ws); }
  async webSocketError(ws) { this.left(ws); }
  left(ws) {
    const me = ws.deserializeAttachment(); if (!me || !me.map) return;
    for (const o of this.players()) if (o.ws !== ws && o.p.map === me.map) this.send(o.ws, {t: 'leave', name: me.name});
  }
}
