// ================= Online-Modus =================
const MW_API_DEFAULT = 'https://monsterwelt.WORKERS_SUBDOMAIN.workers.dev';
const MW_API = (() => { try { return localStorage.getItem('mw_api') || MW_API_DEFAULT; } catch (e) { return MW_API_DEFAULT; } })();
let onTok = null; try { onTok = localStorage.getItem('mw_token'); } catch (e) {}
let onSaving = false, onQueued = false, onLast = 0, onTimer = null, onState = 'ok', onReject = null;
let ws = null, wsTry = 0, wsKey = '', wsMap = null, wsSentAt = 0, OTHERS = {}, onlineCount = 0;
function setTok(t) { onTok = t; try { t ? localStorage.setItem('mw_token', t) : localStorage.removeItem('mw_token'); } catch (e) {} }
async function api(method, path, body) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(MW_API + path, {method, signal: ctl.signal, headers: {'Content-Type': 'application/json', ...(onTok ? {Authorization: 'Bearer ' + onTok} : {})}, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)});
    let d = {}; try { d = await r.json(); } catch (e) {}
    d.status = r.status; return d;
  } finally { clearTimeout(to); }
}
function setOnlineState(s) { onState = s; updateOnlineChip(); }
function updateOnlineChip() {
  const c = $('onlineChip'); if (!c) return;
  if (!G || !G.online) { c.style.display = 'none'; return; }
  c.style.display = '';
  const live = ws && ws.readyState === 1;
  c.className = onState === 'ok' && live ? 'ok' : onState === 'ok' ? 'wait' : 'bad';
  c.textContent = onState === 'auth' ? '🌐 Bitte neu einloggen' : onState === 'err' ? '🌐 Keine Verbindung' : live ? `🌐 ${onlineCount} online` : '🌐 Verbinde …';
}
async function onlineSave() {
  if (!G || !G.online || !onTok) return;
  if (onSaving) { onQueued = true; return; }
  onSaving = true; clearTimeout(onTimer); onLast = Date.now();
  try {
    const d = await api('PUT', '/api/save', JSON.stringify(G));
    if (d.ok) setOnlineState('ok');
    else if (d.status === 401 || d.status === 403) { setOnlineState('auth'); toast('⚠ ' + (d.error || 'Bitte neu einloggen')); }
    else if (d.rejected) { onReject = d; setOnlineState('ok'); }
    else setOnlineState('err');
  } catch (e) { setOnlineState('err'); }
  onSaving = false;
  if (onQueued) { onQueued = false; onlineSave(); }
}
function onlineAutosave() {
  if (Date.now() - onLast > 15000) onlineSave();
  else { clearTimeout(onTimer); onTimer = setTimeout(onlineSave, 15000 - (Date.now() - onLast)); }
}
// abgelehnter Spielstand: letzten gültigen Server-Spielstand laden
function onlineRejectCheck() {
  if (!onReject || handlers.length || scriptLock || B || moving) return;
  const d = onReject; onReject = null;
  script(async () => {
    await say(`⚠ Der Server hat deinen Spielstand abgelehnt:\n„${d.error}“`);
    await say('Damit niemand schummeln kann, wird jetzt dein letzter\ngültiger Spielstand geladen.');
    const name = G.name;
    if (d.save) { d.save.online = true; G = d.save; }
    else { newGame(name); G.online = true; }
    enterMap(G.map, G.x, G.y, G.dir);
  });
}
// --- Echtzeit: andere Spieler sehen ---
function wsConnect() {
  if (!G || !G.online || !onTok || ws) return;
  try { ws = new WebSocket(MW_API.replace(/^http/, 'ws') + '/api/world?token=' + onTok); } catch (e) { ws = null; return; }
  ws.onopen = () => { wsTry = 0; wsKey = ''; sendPos(true); updateOnlineChip(); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } onWsMsg(m); };
  ws.onclose = ev => { ws = null; OTHERS = {}; updateOnlineChip(); if (ev.code === 4000) { toast('🌐 Du hast dich woanders eingeloggt'); return; } if (G && G.online) setTimeout(wsConnect, Math.min(30000, 1000 * Math.pow(2, wsTry++))); };
}
function wsClose() { if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; } OTHERS = {}; }
function onWsMsg(m) {
  if (m.t === 'hello' || m.t === 'pong') { onlineCount = m.online; updateOnlineChip(); }
  else if (m.t === 'here') { OTHERS = {}; for (const p of m.players) if (p.map === G.map) addOther(p); }
  else if (m.t === 'pos') { if (m.map !== G.map) { delete OTHERS[m.name]; return; } addOther(m); }
  else if (m.t === 'leave') delete OTHERS[m.name];
  else if (m.t === 'emote') { const o = OTHERS[m.name]; if (o) { o.emote = m.e; o.emoteT = performance.now(); } }
}
function lookFor(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const SH = ['#e67e22', '#27ae60', '#8e44ad', '#16a085', '#d35400', '#c0392b', '#2c3e50', '#f1c40f', '#e84393', '#00b894'], HT = ['#2d3436', '#0984e3', '#6c5ce7', '#fdcb6e', '#00cec9', '#e17055', '#ffffff', '#55efc4'], HR = ['#3b2a20', '#1d1f2a', '#a0522d', '#f5d76e', '#7f8c8d'];
  return {hair: HR[h % HR.length], hat: HT[(h >> 4) % HT.length], shirt: SH[(h >> 8) % SH.length], pants: '#28324a'};
}
function addOther(p) {
  const o = OTHERS[p.name];
  if (o) Object.assign(o, {x: p.x, y: p.y, dir: p.dir, ride: p.ride});
  else OTHERS[p.name] = {name: p.name, x: p.x, y: p.y, dir: p.dir, ride: p.ride, px: p.x * 16, py: p.y * 16, look: lookFor(p.name)};
}
function sendPos(force) {
  if (!G) return;
  if (G.map !== wsMap) { wsMap = G.map; OTHERS = {}; }
  if (!ws || ws.readyState !== 1) return;
  const ride = G.surf ? 'surf' : G.bike ? 'bike' : null, key = `${G.map}|${G.x}|${G.y}|${G.dir}|${ride}`;
  if (!force && (key === wsKey || performance.now() - wsSentAt < 90)) return;
  wsKey = key; wsSentAt = performance.now();
  try { ws.send(JSON.stringify({t: 'pos', map: G.map, x: G.x, y: G.y, dir: G.dir, ride})); } catch (e) {}
}
setInterval(() => { if (ws && ws.readyState === 1) try { ws.send('{"t":"ping"}'); } catch (e) {} }, 25000);
function onlineUpdate(dt) {
  if (!G || !G.online) return;
  sendPos(false); onlineRejectCheck();
  const sp = dt * 0.14;
  for (const o of Object.values(OTHERS)) {
    const tx = o.x * 16, ty = o.y * 16, dx = tx - o.px, dy = ty - o.py;
    if (Math.abs(dx) > 48 || Math.abs(dy) > 48) { o.px = tx; o.py = ty; }
    else { o.px += Math.sign(dx) * Math.min(Math.abs(dx), sp * (o.ride === 'bike' ? 2 : 1)); o.py += Math.sign(dy) * Math.min(Math.abs(dy), sp * (o.ride === 'bike' ? 2 : 1)); }
    o.moving = o.px !== tx || o.py !== ty;
  }
}
function otherEnts(camX, camY) {
  if (!G || !G.online) return [];
  return Object.values(OTHERS).map(o => ({y: o.py, f: () => drawOther(o, Math.round(o.px - camX), Math.round(o.py - camY))}));
}
function drawOther(o, x, y) {
  const now = performance.now();
  if (o.ride === 'surf') {
    ctx.fillStyle = '#1d3f7a'; ctx.beginPath(); ctx.ellipse(x + 8, y + 11, 8, 5, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y - 8, 24, 16); ctx.clip(); drawPerson(ctx, x, y - 6, o.dir, o.look, 0); ctx.restore();
  } else if (o.ride === 'bike') {
    ctx.fillStyle = '#1d1f2a'; if (o.dir === 'left' || o.dir === 'right') { ctx.beginPath(); ctx.arc(x + 3, y + 13, 3, 0, 7); ctx.arc(x + 13, y + 13, 3, 0, 7); ctx.fill(); } else R_(ctx, x + 6, y + 9, 4, 7, '#1d1f2a');
    drawPerson(ctx, x, y - 3, o.dir, o.look, 0);
  } else drawPerson(ctx, x, y - 3, o.dir, o.look, o.moving ? (Math.floor(now / 130) % 2) + 1 : 0);
  // Name
  ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const w = ctx.measureText(o.name).width + 4;
  ctx.fillStyle = 'rgba(20,22,34,.75)'; ctx.fillRect(x + 8 - w / 2, y - 12, w, 8);
  ctx.fillStyle = '#9ff0a6'; ctx.fillText(o.name, x + 8, y - 4.5);
  if (o.emote && now - o.emoteT < 2500) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d1f2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 1, y - 26, 14, 12, 3); ctx.fill(); ctx.stroke();
    ctx.font = '8px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(o.emote, x + 8, y - 19.5);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
async function onlineMenu() {
  let list = [];
  try { const d = await api('GET', '/api/online'); if (d.ok) list = d.players; } catch (e) {}
  const where = p => (MAPS[p.map] && MAPS[p.map].name) || '…';
  const others = list.filter(p => p.name !== G.name);
  const txt = others.length ? others.map(p => `• ${p.name} – ${where(p)}${p.map === G.map ? ' (hier!)' : ''}`).join('\n') : 'Gerade ist niemand außer dir online.';
  const i = await choose(['👋 Winken', '❤️ Herz', '😂 Lachen', '⚔️ Kampf?', '🔁 Tausch?', 'Abmelden', 'Zurück'], {title: `🌐 Online: ${list.length} Spieler`, text: txt});
  const E = ['👋', '❤️', '😂', '⚔️', '🔁'];
  if (i >= 0 && i < 5) { try { ws && ws.readyState === 1 && ws.send(JSON.stringify({t: 'emote', e: E[i]})); } catch (e) {} G._myEmote = E[i]; G._myEmoteT = performance.now(); toast(`${E[i]} gesendet`); }
  else if (i === 5) { if (await yesNo('Wirklich abmelden? Dein Spielstand wird vorher gespeichert.')) { await onlineSave(); try { await api('POST', '/api/logout'); } catch (e) {} setTok(null); wsClose(); G = null; $('title').style.display = ''; titleScreen(); } }
}
// --- Titelbildschirm: Online-Bereich ---
function onlineTitle(main, back) {
  const box = document.createElement('div'); box.className = 'onbox'; main.innerHTML = ''; main.appendChild(box);
  const msg = t => { const h = box.querySelector('.hint') || box.appendChild(Object.assign(document.createElement('div'), {className: 'hint'})); h.textContent = t; };
  const btn = (t, fn, parent) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; (parent || box).appendChild(b); return b; };
  async function start() {
    box.innerHTML = '<div class="hint">Verbinde mit dem Server …</div>';
    if (onTok) {
      let me = null; try { me = await api('GET', '/api/me'); } catch (e) {}
      if (me && me.ok) return menu(me.name);
      if (!me) { box.innerHTML = ''; msg('Der Server ist gerade nicht erreichbar. Prüfe dein Internet.'); btn('Nochmal versuchen', start); btn('Zurück', back); return; }
      setTok(null);
    }
    form();
  }
  function form() {
    box.innerHTML = '<div class="sub">🌐 Online spielen</div>';
    const n = Object.assign(document.createElement('input'), {placeholder: 'Name', maxLength: 12, autocomplete: 'username'});
    const p = Object.assign(document.createElement('input'), {placeholder: 'Passwort', type: 'password', maxLength: 64, autocomplete: 'current-password'});
    box.appendChild(n); box.appendChild(p);
    const row = document.createElement('div'); row.className = 'row'; box.appendChild(row);
    const go = async reg => {
      const name = n.value.trim(), pass = p.value;
      if (!name || !pass) return msg('Bitte Name und Passwort eingeben.');
      msg(reg ? 'Account wird erstellt …' : 'Einloggen …');
      let d = null; try { d = await api('POST', reg ? '/api/register' : '/api/login', {name, pass}); } catch (e) {}
      if (!d) return msg('Server nicht erreichbar. Prüfe dein Internet.');
      if (!d.ok) return msg(d.error || 'Fehler');
      setTok(d.token); menu(d.name);
    };
    btn('Einloggen', () => go(false), row); btn('Account erstellen', () => go(true), row);
    p.addEventListener('keydown', e => { if (e.key === 'Enter') go(false); });
    btn('Zurück', back);
    msg('Neu hier? Name und Passwort ausdenken und „Account erstellen“ drücken.');
    n.focus();
  }
  async function menu(name) {
    box.innerHTML = '<div class="hint">Spielstand wird geladen …</div>';
    let d = null; try { d = await api('GET', '/api/save'); } catch (e) {}
    box.innerHTML = `<div class="sub">🌐 Eingeloggt als <b>${name}</b></div>`;
    if (!d || !d.ok) { msg('Spielstand konnte nicht geladen werden.'); btn('Nochmal versuchen', () => menu(name)); btn('Zurück', back); return; }
    const sv = d.save;
    if (sv) { const top = (sv.team || []).reduce((mx, m) => Math.max(mx, m.level), 0); btn(`Weiter (Lv ${top} · ${(sv.badges || []).length} Orden)`, () => { sv.online = true; startGame(sv, false); }); }
    else btn('Online-Abenteuer starten', () => { newGame(name); G.online = true; startGame(G, true); onlineSave(); });
    btn('Abmelden', async () => { try { await api('POST', '/api/logout'); } catch (e) {} setTok(null); form(); });
    btn('Zurück', back);
    msg('Online wird dein Spielstand auf dem Server gespeichert und geprüft. Offline-Spielstände zählen hier nicht.');
  }
  start();
}
