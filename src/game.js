'use strict';
const DATA = /*DATA*/null;

// ================= Grunddaten =================
const TILE = 16, VW = 15, VH = 11;
const TYPE_COLORS = {Glut:'#e8603c',Flut:'#3d8be0',Wuchs:'#43a047',Funke:'#e6b417',Stein:'#a1887f',Frost:'#5ec6dc',Klang:'#cc5fc8',Nebel:'#7e70b5',Metall:'#8c99a6',Wind:'#5fbf86',Geist:'#5a3f9e'};
const TYPE_DISPLAY = DATA.typenAnzeigeNamen || {};
const SHINY_CHANCE = (DATA.shinyRegeln && DATA.shinyRegeln.chance) || 0.002;
const SPECIES = {};
DATA.monster.forEach(m => { SPECIES[m.name] = m; });

function parseEffect(t) {
  const e = {chance: 1}; let m;
  if ((m = t.match(/^(\d+)\s*%\s*Chance/))) e.chance = +m[1] / 100;
  if ((m = t.match(/Heilt (\d+)\s*%/))) { e.heal = +m[1] / 100; e.once = /einmal pro Kampf/.test(t); }
  if ((m = t.match(/[Ee]rhöht (?:die )?eigene[ns]? (Angriff|Verteidigung|Tempo) für (\d+) Runden? um (\d+)/))) e.self = {stat: m[1], turns: +m[2], mult: 1 + m[3] / 100};
  if ((m = t.match(/(Angriff|Verteidigung|Tempo|Genauigkeit) des Ziels für (\d+) Runden? (?:um )?[−-]?\s?(\d+)/))) e.foe = {stat: m[1], turns: +m[2], mult: 1 - m[3] / 100};
  if ((m = t.match(/Eigenes (Tempo|Angriff|Verteidigung) in der nächsten Runde [−-]\s?(\d+)/))) e.self = {stat: m[1], turns: 1, mult: 1 - m[2] / 100};
  if ((m = t.match(/verliert (\d+)\s*% seiner maximalen KP/))) e.recoil = +m[1] / 100;
  if (/auszuweichen/.test(t)) e.evade = true;
  if ((m = t.match(/gegnerische[n]? (Angriff|Verteidigung|Tempo) für (\d+) Runden? um (\d+)/))) e.foe = {stat: m[1], turns: +m[2], mult: 1 - m[3] / 100};
  if (/einmal pro Kampf/i.test(t) && !e.heal) e.onceMove = true;
  if ((m = t.match(/(Angriff|Verteidigung|Tempo) des Ziels um eine Stufe/))) e.foe = {stat: m[1], turns: 3, mult: 0.8};
  if ((m = t.match(/[Ee]rhöht (?:das |die |den )?eigene[ns]? (Angriff|Verteidigung|Tempo) um eine Stufe/))) e.self = {stat: m[1], turns: 3, mult: 1.2};
  if ((m = t.match(/sinkt der eigene (Angriff|Verteidigung|Tempo) für (\d+) Runden? um (\d+)/))) e.selfAfter = {stat: m[1], turns: +m[2], mult: 1 - m[3] / 100};
  return e;
}
DATA.monster.forEach(m => m.attacken.forEach(a => {
  a.anzeige = a.name.startsWith(m.name + '-') ? a.name.slice(m.name.length + 1) : a.name.endsWith(' ' + m.name) ? a.name.slice(0, -(m.name.length + 1)) : a.name;
  a.fx = parseEffect(a.effekt || '');
}));
const PREV = {}; DATA.monster.forEach(m => { if (m.entwicktSichZu) PREV[m.entwicktSichZu] = m.name; });
function isLegend(name) { return ['Legendär', 'Geheimlegendär', 'Mythisch'].includes(SPECIES[name].kategorie); }
function statSum(name) { const s = SPECIES[name]; return s.kp + s.angriff + s.verteidigung + s.tempo; }
function sizeClass(name) { if (isLegend(name)) return 4; const v = statSum(name); return v < 220 ? 1 : v < 320 ? 2 : v < 400 ? 3 : 4; }
function catchBase(name) { if (isLegend(name)) return 0.06; const v = statSum(name); return v < 220 ? 0.6 : v < 320 ? 0.4 : v < 400 ? 0.22 : 0.12; }
function stageOf(name) { let s = 1, c = name; while (PREV[c]) { s++; c = PREV[c]; } return s; }
function typeMult(at, defTypes) {
  const t = DATA.typTabelle[at]; if (!t) return 1; let m = 1;
  for (const d of defTypes) { if (t.starkGegen.includes(d)) m *= 2; else if (t.schwachGegen.includes(d)) m *= 0.5; }
  return m;
}
function moveLevel(a, sp) {
  if (isLegend(sp.name)) return 1;
  const s = a.staerke; if (s <= 50) return 1; if (s <= 69) return 7; if (s <= 79) return 11; return 15;
}
function badge(t) { return `<span class="tbadge" style="background:${TYPE_COLORS[t] || '#888'}">${TYPE_DISPLAY[t] || t}</span>`; }
function dispText(t) { return String(t).replace(/\bFunke\b/g, TYPE_DISPLAY.Funke || 'Funke'); }
function badges(types) { return types.map(badge).join(' '); }

// ================= Monster-Instanzen =================
let G = null; // Spielstand
function expFor(L) { return L <= 1 ? 0 : Math.floor(0.8 * L * L * L); }
function calcStats(m) {
  const sp = SPECIES[m.sp], L = m.level;
  m.maxhp = Math.floor(sp.kp * 2 * L / 100) + L + 10;
  m.atk = Math.floor(sp.angriff * 2 * L / 100) + 5;
  m.def = Math.floor(sp.verteidigung * 2 * L / 100) + 5;
  m.spd = Math.floor(sp.tempo * 2 * L / 100) + 5;
  const b = m.bonus || {}; m.maxhp += b.kp || 0; m.atk += b.atk || 0; m.def += b.def || 0; m.spd += b.spd || 0;
}
function wildMon(name, level) { const m = makeMon(name, level); if (Math.random() < SHINY_CHANCE) m.shiny = true; return m; }
function makeMon(name, level) {
  const m = {sp: name, level, exp: expFor(level), uid: Math.random().toString(36).slice(2)};
  calcStats(m); m.hp = m.maxhp; return m;
}
function movesOf(m) { const sp = SPECIES[m.sp]; let l = sp.attacken.filter(a => moveLevel(a, sp) <= m.level); if (!l.length) l = [sp.attacken[0]]; if (m.extra && m.extra.length) l = l.concat(m.extra.map(n => TP_MOVES[n]).filter(Boolean)); return l; }
const MAX_MONEY = 1000000000;
function fmtC(n) { return Math.floor(Number(n) || 0).toLocaleString('de-DE'); }
function addMoney(n) { n = Math.floor(n); const before = G.money; G.money = Math.max(0, Math.min(MAX_MONEY, G.money + n)); if (n > 0 && G.money === MAX_MONEY && before + n > MAX_MONEY) toast(`🪙 Maximum erreicht: ${fmtC(MAX_MONEY)} Coins!`); }
function healAll() { G.team.forEach(m => { m.hp = m.maxhp; cureStatus(m); }); }
// ===== Statuseffekte =====
const STATUS = {gift: {tag: 'GIF', col: '#9b59b6', name: 'vergiftet'}, para: {tag: 'PAR', col: '#e0b000', name: 'paralysiert'}, brand: {tag: 'BRT', col: '#e8572a', name: 'verbrannt'}, schlaf: {tag: 'SLF', col: '#7f8c8d', name: 'eingeschlafen'}, eis: {tag: 'GFR', col: '#3fb6e8', name: 'eingefroren'}};
const STATUS_BY_TYPE = {Funke: ['para', 0.12], Glut: ['brand', 0.12], Frost: ['eis', 0.08], Nebel: ['gift', 0.18], Geist: ['gift', 0.12], Wuchs: ['gift', 0.1], Klang: ['schlaf', 0.1]};
const STATUS_IMMUNE = {para: ['Funke'], brand: ['Glut'], eis: ['Frost'], gift: ['Metall', 'Nebel']};
const POISON_TIME = 180;
function cureStatus(m) { m.status = null; delete m.poisonDeadline; delete m.sleep; }
function statusTag(m) { return m && m.status && m.hp > 0 && STATUS[m.status] ? `<span class="stag" style="background:${STATUS[m.status].col}">${STATUS[m.status].tag}</span>` : ''; }
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function alive() { return G.team.filter(m => m.hp > 0); }
function markSeen(n) { G.seen[n] = 1; }
function markCaught(n) { G.seen[n] = 1; G.caught[n] = 1; }

// ================= Sprite-Generator =================
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const spriteCache = {};
const SHINY_PAL = {'Silber und Violett': ['#c4c8d4', '#8e44ad'], 'Kupfer und Türkis': ['#c07a3e', '#1abc9c'], 'Perlmutt und Gold': ['#efe4ee', '#d4af37'], 'Schwarz und Cyan': ['#34343f', '#00d8ff'], 'Weiß und Magenta': ['#f2f2f6', '#e040a0']};
const COLOR_WORDS = {Silber: '#c4c8d4', Violett: '#8e44ad', Kupfer: '#c07a3e', 'Türkis': '#1abc9c', Perlmutt: '#efe4ee', Gold: '#d4af37', Schwarz: '#2a2a35', Cyan: '#00d8ff', 'Weiß': '#f2f2f6', Magenta: '#e040a0', Indigo: '#4b3d8a', Dunkelblau: '#1f3a7a', Opalgold: '#e8c86a', 'Rosé': '#f2a6b8', 'Eisweiß': '#eaf6ff', Petrol: '#1f6f78', Mint: '#7ee0b8', Obsidian: '#221c2c', 'Mondweiß': '#f4f2e6', Blau: '#3d6be0', Smaragd: '#1e9e6a', Rot: '#d63031'};
function paletteFrom(str) { if (SHINY_PAL[str]) return SHINY_PAL[str]; const p = String(str).split(/\s*(?:und|\/)\s*/).map(w => COLOR_WORDS[w] || '#' + (hashStr(w) & 0xffffff).toString(16).padStart(6, '0')); return p.length >= 2 ? [p[0], p[1]] : null; }
function shinyColors(name) {
  const sp = SPECIES[name];
  const leg = typeof LEG_SHINY !== 'undefined' && LEG_SHINY[name];
  const v = leg || (sp.shiny && (sp.shiny.farbvariante || sp.shiny.farbpalette)) || Object.keys(SHINY_PAL)[hashStr(name) % 5];
  return paletteFrom(v) || SHINY_PAL['Perlmutt und Gold'];
}
function monSprite(name, back, shiny) {
  const key = name + (back ? '_b' : '') + (shiny ? '_s' : '');
  if (spriteCache[key]) return spriteCache[key];
  const sp = SPECIES[name], R = rng(hashStr(name)), N = 32;
  const g = Array.from({length: N}, () => Array(N).fill(0));
  const st = sizeClass(name);
  const d = sp.beschreibung;
  const float = /schweb|Gleiter|gleit|Tropfen|Kern/i.test(d);
  let legs = /sechs/i.test(d) ? 3 : /vier/i.test(d) ? 2 : /(zwei|Wurzel)\w*\s*(Füße|Beine)|Wurzelfüß|aufrecht|Standbein/i.test(d) ? 1 : 2;
  if (float) legs = 0;
  const wings = /Flügel|Segel|Flosse|Membran|Fächer|Schleier/i.test(d);
  const ears = /Ohr|Fühler|Antenne|Kamm|Krone|Blatt|Kristall|Stirn/i.test(d);
  const set = (x, y, v, force) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= 16 || y >= N) return; if (force || g[y][x] === 0) g[y][x] = v; };
  const rx = 4.5 + st * 1.5 + R() * 1.5, ry = 4 + st * 1.25 + R() * 1.5;
  const cx = 15.5;
  const bottom = float ? 26 : 29 - (legs ? 3 + (st > 2 ? 1 : 0) : 0);
  const cy = bottom - ry;
  const hasHead = st >= 2 || R() < 0.4;
  const hr = Math.max(3.5, rx * (0.5 + R() * 0.15));
  const hcy = hasHead ? Math.max(hr + 2, cy - ry * 0.75) : cy;
  // Körper
  for (let y = 0; y < N; y++) { const rr = rx * (1 + (R() - 0.5) * 0.12); for (let x = 0; x < 16; x++) { const dx = (x + 0.5 - cx - 0.5) / rr, dy = (y - cy) / ry; if (dx * dx + dy * dy < 1) set(x, y, 1); } }
  if (hasHead) for (let y = 0; y < N; y++) for (let x = 0; x < 16; x++) { const dx = (x - cx + 0.5) / hr, dy = (y - hcy) / (hr * 0.9); if (dx * dx + dy * dy < 1) set(x, y, 1, true); }
  // Beine
  for (let i = 0; i < legs; i++) {
    const lx = cx - rx * (0.25 + 0.55 * (legs === 1 ? 0.5 : i / (legs - 1)));
    for (let y = Math.floor(cy + ry * 0.5); y <= 29; y++) { set(lx, y, 7); set(lx - 1, y, 7); }
    set(lx - 2, 29, 7); set(lx + 1, 29, 7);
  }
  // Flügel / Flossen
  if (wings) {
    const wy0 = cy - ry * 0.7, wy1 = cy + ry * 0.3, wx = cx - rx - 4 - st;
    for (let y = Math.floor(wy0); y <= wy1; y++) { const t = (y - wy0) / (wy1 - wy0); for (let x = Math.floor(wx + t * 3); x < cx - rx + 2; x++) set(x, y, 2); }
  }
  // Ohren / Fühler / Kamm
  if (ears) {
    const top = hcy - (hasHead ? hr * 0.9 : ry);
    const ex = cx - (hasHead ? hr : rx) * 0.55;
    const len = 3 + Math.floor(R() * 3) + (st > 2 ? 1 : 0);
    const kind = R();
    for (let i = 0; i < len; i++) {
      if (kind < 0.5) { set(ex - i * 0.4, top - i + 1, 2, true); set(ex + 1 - i * 0.4, top - i + 1, 2, true); if (i < len - 1) set(ex + 2 - i * 0.6, top - i + 1, 2, true); }
      else { set(ex - i * 0.7, top - i + 1, 7, true); }
    }
  }
  // Muster in Zweitfarbe
  const spots = 2 + Math.floor(R() * 4);
  for (let i = 0; i < spots; i++) { const x = Math.floor(cx - rx + 1 + R() * rx * 0.8), y = Math.floor(cy - ry * 0.6 + R() * ry); if (g[y] && g[y][x] === 1 && g[y][x + 1] === 1) { g[y][x] = 2; g[y][x + 1] = 2; if (g[y + 1] && g[y + 1][x] === 1) g[y + 1][x] = 2; } }
  if (!back) {
    // Bauch
    for (let y = 0; y < N; y++) for (let x = 0; x < 16; x++) { const dx = (x - cx + 0.5) / (rx * 0.55), dy = (y - (cy + ry * 0.35)) / (ry * 0.5); if (dx * dx + dy * dy < 1 && g[y][x] === 1) g[y][x] = 3; }
    // Augen
    const ey = Math.round(hasHead ? hcy : cy - ry * 0.35), ex = Math.round(cx - (hasHead ? hr : rx) * 0.42);
    const big = R() < 0.5 || st === 1;
    set(ex - 1, ey - 1, 4, true); set(ex, ey - 1, 4, true); set(ex - 1, ey, 4, true); set(ex, ey, 5, true);
    if (big) { set(ex - 1, ey + 1, 4, true); set(ex, ey + 1, 5, true); }
  }
  // spiegeln
  for (let y = 0; y < N; y++) for (let x = 0; x < 16; x++) g[y][31 - x] = g[y][x];
  // Umriss
  const out = g.map(r => r.slice());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === 0) { for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = g[y + b] && g[y + b][x + a]; if (v) { out[y][x] = 8; break; } } }
  const c = document.createElement('canvas'); c.width = c.height = N; const x2 = c.getContext('2d');
  let main = TYPE_COLORS[sp.typen[0]], sec = TYPE_COLORS[sp.typen[1]] || shade(main, -0.35);
  let secHex = sp.typen[1] ? TYPE_COLORS[sp.typen[1]] : null;
  if (shiny) { const sc = shinyColors(name); main = sc[0]; secHex = sc[1]; sec = sc[1]; }
  const pal = {1: shade(main, 0.08), 2: secHex ? shade(secHex, 0) : sec, 3: shade(main, 0.55), 4: '#ffffff', 5: '#151520', 7: shade(main, -0.4), 8: shade(main, -0.72)};
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = out[y][x]; if (!v) continue;
    let col = pal[v];
    if (v === 1 && y > cy + ry * 0.35) col = shade(main, -0.15);
    if (v === 1 && hasHead && y < hcy - hr * 0.4 && Math.abs(x - 15.5) < hr * 0.5) col = shade(main, 0.3);
    if (back && v === 1 && y < cy) col = shade(main, -0.05);
    x2.fillStyle = col; x2.fillRect(x, y, 1, 1);
  }
  if (shiny) { x2.globalCompositeOperation = 'source-atop'; x2.fillStyle = 'rgba(255,255,255,0.9)'; for (const [a, b] of [[6, 5], [25, 8], [9, 22], [23, 20]]) x2.fillRect(a, b, 1, 1); x2.globalCompositeOperation = 'source-over'; }
  if (isLegend(name)) { x2.globalCompositeOperation = 'source-atop'; x2.fillStyle = 'rgba(255,240,160,0.12)'; x2.fillRect(0, 0, N, N); }
  spriteCache[key] = c; return c;
}
function paintSprite(canvas, name, back, shiny) { const x = canvas.getContext('2d'); x.clearRect(0, 0, 32, 32); x.drawImage(monSprite(name, back, shiny), 0, 0); }
function spriteImg(name, size, shiny) { const c = monSprite(name, false, shiny); return `<img class="pix" src="${c.toDataURL()}" style="width:${size || 2}em;height:${size || 2}em;vertical-align:middle">`; }

// ================= Karten =================
function room(w, h, exitX, items) {
  const g = [];
  for (let y = 0; y < h; y++) { const r = []; for (let x = 0; x < w; x++) { let c; if (y === 0 || x === 0 || x === w - 1) c = 'w'; else if (y === 1) c = 'k'; else if (y === h - 1) c = 'w'; else c = 'f'; r.push(c); } g.push(r); }
  g[h - 1][exitX] = 'm';
  (items || []).forEach(([c, x, y]) => { g[y][x] = c; });
  return g.map(r => r.join(''));
}
const MAPS = {
  dorf: {name: 'Wurzelheim', outdoor: true, exits: {north: 'route1'}, rows: [
    'TTTTTTTTT,,TTTTTTTTT',
    'T.F......,,......F.T',
    'T.RRRR...,,..rrrrr.T',
    'T.RRRR...,,..rrrrr.T',
    'T.HNDH...,,..HNHDH.T',
    'T...,,,,,,,,,,,,,..T',
    'T.F......,,......F.T',
    'T.RRRR...,,...RRRR.T',
    'T.RRRR...,,...RRRR.T',
    'T.HNDH...,,S..HDNH.T',
    'T...,,,,,,,,,,,,...T',
    'T..F..............FT',
    'T......WWWWW...F...T',
    'T..F...WWWWW.......T',
    'T.........F........T',
    'TTTTTTTTTTTTTTTTTTTT']},
  route1: {name: 'Route 1', outdoor: true, exits: {south: 'dorf', north: 'stadt1'}, enc: [['Piepra', 2, 4, 30], ['Lufti', 2, 4, 25], ['Terrab', 3, 5, 15], ['Knisterl', 3, 4, 14], ['Lumin', 3, 5, 11], ['Flirri', 4, 5, 5]], rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T.GGGGG..,,..GGGGGG..T',
    'T.GGGGG..,,..GGGGGG..T',
    'T.GGGGG..,,..GGGGGG..T',
    'T........,,..........T',
    'TTTTT....,,....TTTTTTT',
    'T........,,..........T',
    'T..GGGGGGGGGGGGGG....T',
    'T..GGGGGGGGGGGGGG..F.T',
    'T........,,..........T',
    'T........,,..GGGGGG..T',
    'T...TT...,,..GGGGGG..T',
    'T...TT...,,..GGGGGG..T',
    'T........,,..........T',
    'T.GGGG...,,....S.....T',
    'T.GGGG...,,.....GGG..T',
    'T.GGGG...,,.....GGG..T',
    'T........,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  stadt1: {name: 'Kieselstadt', outdoor: true, exits: {south: 'route1', north: 'route2'}, rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T.AAAAAAA,,..........T',
    'T.AAAAAAA,,..ZZZZZ...T',
    'T.AAAAAAA,,..ZZZZZ...T',
    'T.HHHDHHH,,..HNDNH...T',
    'T..,,,,,,,,,,,,,,,...T',
    'T........,,..........T',
    'T..F.....,,....F.....T',
    'T.RRRR...,,..KKKK....T',
    'T.RRRR...,,..KKKK....T',
    'T.HNDH...,,..HDNH....T',
    'T...,,,,,,,,,,,......T',
    'T........,,..........T',
    'T..WWWW..,,...F......T',
    'T..WWWW..,,..........T',
    'T........,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  route2: {name: 'Route 2', outdoor: true, exits: {south: 'stadt1', north: 'stadt2'}, enc: [['Flirri', 7, 10, 15], ['Dunkling', 8, 10, 14], ['Metalli', 8, 11, 14], ['Kieselix', 8, 10, 12], ['Toxli', 8, 10, 12], ['Drakian', 9, 11, 9], ['Surrli', 9, 11, 9], ['Reifling', 9, 11, 9], ['Froschi', 10, 12, 4], ['Piepra', 8, 10, 2]], rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,.......GGGT',
    'T.GGGGG..,,..TT...GGGT',
    'T.GGGGG..,,..TT...GGGT',
    'T.GGGGG..,,.......GGGT',
    'T........,,..........T',
    'TTTTTT...,,...TTTTTTTT',
    'T........,,..........T',
    'T.GGGGGGGGGGGGGGGGGG.T',
    'T.GGGGGGGGGGGGGGGGGG.T',
    'T........,,.......MMMT',
    'T..WWWW..,,..GGG..MMMT',
    'T..WWWW..,,..GGG..MYMT',
    'T..WWWW..,,..GGG.....T',
    'T........,,..........T',
    'TTTT.....,,.....TTTTTT',
    'T........,,..........T',
    'T.GGGG...,,...GGGGG..T',
    'T.GGGG...,,...GGGGG..T',
    'T.GGGG...,,...GGGGG..T',
    'T........,,....S.....T',
    'T........,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  stadt2: {name: 'Funkenhafen', outdoor: true, exits: {south: 'route2', north: 'route3'}, rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T..ZZZZZ.,,.AAAAAAA..T',
    'T..ZZZZZ.,,.AAAAAAA..T',
    'T..HNDNH.,,.AAAAAAA..T',
    'T...,,,,,,,.HHHDHHH..T',
    'T........,,,,,,,.....T',
    'T........,,..........T',
    'T.KKKK...,,...RRRR...T',
    'T.KKKK...,,...RRRR...T',
    'T.HDNH...,,...HNDH...T',
    'T..,,,,,,,,,,,,,,....T',
    'T........,,....WWWMMMT',
    'T..F.....,,....WWWMYMT',
    'T........,,,,,,pppppWT',
    'T....F...,,....WWWWWWT',
    'T........,,....WWWWWWT',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  route3: {name: 'Route 3', outdoor: true, fog: true, exits: {south: 'stadt2', north: 'stadt3'}, enc: [['Flirri', 14, 16, 16], ['Toxli', 14, 16, 15], ['Dunkling', 14, 17, 15], ['Lumin', 14, 16, 12], ['Drakian', 15, 17, 12], ['Surrli', 15, 17, 12], ['Brisaro', 17, 18, 6], ['Halluro', 18, 18, 4], ['Nachtor', 18, 18, 4]], rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T.GGGGGG.,,.GGGGGGGG.T',
    'T.GGGGGG.,,.GGGGGGGG.T',
    'T........,,..........T',
    'TTTTTTT..,,..TTTTTTTTT',
    'T........,,..........T',
    'T..GGGG..,,,,,,,,....T',
    'T..GGGG........,,....T',
    'T..GGGG..FF....,,....T',
    'T..............,,.GG.T',
    'TTTTTT.........,,.GG.T',
    'T......GGGGGG..,,.GG.T',
    'T......GGGGGG..,,....T',
    'T......GGGGGG..,,....T',
    'T..,,,,,,,,,,,,,,....T',
    'T..,,................T',
    'T..,,..GGGGG...S.....T',
    'T..,,..GGGGG.........T',
    'T..,,,,,,,,,.........T',
    'T........,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  stadt3: {name: 'Nebelhain', outdoor: true, fog: true, exits: {south: 'route3', north: 'route4'}, rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T.ZZZZZ..,,..AAAAAAA.T',
    'T.ZZZZZ..,,..AAAAAAA.T',
    'T.HNDNH..,,..AAAAAAA.T',
    'T...,,,,,,,..HHHDHHH.T',
    'T........,,,,,,,,....T',
    'T..F.....,,.......F..T',
    'T.KKKK...,,..rrrrr...T',
    'T.KKKK...,,..rrrrr...T',
    'T.HDNH...,,..HNDNH...T',
    'T..,,,,,,,,,,,,,.....T',
    'T........,,..........T',
    'T.FF.....,,....FFF...T',
    'T........,,..........T',
    'T..WWW...,,...TT.....T',
    'T..WWW...,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  route4: {name: 'Route 4', outdoor: true, snow: true, exits: {south: 'stadt3', north: 'stadt4'}, enc: [['Reifling', 20, 23, 20], ['Froschi', 20, 23, 18], ['Brisaro', 21, 24, 14], ['Lufti', 20, 22, 10], ['Metalli', 20, 22, 10], ['Ferron', 22, 24, 10], ['Kristavor', 24, 25, 4], ['Glazaro', 25, 25, 3]], rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T.GGGGG..,,..MMMMMM..T',
    'T.GGGGG..,,..MMYMMM..T',
    'T.GGGGG..,,..........T',
    'T........,,..........T',
    'TTTT.....,,....TTTTTTT',
    'T........,,..........T',
    'T..GGGGGGGGGGGGGGGG..T',
    'T..GGGGGGGGGGGGGGGG..T',
    'T........,,..........T',
    'T.TT.....,,.....GGGG.T',
    'T.TT.....,,.....GGGG.T',
    'T........,,.....GGGG.T',
    'T..GGGG..,,..........T',
    'T..GGGG..,,....S.....T',
    'T..GGGG..,,..........T',
    'T........,,..........T',
    'TTTTTT...,,...TTTTTTTT',
    'T........,,..........T',
    'T........,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  stadt4: {name: 'Frostbergen', outdoor: true, snow: true, exits: {south: 'route4', north: 'none'}, rows: [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T.AAAAAAA,,..ZZZZZ...T',
    'T.AAAAAAA,,..ZZZZZ...T',
    'T.AAAAAAA,,..HNDNH...T',
    'T.HHHDHHH,,..,,,,,...T',
    'T..,,,,,,,,,,,,,,,...T',
    'T........,,..........T',
    'T.RRRR...,,..KKKKKK..T',
    'T.RRRR...,,..KKKKKK..T',
    'T.HNDH...,,..HNHDNH..T',
    'T...,,,,,,,,,,,,,....T',
    'T........,,..........T',
    'T..F.....,,....F.....T',
    'T........,,..........T',
    'T..TT....,,....TT....T',
    'T........,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT']},
  hoehle1: {name: 'Glimmerhöhle', cave: true, encRate: 0.07, enc: [['Kieselix', 10, 13, 20], ['Metalli', 10, 13, 18], ['Dunkling', 10, 13, 16], ['Terrab', 10, 12, 12], ['Reifling', 11, 13, 12], ['Surrli', 11, 13, 10], ['Ferron', 14, 15, 6], ['Schollram', 15, 15, 3]], rows: [
    'XXXXXXXXXXXXXXXXXXXX',
    'XxxxxxxxXXXxxxxxxxxX',
    'XxoxxxxxXXXxxxxoxxxX',
    'XxxxxXxxxxxxxxxxxLxX',
    'XxxxxXxxxxxxxXXxxxxX',
    'XXXxxxxxoxxxxXXxxxxX',
    'XxxxxxxxxxxxxxxxxxXX',
    'XxxXXXxxxxxoxxxxxxxX',
    'XxxXXXxxxxxxxxXXxxxX',
    'XxxxxxxxXXxxxxXXxxxX',
    'XxxoxxxxXXxxxxxxxxxX',
    'XxxxxxxxxxxxoxxxxxXX',
    'XXxxxxxXXXxxxxxxxxxX',
    'XxxxxxxXXXxxxxxoxxxX',
    'XxxxxxxxxxxxxxxxxxxX',
    'XXXXXXXXXUXXXXXXXXXX']},
  hoehle2: {name: 'Glimmerhöhle – Tiefe', cave: true, encRate: 0.07, enc: [['Ferron', 16, 19, 15], ['Schollram', 17, 20, 12], ['Nachtor', 17, 19, 12], ['Kieselix', 16, 18, 15], ['Metalli', 16, 18, 15], ['Dunkling', 16, 18, 15], ['Erdoran', 18, 20, 6], ['Kristavor', 20, 20, 4]], rows: [
    'XXXXXXXXXXXXXXXXXXXX',
    'XXUXXXXXXXXXXXXXXXXX',
    'XxxxxxxXXXXxxxxxxxxX',
    'XxxoxxxxxxxxxxXXxxxX',
    'XXXXXXxxxXxxxxXXxxxX',
    'XxxxxXxxxXXXXxxxxxxX',
    'XxoxxxxxxxxxXxxoxXXX',
    'XxxxXXXXXxxxxxxxxxxX',
    'XxxxXaaaaaaaaaXxxxxX',
    'XxxxXaaaaaaaaaXxxxxX',
    'XxxxxaaaaaaaaaxxxoxX',
    'XxxxxaaaaaaaaaxxxxxX',
    'XxxxxxxxxxxxxxxxxxxX',
    'XXXXXXXXXXXXXXXXXXXX']},
  hoehle3: {name: 'Frosthöhle', cave: true, ice: true, encRate: 0.07, enc: [['Reifling', 23, 26, 20], ['Froschi', 23, 26, 18], ['Kristavor', 25, 27, 12], ['Dunkling', 23, 25, 12], ['Nachtor', 24, 26, 12], ['Glazaro', 26, 28, 8], ['Finstramor', 28, 28, 3]], rows: [
    'XXXXXXXXXXXXXXXXXXXX',
    'XxxxxxxXaaaaaXxxxxxX',
    'XxoxxxxXaaaaaXxxxoxX',
    'XxxxxxxXaaaaaXxxxxxX',
    'XXXxxxxXXaaaXXxxxXXX',
    'XxxxxxxxxxxxxxxxxxxX',
    'XxxXXXXxxxxxxXXXXxxX',
    'XxxxxxXxxoxxxXxxxxxX',
    'XoxxxxXxxxxxxXxxxxxX',
    'XxxxxxxxxXXxxxxxxxoX',
    'XXXxxxxxxXXxxxxxXXXX',
    'XxxxxoxxxxxxxxxxxxxX',
    'XxxxxxxXXXXXxxxxxxxX',
    'XxxxxxxxxxxxxxxoxxxX',
    'XxxxxxxxxxxxxxxxxxxX',
    'XXXXXXXXXUXXXXXXXXXX']},
  grotte: {name: 'Meeresgrotte', cave: true, sea: true, encRate: 0.07, enc: [['Froschi', 25, 28, 20], ['Glazaro', 27, 30, 15], ['Flirri', 25, 27, 15], ['Brisaro', 26, 28, 12], ['Lufti', 25, 27, 10], ['Toxli', 25, 27, 10], ['Schleiera', 29, 29, 4]], rows: [
    'XXXXXXXXXXXXXXXXXX',
    'XWWWWWxaaaaxWWWWWX',
    'XWWWWxxaaaaxxWWWWX',
    'XWWWxxxxxxxxxxWWWX',
    'XWWxxxoxxxxxxxxWWX',
    'XWxxxxxxxxxxoxxxWX',
    'XxxxWWWxxxxWWWxxxX',
    'XxxxWWWxxxxWWWxxxX',
    'XxoxxxxxxxxxxxxxxX',
    'XxxxxxxxxxxxxxoxxX',
    'XxxxxxxxxxxxxxxxxX',
    'XXXXXXXXUXXXXXXXXX']},
  home: {name: 'Dein Zuhause', rows: room(10, 8, 4, [['C', 1, 2], ['B', 8, 2], ['B', 8, 3], ['t', 5, 4], ['t', 6, 4], ['P', 1, 6], ['P', 8, 6], ['b', 2, 1], ['b', 3, 1]])},
  lab: {name: 'Labor', rows: room(11, 9, 5, [['b', 1, 1], ['b', 2, 1], ['b', 3, 1], ['b', 7, 1], ['b', 8, 1], ['b', 9, 1], ['Q', 7, 4], ['Q', 8, 4], ['Q', 9, 4], ['P', 1, 7], ['P', 9, 7], ['C', 1, 3]])},
  heil1: {name: 'Heilstation', rows: heilRoom()},
  heil2: {name: 'Heilstation', rows: heilRoom()},
  heil3: {name: 'Heilstation', rows: heilRoom()},
  heil4: {name: 'Heilstation', rows: heilRoom()},
  shop1: {name: 'Laden', rows: shopRoom()},
  shop2: {name: 'Laden', rows: shopRoom()},
  shop3: {name: 'Laden', rows: shopRoom()},
  stern: {name: 'Sternenladen', rows: shopRoom()},
  shop4: {name: 'Kaufhaus Frostbergen', rows: room(12, 8, 5, [['c', 2, 3], ['c', 3, 3], ['c', 4, 3], ['c', 5, 3], ['c', 6, 3], ['c', 7, 3], ['b', 1, 1], ['b', 2, 1], ['b', 8, 1], ['b', 9, 1], ['b', 10, 1], ['P', 1, 6], ['P', 10, 6]])},
  arena1: {name: 'Arena Kieselstadt', arena: 'stein', rows: room(11, 12, 5, [['O', 1, 3], ['O', 2, 3], ['O', 8, 3], ['O', 9, 3], ['O', 1, 8], ['O', 9, 8], ['O', 2, 9], ['O', 8, 9], ['O', 3, 5], ['O', 7, 5]])},
  arena2: {name: 'Arena Funkenhafen', arena: 'funke', rows: room(11, 12, 5, [['E', 1, 3], ['E', 9, 3], ['E', 1, 6], ['E', 9, 6], ['E', 1, 9], ['E', 9, 9], ['E', 3, 4], ['E', 7, 4], ['E', 7, 8]])},
  arena3: {name: 'Arena Nebelhain', arena: 'nebel', rows: room(11, 12, 5, [['n', 1, 3], ['n', 9, 3], ['n', 3, 4], ['n', 7, 4], ['n', 2, 7], ['n', 8, 7], ['n', 1, 9], ['n', 9, 9], ['n', 7, 6]])},
  arena4: {name: 'Arena Frostbergen', arena: 'frost', rows: room(11, 12, 5, [['j', 1, 3], ['j', 2, 3], ['j', 8, 3], ['j', 9, 3], ['j', 3, 5], ['j', 7, 5], ['j', 1, 8], ['j', 9, 8], ['j', 2, 9], ['j', 8, 9]])}
};
function heilRoom() { return room(11, 8, 5, [['c', 3, 3], ['c', 4, 3], ['c', 5, 3], ['c', 6, 3], ['c', 7, 3], ['P', 1, 6], ['P', 9, 6], ['C', 9, 2]]); }
function shopRoom() { return room(10, 8, 4, [['c', 2, 3], ['c', 3, 3], ['c', 4, 3], ['c', 5, 3], ['b', 1, 1], ['b', 6, 1], ['b', 7, 1], ['b', 8, 1], ['P', 8, 6]]); }
const SOLID = new Set(['u', 'v', '=', 'Ü', 'T', 'W', 'R', 'r', 'A', 'Z', 'K', 'H', 'N', 'w', 'k', 't', 'B', 'C', 'S', 'P', 'b', 'Q', 'c', 'O', 'E', 'X', 'o', 'M', 'n', 'j', 'J', 'V', 'I', 'g', 'q', '1', '2', '3', 'l', 'z', 'y', 'h']);
const WARPS = {
  'dorf:4,4': {to: 'home', x: 4, y: 6, dir: 'up'},
  'dorf:16,4': {to: 'lab', x: 5, y: 7, dir: 'up'},
  'dorf:4,9': {locked: 'Hier wohnt Familie Birkenhain.\nDie Tür ist abgeschlossen.'},
  'dorf:15,9': {locked: 'Ein Zettel klebt an der Tür:\n„Bin auf Reisen. – Opa Kurt“'},
  'home:4,7': {to: 'dorf', x: 4, y: 5, dir: 'down'},
  'lab:5,8': {to: 'dorf', x: 16, y: 5, dir: 'down'},
  'stadt1:5,5': {to: 'arena1', x: 5, y: 10, dir: 'up'},
  'stadt1:15,5': {to: 'heil1', x: 5, y: 6, dir: 'up'},
  'stadt1:14,11': {to: 'shop1', x: 4, y: 6, dir: 'up'},
  'stadt1:4,11': {locked: 'Die Tür ist abgeschlossen.\nDrinnen hört man jemanden schnarchen.'},
  'arena1:5,11': {to: 'stadt1', x: 5, y: 6, dir: 'down'},
  'heil1:5,7': {to: 'stadt1', x: 15, y: 6, dir: 'down'},
  'shop1:4,7': {to: 'stadt1', x: 14, y: 12, dir: 'down'},
  'route2:19,12': {to: 'hoehle1', x: 9, y: 14, dir: 'up'},
  'hoehle1:9,15': {to: 'route2', x: 19, y: 13, dir: 'down'},
  'hoehle1:17,3': {to: 'hoehle2', x: 2, y: 2, dir: 'down'},
  'hoehle2:2,1': {to: 'hoehle1', x: 17, y: 4, dir: 'down'},
  'stadt2:5,4': {to: 'heil2', x: 5, y: 6, dir: 'up'},
  'stadt2:15,5': {to: 'arena2', x: 5, y: 10, dir: 'up'},
  'stadt2:3,10': {to: 'shop2', x: 4, y: 6, dir: 'up'},
  'stadt2:16,10': {locked: 'Die Tür ist abgeschlossen.\nAm Fenster steht ein Modellschiff.'},
  'stadt2:19,13': {to: 'grotte', x: 8, y: 10, dir: 'up', req: () => G.badges.length >= 3, reqMsg: 'Hafenmeister: „Halt! Die Meeresgrotte ist gefährlich.\nNur Trainer mit mindestens 3 Orden dürfen hinein!“'},
  'grotte:8,11': {to: 'stadt2', x: 19, y: 14, dir: 'down'},
  'heil2:5,7': {to: 'stadt2', x: 5, y: 5, dir: 'down'},
  'arena2:5,11': {to: 'stadt2', x: 15, y: 6, dir: 'down'},
  'shop2:4,7': {to: 'stadt2', x: 3, y: 11, dir: 'down'},
  'stadt3:4,4': {to: 'heil3', x: 5, y: 6, dir: 'up'},
  'stadt3:16,5': {to: 'arena3', x: 5, y: 10, dir: 'up'},
  'stadt3:3,10': {to: 'shop3', x: 4, y: 6, dir: 'up'},
  'stadt3:15,10': {to: 'stern', x: 4, y: 6, dir: 'up'},
  'heil3:5,7': {to: 'stadt3', x: 4, y: 5, dir: 'down'},
  'arena3:5,11': {to: 'stadt3', x: 16, y: 6, dir: 'down'},
  'shop3:4,7': {to: 'stadt3', x: 3, y: 11, dir: 'down'},
  'stern:4,7': {to: 'stadt3', x: 15, y: 11, dir: 'down'},
  'route4:15,3': {to: 'hoehle3', x: 9, y: 14, dir: 'up'},
  'hoehle3:9,15': {to: 'route4', x: 15, y: 4, dir: 'down'},
  'stadt4:5,5': {to: 'arena4', x: 5, y: 10, dir: 'up'},
  'stadt4:15,4': {to: 'heil4', x: 5, y: 6, dir: 'up'},
  'stadt4:16,10': {to: 'shop4', x: 5, y: 6, dir: 'up'},
  'stadt4:4,10': {locked: 'Die Tür ist abgeschlossen.\nVor der Tür steht ein Schneemann.'},
  'arena4:5,11': {to: 'stadt4', x: 5, y: 6, dir: 'down'},
  'heil4:5,7': {to: 'stadt4', x: 15, y: 5, dir: 'down'},
  'shop4:5,7': {to: 'stadt4', x: 16, y: 11, dir: 'down'}
};
const SIGNS = {
  'dorf:11,9': 'Wurzelheim\n„Hier wachsen große Träume.“',
  'route1:15,15': 'Route 1\nNorden: Kieselstadt · Süden: Wurzelheim',
  'route2:15,20': 'Route 2\nNorden: Funkenhafen · Osten: Glimmerhöhle',
  'route3:15,17': 'Route 3\nNorden: Nebelhain · Süden: Funkenhafen',
  'route4:15,15': 'Route 4\nNorden: Frostbergen · Nordosten: Frosthöhle'
};
// Wohin man bei einem Ausgang nur mit Orden darf
const GATES = {
  'stadt1:north': {badge: 'Steinorden', msg: 'Wache: „Halt! Route 2 ist nur für Trainer mit dem Steinorden.“'},
  'stadt2:north': {badge: 'Funkenorden', msg: 'Wache: „Halt! Route 3 ist nur für Trainer mit dem Funkenorden.“'},
  'stadt3:north': {badge: 'Nebelorden', msg: 'Wache: „Halt! Route 4 ist nur für Trainer mit dem Nebelorden.“'}
};

// ================= Personen / Trainer =================
const LOOK = {
  player: {hair: '#3b2a20', hat: '#d8342c', shirt: '#2f6fd6', pants: '#28324a'},
  rival: {hair: '#7b3fb8', shirt: '#2a2a2a', pants: '#6b6b6b'},
  mama: {hair: '#8a4b2a', shirt: '#e07aa0', pants: '#7a3f5a'},
  prof: {hair: '#d9d9d9', shirt: '#f4f4f4', pants: '#4a5568'},
  helper: {hair: '#222', shirt: '#9ad0f5', pants: '#3b4a6b'},
  kid: {hair: '#e0b040', shirt: '#4caf50', pants: '#3b4a6b'},
  old: {hair: '#bbbbbb', shirt: '#8d6e63', pants: '#4e342e'},
  hiker: {hair: '#5a3a22', hat: '#6d8b3a', shirt: '#a06a3a', pants: '#4e5d2e'},
  girl: {hair: '#c0392b', shirt: '#f1c40f', pants: '#8e44ad'},
  guard: {hair: '#222', hat: '#2c3e50', shirt: '#34495e', pants: '#1c2833'},
  nurse: {hair: '#f48fb1', hat: '#ffffff', shirt: '#ffffff', pants: '#f48fb1'},
  clerk: {hair: '#333', shirt: '#3d8be0', pants: '#2b3d6b'},
  starclerk: {hair: '#f2d16b', shirt: '#3b2f7a', pants: '#1d1840'},
  brocka: {hair: '#7b5e3b', shirt: '#8d7b68', pants: '#4a3b2a'},
  volta: {hair: '#f2c12e', shirt: '#2b2b2b', pants: '#f2c12e'},
  selene: {hair: '#b9a8f0', shirt: '#4b3d8a', pants: '#2c2350'},
  frida: {hair: '#e8f4ff', shirt: '#5ec6dc', pants: '#2d5f8a'},
  pupil: {hair: '#4e342e', shirt: '#bcaaa4', pants: '#5d4037'},
  sailor: {hair: '#222', hat: '#fff', shirt: '#1f4e8c', pants: '#fff'},
  mystic: {hair: '#4b3d8a', shirt: '#8a7fb8', pants: '#3a2f5a'},
  skier: {hair: '#5a3a22', hat: '#e74c3c', shirt: '#ecf0f1', pants: '#2c3e50'},
  digger: {hair: '#5a3a22', hat: '#f1c40f', shirt: '#7f8c8d', pants: '#4e342e'}
};
function T(name, team, reward, intro, lose, after) { return {name, team, reward, intro, lose, after}; }
const SHOP_LISTS = {
  shop1: ['Fangkapsel', 'Heiltrank', 'Schutzspray', 'Fluchtseil'],
  shop2: ['Fangkapsel', 'Superkapsel', 'Heiltrank', 'Supertrank', 'Beleber', 'Schutzspray', 'Fluchtseil'],
  shop3: ['Fangkapsel', 'Superkapsel', 'Hyperkapsel', 'Supertrank', 'Hypertrank', 'Beleber', 'Schutzspray', 'Fluchtseil'],
  stern: ['Legendenkapsel', 'Sonderbonbon', 'Hyperkapsel'],
  shop4: ['Fangkapsel', 'Superkapsel', 'Hyperkapsel', 'Legendenkapsel', 'Heiltrank', 'Supertrank', 'Hypertrank', 'Beleber', 'Sonderbonbon', 'Schutzspray', 'Fluchtseil']
};
const NPCS = {
  home: [{id: 'mama', x: 6, y: 5, dir: 'left', look: LOOK.mama, talk: talkMama}],
  lab: [{id: 'prof', x: 5, y: 3, dir: 'down', look: LOOK.prof, talk: talkProf},
        {id: 'rival_lab', x: 8, y: 6, dir: 'up', look: LOOK.rival, talk: async () => {
          if (!G.flags.starter) await say('Lenny: „Na, endlich wach, {name}?\nIch warte schon ewig! Such du dir ruhig zuerst eins aus.“');
          else await say('Lenny: „Ich werde der beste Trainer der Welt!\nUnd du bist mein größter Rivale!“'); }},
        {id: 'helper', x: 2, y: 5, dir: 'right', look: LOOK.helper, talk: async () => {
          if (!G.flags.starter) await say('Die Professorin hat drei Monster vorbereitet.\nSie liegen in den Kapseln auf dem Tisch!');
          else await say('Tipp: Schwäche ein wildes Monster, bevor du eine Kapsel wirfst.\nSuperkapseln und Hyperkapseln klappen noch besser!');
        }}],
  dorf: [{id: 'kid', x: 7, y: 6, dir: 'down', look: LOOK.kid, walk: true, talk: async () => {
          await say('Ich will auch mal Arenaleiter werden!\nDie erste Arena ist in Kieselstadt, ganz im Norden.'); }},
         {id: 'old', x: 13, y: 13, dir: 'left', look: LOOK.old, talk: async () => {
          await say('Im hohen Gras verstecken sich wilde Monster.\nOhne eigenes Monster gehst du da besser nicht rein!'); }}],
  route1: [{id: 'tim', x: 12, y: 7, dir: 'left', look: LOOK.hiker, trainer: T('Wanderer Tim', [['Piepra', 4], ['Lufti', 5]], 180,
            'He, du! Unsere Blicke haben sich getroffen.\nDas heißt: Kampf!', 'Uff, du bist stark!', 'Trainiere deine Monster im hohen Gras, dann werden sie stärker.')},
           {id: 'mia', x: 7, y: 14, dir: 'right', look: LOOK.girl, trainer: T('Schülerin Mia', [['Terrab', 5], ['Lumin', 6]], 200,
            'Ich habe gerade erst angefangen…\naber ich gebe nicht auf!', 'Oh nein! Aber das war ein toller Kampf.', 'Gegen Stein-Monster helfen Flut- und Wuchs-Attacken!')}],
  stadt1: [{id: 'guard1', x: 11, y: 1, dir: 'down', look: LOOK.guard, talk: async () => {
             if (G.badges.includes('Steinorden')) await say('Du hast den Steinorden! Route 2 steht dir offen.');
             else await say('Halt! Route 2 ist nur für Trainer mit dem Steinorden.\nBesiege zuerst Arenaleiterin Brocka!'); }},
           {id: 'c1', x: 16, y: 8, dir: 'left', look: LOOK.old, talk: async () => {
             await say('Arenaleiterin Brocka setzt auf Stein-Monster.\nFlut und Wuchs sind sehr effektiv dagegen!\nGlut-Attacken prallen dagegen eher ab.'); }},
           {id: 'c2', x: 5, y: 13, dir: 'up', look: LOOK.kid, talk: async () => {
             await say('In der Heilstation wird dein Team kostenlos geheilt.\nIm Laden bekommst du Kapseln und Tränke – bezahlt wird mit Coins 🪙!'); }}],
  route2: [{id: 'jonas', x: 12, y: 7, dir: 'left', look: LOOK.hiker, trainer: T('Bergsteiger Jonas', [['Kieselix', 9], ['Metalli', 10]], 300,
            'Hier oben weht ein rauer Wind.\nZeig mal, was du kannst!', 'Wie ein Felssturz!', 'Östlich von hier liegt die Glimmerhöhle.\nMan sagt, tief unten schläft etwas Uraltes …')},
           {id: 'lea', x: 7, y: 14, dir: 'right', look: LOOK.girl, trainer: T('Forscherin Lea', [['Flirri', 10], ['Toxli', 10], ['Dunkling', 11]], 340,
            'Nebel-Monster sind geheimnisvoll…\nWillst du sie kennenlernen?', 'Der Nebel hat sich gelichtet…', 'Klang-Attacken sind stark gegen Nebel-Monster.')},
           {id: 'ole', x: 12, y: 20, dir: 'left', look: LOOK.sailor, trainer: T('Matrose Ole', [['Drakian', 11], ['Surrli', 11]], 360,
            'Ahoi! Bevor du in den Hafen kommst,\nmusst du an mir vorbei!', 'Ich geh baden…', 'Funkenhafen liegt direkt im Norden.')},
           {id: 'rival_r2', x: 0, y: 0, dir: 'down', look: LOOK.rival, show: () => G.flags.rivalShow === 'rival_r2', talk: async () => {}}],
  hoehle1: [{id: 'rolf', x: 12, y: 14, dir: 'left', look: LOOK.digger, trainer: T('Höhlenforscher Rolf', [['Kieselix', 12], ['Dunkling', 13]], 380,
             'Psst! Hier unten wird gekämpft, nicht geredet!', 'Mir geht das Licht aus …', 'Die Leiter führt in die Tiefe.\nDort unten glüht ein uralter Altar.')},
            {id: 'it_h1a', x: 2, y: 1, item: 'Superkapsel', n: 3},
            {id: 'it_h1b', x: 18, y: 10, item: 'Sonderbonbon', n: 1}],
  hoehle2: [{id: 'leg_terrakron', x: 9, y: 8, dir: 'down', legend: 'Terrakron', level: 28},
            {id: 'it_h2a', x: 18, y: 2, item: 'Hypertrank', n: 1},
            {id: 'it_h2b', x: 1, y: 12, item: 'Superkapsel', n: 2}],
  stadt2: [{id: 'guard2', x: 11, y: 1, dir: 'down', look: LOOK.guard, talk: async () => {
             if (G.badges.includes('Funkenorden')) await say('Du hast den Funkenorden! Route 3 steht dir offen.\nPass im Nebel gut auf!');
             else await say('Halt! Route 3 ist nur für Trainer mit dem Funkenorden.\nBesiege zuerst Arenaleiter Volta!'); }},
           {id: 'c3', x: 6, y: 7, dir: 'right', look: LOOK.sailor, talk: async () => {
             await say('Arenaleiter Volta liebt Funke-Monster.\nStein-Attacken wirken super gegen sie!\nUnd Flut-Monster sollten sich in Acht nehmen.'); }},
           {id: 'c4', x: 12, y: 13, dir: 'right', look: LOOK.old, talk: async () => {
             await say('Hinter dem Steg liegt die Meeresgrotte.\nDort soll Aquarion leben, ein legendäres Meeresmonster!');
             await say('Legendäre Monster lassen sich nur mit einer Legendenkapsel fangen.\nNormale Kapseln prallen an ihrer Aura einfach ab.'); }}],
  route3: [{id: 'nora', x: 12, y: 6, dir: 'left', look: LOOK.mystic, trainer: T('Mystikerin Nora', [['Flirri', 15], ['Toxli', 16]], 420,
            'Der Nebel hat mir deine Ankunft verraten …', 'Das sah ich nicht kommen!', 'In Nebelhain gibt es einen Sternenladen.\nDort verkaufen sie sogar Legendenkapseln!')},
           {id: 'paul', x: 8, y: 17, dir: 'up', look: LOOK.hiker, trainer: T('Vogelfreund Paul', [['Lufti', 15], ['Drakian', 16], ['Brisaro', 18]], 480,
            'Meine Flugmonster sind schneller als du!', 'Abgestürzt …', 'Wind-Attacken sind stark gegen Nebel und Wuchs.')},
           {id: 'finn', x: 18, y: 8, dir: 'left', look: LOOK.kid, trainer: T('Musiker Finn', [['Surrli', 16], ['Lumin', 17]], 450,
            'Hör dir meinen Sound an!', 'Falscher Ton!', 'Klang-Monster sind super gegen Nebel und Frost.')},
           {id: 'it_r3', x: 20, y: 12, item: 'Supertrank', n: 2}],
  stadt3: [{id: 'guard3', x: 11, y: 1, dir: 'down', look: LOOK.guard, talk: async () => {
             if (G.badges.includes('Nebelorden')) await say('Mit dem Nebelorden darfst du auf Route 4.\nZieh dich warm an!');
             else await say('Halt! Route 4 ist nur für Trainer mit dem Nebelorden.\nSelene wartet in der Arena.'); }},
           {id: 'c5', x: 6, y: 12, dir: 'right', look: LOOK.mystic, talk: async () => {
             await say('Arenaleiterin Selene kämpft mit Nebel-Monstern.\nKlang- und Wind-Attacken sind sehr effektiv!'); }},
           {id: 'c6', x: 18, y: 12, dir: 'left', look: LOOK.girl, talk: async () => {
             await say('Im Sternenladen gibt es Legendenkapseln.\nSie sind teuer, aber jedes Monster wird damit sicher gefangen!'); }},
           {id: 'rival_s3', x: 0, y: 0, dir: 'down', look: LOOK.rival, show: () => G.flags.rivalShow === 'rival_s3', talk: async () => {}}],
  route4: [{id: 'max', x: 12, y: 5, dir: 'left', look: LOOK.skier, trainer: T('Skifahrer Max', [['Reifling', 21], ['Brisaro', 22]], 600,
            'Achtung, Piste!', 'Hingefallen …', 'Die Frosthöhle liegt hinter den Felsen im Nordosten.')},
           {id: 'ella', x: 6, y: 13, dir: 'right', look: LOOK.girl, trainer: T('Eisläuferin Ella', [['Froschi', 22], ['Reifling', 22], ['Flirri', 23]], 650,
            'Schau mal, wie elegant meine Monster sind!', 'Ausgerutscht!', 'Glut-Attacken schmelzen Frost-Monster!')},
           {id: 'udo', x: 13, y: 19, dir: 'left', look: LOOK.hiker, trainer: T('Bergführer Udo', [['Schollram', 23], ['Ferron', 24]], 700,
            'Nur die Stärksten erreichen Frostbergen!', 'Respekt!', 'In Frostbergen gibt es ein riesiges Kaufhaus.')}],
  hoehle3: [{id: 'ida', x: 14, y: 11, dir: 'left', look: LOOK.skier, trainer: T('Frostforscherin Ida', [['Reifling', 24], ['Kristavor', 26]], 700,
             'Brrr! Ein Kampf wärmt auf!', 'Mir ist jetzt richtig warm!', 'Ganz oben in der Höhle glänzt ein eisiger Altar …')},
            {id: 'leg_noctarion', x: 10, y: 2, dir: 'down', legend: 'Noctarion', level: 42},
            {id: 'it_h3a', x: 18, y: 1, item: 'Legendenkapsel', n: 1},
            {id: 'it_h3b', x: 1, y: 13, item: 'Sonderbonbon', n: 1}],
  grotte: [{id: 'leg_aquarion', x: 8, y: 1, dir: 'down', legend: 'Aquarion', level: 38},
           {id: 'it_gr', x: 15, y: 9, item: 'Hyperkapsel', n: 2}],
  stadt4: [{id: 'guard4', x: 11, y: 1, dir: 'down', look: LOOK.guard, talk: async () => {
             await say('Dahinter beginnt die Siegesstraße.\nSie wird gerade gebaut … (Fortsetzung folgt)'); }},
           {id: 'c7', x: 6, y: 13, dir: 'right', look: LOOK.skier, talk: async () => {
             await say('Arenaleiterin Frida kämpft mit Frost-Monstern.\nGlut- und Metall-Attacken schmelzen ihr Eis!'); }},
           {id: 'rival_s4', x: 0, y: 0, dir: 'down', look: LOOK.rival, show: () => G.flags.rivalShow === 'rival_s4', talk: async () => {}}],
  heil1: [{id: 'nurse1', x: 5, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse}],
  heil2: [{id: 'nurse2', x: 5, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse}],
  heil3: [{id: 'nurse3', x: 5, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse}],
  heil4: [{id: 'nurse4', x: 5, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse}],
  shop1: [{id: 'clerk1', x: 3, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('shop1')}],
  shop2: [{id: 'clerk2', x: 3, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('shop2')}],
  shop3: [{id: 'clerk3', x: 3, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('shop3')}],
  stern: [{id: 'clerk5', x: 3, y: 2, dir: 'down', look: LOOK.starclerk, talk: () => talkShop('stern')}],
  shop4: [{id: 'clerk4', x: 4, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('shop4')},
          {id: 'c8', x: 9, y: 5, dir: 'left', look: LOOK.old, talk: async () => { await say('Ein Sonderbonbon lässt ein Monster sofort ein Level aufsteigen.\nTeuer, aber praktisch!'); }}],
  arena1: [{id: 'kai', x: 3, y: 6, dir: 'right', look: LOOK.pupil, trainer: T('Arenaschüler Kai', [['Kieselix', 8], ['Terrab', 9]], 300,
            'Bevor du zu Brocka darfst, musst du mich besiegen!', 'Hart wie Granit … warst du!', 'Brocka ist noch viel härter als ich!')},
           {id: 'brocka', x: 5, y: 2, dir: 'down', look: LOOK.brocka, leader: true, trainer: Object.assign(T('Arenaleiterin Brocka', [['Terrab', 10], ['Kieselix', 11], ['Ferron', 13]], 1500,
            'Willkommen in der Arena von Kieselstadt!\nIch bin Brocka. Meine Stein-Monster sind unerschütterlich.\nZeig mir, ob du stark genug für den Steinorden bist!',
            'Unglaublich … du hast meine Felsen zerschmettert!\nDu hast dir den Steinorden verdient.',
            'Mit dem Steinorden darfst du auf Route 2.\nIn Funkenhafen wartet Volta mit seinen Funke-Monstern!'), {badge: 'Steinorden'})}],
  arena2: [{id: 'funky', x: 3, y: 6, dir: 'right', look: LOOK.pupil, trainer: T('Arenaschüler Funky', [['Knisterl', 14], ['Surrli', 15]], 450,
            'Bzzzt! Hier knistert die Luft!', 'Kurzschluss!', 'Volta ist schneller als der Blitz!')},
           {id: 'volta', x: 5, y: 2, dir: 'down', look: LOOK.volta, leader: true, trainer: Object.assign(T('Arenaleiter Volta', [['Knisterl', 16], ['Metalli', 17], ['Voltaro', 19]], 2500,
            'Ha! Ein neuer Herausforderer!\nIch bin Volta, der Blitz von Funkenhafen.\nMal sehen, ob du mit meinem Tempo mithältst!',
            'Wow … du hast mich wirklich geschlagen!\nHier, der Funkenorden gehört dir!',
            'Mit dem Funkenorden kommst du auf Route 3 nach Nebelhain.'), {badge: 'Funkenorden', extra: async () => {
              G.bag.Legendenkapsel = (G.bag.Legendenkapsel || 0) + 1;
              await say('Volta: „Und weil du so stark bist, bekommst du das hier:\neine Legendenkapsel!“');
              await say('{name} erhält 1× Legendenkapsel!');
              await say('„Nur damit kannst du legendäre Monster fangen.\nTief in der Glimmerhöhle soll Terrakron schlafen …“');
            }})}],
  arena3: [{id: 'luna', x: 3, y: 6, dir: 'right', look: LOOK.mystic, trainer: T('Arenaschülerin Luna', [['Flirri', 19], ['Dunkling', 20]], 600,
            'Siehst du mich im Nebel?', 'Du hast mich gefunden …', 'Selene sieht alles voraus. Fast alles.')},
           {id: 'selene', x: 5, y: 2, dir: 'down', look: LOOK.selene, leader: true, trainer: Object.assign(T('Arenaleiterin Selene', [['Toxli', 22], ['Nachtor', 23], ['Giftrax', 23], ['Schleiera', 25]], 3500,
            'Ich habe gesehen, dass du kommst, {name}.\nIch bin Selene. Der Nebel ist mein Verbündeter.\nFinde deinen Weg hindurch – wenn du kannst!',
            'Der Nebel lichtet sich … du bist wahrhaft stark.\nNimm den Nebelorden.',
            'Im Norden liegt Frostbergen. Frida ist eine harte Gegnerin.'), {badge: 'Nebelorden'})}],
  arena4: [{id: 'olaf', x: 3, y: 6, dir: 'right', look: LOOK.skier, trainer: T('Arenaschüler Olaf', [['Reifling', 26], ['Froschi', 27]], 800,
            'Hier drin ist es eiskalt – genau wie meine Taktik!', 'Geschmolzen …', 'Frida hat noch nie verloren. Glaube ich.')},
           {id: 'frida', x: 5, y: 2, dir: 'down', look: LOOK.frida, leader: true, trainer: Object.assign(T('Arenaleiterin Frida', [['Reifling', 28], ['Froschi', 29], ['Kristavor', 31], ['Glazaro', 32]], 5000,
            'Willkommen im ewigen Eis, {name}!\nIch bin Frida. Meine Frost-Monster sind kalt wie ein Wintermorgen.\nBist du bereit?',
            'Unglaublich! Du hast mein Eis zum Schmelzen gebracht.\nDer Frostorden gehört dir!',
            'Mit vier Orden bist du einer der besten Trainer der Region!\nDie Siegesstraße wird bald eröffnet.'), {badge: 'Frostorden'})}]
};

// ================= Welt Teil 2: Routen 5–11, Städte, Liga =================
MAPS.stadt4.exits.north = 'route5';
GATES['stadt4:north'] = {badge: 'Frostorden', msg: 'Wache: „Halt! Route 5 ist nur für Trainer mit dem Frostorden.“'};
NPCS.stadt4[0].talk = async () => {
  if (G.badges.includes('Frostorden')) await say('Mit dem Frostorden darfst du auf Route 5.\nDort wird es heiß – sie führt zum Vulkan!');
  else await say('Halt! Route 5 ist nur für Trainer mit dem Frostorden.\nBesiege zuerst Frida!');
};
Object.assign(LOOK, {
  ace: {hair: '#1d1f2a', hat: '#c0392b', shirt: '#ecf0f1', pants: '#c0392b'},
  medium: {hair: '#dddddd', shirt: '#5b3a7a', pants: '#3a2450'},
  monk: {hair: '#c9a07a', shirt: '#e67e22', pants: '#8a4a1a'},
  swimmer: {hair: '#f1c40f', shirt: '#3d8be0', pants: '#3d8be0'},
  gent: {hair: '#555555', hat: '#222222', shirt: '#2c2c2c', pants: '#2c2c2c'},
  beauty: {hair: '#f39c12', shirt: '#e91e63', pants: '#e91e63'},
  worker: {hair: '#5a3a22', hat: '#f39c12', shirt: '#f39c12', pants: '#34495e'},
  croupier: {hair: '#222222', shirt: '#ffffff', pants: '#222222'},
  ranger: {hair: '#5a3a22', hat: '#6d8b3a', shirt: '#8bc34a', pants: '#5d4037'},
  flammara: {hair: '#e74c3c', shirt: '#f39c12', pants: '#c0392b'},
  ferrum: {hair: '#7f8c8d', shirt: '#95a5a6', pants: '#2c3e50'},
  marina: {hair: '#1abc9c', shirt: '#3498db', pants: '#ecf0f1'},
  flora: {hair: '#27ae60', shirt: '#f8bbd0', pants: '#2e7d32'},
  harmonia: {hair: '#cc5fc8', shirt: '#2c2c2c', pants: '#cc5fc8'},
  zephyr: {hair: '#ecf0f1', shirt: '#5fbf86', pants: '#2c3e50'},
  morgana: {hair: '#4a148c', shirt: '#7e57c2', pants: '#311b92'},
  granit: {hair: '#5d4037', shirt: '#8d6e63', pants: '#3e2723'},
  ampera: {hair: '#ffeb3b', shirt: '#ff9800', pants: '#212121'},
  zephor: {hair: '#b0bec5', shirt: '#e53935', pants: '#263238'}
});
const THEMES = {
  normal: {g: '#8fd16a', t: '#6fb84f', tall: ['#5fae46', '#3f8a30', '#78c95a'], tree: ['#2f7d32', '#3f9a3f', '#62b860']},
  snow: {g: '#eef4fb', t: '#cfdde8', tall: ['#cfe3dc', '#6f9e8a', '#ffffff'], tree: ['#2f7d32', '#3f9a3f', '#62b860']},
  ash: {g: '#a89f94', t: '#8c8278', tall: ['#7d8a5a', '#55603a', '#9caa70'], tree: ['#4a4038', '#5e5248', '#7a6c60']},
  dusk: {g: '#76866a', t: '#5e6c56', tall: ['#4e6a4a', '#30483a', '#6a8a5a'], tree: ['#2a3630', '#3a4840', '#56665a']},
  beach: {g: '#f0dc9c', t: '#d8c07c', tall: ['#b8c86a', '#86964a', '#d4e48c'], tree: ['#2f8d42', '#3faa4f', '#62c870']},
  flower: {g: '#9ad66a', t: '#f08ab8', tall: ['#5fae46', '#3f8a30', '#78c95a'], tree: ['#2f7d32', '#4caf50', '#81c784']},
  mountain: {g: '#9cc77e', t: '#80a866', tall: ['#6aa050', '#467a34', '#86bc66'], tree: ['#2e6b3a', '#3c8448', '#5aa266']}
};
function themeOf(map) { return THEMES[map.theme || (map.snow ? 'snow' : 'normal')]; }

// ---------- Generatoren ----------
function genRoute(seed, h) {
  const R = rng(seed), W = 22;
  const g = Array.from({length: h}, () => Array.from({length: W}, (_, x) => (x === 0 || x === W - 1) ? 'T' : '.'));
  const rect = (x0, y0, w, hh, c) => { for (let y = y0; y < y0 + hh && y < h - 1; y++) for (let x = x0; x < x0 + w && x < W - 1; x++) if ((x !== 9 && x !== 10) || c === 'G') g[y][x] = c; };
  for (let x = 0; x < W; x++) { g[0][x] = g[h - 1][x] = (x === 9 || x === 10) ? ',' : 'T'; }
  for (let y = 1; y < h - 1; y++) { g[y][9] = ','; g[y][10] = ','; }
  const seps = []; let y = 2, last = -1;
  while (y < h - 4) {
    let kind = Math.floor(R() * 6); if (kind === last) kind = (kind + 1) % 6; last = kind;
    let bh = 2 + Math.floor(R() * 3); if (y + bh > h - 3) bh = h - 3 - y; if (bh < 1) break;
    if (kind === 0) { rect(1 + Math.floor(R() * 2), y, 6, bh, 'G'); rect(12, y, 6 + Math.floor(R() * 3), bh, 'G'); }
    else if (kind === 1) { bh = Math.min(2, bh); rect(2, y, 18, bh, 'G'); }
    else if (kind === 2) { bh = 1; for (let x = 1; x < W - 1; x++) if (x < 7 || x > 12) g[y][x] = 'T'; }
    else if (kind === 3) { rect(2, y, 4, bh, 'W'); rect(13, y, 6, bh, 'G'); }
    else if (kind === 4) { rect(3, y, 5, bh, 'G'); rect(14, y, 2, bh, 'T'); rect(17, y, 3, bh, 'G'); }
    else { rect(14, y, 3, bh, 'W'); rect(2, y, 6, bh, 'G'); }
    seps.push(y + bh);
    y += bh + 1 + (R() < 0.3 ? 1 : 0);
  }
  for (let i = 0; i < 10; i++) { const fx = 1 + Math.floor(R() * 20), fy = 2 + Math.floor(R() * (h - 4)); if (g[fy][fx] === '.' && fx !== 8 && fx !== 11 && fx !== 7 && fx !== 12) g[fy][fx] = 'F'; }
  if (g[h - 3][13] === '.') g[h - 3][13] = 'S';
  const spots = [];
  const pick = seps.filter(r => r > 2 && r < h - 3);
  const want = Math.min(pick.length, h > 26 ? 5 : 3);
  for (let i = 0; i < want; i++) { const r = pick[Math.floor((i + 0.5) * pick.length / want)]; const left = i % 2 === 0; spots.push({x: left ? 7 : 12, y: r, dir: left ? 'right' : 'left'}); }
  let item = null;
  for (let t = 0; t < 50 && !item; t++) { const ix = R() < 0.5 ? 1 : 20, iy = 2 + Math.floor(R() * (h - 4)); if (g[iy][ix] === '.' || g[iy][ix] === 'G') item = {x: ix, y: iy}; }
  return {rows: g.map(r => r.join('')), spots, item, sign: g[h - 3][13] === 'S' ? {x: 13, y: h - 3} : null};
}
function genTown(mountain) {
  const r = [
    'TTTTTTTTT,,TTTTTTTTTTT',
    'T........,,..........T',
    'T.AAAAAAA,,..ZZZZZ...T',
    'T.AAAAAAA,,..ZZZZZ...T',
    'T.AAAAAAA,,..HNDNH...T',
    'T.HHHDHHH,,..,,,,,...T',
    'T..,,,,,,,,,,,,,,,...T',
    'T........,,..........T',
    'T.RRRR...,,..KKKK....T',
    'T.RRRR...,,..KKKK....T',
    'T.HNDH...,,..HDNH....T',
    'T...,,,,,,,,,,,......T',
    'T........,,..........T',
    'T..F.....,,....F.....T',
    'T........,,..........T',
    'T..TT....,,....TT....T',
    'T........,,..........T',
    'TTTTTTTTT,,TTTTTTTTTTT'];
  if (mountain) { r[12] = 'T........,,.......MMMT'; r[13] = 'T..F.....,,....F..MYMT'; }
  return r;
}
const ARENA_POS = [[1, 3], [2, 3], [8, 3], [9, 3], [1, 8], [9, 8], [2, 9], [8, 9], [3, 5], [7, 5]];
function arenaRoom(deco) { return room(11, 12, 5, ARENA_POS.map(([x, y]) => [deco, x, y])); }
function leagueRoom(deco) { return room(11, 12, 5, ARENA_POS.map(([x, y]) => [deco, x, y]).concat([['w', 5, 11], ['D', 5, 1]])); }

const T_CLASSES = [['Wanderer', 'hiker'], ['Schülerin', 'girl'], ['Forscher', 'helper'], ['Matrose', 'sailor'], ['Mystikerin', 'mystic'], ['Skifahrer', 'skier'], ['Höhlenforscher', 'digger'], ['Ass-Trainer', 'ace'], ['Schöne', 'beauty'], ['Gentleman', 'gent'], ['Schwimmerin', 'swimmer'], ['Arbeiter', 'worker'], ['Mönch', 'monk']];
const T_NAMES = ['Lukas', 'Emma', 'Noah', 'Hanna', 'Elias', 'Lina', 'Paul', 'Marie', 'Felix', 'Lea', 'Jonas', 'Sophie', 'Leon', 'Clara', 'Max', 'Ida', 'Mila', 'Tom', 'Nele', 'Finn', 'Greta', 'Erik', 'Zoe', 'Jan', 'Pia', 'Theo', 'Lotte', 'Moritz', 'Frieda', 'Anton', 'Romy', 'Oskar', 'Mats', 'Juna', 'Karl', 'Ella'];
const T_INTRO = ['Ich habe auf einen starken Gegner gewartet!', 'Lass uns kämpfen!', 'Meine Monster sind bereit – deine auch?', 'Hier kommst du nicht einfach so vorbei!', 'Ich trainiere schon den ganzen Tag. Zeig mal, was du kannst!', 'Ein Kampf? Sehr gerne!', 'Du siehst stark aus. Das will ich testen!'];
const T_LOSE = ['Wow, du bist richtig stark!', 'Das war knapp … oder auch nicht.', 'Ich muss noch viel trainieren.', 'Unglaublich!', 'Na gut, du hast gewonnen.', 'Respekt!'];
const T_AFTER = ['Weiter vorne warten noch stärkere Trainer.', 'In der nächsten Stadt gibt es eine Heilstation.', 'Mit Superkapseln fängt man viel leichter Monster.', 'Ich werde auch irgendwann Champion!', 'Trainiere fleißig weiter!', 'Ein EP-Teiler hilft, das ganze Team zu trainieren.'];
function genTrainers(mapId, spots, enc, seed, opts = {}) {
  const R = rng(seed + 777);
  const maxL = Math.max(...enc.map(e => e[2]));
  return spots.map((s, i) => {
    const cls = opts.classes ? opts.classes[i % opts.classes.length] : T_CLASSES[Math.floor(R() * T_CLASSES.length)];
    const nm = T_NAMES[Math.floor(R() * T_NAMES.length)];
    const size = (opts.min || 2) + Math.floor(R() * ((opts.max || 3) - (opts.min || 2) + 1));
    const team = []; for (let k = 0; k < size; k++) { const e = enc[Math.floor(R() * enc.length)]; team.push([e[0], maxL + (opts.bonus || 1) + Math.floor(R() * 3)]); }
    const top = Math.max(...team.map(t => t[1]));
    return {id: `${mapId}_t${i}`, x: s.x, y: s.y, dir: s.dir, look: LOOK[cls[1]],
      trainer: T(`${cls[0]} ${nm}`, team, top * 45, T_INTRO[Math.floor(R() * T_INTRO.length)], T_LOSE[Math.floor(R() * T_LOSE.length)], T_AFTER[Math.floor(R() * T_AFTER.length)])};
  });
}
const ROUTE_ITEMS = ['Supertrank', 'Hyperkapsel', 'Hypertrank', 'Sonderbonbon', 'Beleber', 'Superkapsel', 'Top-Trank', 'Sonderbonbon'];
function addRoute(id, num, seed, h, theme, from, to, enc, signText, opts = {}) {
  const r = genRoute(seed, h);
  MAPS[id] = {name: opts.name || `Route ${num}`, outdoor: true, theme, exits: {south: from, north: to}, enc, rows: r.rows, fog: opts.fog};
  NPCS[id] = genTrainers(id, r.spots, enc, seed, opts.trainers || {});
  if (r.item) NPCS[id].push({id: `it_${id}`, x: r.item.x, y: r.item.y, item: ROUTE_ITEMS[num % ROUTE_ITEMS.length], n: 1});
  if (r.sign) SIGNS[`${id}:${r.sign.x},${r.sign.y}`] = signText;
}
function leader(id, name, look, team, reward, badge, intro, lose, after) {
  return {id, x: 5, y: 2, dir: 'down', look, leader: true, trainer: Object.assign(T(name, team, reward, intro, lose, after), {badge})};
}
function addTown(id, n, name, theme, opts) {
  MAPS[id] = {name, outdoor: true, theme, exits: {south: opts.south, north: opts.north}, rows: genTown(!!opts.mountain)};
  MAPS['heil' + n] = {name: 'Heilstation', rows: heilRoom()};
  NPCS['heil' + n] = [{id: 'nurse' + n, x: 5, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse}];
  MAPS['shop' + n] = {name: 'Laden', rows: shopRoom()};
  NPCS['shop' + n] = [{id: 'clerk' + n, x: 3, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('late')}];
  WARPS[`${id}:15,4`] = {to: 'heil' + n, x: 5, y: 6, dir: 'up'}; WARPS[`heil${n}:5,7`] = {to: id, x: 15, y: 5, dir: 'down'};
  WARPS[`${id}:14,10`] = {to: 'shop' + n, x: 4, y: 6, dir: 'up'}; WARPS[`shop${n}:4,7`] = {to: id, x: 14, y: 11, dir: 'down'};
  MAPS['arena' + n] = {name: 'Arena ' + name, arena: opts.arena, rows: arenaRoom(opts.deco)};
  WARPS[`${id}:5,5`] = {to: 'arena' + n, x: 5, y: 10, dir: 'up'}; WARPS[`arena${n}:5,11`] = {to: id, x: 5, y: 6, dir: 'down'};
  NPCS['arena' + n] = [{id: 'as' + n, x: 3, y: 6, dir: 'right', look: opts.assistant[1], trainer: T(opts.assistant[0], opts.assistant[2], opts.assistant[3], opts.assistant[4], 'Gut gekämpft!', 'Die Arenaleitung wartet oben auf dich.')}, opts.leader];
  WARPS[`${id}:4,10`] = opts.house || {locked: 'Die Tür ist abgeschlossen.'};
  NPCS[id] = [{id: 'g' + n, x: 11, y: 1, dir: 'down', look: LOOK.guard, talk: opts.guardTalk || (async () => {
      if (opts.gateBadge && !G.badges.includes(opts.gateBadge)) await say(`Halt! Weiter nördlich geht es nur mit dem ${opts.gateBadge}.`);
      else await say('Gute Reise! Pass auf dich auf.'); })},
    {id: 'tip' + n, x: 6, y: 13, dir: 'right', look: opts.tipLook || LOOK.old, talk: async () => { for (const t of opts.tips) await say(t); }}];
  if (opts.gateBadge) GATES[`${id}:north`] = {badge: opts.gateBadge, msg: `Wache: „Halt! Weiter geht es nur mit dem ${opts.gateBadge}.“`};
}
SHOP_LISTS.late = ['Fangkapsel', 'Superkapsel', 'Hyperkapsel', 'Supertrank', 'Hypertrank', 'Top-Trank', 'Beleber', 'Schutzspray', 'Lockduft', 'Fluchtseil'];
SHOP_LISTS.mall_balls = ['Fangkapsel', 'Superkapsel', 'Hyperkapsel', 'Legendenkapsel'];
SHOP_LISTS.mall_med = ['Heiltrank', 'Supertrank', 'Hypertrank', 'Top-Trank', 'Beleber', 'Top-Beleber'];
SHOP_LISTS.mall_spec = ['Sonderbonbon', 'EP-Teiler', 'Schutzspray', 'Lockduft', 'Fluchtseil'];
SHOP_LISTS.liga = ['Hyperkapsel', 'Hypertrank', 'Top-Trank', 'Top-Beleber', 'Beleber', 'Sonderbonbon'];

// ---------- Routen ----------
const E5 = [['Strahlino', 28, 31, 14], ['Wyrmendor', 28, 31, 12], ['Schollram', 28, 31, 14], ['Erdoran', 28, 30, 12], ['Ferron', 28, 31, 12], ['Voltaro', 29, 31, 10], ['Brisaro', 28, 30, 12], ['Kieselix', 27, 29, 10]];
const E6 = [['Nachtor', 32, 35, 15], ['Giftrax', 32, 35, 14], ['Dunkling', 31, 33, 12], ['Toxli', 31, 33, 12], ['Halluro', 32, 35, 12], ['Brisaro', 32, 34, 12], ['Surrli', 31, 33, 10], ['Schleiera', 35, 35, 4]];
const E7 = [['Ferron', 35, 38, 14], ['Voltaro', 35, 38, 14], ['Halluro', 35, 38, 14], ['Resonox', 36, 38, 10], ['Brisaro', 35, 37, 12], ['Erdoran', 35, 38, 12], ['Strahlino', 35, 37, 12], ['Titanor', 38, 38, 3]];
const E8 = [['Glazaro', 38, 41, 14], ['Froschi', 37, 39, 12], ['Brisaro', 38, 40, 12], ['Wyrmendor', 38, 41, 12], ['Schleiera', 38, 41, 10], ['Flirri', 37, 39, 10], ['Lufti', 37, 39, 10], ['Strömara', 41, 41, 2]];
const E9 = [['Giftrax', 41, 44, 14], ['Erdoran', 41, 44, 14], ['Strahlino', 41, 44, 12], ['Toxli', 40, 42, 10], ['Lumin', 40, 42, 10], ['Brisaro', 41, 43, 12], ['Morbador', 44, 44, 4], ['Geotitan', 44, 44, 3]];
const E10 = [['Halluro', 44, 47, 14], ['Resonox', 44, 47, 14], ['Strahlino', 44, 46, 12], ['Schollram', 44, 47, 12], ['Kristavor', 44, 47, 10], ['Sonorak', 47, 47, 4], ['Bergorun', 47, 47, 4], ['Titanor', 46, 47, 6]];
const E11 = [['Brisaro', 47, 50, 14], ['Sturmarik', 47, 50, 10], ['Wyrmendor', 47, 50, 12], ['Sonorak', 48, 50, 8], ['Bergorun', 48, 50, 8], ['Dravulkan', 50, 50, 4], ['Halluro', 47, 49, 12], ['Glazaro', 47, 50, 10]];
const ESIEG = [['Sturmarik', 50, 54, 10], ['Dravulkan', 50, 54, 10], ['Titanor', 50, 54, 10], ['Geotitan', 50, 54, 10], ['Sonorak', 50, 54, 10], ['Solavion', 50, 54, 10], ['Finstramor', 50, 54, 10], ['Morbador', 50, 54, 10], ['Bergorun', 50, 54, 10], ['Kristavor', 50, 54, 10]];
addRoute('route5', 5, 501, 24, 'ash', 'stadt4', 'stadt5', E5, 'Route 5\nNorden: Glutheim – die Stadt am Vulkan');
addRoute('route6', 6, 602, 24, 'dusk', 'stadt5', 'dorf2', E6, 'Route 6\nNorden: Dämmerfeld – das Dorf mit dem Geisterturm', {fog: true});
addRoute('route7', 7, 703, 26, 'normal', 'dorf2', 'stadt6', E7, 'Route 7\nNorden: Lumora – die Riesenstadt');
addRoute('route8', 8, 804, 24, 'beach', 'stadt6', 'stadt7', E8, 'Route 8\nNorden: Wellenstrand');
addRoute('route9', 9, 905, 24, 'flower', 'stadt7', 'stadt8', E9, 'Route 9\nNorden: Blütental – mit Safari-Park!');
addRoute('route10', 10, 1006, 26, 'mountain', 'stadt8', 'stadt9', E10, 'Route 10\nNorden: Klangberg');
addRoute('route11', 11, 1107, 26, 'mountain', 'stadt9', 'stadt10', E11, 'Route 11\nNorden: Windhöhe');
addRoute('sieg', 12, 1208, 32, 'mountain', 'stadt10', 'ligaplatz', ESIEG, 'Siegesstraße\nNur die Besten erreichen die Monster-Liga!', {name: 'Siegesstraße', trainers: {min: 3, max: 4, bonus: 1, classes: [['Ass-Trainer', 'ace'], ['Ass-Trainerin', 'beauty'], ['Veteran', 'gent'], ['Ass-Trainer', 'ace'], ['Meisterschüler', 'monk']]}});

// ---------- Städte mit Arenen ----------
addTown('stadt5', 5, 'Glutheim', 'ash', {south: 'route5', north: 'route6', arena: 'glut', deco: 'l', mountain: true, gateBadge: 'Glutorden',
  assistant: ['Arenaschüler Ignaz', LOOK.monk, [['Strahlino', 32], ['Wyrmendor', 33]], 1200, 'Spürst du die Hitze?'],
  leader: leader('flammara', 'Arenaleiterin Flammara', LOOK.flammara, [['Strahlino', 34], ['Wyrmendor', 35], ['Brennaro', 35], ['Vulkaron', 37]], 6000, 'Glutorden',
    'Willkommen im Herzen des Vulkans!\nIch bin Flammara. Meine Glut-Monster brennen für den Sieg!', 'Was?! Mein Feuer ist erloschen …\nDer Glutorden gehört dir!', 'Im Krater östlich der Stadt soll Soltherion wohnen …'),
  tips: ['Flammara kämpft mit Glut-Monstern.\nFlut- und Stein-Attacken löschen jedes Feuer!', 'Östlich der Stadt liegt der Glutkrater.\nDort soll ein legendäres Sonnenmonster leben!']});
MAPS.stadt5.lava = false;
addTown('stadt7', 7, 'Wellenstrand', 'beach', {south: 'route8', north: 'route9', arena: 'flut', deco: 'W', gateBadge: 'Wellenorden',
  assistant: ['Schwimmerin Nemo', LOOK.swimmer, [['Glazaro', 39], ['Froschi', 40]], 1600, 'Spring rein, das Wasser ist super!'],
  leader: leader('marina', 'Arenaleiterin Marina', LOOK.marina, [['Glazaro', 42], ['Rinnavo', 42], ['Glazaro', 43], ['Strömara', 44]], 8000, 'Wellenorden',
    'Ahoi, {name}! Ich bin Marina.\nMeine Flut-Monster reißen dich mit wie eine Welle!', 'Du bist wie ein Fels in der Brandung!\nHier, der Wellenorden.', 'Im Norden liegt Blütental mit dem Safari-Park.'),
  tips: ['Marina setzt auf Flut-Monster.\nWuchs- und Funke-Attacken sind sehr effektiv!']});
addTown('stadt8', 8, 'Blütental', 'flower', {south: 'route9', north: 'route10', arena: 'wuchs', deco: 'P', gateBadge: 'Blütenorden',
  house: {to: 'safari_tor', x: 4, y: 6, dir: 'up'},
  assistant: ['Gärtner Kurt', LOOK.ranger, [['Giftrax', 43], ['Erdoran', 43]], 1800, 'Meine Monster sind frisch gegossen!'],
  leader: leader('flora', 'Arenaleiterin Flora', LOOK.flora, [['Giftrax', 44], ['Erdoran', 45], ['Morbador', 46], ['Hainwacht', 47], ['Geotitan', 47]], 9000, 'Blütenorden',
    'Willkommen in meinem Garten, {name}!\nIch bin Flora. Hier blüht alles – auch der Kampfgeist!', 'Meine Blumen … verwelkt.\nDu verdienst den Blütenorden!', 'Hast du den Safari-Park schon besucht? Das Haus links im Ort!'),
  tips: ['Flora liebt Wuchs-Monster.\nGlut- und Frost-Attacken sind sehr effektiv!', 'Das Haus mit dem roten Dach ist der Eingang zum Safari-Park!']});
addTown('stadt9', 9, 'Klangberg', 'mountain', {south: 'route10', north: 'route11', arena: 'klang', deco: 'y', gateBadge: 'Klangorden',
  assistant: ['Sänger Ludwig', LOOK.gent, [['Halluro', 46], ['Resonox', 47]], 2000, 'Lalala! Hör dir meine Monster an!'],
  leader: leader('harmonia', 'Arenaleiterin Harmonia', LOOK.harmonia, [['Halluro', 47], ['Strahlino', 47], ['Resonox', 48], ['Schleiera', 48], ['Sonorak', 50]], 10000, 'Klangorden',
    'Hörst du das? Das ist der Klang des Sieges!\nIch bin Harmonia – lass uns musizieren!', 'Was für ein großartiges Finale!\nDer Klangorden gehört dir.', 'Nur noch ein Orden bis zur Siegesstraße!'),
  tips: ['Harmonia kämpft mit Klang-Monstern.\nFunke- und Metall-Attacken bringen sie aus dem Takt!']});
addTown('stadt10', 10, 'Windhöhe', 'mountain', {south: 'route11', north: 'sieg', arena: 'wind', deco: 'h', mountain: true,
  assistant: ['Pilot Fred', LOOK.ace, [['Brisaro', 49], ['Sturmarik', 50]], 2200, 'Wir heben ab!'],
  leader: leader('zephyr', 'Arenaleiter Zephyr', LOOK.zephyr, [['Brisaro', 50], ['Sturmarik', 51], ['Strömara', 51], ['Dravulkan', 52], ['Sonorak', 53]], 12000, 'Windorden',
    'Der Wind hat mir von dir erzählt, {name}.\nIch bin Zephyr, der letzte Arenaleiter. Zeig mir deinen Sturm!', 'Ein echter Wirbelsturm!\nDer Windorden ist dein – dein zehnter Orden!', 'Mit zehn Orden darfst du die Siegesstraße betreten.\nDahinter wartet die Monster-Liga!'),
  guardTalk: async () => { if (G.badges.length >= 10) await say('Zehn Orden! Unglaublich.\nDie Siegesstraße steht dir offen. Viel Glück bei der Liga!'); else await say(`Halt! Die Siegesstraße ist nur für Trainer mit 10 Orden.\nDu hast erst ${G.badges.length}.`); },
  tips: ['Zephyr kämpft mit Wind-Monstern.\nFunke- und Frost-Attacken holen sie vom Himmel!', 'Östlich der Stadt ist eine versiegelte Höhle.\nNur ein Champion kann das Siegel brechen …']});
GATES['stadt10:north'] = {count: 10, msg: 'Wache: „Halt! Die Siegesstraße ist nur für Trainer mit 10 Orden.“'};

// ---------- Lumora (Riesenstadt) ----------
MAPS.stadt6 = {name: 'Lumora', outdoor: true, theme: 'normal', exits: {south: 'route7', north: 'route8'}, rows: [
  'TTTTTTTTT,,TTTTTTTTTTTTTTTTTTTTTTT',
  'T........,,......................T',
  'T.ZZZZZ..,,..KKKKKKKKK..JJJJJJJ..T',
  'T.ZZZZZ..,,..KKKKKKKKK..JJJJJJJ..T',
  'T.HNDNH..,,..KKKKKKKKK..JJJJJJJ..T',
  'T........,,..HNNHDHNNH..HNHDHNH..T',
  'T...,,,,,,,,,,,,,,,,,,,,,,,,,,,..T',
  'T........,,......................T',
  'T.RRRR...,,..WWWWW....AAAAAAA....T',
  'T.RRRR...,,..WWWWW....AAAAAAA....T',
  'T.HNDH...,,..WWWWW....AAAAAAA....T',
  'T...,,,,,,,..F...F....HHHDHHH....T',
  'T........,,,,,,,,,,,,,,,,,,,,,...T',
  'T........,,......................T',
  'T.RRRR...,,..RRRR....RRRR...RRRR.T',
  'T.RRRR...,,..RRRR....RRRR...RRRR.T',
  'T.HNDH...,,..HNDH....HDNH...HNDH.T',
  'T...,,,,,,,,,,,,,,,,,,,,,,,,,,,..T',
  'T........,,......................T',
  'T..F..F..,,..F..F..F..F..F..F....T',
  'T........,,......................T',
  'TTTTTTTTT,,TTTTTTTTTTTTTTTTTTTTTTT']};
GATES['stadt6:north'] = {badge: 'Stahlorden', msg: 'Wache: „Halt! Route 8 ist nur für Trainer mit dem Stahlorden.“'};
MAPS.heil6 = {name: 'Heilstation', rows: heilRoom()};
NPCS.heil6 = [{id: 'nurse6', x: 5, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse}];
MAPS.mall = {name: 'Einkaufszentrum Lumora', arena: 'mall', rows: room(16, 10, 7, [['c', 1, 3], ['c', 2, 3], ['c', 3, 3], ['c', 5, 3], ['c', 6, 3], ['c', 7, 3], ['c', 9, 3], ['c', 10, 3], ['c', 11, 3], ['c', 12, 3], ['c', 13, 3], ['c', 14, 3], ['P', 1, 8], ['P', 14, 8], ['P', 4, 6], ['P', 11, 6], ['b', 4, 1], ['b', 8, 1]])};
NPCS.mall = [{id: 'm1', x: 2, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('mall_balls', 'Kapsel-Theke')},
  {id: 'm2', x: 6, y: 2, dir: 'down', look: LOOK.nurse, talk: () => talkShop('mall_med', 'Medizin-Theke')},
  {id: 'm3', x: 10, y: 2, dir: 'down', look: LOOK.starclerk, talk: () => talkShop('mall_spec', 'Spezial-Theke')},
  {id: 'm4', x: 13, y: 2, dir: 'down', look: LOOK.ranger, talk: () => talkMonsterShop()},
  {id: 'm5', x: 8, y: 7, dir: 'left', look: LOOK.beauty, talk: async () => { await say('Das ist das größte Einkaufszentrum der Region!\nGanz rechts kann man sogar Monster kaufen.'); }}];
MAPS.casino = {name: 'Casino Lumora', arena: 'casino', rows: room(16, 11, 7, [['1', 1, 2], ['1', 2, 2], ['1', 3, 2], ['1', 4, 2], ['1', 5, 2], ['1', 6, 2], ['2', 9, 5], ['2', 10, 5], ['3', 12, 5], ['3', 13, 5], ['1', 1, 7], ['1', 2, 7], ['1', 3, 7], ['P', 14, 9], ['P', 1, 9]])};
NPCS.casino = [{id: 'cr1', x: 10, y: 4, dir: 'down', look: LOOK.croupier, talk: async () => { await say('Croupier: „Willkommen am Roulette!\nStell dich vor den Tisch, um zu spielen.“'); }},
  {id: 'cr2', x: 13, y: 4, dir: 'down', look: LOOK.croupier, talk: async () => { await say('Croupier: „Blackjack! Wer näher an 21 kommt, gewinnt.\nAber Achtung: Über 21 hat man verloren.“'); }},
  {id: 'cg1', x: 4, y: 4, dir: 'up', look: LOOK.gent, talk: async () => { await say('Beim Einarmigen Banditen gibt es mit drei Diamanten\nden Hauptgewinn: das 200-Fache!'); }},
  {id: 'cg2', x: 12, y: 8, dir: 'left', look: LOOK.beauty, talk: async () => { await say('Tipp: Beim Blackjack bei 17 oder mehr lieber halten!'); await say('Und denk dran: Hier wird nur mit Spielgeld gespielt.\nHör auf, wenn du vorne liegst!'); }}];
MAPS.fanclub = {name: 'Monster-Fanclub', rows: room(10, 8, 4, [['t', 3, 3], ['t', 4, 3], ['t', 5, 3], ['P', 1, 6], ['P', 8, 6], ['b', 2, 1], ['b', 7, 1]])};
NPCS.fanclub = [{id: 'fan1', x: 4, y: 2, dir: 'down', look: LOOK.gent, talk: async () => {
    if (G.flags.fanGift) { await say('Vorsitzender: „Wie gefällt dir der EP-Teiler?\nDein ganzes Team wird jetzt stärker!“'); return; }
    await say('Vorsitzender: „Willkommen im Monster-Fanclub!\nIch liebe es, über Monster zu reden!“');
    await say(`„Oh, du hast ein ${G.team[0] ? G.team[0].sp : 'Monster'}? Wie wunderbar!\nHier, nimm dieses Geschenk!“`);
    G.bag['EP-Teiler'] = 1; G.flags.fanGift = 1;
    await say('{name} erhält den EP-Teiler!\nJetzt bekommen auch Monster, die nicht kämpfen, Erfahrung.'); }},
  {id: 'fan2', x: 7, y: 4, dir: 'left', look: LOOK.girl, talk: async () => { await say('Mein Lieblingsmonster ist Lumin.\nEs leuchtet so schön!'); }}];
MAPS.arena6 = {name: 'Arena Lumora', arena: 'metall', rows: arenaRoom('z')};
NPCS.arena6 = [{id: 'as6', x: 3, y: 6, dir: 'right', look: LOOK.worker, trainer: T('Mechaniker Otto', [['Ferron', 37], ['Voltaro', 38]], 1500, 'Hier wird geschraubt!', 'Schraube locker …', 'Ferrum ist hart wie Stahl.')},
  leader('ferrum', 'Arenaleiter Ferrum', LOOK.ferrum, [['Ferron', 38], ['Kristavor', 39], ['Voltaro', 39], ['Titanor', 41]], 7000, 'Stahlorden',
    'Willkommen in der Stahlarena von Lumora!\nIch bin Ferrum. Meine Metall-Monster sind unzerbrechlich.', 'Unglaublich … du hast Stahl verbogen!\nDer Stahlorden gehört dir.', 'Im Norden liegt Wellenstrand. Pack deine Badehose ein!')];
NPCS.stadt6 = [{id: 'g6', x: 11, y: 1, dir: 'down', look: LOOK.guard, talk: async () => { await say(G.badges.includes('Stahlorden') ? 'Route 8 führt ans Meer. Gute Reise!' : 'Halt! Route 8 ist nur für Trainer mit dem Stahlorden.'); }},
  {id: 'l1', x: 18, y: 13, dir: 'down', look: LOOK.beauty, talk: async () => { await say('Willkommen in Lumora, der größten Stadt der Region!\nOben links ist die Heilstation, daneben das Einkaufszentrum.'); }},
  {id: 'l2', x: 30, y: 7, dir: 'left', look: LOOK.gent, talk: async () => { await say('Im Casino kann man am Einarmigen Banditen,\nam Roulette und beim Blackjack Coins gewinnen!'); }},
  {id: 'l3', x: 14, y: 18, dir: 'up', look: LOOK.kid, talk: async () => { await say('Im Haus hinter mir ist der Monster-Fanclub.\nDer Vorsitzende verschenkt manchmal tolle Sachen!'); }},
  {id: 'l4', x: 20, y: 11, dir: 'right', look: LOOK.worker, talk: async () => { await say('Arenaleiter Ferrum kämpft mit Metall-Monstern.\nGlut- und Nebel-Attacken sind sehr effektiv!'); }},
  {id: 'rival_s6', x: 0, y: 0, dir: 'down', look: LOOK.rival, show: () => G.flags.rivalShow === 'rival_s6', talk: async () => {}}];
Object.assign(WARPS, {
  'stadt6:4,4': {to: 'heil6', x: 5, y: 6, dir: 'up'}, 'heil6:5,7': {to: 'stadt6', x: 4, y: 5, dir: 'down'},
  'stadt6:17,5': {to: 'mall', x: 7, y: 8, dir: 'up'}, 'mall:7,9': {to: 'stadt6', x: 17, y: 6, dir: 'down'},
  'stadt6:27,5': {to: 'casino', x: 7, y: 9, dir: 'up'}, 'casino:7,10': {to: 'stadt6', x: 27, y: 6, dir: 'down'},
  'stadt6:25,11': {to: 'arena6', x: 5, y: 10, dir: 'up'}, 'arena6:5,11': {to: 'stadt6', x: 25, y: 12, dir: 'down'},
  'stadt6:15,16': {to: 'fanclub', x: 4, y: 6, dir: 'up'}, 'fanclub:4,7': {to: 'stadt6', x: 15, y: 17, dir: 'down'},
  'stadt6:4,10': {locked: 'Die Tür ist abgeschlossen. Ein Schild: „Bin im Casino!“'},
  'stadt6:22,16': {locked: 'Die Tür ist abgeschlossen. Drinnen bellt ein Monster.'},
  'stadt6:30,16': {locked: 'Die Tür ist abgeschlossen.'}
});

// ---------- Dämmerfeld & Geisterturm ----------
MAPS.dorf2 = {name: 'Dämmerfeld', outdoor: true, theme: 'dusk', fog: true, exits: {south: 'route6', north: 'route7'}, rows: [
  'TTTTTTTTT,,TTTTTTTTTTT',
  'T........,,..........T',
  'T..ZZZZZ.,,..VVVVV...T',
  'T..ZZZZZ.,,..VVVVV...T',
  'T..HNDNH.,,..VVVVV...T',
  'T...,,,,,,,..VVVVV...T',
  'T........,,..IIDII...T',
  'T........,,,,,,,,....T',
  'T.KKKK...,,..........T',
  'T.KKKK...,,...gggg...T',
  'T.HDNH...,,..........T',
  'T..,,,,,,,,...gggg...T',
  'T........,,..........T',
  'T..TT....,,...g.g.g..T',
  'T........,,..........T',
  'T.TT.....,,.....TT...T',
  'T........,,..........T',
  'TTTTTTTTT,,TTTTTTTTTTT']};
MAPS.heil_d = {name: 'Heilstation', rows: heilRoom()};
NPCS.heil_d = [{id: 'nurse_d', x: 5, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse}];
MAPS.shop_d = {name: 'Laden', rows: shopRoom()};
NPCS.shop_d = [{id: 'clerk_d', x: 3, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('late')}];
NPCS.dorf2 = [{id: 'd1', x: 12, y: 8, dir: 'left', look: LOOK.medium, talk: async () => { await say('Der Geisterturm … dort spuken Nebel-Monster.\nUnd ganz oben soll Aetherion schweben!'); await say('Nur Mutige wagen sich hinauf.'); }},
  {id: 'd2', x: 6, y: 12, dir: 'right', look: LOOK.old, talk: async () => { await say('Die Gräber dort gehören den Monstern früherer Zeiten.\nIhre Geister wachen über das Dorf.'); }}];
const GHOST = [['Flirri', 30, 33, 16], ['Dunkling', 30, 33, 16], ['Nachtor', 32, 35, 14], ['Toxli', 30, 33, 12], ['Giftrax', 32, 35, 12], ['Schleiera', 34, 36, 8], ['Finstramor', 36, 38, 3], ['Morbador', 36, 38, 3]];
MAPS.turm1 = {name: 'Geisterturm 1F', cave: true, tower: true, encRate: 0.08, enc: GHOST, rows: [
  'XXXXXXXXXXXXXXXX', 'XxxxxxxxxxxxxxLX', 'XxoxxxxxxxxoxxxX', 'XxxxxXXxxXXxxxxX', 'XxxxxXxxxxXxxxxX', 'XxoxxxxxxxxxxoxX', 'XxxxxxxxxxxxxxxX',
  'XxXXxxxoxxxXXxxX', 'XxxxxxxxxxxxxxxX', 'XxxoxxxxxxxxoxxX', 'XxxxxxXxxXxxxxxX', 'XxxxxxxxxxxxxxxX', 'XxxxxxxxxxxxxxxX', 'XXXXXXXUXXXXXXXX']};
MAPS.turm2 = {name: 'Geisterturm 2F', cave: true, tower: true, encRate: 0.08, enc: GHOST.map(e => [e[0], e[1] + 1, e[2] + 1, e[3]]), rows: [
  'XXXXXXXXXXXXXXXX', 'XUxxxxxxxxxxxxLX', 'XxxxxxxxxxxxxxxX', 'XxxXXXxxxxXXXxxX', 'XxxxxXxxxxXxxxxX', 'XxoxxxxxxxxxxoxX', 'XxxxxxxXXxxxxxxX',
  'XxxxxxxXXxxxxxxX', 'XxXXxxxxxxxxXXxX', 'XxxxxxxoxxxxxxxX', 'XxxxxxxxxxxxxxxX', 'XxoxxXXxxXXxxoxX', 'XxxxxxxxxxxxxxxX', 'XXXXXXXXXXXXXXXX']};
MAPS.turm3 = {name: 'Geisterturm 3F', cave: true, tower: true, encRate: 0.08, enc: GHOST.map(e => [e[0], e[1] + 2, e[2] + 2, e[3]]), rows: [
  'XXXXXXXXXXXXXXXX', 'XUxxxxxxxxxxxxLX', 'XxxxxXxxxxXxxxxX', 'XxoxxXxxxxXxxoxX', 'XxxxxxxxxxxxxxxX', 'XxxxxxxxxxxxxxxX', 'XXXxxxXXXXxxxXXX',
  'XxxxxxxxxxxxxxxX', 'XxoxxxxxxxxxxoxX', 'XxxxXXxxxxXXxxxX', 'XxxxxxxxxxxxxxxX', 'XxxxxxxoxxxxxxxX', 'XxxxxxxxxxxxxxxX', 'XXXXXXXXXXXXXXXX']};
MAPS.turm4 = {name: 'Geisterturm – Spitze', cave: true, tower: true, rows: [
  'XXXXXXXXXXXXXXXX', 'XUxxxxxxxxxxxxxX', 'XxxxxxxxxxxxxxxX', 'XxxxxaaaaaaxxxxX', 'XxxxxaaaaaaxxxxX', 'XxxxxaaaaaaxxxxX', 'XxxxxaaaaaaxxxxX', 'XxxxxxxxxxxxxxxX', 'XXXXXXXXXXXXXXXX']};
NPCS.turm1 = [{id: 'tu1', x: 12, y: 6, dir: 'left', look: LOOK.medium, trainer: T('Medium Agathe', [['Flirri', 33], ['Dunkling', 34]], 1300, 'Die Geister haben dich angekündigt …', 'Die Geister sind enttäuscht.', 'Oben wird es noch unheimlicher.')},
  {id: 'it_tu1', x: 1, y: 12, item: 'Hypertrank', n: 1}];
NPCS.turm2 = [{id: 'tu2', x: 3, y: 10, dir: 'right', look: LOOK.monk, trainer: T('Mönch Anselm', [['Nachtor', 35], ['Toxli', 34], ['Giftrax', 35]], 1500, 'Om … Konzentration … Kampf!', 'Meine Meditation war gestört.', 'Ganz oben schwebt Aetherion. Hast du eine Legendenkapsel?')},
  {id: 'tu3', x: 12, y: 4, dir: 'down', look: LOOK.medium, trainer: T('Medium Selma', [['Schleiera', 36], ['Dunkling', 35]], 1500, 'Buuuh!', 'Du hast keine Angst? Respekt.', 'Die Geister mögen dich.')},
  {id: 'it_tu2', x: 14, y: 12, item: 'Sonderbonbon', n: 1}];
NPCS.turm3 = [{id: 'tu4', x: 12, y: 5, dir: 'left', look: LOOK.medium, trainer: T('Geisterjägerin Mara', [['Nachtor', 37], ['Schleiera', 37], ['Finstramor', 38]], 1800, 'Ich jage Geister – und Trainer!', 'Ich gebe auf!', 'Die Treppe führt zur Spitze.')},
  {id: 'it_tu3', x: 2, y: 12, item: 'Legendenkapsel', n: 1}];
NPCS.turm4 = [{id: 'leg_aetherion', x: 8, y: 4, dir: 'down', legend: 'Aetherion', level: 50}];
Object.assign(WARPS, {
  'dorf2:5,4': {to: 'heil_d', x: 5, y: 6, dir: 'up'}, 'heil_d:5,7': {to: 'dorf2', x: 5, y: 5, dir: 'down'},
  'dorf2:3,10': {to: 'shop_d', x: 4, y: 6, dir: 'up'}, 'shop_d:4,7': {to: 'dorf2', x: 3, y: 11, dir: 'down'},
  'dorf2:15,6': {to: 'turm1', x: 7, y: 12, dir: 'up'}, 'turm1:7,13': {to: 'dorf2', x: 15, y: 7, dir: 'down'},
  'turm1:14,1': {to: 'turm2', x: 1, y: 2, dir: 'down'}, 'turm2:1,1': {to: 'turm1', x: 14, y: 2, dir: 'down'},
  'turm2:14,1': {to: 'turm3', x: 1, y: 2, dir: 'down'}, 'turm3:1,1': {to: 'turm2', x: 14, y: 2, dir: 'down'},
  'turm3:14,1': {to: 'turm4', x: 1, y: 2, dir: 'down'}, 'turm4:1,1': {to: 'turm3', x: 14, y: 2, dir: 'down'}
});

// ---------- Glutkrater & Ursprungshöhle ----------
MAPS.krater = {name: 'Glutkrater', cave: true, lava: true, encRate: 0.07, enc: [['Strahlino', 32, 35, 16], ['Wyrmendor', 32, 35, 16], ['Schollram', 32, 35, 14], ['Ferron', 32, 35, 12], ['Erdoran', 32, 34, 12], ['Dravulkan', 36, 36, 3], ['Vulkaron', 36, 36, 2]], rows: [
  'XXXXXXXXXXXXXXXXXXXX', 'XxxxxxxXaaaaaXxxxxxX', 'XxWWxxxXaaaaaXxxWWxX', 'XxWWxxxXXaaaXXxxWWxX', 'XxxxxxxxxxxxxxxxxxxX', 'XxxxXXxxxWWxxxXXxxxX', 'XoxxXXxxxWWxxxXXxoxX',
  'XxxxxxxxxxxxxxxxxxxX', 'XWWxxxxoxxxxoxxxxWWX', 'XWWxxxxxxxxxxxxxxWWX', 'XxxxxxXXxxxxXXxxxxxX', 'XxxoxxxxxxxxxxxxoxxX', 'XxxxxxxxxxxxxxxxxxxX', 'XXXXXXXXXUXXXXXXXXXX']};
NPCS.krater = [{id: 'leg_soltherion', x: 10, y: 1, dir: 'down', legend: 'Soltherion', level: 45}, {id: 'it_kr', x: 18, y: 12, item: 'Hyperkapsel', n: 3}];
MAPS.ursprung = {name: 'Ursprungshöhle', cave: true, void: true, encRate: 0.06, enc: [['Finstramor', 55, 58, 12], ['Titanor', 55, 58, 12], ['Geotitan', 55, 58, 12], ['Sonorak', 55, 58, 12], ['Solavion', 55, 58, 10], ['Dravulkan', 55, 58, 10], ['Kristavor', 55, 58, 12], ['Morbador', 55, 58, 10]], rows: [
  'XXXXXXXXXXXXXXXXXX', 'XxxxxxxaaaaxxxxxxX', 'XxoxxxxaaaaxxxxoxX', 'XxxxXXxxxxxxXXxxxX', 'XxxxXXxxxxxxXXxxxX', 'XxxxxxxxxxxxxxxxxX', 'XxoxxxxxXXxxxxxoxX',
  'XxxxxxxxXXxxxxxxxX', 'XxxXXxxxxxxxxXXxxX', 'XxxxxxxxxxxxxxxxxX', 'XxxxxxxxxxxxxxxxxX', 'XXXXXXXXUXXXXXXXXX']};
NPCS.ursprung = [{id: 'leg_ursphaeron', x: 8, y: 1, dir: 'down', legend: 'Ursphäron', level: 65}];
Object.assign(WARPS, {
  'stadt5:19,13': {to: 'krater', x: 9, y: 12, dir: 'up'}, 'krater:9,13': {to: 'stadt5', x: 19, y: 14, dir: 'down'},
  'stadt10:19,13': {to: 'ursprung', x: 8, y: 10, dir: 'up', req: () => G.flags.champion, reqMsg: 'Ein uraltes Siegel versperrt den Eingang.\nNur ein Champion kann es brechen …'},
  'ursprung:8,11': {to: 'stadt10', x: 19, y: 14, dir: 'down'}
});

// ---------- Safari-Park ----------
MAPS.safari_tor = {name: 'Safari-Park – Eingang', rows: room(10, 8, 4, [['c', 2, 3], ['c', 3, 3], ['c', 4, 3], ['c', 5, 3], ['P', 1, 6], ['P', 8, 6], ['b', 7, 1], ['b', 8, 1]])};
NPCS.safari_tor = [{id: 'ranger', x: 3, y: 2, dir: 'down', look: LOOK.ranger, talk: talkSafari},
  {id: 'sf1', x: 7, y: 4, dir: 'left', look: LOOK.kid, talk: async () => { await say('Im Safari-Park gibt es seltene Monster –\nsogar Zirkelu, Plitscho und Moosli!'); await say('Wirf einen Stein, dann lassen sie sich leichter fangen.\nAber sie hauen auch schneller ab!'); }}];
WARPS['safari_tor:4,7'] = {to: 'stadt8', x: 4, y: 11, dir: 'down'};
(function () {
  const W = 30, H = 22, g = Array.from({length: H}, (_, y) => Array.from({length: W}, (_, x) => (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? 'T' : '.'));
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = c; };
  rect(2, 2, 8, 5, 'G'); rect(13, 2, 6, 4, 'G'); rect(21, 2, 7, 6, 'G'); rect(2, 9, 6, 6, 'G'); rect(10, 8, 7, 5, 'G');
  rect(20, 10, 6, 4, 'W'); rect(21, 15, 6, 4, 'G'); rect(2, 16, 9, 3, 'G'); rect(11, 15, 2, 2, 'T'); rect(17, 15, 2, 2, 'T'); rect(19, 5, 1, 1, 'T');
  for (const [x, y] of [[11, 2], [26, 9], [8, 14], [15, 18], [27, 19], [4, 8]]) g[y][x] = 'F';
  for (let y = 14; y < H; y++) { g[y][14] = ','; g[y][15] = ','; }
  MAPS.safari = {name: 'Safari-Park', outdoor: true, theme: 'flower', safari: true, exitTo: {map: 'safari_tor', x: 4, y: 5, dir: 'up'},
    enc: [['Zirkelu', 25, 28, 3], ['Plitscho', 25, 28, 3], ['Moosli', 25, 28, 3], ['Drakian', 25, 30, 10], ['Halluro', 27, 32, 9], ['Erdoran', 27, 32, 9], ['Strahlino', 26, 30, 9], ['Giftrax', 26, 30, 9], ['Glazaro', 29, 33, 6], ['Lumin', 25, 28, 12], ['Surrli', 25, 28, 12], ['Terrab', 25, 28, 12], ['Knisterl', 25, 28, 10], ['Geotitan', 35, 35, 2], ['Sonorak', 35, 35, 2]],
    rows: g.map(r => r.join(''))};
})();
NPCS.safari = [{id: 'it_sf1', x: 27, y: 20, item: 'Sonderbonbon', n: 1}, {id: 'it_sf2', x: 1, y: 1, item: 'Hyperkapsel', n: 2}];

// ---------- Monster-Liga ----------
MAPS.ligaplatz = {name: 'Monster-Liga', outdoor: true, theme: 'mountain', exits: {south: 'sieg'}, rows: [
  'TTTTTTTTTTTTTTTTTTTTTT',
  'T....................T',
  'T...qqqqqqqqqqqqqq...T',
  'T...qqqqqqqqqqqqqq...T',
  'T...qqqqqqqqqqqqqq...T',
  'T...HHNHHHDHHHNHHH...T',
  'T........,,..........T',
  'T..F.....,,......F...T',
  'T........,,..........T',
  'T.F......,,.......F..T',
  'T........,,..........T',
  'TTTTTTTTT,,TTTTTTTTTTT']};
MAPS.liga_lobby = {name: 'Liga – Eingangshalle', arena: 'league', rows: room(11, 9, 5, [['c', 1, 3], ['c', 2, 3], ['c', 3, 3], ['c', 7, 3], ['c', 8, 3], ['c', 9, 3], ['D', 5, 1], ['P', 1, 7], ['P', 9, 7]])};
NPCS.liga_lobby = [{id: 'nurse_l', x: 2, y: 2, dir: 'down', look: LOOK.nurse, talk: talkNurse},
  {id: 'clerk_l', x: 8, y: 2, dir: 'down', look: LOOK.clerk, talk: () => talkShop('liga', 'Liga-Laden')},
  {id: 'guard_l', x: 4, y: 2, dir: 'down', look: LOOK.guard, talk: async () => {
    await say('Hinter dieser Tür wartet der Meisterrat:\nvier Meister – und danach der Champion.');
    await say('Wenn du einmal hineingehst, gibt es kein Zurück,\nbis du gewinnst oder verlierst. Bereite dich gut vor!'); }}];
const ELITES = [
  ['e1', 'Meisterin Morgana', LOOK.morgana, 'nebel', 'n', [['Nachtor', 55], ['Giftrax', 55], ['Schleiera', 56], ['Morbador', 56], ['Finstramor', 58]],
    'Willkommen beim Meisterrat, {name}.\nIch bin Morgana. Die Schatten flüstern mir deine Schwächen zu …', 'Die Schatten haben gelogen.\nGeh weiter – wenn du dich traust.'],
  ['e2', 'Meister Granit', LOOK.granit, 'stein', 'O', [['Schollram', 56], ['Kristavor', 56], ['Titanor', 57], ['Geotitan', 57], ['Bergorun', 59]],
    'Ich bin Granit. Nichts erschüttert mich.\nAuch du nicht!', 'Ich … bin erschüttert.\nDu bist wirklich stark.'],
  ['e3', 'Meisterin Ampera', LOOK.ampera, 'funke', 'E', [['Voltaro', 57], ['Resonox', 57], ['Sturmarik', 58], ['Solavion', 58], ['Sonorak', 60]],
    'Hochspannung! Ich bin Ampera.\nMal sehen, ob du meinen Blitzen standhältst!', 'Kurzschluss!\nDu hast eine unglaubliche Energie.'],
  ['e4', 'Meister Zephor', LOOK.zephor, 'glut', 'l', [['Strömara', 58], ['Wyrmendor', 58], ['Vulkaron', 59], ['Bergorun', 59], ['Dravulkan', 61]],
    'Ich bin Zephor, der Stärkste des Meisterrats.\nFeuer und Sturm – mehr brauche ich nicht!', 'Du hast mich besiegt …\nDer Champion erwartet dich hinter der Tür.']];
ELITES.forEach(([id, name, look, arena, deco, team, intro, lose], i) => {
  const mid = 'elite' + (i + 1);
  MAPS[mid] = {name: `Liga – ${name}`, arena, rows: leagueRoom(deco)};
  NPCS[mid] = [{id, x: 5, y: 3, dir: 'down', look, leader: true, trainer: Object.assign(T(name, team, 8000 + i * 2000, intro, lose, lose), {league: true})}];
  const next = i < 3 ? 'elite' + (i + 2) : 'champ';
  WARPS[`${mid}:5,1`] = {to: next, x: 5, y: 10, dir: 'up', req: () => G.flags['beat_' + id], reqMsg: `Die Tür ist verschlossen.\nBesiege zuerst ${name}!`};
});
MAPS.champ = {name: 'Liga – Halle des Champions', arena: 'league', rows: leagueRoom('P').map((r, y) => y === 1 ? r.replace('D', 'k') : r)};
NPCS.champ = [{id: 'champ', x: 5, y: 3, dir: 'down', look: LOOK.rival, leader: true, trainer: {name: 'Champion Lenny', team: [], reward: 30000, league: true, champion: true,
  intro: 'Na endlich, {name}! Ich hab dich erwartet.\nIch habe den Meisterrat vor dir besiegt – ich bin der Champion!\nUnd jetzt zeige ich dir, wer der beste Trainer der Welt ist!',
  lose: 'Ich … hab verloren?\nNach all dem Training …\nDu bist wirklich der Beste, {name}. Glückwunsch!', after: 'Champion zu sein steht dir gut, {name}!'}}];
Object.assign(WARPS, {
  'ligaplatz:10,5': {to: 'liga_lobby', x: 5, y: 7, dir: 'up'}, 'liga_lobby:5,8': {to: 'ligaplatz', x: 10, y: 6, dir: 'down'},
  'liga_lobby:5,1': {to: 'elite1', x: 5, y: 10, dir: 'up'}
});
NPCS.ligaplatz = [{id: 'lp1', x: 12, y: 7, dir: 'left', look: LOOK.ace, talk: async () => { await say('Das ist die Monster-Liga!\nWer den Meisterrat und den Champion besiegt, wird unsterblich.'); }}];

// ================= Einkaufszentrum: Monsterhandel =================
const MONSTER_SHOP = [['Drakian', 25, 6000], ['Strahlino', 25, 6000], ['Surrli', 25, 5000], ['Halluro', 25, 5500], ['Froschi', 25, 5000], ['Erdoran', 28, 8000], ['Glazaro', 30, 12000], ['Zirkelu', 20, 15000], ['Plitscho', 20, 15000], ['Moosli', 20, 15000]];
async function talkMonsterShop() {
  await say('„Willkommen beim Monsterhandel!\nHier findest du Monster aus aller Welt.“');
  while (true) {
    const i = await choose(MONSTER_SHOP.map(([n, l, p]) => ({label: `${spriteImg(n, 1.8)} <span style="flex:1">${n} <span class="small">Lv ${l}</span> ${badges(SPECIES[n].typen)}</span> <span class="small">${fmtC(p)} Coins</span>`})).concat(['Tschüss']),
      {title: `Deine Coins: ${fmtC(G.money)}`});
    if (i < 0 || i === MONSTER_SHOP.length) break;
    const [n, l, p] = MONSTER_SHOP[i];
    if (!(await yesNo(`${n} (Lv ${l}) für ${fmtC(p)} Coins kaufen?`))) continue;
    if (G.money < p) { await say('„Dafür reichen deine Coins leider nicht.“'); continue; }
    G.money -= p; const m = makeMon(n, l); markCaught(n);
    if (G.team.length < 6) { G.team.push(m); await say(`${n} ist jetzt in deinem Team!`); } else { G.box.push(m); await say(`${n} wurde in deine Box am PC geschickt.`); }
  }
  await say('„Pass gut auf deine Monster auf!“');
}

// ================= Safari-Park =================
async function talkSafari() {
  if (G.safari) { await say('„Viel Spaß im Safari-Park!“'); return; }
  await say('Ranger: „Willkommen im Safari-Park von Blütental!\nHier leben viele seltene Monster.“');
  await say('„Der Eintritt kostet 500 Coins. Du bekommst 30 Safari-Kapseln\nund darfst 500 Schritte durch den Park gehen.“');
  await say('„Im Park kannst du nicht kämpfen – nur Kapseln, Köder\nund Steine werfen. Köder beruhigen, Steine machen wütend.“');
  if (!(await yesNo('Möchtest du für 500 Coins in den Safari-Park?'))) { await say('„Komm gerne wieder!“'); return; }
  if (G.money < 500) { await say('„Oh, du hast leider nicht genug Coins.“'); return; }
  G.money -= 500; G.safari = {balls: 30, steps: 500};
  await say('{name} erhält 30 Safari-Kapseln!');
  await say('„Viel Glück! Zum Verlassen geh einfach unten aus dem Park.“');
  await fade(true); enterMap('safari', 14, 20, 'up'); await fade(false);
}
async function endSafari(msg) {
  if (msg) await say(msg);
  G.safari = null;
  await fade(true); enterMap('safari_tor', 4, 5, 'up'); await fade(false);
  await say('Ranger: „Ich hoffe, du hattest Spaß! Komm bald wieder!“');
}
async function safariBattle(foe) {
  scriptLock++;
  try {
    B = {wild: true, safari: true, foes: [foe], fi: 0, part: new Set(), used: new Set(), runs: 0};
    held.clear();
    await transIn('wild');
    setBg(); $('battle').style.display = 'block'; $('meInfo').style.display = 'none'; $('foeInfo').style.display = 'none';
    $('meMon').style.opacity = 0; $('hud').style.display = 'none'; hideBall(); $('fx').innerHTML = '';
    const meT = $('meTrainer'); drawAvatar(meT, LOOK.player, 'up'); meT.style.display = 'block'; meT.style.transform = 'translateX(-170%)';
    const fe = $('foeMon'); paintSprite(fe, foe.sp, false, foe.shiny); fe.style.opacity = 1; fe.style.filter = 'brightness(0)'; fe.style.transform = 'translateX(140%)';
    await transOut();
    await Promise.all([slideTrainer(meT, 'me', 'in'), play(fe, [{transform: 'translateX(140%)'}, {transform: 'translateX(0)'}], {duration: 600, easing: 'ease-out'})]);
    await play(fe, [{filter: 'brightness(0)'}, {filter: 'brightness(1)'}], 350); fe.style.filter = '';
    await sendOutFoe(foe);
    await say(`Ein wildes ${foe.sp} erscheint!`);
    let angry = 0, eating = 0, result = null;
    const base = catchBase(foe.sp);
    if (foe.shiny) { anim($('foeMon'), 'flash'); await say(`✨ Ein SCHILLERNDES ${foe.sp}! ✨`); }
    while (!result) {
      const i = await choose([`Kapsel (${G.safari.balls})`, 'Köder', 'Stein', 'Flucht'], {grid: true, cancel: false, text: `Safari-Park · ${G.safari.steps} Schritte übrig\nWas tust du?`});
      if (i === 0) {
        G.safari.balls--;
        showText('{name} wirft eine Safari-Kapsel!');
        const p = Math.min(0.95, base * 0.8 * (angry ? 2 : 1) * (eating ? 0.5 : 1));
        const ok = Math.random() < p, shakes = ok ? 3 : Math.floor(Math.random() * 3);
        await throwPose($('meTrainer'), 'me');
        await catchAnim(BALL_COL.Safari, ok, shakes, false);
        if (ok) {
          hideBall();
          await say(`Geschafft! ${foe.sp} wurde gefangen!`); markCaught(foe.sp);
          if (G.team.length < 6) { G.team.push(foe); await say(`${foe.sp} ist jetzt in deinem Team.`); } else { G.box.push(foe); await say(`${foe.sp} wurde in die Box geschickt.`); }
          result = 'caught'; break;
        }
        await say('Oh nein! Es hat sich befreit!');
      } else if (i === 1) { eating = 1 + Math.floor(Math.random() * 4); angry = 0; await throwPose($('meTrainer'), 'me'); await throwThing('🍓'); rise(POS.foe.x, POS.foe.y, '#ff9ad5', 8); await say(`{name} wirft einen Köder.\n${foe.sp} frisst ihn genüsslich!`); }
      else if (i === 2) { angry = 1 + Math.floor(Math.random() * 4); eating = 0; await throwPose($('meTrainer'), 'me'); await throwThing('🪨'); anim($('foeMon'), 'shake'); floatText(POS.foe.x, POS.foe.y - 12, '💢', '#e74c3c'); await say(`{name} wirft einen Stein.\n${foe.sp} wird wütend!`); }
      else { await say('Du schleichst dich davon.'); result = 'run'; break; }
      if (G.safari.balls <= 0) { await say('Du hast keine Safari-Kapseln mehr!'); result = 'out'; break; }
      const flee = Math.min(0.6, (0.06 + foe.spd / (foe.spd + 150) * 0.25) * (angry ? 2 : 1) * (eating ? 0.35 : 1));
      if (Math.random() < flee) { await play($('foeMon'), [{transform: 'translateX(0)', opacity: 1}, {transform: 'translateX(120%)', opacity: 0}], 450); $('foeMon').style.opacity = 0; await say(`${foe.sp} ist geflohen!`); result = 'fled'; break; }
      await say(eating ? `${foe.sp} frisst gemütlich.` : angry ? `${foe.sp} ist wütend!` : `${foe.sp} beobachtet dich aufmerksam.`);
      if (angry) angry--; if (eating) eating--;
    }
    await fade(true); $('battle').style.display = 'none'; $('hud').style.display = ''; $('meTrainer').style.display = 'none'; hideBall(); $('fx').innerHTML = ''; hideText(); await fade(false);
    B = null; autosave();
    if (G.safari && G.safari.balls <= 0) await endSafari('Ding-dong! „Deine Safari-Kapseln sind aufgebraucht!“');
  } finally { scriptLock--; }
}

// ================= Casino =================
function casinoHeader(title) { return `<h2>${title}</h2><div class="small">Deine Coins: <b>${fmtC(G.money)} 🪙</b> · Nur Spielgeld – hör auf, wenn du vorne liegst!</div>`; }
async function chooseBet(title) {
  const bets = [50, 100, 500, 1000, 5000];
  const i = await choose(bets.map(b => ({label: `Einsatz ${fmtC(b)} Coins`, disabled: G.money < b})).concat(['Aufhören']), {title: `${title} · ${fmtC(G.money)} Coins`});
  if (i < 0 || i === bets.length) return 0;
  return bets[i];
}
const SLOT_SYM = ['🍒', '🍋', '🔔', '⭐', '7️⃣', '💎'], SLOT_W = [6, 5, 4, 3, 2, 1];
const SLOT_PAY = {'💎': 200, '7️⃣': 80, '⭐': 30, '🔔': 15, '🍋': 8, '🍒': 5};
function slotSpin() { let r = Math.random() * 21; for (let i = 0; i < 6; i++) { r -= SLOT_W[i]; if (r <= 0) return SLOT_SYM[i]; } return '🍒'; }
function slotHtml(reels, msg) {
  return casinoHeader('🎰 Einarmiger Bandit') + `<div style="display:flex;justify-content:center;gap:.4em;margin:.6em 0"><div style="background:#2d3142;padding:.5em;border-radius:.6em;display:flex;gap:.4em">${reels.map(s => `<div style="width:2.4em;height:2.4em;background:#fff;border-radius:.4em;display:flex;align-items:center;justify-content:center;font-size:1.7em">${s}</div>`).join('')}</div></div><div style="text-align:center;font-weight:700;min-height:1.4em">${msg || ''}</div><div class="small" style="text-align:center;margin-top:.4em">💎💎💎 ×200 · 7️⃣7️⃣7️⃣ ×80 · ⭐⭐⭐ ×30 · 🔔🔔🔔 ×15 · 🍋🍋🍋 ×8 · 🍒🍒🍒 ×5 · 🍒🍒 ×3 · 🍒 vorne ×1</div>`;
}
async function playSlots() {
  let reels = ['🍒', '⭐', '💎'];
  while (true) {
    showPanel(slotHtml(reels, 'Wähle deinen Einsatz!'));
    const bet = await chooseBet('Einarmiger Bandit');
    if (!bet) break;
    G.money -= bet;
    const final = [slotSpin(), slotSpin(), slotSpin()];
    for (let t = 0; t < 22; t++) { for (let k = 0; k < 3; k++) if (t < 8 + k * 6) reels[k] = SLOT_SYM[Math.floor(Math.random() * 6)]; else reels[k] = final[k]; showPanel(slotHtml(reels, 'Die Walzen drehen sich …')); await sleep(70); }
    reels = final;
    let mult = 0;
    if (final[0] === final[1] && final[1] === final[2]) mult = SLOT_PAY[final[0]];
    else if (final[0] === '🍒' && final[1] === '🍒') mult = 3;
    else if (final[0] === '🍒') mult = 1;
    const win = bet * mult; addMoney(win);
    showPanel(slotHtml(reels, win ? `Gewonnen: ${fmtC(win)} Coins!` : 'Leider nichts gewonnen.'));
    if (mult >= 30) await say(`JACKPOT! Du gewinnst ${fmtC(win)} Coins!`);
    else if (win > bet) await say(`Gewonnen! Du erhältst ${fmtC(win)} Coins.`);
    else if (win === bet) await say('Einsatz zurück!');
    else await say('Leider nichts gewonnen …');
  }
  hidePanel();
}
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
function numColor(n) { return n === 0 ? '#2e8b3a' : RED.has(n) ? '#c0392b' : '#1d1f2a'; }
function rouletteHtml(n, msg) {
  return casinoHeader('🎡 Roulette') + `<div style="display:flex;justify-content:center;margin:.6em 0"><div style="width:5em;height:5em;border-radius:50%;background:radial-gradient(circle,#f5e6b8 0 35%,#7a4a20 36% 42%,${n === null ? '#555' : numColor(n)} 43% 70%,#3a2010 71%);display:flex;align-items:center;justify-content:center"><span style="color:#1d1f2a;font-weight:900;font-size:1.4em">${n === null ? '?' : n}</span></div></div><div style="text-align:center;font-weight:700;min-height:1.4em">${msg || ''}</div><div class="small" style="text-align:center">Rot/Schwarz, Gerade/Ungerade, 1–18/19–36 zahlen ×2 · Dutzend ×3 · Einzelne Zahl ×36 · Die 0 ist grün</div>`;
}
async function playRoulette() {
  let last = null;
  while (true) {
    showPanel(rouletteHtml(last, 'Worauf setzt du?'));
    const types = ['Rot', 'Schwarz', 'Gerade', 'Ungerade', '1–18', '19–36', '1. Dutzend (1–12)', '2. Dutzend (13–24)', '3. Dutzend (25–36)', 'Eine Zahl', 'Aufhören'];
    const t = await choose(types, {title: `Roulette · ${fmtC(G.money)} Coins`});
    if (t < 0 || t === 10) break;
    let num = null;
    if (t === 9) { const k = await choose(Array.from({length: 37}, (_, i) => `<span style="color:${numColor(i)};font-weight:800">● ${i}</span>`), {title: 'Welche Zahl?'}); if (k < 0) continue; num = k; }
    const bet = await chooseBet('Roulette'); if (!bet) continue;
    G.money -= bet;
    let n = 0;
    for (let s = 0; s < 24; s++) { n = Math.floor(Math.random() * 37); showPanel(rouletteHtml(n, 'Rien ne va plus – nichts geht mehr!')); await sleep(40 + s * 9); }
    last = n;
    let mult = 0;
    if (t === 0 && RED.has(n)) mult = 2; if (t === 1 && n && !RED.has(n)) mult = 2;
    if (t === 2 && n && n % 2 === 0) mult = 2; if (t === 3 && n % 2 === 1) mult = 2;
    if (t === 4 && n >= 1 && n <= 18) mult = 2; if (t === 5 && n >= 19) mult = 2;
    if (t >= 6 && t <= 8 && n >= (t - 6) * 12 + 1 && n <= (t - 5) * 12) mult = 3;
    if (t === 9 && n === num) mult = 36;
    const win = bet * mult; addMoney(win);
    const col = n === 0 ? 'Grün' : RED.has(n) ? 'Rot' : 'Schwarz';
    showPanel(rouletteHtml(n, win ? `${n} ${col} – Gewonnen: ${fmtC(win)} Coins!` : `${n} ${col} – leider verloren.`));
    await say(win ? `Die Kugel fällt auf ${n} (${col})!\nDu gewinnst ${fmtC(win)} Coins!` : `Die Kugel fällt auf ${n} (${col}).\nLeider verloren …`);
  }
  hidePanel();
}
function newDeck() { const d = []; for (let k = 0; k < 4; k++) for (const s of ['♠', '♥', '♦', '♣']) for (const r of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K']) d.push({r, s}); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
function handVal(h) { let v = 0, a = 0; for (const c of h) { if (c.r === 'A') { v += 11; a++; } else if ('BDK'.includes(c.r) || c.r === '10') v += 10; else v += +c.r; } while (v > 21 && a) { v -= 10; a--; } return v; }
function cardHtml(c, hidden) { if (hidden) return `<div style="width:2.2em;height:3.1em;border-radius:.3em;background:repeating-linear-gradient(45deg,#c0392b 0 4px,#e74c3c 4px 8px);border:.12em solid #fff;box-shadow:0 .1em .2em rgba(0,0,0,.3)"></div>`; const red = c.s === '♥' || c.s === '♦'; return `<div style="width:2.2em;height:3.1em;border-radius:.3em;background:#fff;border:.12em solid #ccc;color:${red ? '#c0392b' : '#1d1f2a'};font-weight:900;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;box-shadow:0 .1em .2em rgba(0,0,0,.3)"><span>${c.r}</span><span>${c.s}</span></div>`; }
function bjHtml(dealer, player, hideHole, msg) {
  const dv = hideHole ? '?' : handVal(dealer);
  return casinoHeader('🃏 Blackjack') + `<div style="background:#1e6b3a;border-radius:.6em;padding:.5em .8em;margin-top:.4em;color:#fff"><div class="small" style="color:#cde">Croupier (${dv})</div><div style="display:flex;gap:.3em;margin:.2em 0 .5em">${dealer.map((c, i) => cardHtml(c, hideHole && i === 1)).join('')}</div><div class="small" style="color:#cde">Du (${handVal(player)})</div><div style="display:flex;gap:.3em;margin-top:.2em">${player.map(c => cardHtml(c)).join('')}</div></div><div style="text-align:center;font-weight:700;margin-top:.4em;min-height:1.4em">${msg || ''}</div>`;
}
async function playBlackjack() {
  while (true) {
    showPanel(casinoHeader('🃏 Blackjack') + '<div style="margin-top:.6em">Ziel: näher an 21 als der Croupier, ohne darüber zu kommen.<br>Bild-Karten zählen 10, Asse 1 oder 11. Blackjack zahlt 3:2.</div>');
    let bet = await chooseBet('Blackjack');
    if (!bet) break;
    G.money -= bet;
    const deck = newDeck(), dealer = [deck.pop(), deck.pop()], player = [deck.pop(), deck.pop()];
    let done = false, msg = '';
    showPanel(bjHtml(dealer, player, true));
    if (handVal(player) === 21) {
      if (handVal(dealer) === 21) { addMoney(bet); msg = 'Beide haben Blackjack – Unentschieden.'; }
      else { const w = Math.floor(bet * 2.5); addMoney(w); msg = `BLACKJACK! Du gewinnst ${fmtC(w)} Coins!`; }
      showPanel(bjHtml(dealer, player, false, msg)); await say(msg); continue;
    }
    let first = true;
    while (!done) {
      const opts = ['Karte ziehen', 'Halten', {label: 'Verdoppeln', disabled: !first || G.money < bet}];
      const a = await choose(opts, {title: `Du hast ${handVal(player)}`, cancel: false});
      if (a === 0) { player.push(deck.pop()); first = false; showPanel(bjHtml(dealer, player, true)); if (handVal(player) > 21) { msg = `${handVal(player)} – überkauft! Verloren.`; done = 'bust'; } else if (handVal(player) === 21) done = 'stand'; }
      else if (a === 1) done = 'stand';
      else { G.money -= bet; bet *= 2; player.push(deck.pop()); showPanel(bjHtml(dealer, player, true)); if (handVal(player) > 21) { msg = `${handVal(player)} – überkauft! Verloren.`; done = 'bust'; } else done = 'stand'; }
    }
    if (done === 'stand') {
      showPanel(bjHtml(dealer, player, false, 'Der Croupier deckt auf …')); await sleep(600);
      while (handVal(dealer) < 17) { dealer.push(deck.pop()); showPanel(bjHtml(dealer, player, false, 'Der Croupier zieht …')); await sleep(600); }
      const p = handVal(player), d = handVal(dealer);
      if (d > 21 || p > d) { addMoney(bet * 2); msg = `Du gewinnst ${fmtC(bet * 2)} Coins! (${p} gegen ${d > 21 ? 'überkauft' : d})`; }
      else if (p === d) { addMoney(bet); msg = `Unentschieden (${p}) – Einsatz zurück.`; }
      else msg = `Verloren … (${p} gegen ${d})`;
    }
    showPanel(bjHtml(dealer, player, false, msg));
    await say(msg);
  }
  hidePanel();
}

// ================= Ruhmeshalle =================
async function hallOfFame() {
  G.flags.champion = 1;
  await fade(true, true); await sleep(200);
  showPanel(`<div style="text-align:center"><h2>🏆 Ruhmeshalle 🏆</h2><div>Champion: <b>${G.name}</b></div><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:.8em;margin-top:.8em">${G.team.map(m => `<div>${spriteImg(m.sp, 4, m.shiny)}<div class="small">${m.sp} · Lv ${m.level}</div></div>`).join('')}</div><div class="small" style="margin-top:.8em">Spielzeit: ${Math.floor(G.time / 60)} Minuten · ${Object.keys(G.caught).length} Monster gefangen</div></div>`, true);
  await fade(false, true);
  await say('Herzlichen Glückwunsch, {name}!\nDu bist der neue CHAMPION der Monsterwelt!');
  await say('Dein Team wird für immer in der Ruhmeshalle verewigt.');
  hidePanel();
  await say('Prof. Sternberg (über Funk): „{name}, ich bin so stolz auf dich!\nIn Windhöhe hat sich ein uraltes Siegel geöffnet …“');
  await say('„In der Ursprungshöhle soll Ursphäron ruhen –\ndas Monster, aus dem alle Elemente stammen!“');
  ['e1', 'e2', 'e3', 'e4', 'champ'].forEach(k => delete G.flags['beat_' + k]);
  healAll();
  await fade(true); enterMap('liga_lobby', 5, 6, 'down'); G.respawn = {map: 'liga_lobby', x: 5, y: 4, dir: 'up'}; await fade(false);
  save(true);
  await say('Tipp: Du kannst den Meisterrat jederzeit erneut herausfordern!');
}

// ================= Welt Teil 3: Generation 3–5, Legendäre, Champions =================
// --- neue wilde Monster in bestehenden Gebieten ---
const ADD_ENC = {
  route1: [['Fiedra', 2, 4, 10], ['Tropfel', 3, 5, 8]],
  route2: [['Klumsi', 8, 10, 8], ['Klickel', 8, 10, 8], ['Zirral', 9, 11, 7], ['Moosfun', 8, 10, 6]],
  hoehle1: [['Klumsi', 10, 13, 12], ['Bröckel', 10, 13, 10], ['Erzling', 11, 13, 10], ['Summel', 11, 13, 8]],
  hoehle2: [['Schardor', 18, 20, 8], ['Erzling', 16, 19, 10], ['Gongari', 21, 21, 4]],
  route3: [['Flimmli', 14, 16, 12], ['Huschne', 15, 17, 10], ['Sprokkel', 14, 16, 10], ['Spukel', 16, 17, 4]],
  route4: [['Fröstel', 20, 23, 12], ['Reifspuk', 20, 22, 10], ['Dämmerl', 21, 23, 10], ['Bröckel', 21, 23, 8], ['Eiswern', 23, 24, 4]],
  hoehle3: [['Eiswern', 23, 26, 12], ['Dämmerl', 23, 26, 10], ['Frosthauch', 24, 26, 8], ['Bruchvorn', 28, 28, 2]],
  grotte: [['Funkfloss', 25, 28, 12], ['Quibbel', 25, 28, 10], ['Quellaro', 26, 29, 10], ['Tiefenscheu', 32, 32, 2]],
  route5: [['Aschko', 27, 29, 10], ['Glommard', 29, 31, 10], ['Knirpsel', 28, 30, 10], ['Rostel', 28, 30, 8]],
  krater: [['Glommard', 32, 35, 12], ['Knirpsel', 32, 34, 10], ['Flammenseel', 33, 35, 8], ['Funkenkranz', 38, 38, 2]],
  route6: [['Spukel', 30, 33, 12], ['Kerzli', 30, 33, 12], ['Neblitz', 30, 33, 10], ['Knochil', 30, 33, 10], ['Nachtfalteris', 36, 36, 1]],
  route7: [['Klicko', 34, 36, 10], ['Schaltor', 36, 38, 8], ['Zappin', 34, 36, 10], ['Voltessa', 36, 38, 8], ['Tinkel', 34, 37, 10], ['Spulkar', 35, 38, 8]],
  route8: [['Funkfloss', 37, 39, 10], ['Wellenvolt', 38, 41, 8], ['Quibbel', 37, 40, 10], ['Quellaro', 38, 41, 8], ['Tropfel', 37, 39, 8], ['Schleusant', 41, 41, 3]],
  route9: [['Moosfun', 40, 42, 10], ['Leitwurzel', 41, 44, 8], ['Knospir', 40, 43, 10], ['Dornavi', 41, 44, 8], ['Laubkranz', 44, 44, 3]],
  route10: [['Gongari', 44, 47, 10], ['Tinkel', 44, 46, 8], ['Glockar', 45, 47, 6], ['Summel', 44, 46, 8], ['Schaltor', 44, 47, 8], ['Donnerhall', 47, 47, 3]],
  route11: [['Fiedra', 47, 49, 8], ['Orkanfied', 48, 50, 6], ['Schimmerau', 47, 50, 8], ['Eiswern', 47, 50, 8], ['Spulenrix', 48, 50, 6], ['Blitzhuf', 50, 50, 1], ['Raschwelle', 50, 50, 1]],
  sieg: [['Graniturg', 50, 54, 6], ['Flutserin', 50, 54, 6], ['Wurzelorn', 50, 54, 6], ['Impulsar', 50, 54, 6], ['Polariska', 50, 54, 6], ['Donnerhall', 50, 54, 6], ['Dunstavon', 50, 54, 6], ['Schmelzorn', 50, 54, 6], ['Phantorim', 50, 54, 6], ['Stromirax', 50, 54, 6], ['Irrbrandor', 50, 54, 6], ['Relaisar', 50, 54, 6], ['Dunstvex', 50, 54, 6], ['Donnerhain', 50, 54, 5], ['Grabgolem', 50, 54, 5], ['Stromdelar', 50, 54, 6], ['Eisphantom', 50, 54, 6], ['Polartitan', 50, 54, 5], ['Schlackhorn', 50, 54, 6], ['Ambossar', 50, 54, 6], ['Mondschorf', 50, 54, 6], ['Kammolith', 50, 54, 6], ['Schleierfex', 50, 54, 6], ['Glockar', 50, 54, 6]],
  safari: [['Raschwelle', 32, 34, 1], ['Bruchvorn', 32, 34, 1], ['Blitzhuf', 33, 35, 1], ['Nachtfalteris', 33, 35, 1], ['Knospir', 25, 28, 8], ['Fiedra', 25, 28, 8], ['Summel', 25, 28, 8], ['Klickel', 25, 28, 8], ['Sprokkel', 25, 28, 8], ['Tropfel', 25, 28, 8]],
  ursprung: [['Sternleiter', 58, 60, 2], ['Gruftwacht', 58, 60, 2], ['Voltkrone', 58, 60, 2], ['Echoseele', 58, 60, 2], ['Polartitan', 55, 58, 8], ['Grabgolem', 55, 58, 8], ['Donnerhain', 55, 58, 8]]
};
for (const id in ADD_ENC) MAPS[id].enc = (MAPS[id].enc || []).concat(ADD_ENC[id]);
// Geisterturm: jetzt mit echten Geist-Monstern
const GHOST2 = [['Spukel', 30, 33, 14], ['Kerzli', 30, 33, 14], ['Neblitz', 30, 33, 12], ['Knochil', 30, 33, 12], ['Flirri', 30, 33, 8], ['Dunkling', 30, 33, 8], ['Nachtor', 32, 35, 8], ['Schemenor', 34, 36, 5], ['Flammenseel', 34, 36, 4], ['Rasselor', 34, 36, 4], ['Schleudergeist', 34, 36, 4], ['Frosthauch', 33, 35, 4], ['Spiegelspuk', 38, 38, 1]];
MAPS.turm1.enc = GHOST2; MAPS.turm2.enc = GHOST2.map(e => [e[0], e[1] + 1, e[2] + 1, e[3]]); MAPS.turm3.enc = GHOST2.map(e => [e[0], e[1] + 2, e[2] + 2, e[3]]);
NPCS.turm1[0].trainer.team = [['Spukel', 33], ['Kerzli', 34]];
NPCS.turm2[0].trainer.team = [['Schemenor', 35], ['Knochil', 34], ['Neblitz', 35]];
NPCS.turm2[1].trainer.team = [['Flammenseel', 36], ['Rasselor', 35]];
NPCS.turm3[0].trainer.team = [['Schemenor', 37], ['Schleudergeist', 37], ['Flammenseel', 38]];
NPCS.dorf2[0].talk = async () => { await say('Der Geisterturm … dort spuken echte Geist-Monster!\nGlut- und Metall-Attacken helfen gegen sie.'); await say('Ganz oben sollen Aetherion und Vesperox schweben.\nNur Mutige wagen sich hinauf.'); };

// --- Legendäre verteilen ---
NPCS.grotte.push({id: 'leg_marevoss', x: 2, y: 6, dir: 'down', legend: 'Marevoss', level: 42}, {id: 'leg_neruvia', x: 15, y: 6, dir: 'down', legend: 'Neruvia', level: 44}, {id: 'leg_ferragant', x: 6, y: 2, dir: 'down', legend: 'Ferragant', level: 45});
NPCS.krater.push({id: 'leg_pyrothar', x: 5, y: 1, dir: 'down', legend: 'Pyrothar', level: 47}, {id: 'leg_solmara', x: 15, y: 1, dir: 'down', legend: 'Solmara', level: 48});
NPCS.hoehle3.push({id: 'leg_iskariel', x: 16, y: 7, dir: 'down', legend: 'Iskariel', level: 46});
NPCS.turm4.push({id: 'leg_vesperox', x: 12, y: 2, dir: 'down', legend: 'Vesperox', level: 52});

// --- Sternenruinen (nach dem Champion, über die Ursprungshöhle) ---
(function () {
  const W = 26, H = 20, g = Array.from({length: H}, (_, y) => Array.from({length: W}, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 'X' : 'x'));
  const ALT = [['Zeitrava', 5, 4, 60], ['Klangor', 13, 4, 62], ['Auralith', 20, 4, 62], ['Sylvaris', 5, 10, 60], ['Ferrumon', 13, 9, 64], ['Muravon', 20, 10, 62], ['Echoryn', 5, 15, 63], ['Voltraxis', 20, 15, 64], ['Nullfunke', 13, 14, 75]];
  for (const [, cx, cy] of ALT) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) g[y][x] = 'a';
  for (const [x, y] of [[9, 2], [17, 2], [9, 7], [17, 7], [9, 12], [17, 12], [2, 7], [23, 7], [2, 12], [23, 12]]) g[y][x] = 'o';
  g[H - 1][13] = 'U';
  MAPS.ruinen = {name: 'Sternenruinen', cave: true, void: true, encRate: 0.05, enc: [['Sternleiter', 60, 62, 3], ['Gruftwacht', 60, 62, 3], ['Voltkrone', 60, 62, 3], ['Echoseele', 60, 62, 3], ['Phantorim', 58, 61, 10], ['Stromirax', 58, 61, 10], ['Relaisar', 58, 61, 10], ['Dunstvex', 58, 61, 10], ['Eisphantom', 58, 61, 10], ['Irrbrandor', 58, 61, 10]], rows: g.map(r => r.join(''))};
  const others = ALT.filter(a => a[0] !== 'Nullfunke').map(a => 'leg_' + a[0].toLowerCase());
  NPCS.ruinen = ALT.map(([n, x, y, l]) => ({id: 'leg_' + n.toLowerCase(), x, y, dir: 'down', legend: n, level: l, show: n === 'Nullfunke' ? () => others.every(k => G.flags[k]) : undefined}));
  NPCS.ruinen.push({id: 'rn_sage', x: 11, y: 17, dir: 'up', look: LOOK.medium, talk: async () => {
    await say('Willkommen in den Sternenruinen, Champion.\nHier ruhen acht legendäre Monster aus uralter Zeit.');
    await say('Man sagt: Wer alle acht fängt, dem erscheint in der Mitte\ndas mythische Nullfunke …'); }});
  MAPS.ursprung.rows = MAPS.ursprung.rows.map((r, y) => y === 10 ? r.slice(0, 16) + 'L' + r.slice(17) : r);
  WARPS['ursprung:16,10'] = {to: 'ruinen', x: 13, y: 18, dir: 'up'};
  WARPS['ruinen:13,19'] = {to: 'ursprung', x: 16, y: 9, dir: 'down'};
})();

// --- Champions-Halle (6 Level-100-Champions) ---
MAPS.ligaplatz.rows = [
  'TTTTTTTTTTTTTTTTTTTTTT',
  'T....................T',
  'T...qqqqqqqqqqqqqq...T',
  'T...qqqqqqqqqqqqqq...T',
  'T...qqqqqqqqqqqqqq...T',
  'T...HHNHHHDHHHNHHH...T',
  'T........,,..........T',
  'T..F.....,,...AAAAA..T',
  'T........,,...AAAAA..T',
  'T.F......,,...HNDNH..T',
  'T........,,,,,,,,,...T',
  'TTTTTTTTT,,TTTTTTTTTTT'];
NPCS.ligaplatz[0].x = 12; NPCS.ligaplatz[0].y = 7;
NPCS.ligaplatz.push({id: 'lp2', x: 19, y: 10, dir: 'left', look: LOOK.gent, talk: async () => { await say('Das Gebäude dort ist die Champions-Halle.\nDort warten sechs legendäre Champions – alle auf Level 100!'); await say(G.flags.champion ? 'Als Champion darfst du hinein. Viel Glück!' : 'Nur wer selbst Champion ist, darf hinein.'); }});
MAPS.champhall = {name: 'Champions-Halle', arena: 'league', rows: room(17, 12, 8, [['P', 1, 10], ['P', 15, 10], ['P', 1, 1], ['P', 15, 1], ['q', 7, 1], ['q', 9, 1]])};
WARPS['ligaplatz:16,9'] = {to: 'champhall', x: 8, y: 10, dir: 'up', req: () => G.flags.champion, reqMsg: 'Wächter: „Die Champions-Halle ist nur für Champions!\nBesiege zuerst den Meisterrat und den Champion.“'};
WARPS['champhall:8,11'] = {to: 'ligaplatz', x: 16, y: 10, dir: 'down'};
const CH_POS = {C01: [2, 3, 'down'], C02: [5, 3, 'down'], C03: [11, 3, 'down'], C04: [14, 3, 'down'], C05: [2, 7, 'right'], C06: [8, 2, 'down']};
const CH_LOOK = {C01: LOOK.marina, C02: LOOK.granit, C03: LOOK.zephyr, C04: LOOK.morgana, C05: LOOK.flora, C06: {hair: '#ffd84a', hat: '#8e44ad', shirt: '#1d1f2a', pants: '#ffd84a'}};
NPCS.champhall = (DATA.champions || []).filter(c => CH_POS[c.id]).map(c => {
  const [x, y, dir] = CH_POS[c.id];
  const t = T(`Champion ${c.name}`, c.team.map(m => [m.name, m.level]), c.belohnung.muenzen,
    `Ich bin ${c.name} – ${c.titel}!\nWillkommen in der ${c.arena}.\n${c.strategie}`, `Unglaublich … du hast mich besiegt!\nDer Titel „${c.titel}“ gehört jetzt dir.`, `Gegen dich zu kämpfen war mir eine Ehre. Revanche?`);
  t.champTitle = c.titel; t.rematch = true; t.baseReward = c.belohnung.muenzen;
  if (c.id === 'C06') { t.req = () => ['C01', 'C02', 'C03', 'C04', 'C05'].every(k => G.flags['beat_ch_' + k]); t.reqMsg = `${c.name}: „Komm wieder, wenn du die anderen fünf Champions besiegt hast.\nErst dann bist du bereit für mich.“`; }
  return {id: 'ch_' + c.id, x, y, dir, look: CH_LOOK[c.id], leader: true, trainer: t};
});
NPCS.champhall.push({id: 'chg', x: 12, y: 9, dir: 'left', look: LOOK.guard, talk: async () => {
  await say('Willkommen in der Champions-Halle!\nHier warten sechs Champions – jedes ihrer Monster ist auf Level 100.');
  await say('Für jeden ersten Sieg gibt es Coins und einen Ehrentitel.\nTaron, der Meister aller Ringe, kämpft erst nach den anderen fünf.'); }});

// ================= Welt Teil 4: TPs, Feldattacken, Fahrrad, Brücke, Seepfad, Prof. Wandel =================
const TP_MOVES = {
  Flammenwurf: {typ: 'Glut', staerke: 90, effekt: '10 % Chance, den Angriff des Ziels für 2 Runden um 10 % zu senken.'},
  Wasserstrahl: {typ: 'Flut', staerke: 90, effekt: '10 % Chance, das Tempo des Ziels für 2 Runden um 10 % zu senken.'},
  Blattsturm: {typ: 'Wuchs', staerke: 90, effekt: 'Kein Zusatzeffekt.'},
  Donnerkeil: {typ: 'Funke', staerke: 90, effekt: '10 % Chance, das Tempo des Ziels für 2 Runden um 10 % zu senken.'},
  Felsenhagel: {typ: 'Stein', staerke: 90, effekt: 'Kein Zusatzeffekt.'},
  Eissturm: {typ: 'Frost', staerke: 90, effekt: '10 % Chance, das Tempo des Ziels für 2 Runden um 10 % zu senken.'},
  Schallwelle: {typ: 'Klang', staerke: 90, effekt: '10 % Chance, den Angriff des Ziels für 2 Runden um 10 % zu senken.'},
  Nebelschlag: {typ: 'Nebel', staerke: 90, effekt: 'Kein Zusatzeffekt.'},
  Stahlfaust: {typ: 'Metall', staerke: 90, effekt: 'Kein Zusatzeffekt.'},
  Orkanstoß: {typ: 'Wind', staerke: 90, effekt: 'Kein Zusatzeffekt.'},
  Spukball: {typ: 'Geist', staerke: 90, effekt: '10 % Chance, die Verteidigung des Ziels für 2 Runden um 15 % zu senken.'},
  Kraftschub: {typ: 'Klang', staerke: 0, effekt: 'Erhöht eigenen Angriff für 3 Runden um 30 %.'},
  Eisenhaut: {typ: 'Metall', staerke: 0, effekt: 'Erhöht eigene Verteidigung für 3 Runden um 30 %.'},
  Turbo: {typ: 'Wind', staerke: 0, effekt: 'Erhöht eigenes Tempo für 3 Runden um 30 %.'},
  Erholung: {typ: 'Wuchs', staerke: 0, effekt: 'Heilt 40 % der maximalen KP; einmal pro Kampf.'},
  Zerschneider: {typ: 'Wind', staerke: 55, effekt: 'Kein Zusatzeffekt. Außerhalb von Kämpfen: zerschneidet kleine Büsche.', field: 'cut'},
  Surfer: {typ: 'Flut', staerke: 80, effekt: 'Kein Zusatzeffekt. Außerhalb von Kämpfen: auf dem Wasser reiten.', field: 'surf', types: ['Flut', 'Frost']},
  Felsbrecher: {typ: 'Stein', staerke: 75, effekt: 'Kein Zusatzeffekt. Außerhalb von Kämpfen: zertrümmert Felsen.', field: 'rock', types: ['Stein', 'Metall', 'Glut', 'Funke', 'Klang']}
};
for (const n in TP_MOVES) { const d = TP_MOVES[n]; d.name = 'TP:' + n; d.anzeige = n; d.fx = parseEffect(d.effekt); }
function badgeText(t) { return TYPE_DISPLAY[t] || t; }

NPCS.mall.push({id: 'm6', x: 8, y: 5, dir: 'down', look: LOOK.helper, talk: () => talkShop('tp', 'TP-Theke')});
NPCS.mall.find(n => n.id === 'm5').talk = async () => { await say('Das ist das größte Einkaufszentrum der Region!\nIn der Mitte gibt es Technikplatten (TP) – damit lernen Monster neue Attacken.'); };
Object.assign(LOOK, {
  biker: {hair: '#1d1f2a', hat: '#1d1f2a', shirt: '#e67e22', pants: '#1d1f2a'},
  kralle: {hair: '#1d1f2a', hat: '#1d1f2a', shirt: '#2b2b2b', pants: '#c0392b'},
  wandel: {hair: '#c0c0c0', shirt: '#ffffff', pants: '#5d4037'},
  turbo: {hair: '#f1c40f', hat: '#c0392b', shirt: '#c0392b', pants: '#1d1f2a'},
  fisher: {hair: '#5a3a22', hat: '#f1c40f', shirt: '#3d8be0', pants: '#5d4037'}
});

// ---------- Hindernisse & Kisten auf bestehenden Karten ----------
function setTile(id, x, y, c) { const m = MAPS[id]; m.rows[y] = m.rows[y].slice(0, x) + c + m.rows[y].slice(x + 1); }
function chest(id, x, y, gated) { (NPCS[id] = NPCS[id] || []).push({id: `ch_${id}_${x}_${y}`, x, y, chest: true, gated}); }
// Route 1: Kiste hinter Büschen (Zerschneider)
setTile('route1', 19, 12, 'u'); setTile('route1', 20, 11, 'u'); setTile('route1', 20, 13, 'u'); chest('route1', 20, 12, 'cut');
chest('route1', 1, 18);
// Route 2: Kiste auf einer Teich-Insel (Surfer)
setTile('route2', 4, 12, '.'); chest('route2', 4, 12, 'surf');
// Route 3: Kiste hinter Büschen
setTile('route3', 1, 12, 'u'); setTile('route3', 2, 13, 'u'); setTile('route3', 1, 14, 'u'); chest('route3', 1, 13, 'cut');
// Funkenhafen: Insel im Hafen (Surfer)
setTile('stadt2', 19, 16, '.'); chest('stadt2', 19, 16, 'surf');
// Glimmerhöhle: Kiste hinter Felsen (Felsbrecher)
setTile('hoehle1', 17, 13, 'v'); setTile('hoehle1', 18, 12, 'v'); setTile('hoehle1', 18, 14, 'v'); chest('hoehle1', 18, 13, 'rock');
// Route 4: Kiste hinter Felsen
setTile('route4', 19, 13, 'v'); setTile('route4', 20, 12, 'v'); setTile('route4', 20, 14, 'v'); chest('route4', 20, 13, 'rock');
chest('hoehle2', 18, 12); chest('hoehle3', 1, 1); chest('krater', 1, 12); chest('turm3', 14, 12);
// Wasser-Begegnungen beim Surfen
MAPS.route2.waterEnc = [['Funkfloss', 10, 12, 30], ['Tropfel', 10, 12, 30], ['Froschi', 10, 12, 20], ['Quibbel', 11, 12, 20]];
MAPS.stadt2.waterEnc = [['Funkfloss', 14, 18, 30], ['Quibbel', 14, 18, 25], ['Froschi', 15, 18, 25], ['Tropfel', 14, 17, 20]];
MAPS.route8.waterEnc = [['Wellenvolt', 38, 41, 25], ['Quellaro', 38, 41, 25], ['Glazaro', 38, 41, 20], ['Schleusant', 41, 41, 5]];
MAPS.dorf.waterEnc = [['Tropfel', 5, 8, 50], ['Funkfloss', 5, 8, 50]];
MAPS.stadt1.waterEnc = [['Tropfel', 8, 11, 50], ['Funkfloss', 8, 11, 50]];
// Kisten auf den generierten Routen
for (const id of ['route5', 'route6', 'route7', 'route8', 'route9', 'route10', 'route11', 'sieg']) {
  const R = rng(hashStr(id + 'kiste')), m = MAPS[id];
  for (let t = 0; t < 200; t++) { const x = 1 + Math.floor(R() * 20), y = 2 + Math.floor(R() * (m.rows.length - 4)); if (m.rows[y][x] === '.' && x !== 7 && x !== 8 && x !== 11 && x !== 12 && !NPCS[id].some(n => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)) { chest(id, x, y); break; } }
}

// ---------- Goldbrücke + Team Kralle ----------
MAPS.stadt6.exits.north = 'bruecke';
MAPS.route8.exits.south = 'bruecke';
MAPS.bruecke = {name: 'Goldbrücke', outdoor: true, theme: 'normal', exits: {south: 'stadt6', north: 'route8'}, rows: [
  'TTTTTTTTT,,TTTTTTTTTTT', 'T........,,..........T', 'T..F.....,,.....F....T',
  ...Array.from({length: 18}, () => 'WWWWWWWWWppWWWWWWWWWWW'),
  'T........,,..........T', 'T..F.....,,....S.....T', 'TTTTTTTTT,,TTTTTTTTTTT'],
  waterEnc: [['Funkfloss', 38, 41, 30], ['Wellenvolt', 38, 41, 25], ['Quibbel', 38, 41, 25], ['Tiefenscheu', 44, 44, 2]]};
SIGNS['bruecke:15,22'] = 'Goldbrücke\nBesiege alle fünf Brückenkämpfer und gewinne einen Preis!';
const BR = [[9, 18, 'right', 'Brückenkämpfer Nr. 1 – Ole', [['Voltessa', 38], ['Quellaro', 38]]], [10, 15, 'left', 'Brückenkämpferin Nr. 2 – Lia', [['Schemenor', 39], ['Leitwurzel', 39]]],
  [9, 12, 'right', 'Brückenkämpfer Nr. 3 – Kai', [['Schaltor', 39], ['Rasselor', 40]]], [10, 9, 'left', 'Brückenkämpferin Nr. 4 – Mo', [['Wellenvolt', 40], ['Flammenseel', 40]]],
  [9, 6, 'right', 'Brückenkämpfer Nr. 5 – Tarik', [['Magnetor', 40], ['Frosthauch', 41], ['Schleudergeist', 41]]]];
NPCS.bruecke = BR.map(([x, y, dir, name, team], i) => ({id: 'br' + i, x, y, dir, look: [LOOK.ace, LOOK.beauty, LOOK.hiker, LOOK.girl, LOOK.gent][i], trainer: T(name, team, 1200,
  ['Willkommen zur Brücken-Herausforderung! Ich bin Nummer 1!', 'Nummer 2! Weiter kommst du nicht!', 'Nummer 3! Halbzeit – aber nicht für dich!', 'Nummer 4! Gleich hast du es geschafft … vielleicht.', 'Ich bin Nummer 5, der Letzte! Gib alles!'][i],
  'Du bist echt stark!', 'Weiter geht’s – am Ende der Brücke wartet dein Preis!')}));
NPCS.bruecke.push({id: 'kralle1', x: 9, y: 3, dir: 'right', look: LOOK.kralle, trainer: Object.assign(T('Team Kralle Rüpel Grimm', [['Phantorim', 42], ['Stromirax', 42], ['Irrbrandor', 43]], 4000,
  'Glückwunsch! Du hast alle fünf Brückenkämpfer besiegt!\nHier ist dein Preis … aber Moment mal.\nSo starke Trainer wie dich suchen wir bei TEAM KRALLE!\nWir krallen uns die stärksten Monster der Welt!\nDu willst nicht mitmachen?! Dann eben auf die harte Tour!',
  'Grrr! Team Kralle hat verloren?!\nNa schön … nimm das Ding und lass mich in Ruhe!', 'Team Kralle wird sich rächen … irgendwann!'), {extra: async () => {
    G.bag['VM Zerschneider'] = 1; addMoney(5000);
    await say('{name} erhält die VM Zerschneider!\n(Die hatte Team Kralle gestohlen.)');
    await say('Und 5000 Coins Brücken-Preisgeld!');
    await say('Tipp: Bring einem Monster im Beutel die VM bei.\nDann kann es kleine Büsche zerschneiden!');
  }})});

// ---------- Fahrradladen + Rad-Arena in Lumora ----------
MAPS.radladen = {name: 'Fahrradladen Speichenglück', rows: room(10, 8, 4, [['c', 2, 3], ['c', 3, 3], ['c', 4, 3], ['D', 7, 1], ['=', 1, 5], ['=', 1, 6], ['=', 8, 5], ['=', 8, 6]])};
MAPS.radarena = {name: 'Rad-Arena', arena: 'wind', rows: arenaRoom('^')};
WARPS['stadt6:4,10'] = {to: 'radladen', x: 4, y: 6, dir: 'up'};
WARPS['radladen:4,7'] = {to: 'stadt6', x: 4, y: 11, dir: 'down'};
WARPS['radladen:7,1'] = {to: 'radarena', x: 5, y: 10, dir: 'up'};
WARPS['radarena:5,11'] = {to: 'radladen', x: 7, y: 2, dir: 'down'};
NPCS.radladen = [{id: 'radclerk', x: 3, y: 2, dir: 'down', look: LOOK.biker, talk: async () => {
    if (G.bag.Fahrrad) { await say('„Na, wie fährt sich dein Fahrrad? Mit R oder dem 🚲-Knopf steigst du auf!“'); return; }
    await say('„Willkommen bei Speichenglück! Unser Super-Fahrrad kostet 100.000 Coins.“');
    await say('„Zu teuer? Dann geh durch die Tür hinten in die Rad-Arena!\nWer Rad-Champion Turbo besiegt, bekommt ein Fahrrad gratis!“');
    await talkShop('rad', 'Fahrrad-Theke');
  }},
  {id: 'radkid', x: 6, y: 5, dir: 'left', look: LOOK.kid, talk: async () => { await say('Östlich von Lumora liegt der Biker-Park!\nDa kommst du aber nur mit einem Fahrrad rein.'); }}];
NPCS.radarena = [{id: 'rad1', x: 3, y: 6, dir: 'right', look: LOOK.biker, trainer: T('Biker Sven', [['Zirral', 38], ['Spulkar', 39]], 1500, 'Brumm brumm! Mach Platz!', 'Platter Reifen …', 'Turbo ist der schnellste Fahrer der Stadt!')},
  {id: 'turbo', x: 5, y: 2, dir: 'down', look: LOOK.turbo, leader: true, trainer: Object.assign(T('Rad-Champion Turbo', [['Spulenrix', 42], ['Raschwelle', 43], ['Blitzhuf', 45]], 3000,
    'Yo! Ich bin Turbo, der schnellste Rad-Champion der Region!\nBesiege mich, und das Fahrrad gehört dir!', 'Wow, du bist schneller als ich!\nHier – das Fahrrad gehört jetzt dir!', 'Fahr vorsichtig! Und besuch den Biker-Park östlich der Stadt!'), {extra: async () => {
      if (!G.bag.Fahrrad) { G.bag.Fahrrad = 1; await say('{name} erhält das FAHRRAD! 🚲\nMit R oder dem 🚲-Knopf steigst du auf und ab.'); }
    }})}];
// Lumora: Ausgang nach Osten zum Biker-Park
MAPS.stadt6.rows[6] = 'T...' + ','.repeat(30);
MAPS.stadt6.exits.east = 'radpark';
GATES['stadt6:east'] = {bike: true, msg: 'Wächter: „Halt! In den Biker-Park darfst du nur mit Fahrrad!\nIm Fahrradladen in Lumora gibt es eins.“'};

// ---------- Biker-Park ----------
(function () {
  const W = 30, H = 18, g = Array.from({length: H}, (_, y) => Array.from({length: W}, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 'T' : '.'));
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = c; };
  rect(5, 4, 8, 3, 'G'); rect(17, 4, 8, 3, 'G'); rect(5, 10, 8, 4, 'G'); rect(17, 10, 8, 4, 'G');
  for (let x = 2; x <= 27; x++) { g[2][x] = ','; g[15][x] = ','; g[8][x] = ','; }
  for (let y = 2; y <= 15; y++) { g[y][2] = ','; g[y][27] = ','; g[y][14] = ','; }
  for (let x = 0; x <= 2; x++) g[6][x] = ',';
  for (const [x, y] of [[8, 2], [20, 2], [14, 5], [8, 15], [20, 15], [27, 11], [5, 8], [22, 8]]) g[y][x] = '^';
  for (const [x, y] of [[4, 4], [4, 12], [25, 4], [10, 9], [18, 9], [16, 12]]) g[y][x] = 'T';
  for (const [x, y] of [[1, 16], [28, 1], [12, 16]]) g[y][x] = 'v';
  MAPS.radpark = {name: 'Biker-Park', outdoor: true, theme: 'normal', bikeOnly: true, exits: {west: 'stadt6'},
    enc: [['Zirral', 38, 41, 14], ['Spulenrix', 40, 42, 8], ['Zappin', 38, 41, 14], ['Voltessa', 40, 42, 8], ['Fiedra', 38, 41, 12], ['Orkanfied', 41, 43, 6], ['Raschwelle', 43, 43, 2], ['Blitzhuf', 44, 44, 2], ['Klickel', 38, 40, 12], ['Spulkar', 40, 42, 8]],
    rows: g.map(r => r.join(''))};
})();
NPCS.radpark = [
  {id: 'bk1', x: 14, y: 4, dir: 'down', look: LOOK.biker, trainer: T('Biker Max', [['Spulkar', 41], ['Voltessa', 41]], 1800, 'Hey! Das ist unser Revier!', 'Kette abgesprungen …', 'Der Boss wartet unten in der Mitte.')},
  {id: 'bk2', x: 4, y: 15, dir: 'right', look: LOOK.biker, trainer: T('Bikerin Jess', [['Orkanfied', 42], ['Zirral', 41]], 1800, 'Bremsen sind was für Anfänger!', 'Uff, Vollbremsung.', 'Rund um den Park gibt es tolle Rampen.')},
  {id: 'bk3', x: 27, y: 13, dir: 'up', look: LOOK.biker, trainer: T('Biker Ronny', [['Raschwelle', 42], ['Schaltor', 42]], 1900, 'Sieh dir mein Tempo an!', 'Zu schnell für mich.', 'Mit einem Felsbrecher kannst du Felsen zerschlagen.')},
  {id: 'bk4', x: 22, y: 8, dir: 'left', look: LOOK.biker, trainer: T('Bikerin Cleo', [['Blitzhuf', 43], ['Spulenrix', 42]], 2000, 'Hier wird nicht gebremst!', 'Okay, okay!', 'Rex ist unser Boss.')},
  {id: 'bkboss', x: 14, y: 12, dir: 'up', look: LOOK.turbo, leader: true, trainer: Object.assign(T('Biker-Boss Rex', [['Spulenrix', 44], ['Raschwelle', 44], ['Polartitan', 45], ['Blitzhuf', 46]], 5000,
    'Du hast es bis zu mir geschafft?\nIch bin Rex, der Boss des Biker-Parks. Zeig mir, was du drauf hast!', 'Respekt! So einen Fahrer hab ich noch nie gesehen!', 'Mit dem Felsbrecher kannst du Felsen in Höhlen und auf Routen zertrümmern!'), {extra: async () => {
      G.bag['VM Felsbrecher'] = 1; await say('{name} erhält die VM Felsbrecher!\nDamit kann ein Stein-, Metall-, Glut-, Elektro- oder Klang-Monster Felsen zertrümmern.');
    }})}];
chest('radpark', 3, 3); chest('radpark', 26, 14); chest('radpark', 1, 1, 'rock');
setTile('radpark', 1, 2, 'v'); setTile('radpark', 2, 1, 'v');

// ---------- Wellenstrand: Professor Wandel + Seepfad ----------
MAPS.profhaus = {name: 'Haus von Prof. Wandel', rows: room(12, 8, 5, [['Ü', 9, 2], ['Ü', 10, 2], ['b', 1, 1], ['b', 2, 1], ['b', 3, 1], ['C', 1, 3], ['t', 3, 4], ['t', 4, 4], ['P', 1, 6], ['P', 10, 6]])};
WARPS['stadt7:4,10'] = {to: 'profhaus', x: 5, y: 6, dir: 'up'};
WARPS['profhaus:5,7'] = {to: 'stadt7', x: 4, y: 11, dir: 'down'};
NPCS.profhaus = [{id: 'wandel', x: 7, y: 3, dir: 'down', look: LOOK.wandel, talk: talkWandel}];
MAPS.stadt7.rows[7] = MAPS.stadt7.rows[7].slice(0, 21) + ',';
MAPS.stadt7.exits.east = 'seepfad';
NPCS.stadt7.push({id: 'sw1', x: 19, y: 6, dir: 'down', look: LOOK.swimmer, talk: async () => { await say('Östlich von hier liegt der Seepfad.\nDa kommst du nur surfend weiter – mit der VM Surfer!'); }});
(function () {
  const W = 30, H = 16, g = Array.from({length: H}, (_, y) => Array.from({length: W}, (_, x) => (y === 0 || y === H - 1 || x === W - 1) ? 'T' : 'W'));
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = c; };
  rect(0, 5, 4, 5, '.'); g[7][0] = ','; g[7][1] = ',';
  rect(11, 2, 6, 4, '.'); rect(12, 3, 3, 2, 'G'); g[2][16] = 'T';
  rect(21, 9, 7, 4, '.'); rect(22, 11, 4, 1, 'G'); g[12][27] = 'T'; g[9][21] = 'F';
  rect(6, 11, 3, 2, '.');
  MAPS.seepfad = {name: 'Seepfad', outdoor: true, theme: 'beach', exits: {west: 'stadt7'}, rows: g.map(r => r.join('')),
    enc: [['Funkfloss', 40, 43, 30], ['Quellaro', 40, 43, 30], ['Tropfel', 40, 42, 20]],
    waterEnc: [['Funkfloss', 40, 43, 22], ['Wellenvolt', 41, 44, 18], ['Quibbel', 40, 43, 18], ['Quellaro', 40, 43, 15], ['Schleusant', 44, 45, 6], ['Flutserin', 45, 45, 3], ['Tiefenscheu', 46, 46, 2], ['Glazaro', 41, 44, 10]]};
})();
NPCS.seepfad = [
  {id: 'sp1', x: 9, y: 5, dir: 'down', look: LOOK.swimmer, trainer: T('Schwimmer Finn', [['Wellenvolt', 42], ['Quellaro', 42]], 1700, 'Platsch! Ein Kampf auf dem Wasser!', 'Ich geh unter!', 'Auf den Inseln liegen Schatzkisten!')},
  {id: 'sp2', x: 19, y: 7, dir: 'left', look: LOOK.swimmer, trainer: T('Schwimmerin Mira', [['Funkfloss', 41], ['Schleusant', 43]], 1800, 'Hier draußen bin ich die Schnellste!', 'Wasser in den Ohren …', 'Ganz hinten im Osten ist eine größere Insel.')},
  {id: 'sp3', x: 24, y: 10, dir: 'left', look: LOOK.fisher, trainer: T('Angler Bernd', [['Stromdelar', 44], ['Flutserin', 45]], 2500, 'Psst! Du verscheuchst die Fische!', 'Der Fang des Tages warst du.', 'Ich angle hier seit 30 Jahren.')}];
chest('seepfad', 13, 3, 'surf'); chest('seepfad', 26, 10, 'surf'); chest('seepfad', 7, 12, 'surf');

// ================= Feldattacken, TPs, Kisten, Fahrrad, Surfen =================
function canLearn(m, mv) { const d = TP_MOVES[mv]; return !d.types || SPECIES[m.sp].typen.some(t => d.types.includes(t)); }
function teamKnows(mv) { return G.team.find(m => m.extra && m.extra.includes(mv)); }
async function teachTP(it) {
  const mv = ITEMS[it].tp, d = TP_MOVES[mv];
  const k = await choose(G.team.map(m => ({label: monLabel(m, (m.extra || []).includes(mv) ? ' · kann es schon' : canLearn(m, mv) ? '' : ' · kann das nicht lernen'), disabled: !canLearn(m, mv) || (m.extra || []).includes(mv)})), {title: `${mv} (${badgeText(d.typ)}) beibringen …`});
  if (k < 0) return;
  const m = G.team[k]; m.extra = m.extra || [];
  if (m.extra.length >= 2) {
    const j = await choose(m.extra.concat(['Abbrechen']), {title: `${m.sp} kann nur 2 Zusatz-Attacken. Welche vergessen?`});
    if (j < 0 || j === m.extra.length) return;
    await say(`1, 2 und … Puff! ${m.sp} hat ${m.extra[j]} vergessen.`); m.extra.splice(j, 1);
  }
  m.extra.push(mv);
  await say(`${nameMe(m)} hat ${mv} gelernt!${d.field ? '\nDas kann es jetzt auch außerhalb von Kämpfen benutzen.' : ''}`);
}
const LOOT = [['Gegengift', 3, 10], ['Hyperheiler', 2, 6], ['Superkapsel', 3, 16], ['Hyperkapsel', 2, 12], ['Hypertrank', 2, 12], ['Top-Trank', 1, 6], ['Beleber', 2, 10], ['Sonderbonbon', 1, 12], ['Protein', 1, 4], ['Eisen', 1, 4], ['Carbon', 1, 4], ['KP-Plus', 1, 4], ['X-Angriff', 2, 5], ['Superschutz', 2, 5], ['GLIMMER', 0, 12], ['TP', 0, 8], ['Legendenkapsel', 1, 1]];
async function openChest(n) {
  if (G.flags[n.id]) { await say('Die Kiste ist leer.'); return; }
  G.flags[n.id] = 1;
  oParts(n.x, n.y, '#ffd84a', 14);
  const tot = LOOT.reduce((s, l) => s + l[2], 0); let r = Math.random() * tot, pick = LOOT[0];
  for (const l of LOOT) { r -= l[2]; if (r <= 0) { pick = l; break; } }
  if (pick[0] === 'TP') { const free = SHOP_LISTS.tp.filter(t => !G.bag[t]); if (free.length) { const t = free[Math.floor(Math.random() * free.length)]; G.bag[t] = 1; await say(`{name} öffnet die Kiste …\nDarin ist die ${t}! 💿`); return; } pick = ['GLIMMER', 0]; }
  if (pick[0] === 'GLIMMER') { const g = 1000 + Math.floor(Math.random() * 9) * 500; addMoney(g); await say(`{name} öffnet die Kiste …\nDarin sind ${fmtC(g)} Coins! 🪙`); return; }
  const amt = pick[1] > 1 ? 1 + Math.floor(Math.random() * pick[1]) : 1;
  G.bag[pick[0]] = (G.bag[pick[0]] || 0) + amt;
  await say(`{name} öffnet die Kiste …\nDarin: ${amt}× ${pick[0]}!`);
}
function clearedTile(id, x, y) { return G && G.cleared && G.cleared[id + ':' + x + ',' + y]; }
function repaintCleared() {
  if (!map.canvas || !G.cleared) return;
  const c = map.canvas.getContext('2d');
  for (const k in G.cleared) { const [mid, xy] = k.split(':'); if (mid !== map.id) continue; const [x, y] = xy.split(',').map(Number); drawTile(c, map.cave ? 'x' : '.', x, y, map); }
}
async function clearObstacle(x, y, kind) {
  G.cleared = G.cleared || {}; G.cleared[map.id + ':' + x + ',' + y] = 1;
  oParts(x, y, kind === 'cut' ? '#3f9a3f' : '#8a8076', 18);
  repaintCleared();
  await sleep(250);
}
async function fieldObstacle(t, x, y) {
  const isCut = t === 'u', mv = isCut ? 'Zerschneider' : 'Felsbrecher';
  const m = teamKnows(mv);
  if (!m) { await say(isCut ? 'Ein kleiner, dichter Busch.\nEin Monster mit „Zerschneider“ könnte ihn wegschneiden.' : 'Ein großer, rissiger Felsen.\nEin Monster mit „Felsbrecher“ könnte ihn zertrümmern.'); return; }
  if (!(await yesNo(isCut ? `Ein kleiner Busch. Soll ${nameMe(m)} ihn zerschneiden?` : `Ein rissiger Felsen. Soll ${nameMe(m)} ihn zertrümmern?`))) return;
  await say(`${nameMe(m)} setzt ${mv} ein!`);
  await clearObstacle(x, y, isCut ? 'cut' : 'rock');
}
async function startSurf(dir) {
  const m = teamKnows('Surfer');
  if (!m) { await say('Das Wasser ist tief und blau.\nEin Flut- oder Frost-Monster mit „Surfer“ könnte dich tragen.'); return; }
  if (!(await yesNo(`Das Wasser ist ruhig. Willst du mit ${nameMe(m)} surfen?`))) return;
  await say(`{name} surft auf ${nameMe(m)}! 🌊`);
  G.bike = false; G.surf = m.sp;
  tryMove(dir);
}
function toggleBike() {
  if (!G || !G.bag.Fahrrad) return;
  if (scriptLock || handlers.length || moving) return;
  script(async () => {
    if (G.surf) { await say('Beim Surfen kannst du nicht Fahrrad fahren!'); return; }
    if (!map.outdoor) { await say('Hier drinnen kannst du nicht Fahrrad fahren.'); return; }
    if (G.bike && map.bikeOnly) { await say('Im Biker-Park musst du fahren!'); return; }
    G.bike = !G.bike; updateBikeBtn();
    oParts(G.x, G.y, '#cfc6b0', 8);
  });
}
function updateBikeBtn() { updateHudExtra(); const b = $('bikeBtn'); if (b) { b.style.display = G && G.bag.Fahrrad ? '' : 'none'; b.textContent = G && G.bike ? '🚲 Absteigen' : '🚲 Fahrrad'; } }
async function talkWandel() {
  if (!G.flags.wandelFixed) {
    await say('??? : „Hilfe! Hilfe! Ich bin’s – Professor Wandel!“');
    await say('„Ich wollte mich in ein Monster verwandeln, um zu verstehen,\nwie sie fühlen … aber die Maschine ist durchgebrannt!“');
    await say('„Jetzt stecke ich in diesem Körper fest!\nBitte drück den roten Knopf an der Maschine dort rechts!“');
    return;
  }
  if (!G.flags.wandelGift) {
    await say('Prof. Wandel: „Puh! Danke, dass du mich gerettet hast!\nDas Experiment war wohl keine so gute Idee …“');
    await say('„Als Dankeschön darfst du dir eines meiner Forschungs-Monster aussuchen!“');
    const opts = ['Klicko', 'Moosfun'];
    while (true) {
      const i = await choose(opts.map(s => ({label: `${spriteImg(s, 2.2)} <span>${s} ${badges(SPECIES[s].typen)} <span class="small">Lv 25</span></span>`})), {title: 'Welches Monster möchtest du?', cancel: false,
        onSel: i => { const sp = SPECIES[opts[i]]; showPanel(`<div style="display:flex;gap:1em;align-items:center"><div>${spriteImg(sp.name, 7)}</div><div><h2>${sp.name} ${badges(sp.typen)}</h2><div>${sp.beschreibung}</div><div class="small" style="margin-top:.4em">${sp.persoenlichkeitLebensraum}</div><div class="small">Entwickelt sich zu ${sp.entwicktSichZu} (Lv ${sp.entwicklungLevel}).</div></div></div>`); }});
      hidePanel();
      if (await yesNo(`${opts[i]} nehmen?`)) {
        const m = makeMon(opts[i], 25); markCaught(opts[i]);
        if (G.team.length < 6) G.team.push(m); else G.box.push(m);
        await say(`{name} erhält ${opts[i]}!${G.team.includes(m) ? '' : '\n(Es wurde in deine Box geschickt.)'}`);
        break;
      }
    }
    G.bag['VM Surfer'] = 1; G.flags.wandelGift = 1;
    await say('„Und nimm auch das hier: die VM Surfer!\nDamit kann ein Flut- oder Frost-Monster dich übers Wasser tragen.“');
    await say('„Östlich von Wellenstrand liegt der Seepfad.\nDort gibt es Inseln mit Schätzen!“');
    save(true);
    return;
  }
  await say('Prof. Wandel: „Ich bleibe lieber ein Mensch.\nAber Monster zu erforschen ist trotzdem das Schönste!“');
}
async function wandelMachine() {
  if (G.flags.wandelFixed) { await say('Die Verwandlungsmaschine. Auf einem Zettel steht:\n„NIE WIEDER EINSCHALTEN!“'); return; }
  await say('Eine Verwandlungsmaschine mit einem großen roten Knopf.');
  if (!(await yesNo('Den roten Knopf drücken?'))) return;
  await say('Klick!');
  for (let i = 0; i < 4; i++) { await fade(true, true); await sleep(90); await fade(false, true); }
  G.flags.wandelFixed = 1;
  oParts(7, 3, '#ffffff', 20);
  await say('Bzzzzt … PUFF!\nDer Professor ist wieder ein Mensch!');
}

// ---------- Overworld-Partikel ----------
const OPARTS = [];
function oParts(tx, ty, col, n) { for (let i = 0; i < (n || 8); i++) OPARTS.push({x: tx * 16 + 8 + (Math.random() - .5) * 8, y: ty * 16 + 10 + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 1.6, vy: -Math.random() * 1.8 - .3, life: 30 + Math.random() * 20, col}); }
function drawOParts(camX, camY) {
  for (let i = OPARTS.length - 1; i >= 0; i--) {
    const p = OPARTS[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life--;
    if (p.life <= 0) { OPARTS.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life / 15); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 2);
  }
  ctx.globalAlpha = 1;
}
function drawWater(camX, camY, now) {
  const x0 = Math.max(0, Math.floor(camX / 16)), y0 = Math.max(0, Math.floor(camY / 16));
  for (let y = y0; y < Math.min(map.h, y0 + VH + 2); y++) for (let x = x0; x < Math.min(map.w, x0 + VW + 2); x++) {
    if (map.rows[y][x] !== 'W' || map.lava) continue;
    const ph = (now / 600 + x * 0.7 + y * 1.3) % (Math.PI * 2);
    const ox = Math.round(Math.sin(ph) * 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x * 16 - camX + 3 + ox, y * 16 - camY + 5, 5, 1);
    ctx.fillRect(x * 16 - camX + 9 - ox, y * 16 - camY + 11, 4, 1);
  }
}
function drawPlayerSprite(px, py, step) {
  if (G.surf) {
    const bob = Math.round(Math.sin(performance.now() / 250) * 1);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px + 1, py + 14, 14, 1);
    ctx.fillStyle = '#1d3f7a'; ctx.beginPath(); ctx.ellipse(px + 8, py + 11 + bob, 8, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3d8be0'; ctx.beginPath(); ctx.ellipse(px + 8, py + 10 + bob, 7, 4, 0, 0, 7); ctx.fill();
    R_(ctx, px + 3, py + 8 + bob, 2, 2, '#fff'); R_(ctx, px + 11, py + 8 + bob, 2, 2, '#fff');
    ctx.save(); ctx.beginPath(); ctx.rect(px - 4, py - 8, 24, 16 + bob); ctx.clip(); drawPerson(ctx, px, py - 6 + bob, G.dir, LOOK.player, 0); ctx.restore();
    return;
  }
  if (G.bike) {
    const w = (moving ? Math.floor(performance.now() / 80) % 2 : 0);
    ctx.fillStyle = '#1d1f2a';
    const horiz = G.dir === 'left' || G.dir === 'right';
    if (horiz) { ctx.beginPath(); ctx.arc(px + 3, py + 13, 3, 0, 7); ctx.arc(px + 13, py + 13, 3, 0, 7); ctx.fill(); R_(ctx, px + 3, py + 11, 10, 1, '#c0392b'); }
    else { R_(ctx, px + 6, py + 9, 4, 7, '#1d1f2a'); R_(ctx, px + 7, py + 10 + w, 2, 5, '#c0392b'); }
    drawPerson(ctx, px, py - 3, G.dir, LOOK.player, 0);
    return;
  }
  drawPerson(ctx, px, py - 3, G.dir, LOOK.player, step);
}

// ================= Welt Teil 5: Generation 6 & 7 =================
// --- neue Monster automatisch passend zu Typ und Level verteilen ---
(function distribute() {
  const AFF = {
    Glut: ['route5', 'krater', 'route7', 'radpark', 'route1'], Flut: ['route8', 'route9', 'grotte', 'route2', 'route3'], Wuchs: ['route1', 'route9', 'safari', 'route3', 'route6', 'route2'],
    Funke: ['route7', 'radpark', 'route2', 'route10', 'route1'], Stein: ['hoehle1', 'hoehle2', 'route4', 'route10'], Frost: ['route4', 'hoehle3', 'route11'],
    Klang: ['route10', 'route3', 'route7'], Nebel: ['route3', 'route6', 'turm1'], Metall: ['hoehle2', 'route7', 'hoehle1'], Wind: ['route11', 'route1', 'radpark'], Geist: ['route6', 'turm1', 'turm2', 'turm3', 'route3']};
  const WATER = ['seepfad', 'route8', 'bruecke', 'route2', 'stadt2'];
  const range = id => { const e = MAPS[id].enc || []; return e.length ? [Math.min(...e.map(x => x[1])), Math.max(...e.map(x => x[2]))] : [20, 25]; };
  const wrange = id => { const e = MAPS[id].waterEnc || []; return e.length ? [Math.min(...e.map(x => x[1])), Math.max(...e.map(x => x[2]))] : [20, 25]; };
  const lineOf = base => { const l = [base]; let c = base; while (SPECIES[c].entwicktSichZu) { c = SPECIES[c].entwicktSichZu; l.push(c); } return l; };
  const formFor = (line, lv) => { let f = line[0]; for (let i = 0; i < line.length - 1; i++) { const sp = SPECIES[line[i]]; if (sp.entwicklungLevel && lv >= sp.entwicklungLevel) f = line[i + 1]; } return f; };
  const bases = DATA.monster.filter(m => m.generation >= 6 && !PREV[m.name] && !isLegend(m.name));
  for (const m of bases) {
    const R = rng(hashStr(m.name + 'dist')), line = lineOf(m.name), single = line.length === 1;
    const cands = [...new Set([...(AFF[m.typen[0]] || []), ...(AFF[m.typen[1]] || [])])].filter(id => MAPS[id]);
    const picks = [];
    const n = single ? 1 : 2 + (R() < 0.4 ? 1 : 0);
    for (let i = 0; i < n && cands.length; i++) { const id = cands.splice(Math.floor(R() * cands.length), 1)[0]; picks.push(id); }
    for (const id of picks) {
      let [a, b] = range(id);
      if (single) { a = Math.max(a, 30); b = Math.max(b, 34); }
      const f = formFor(line, Math.round((a + b) / 2));
      MAPS[id].enc = (MAPS[id].enc || []).concat([[f, a, b, single ? 1 : 6]]);
    }
    if (m.typen.includes('Flut')) {
      const id = WATER[Math.floor(R() * WATER.length)]; const [a, b] = wrange(id);
      MAPS[id].waterEnc = (MAPS[id].waterEnc || []).concat([[formFor(line, Math.round((a + b) / 2)), a, b, single ? 1 : 8]]);
    }
    // Spätere Formen auch auf der Siegesstraße und im Safari-Park
    if (!single && R() < 0.35) MAPS.sieg.enc.push([line[line.length - 1], 50, 54, 3]);
    if (!single && R() < 0.25) MAPS.safari.enc.push([formFor(line, 28), 25, 30, 4]);
  }
})();

// --- schillernde Legendäre (Spezialbegegnung) ---
const LEG_SHINY = {}; (DATA.legendShiny || []).forEach(v => { LEG_SHINY[v.monsterName] = v.farbpalette; });

// --- Himmelsgipfel (Generation-6-Legendäre), westlich der Liga ---
MAPS.ligaplatz.rows[8] = ',' + MAPS.ligaplatz.rows[8].slice(1);
MAPS.ligaplatz.exits.west = 'gipfel';
GATES['ligaplatz:west'] = {champ: true, msg: 'Wächter: „Der Weg zum Himmelsgipfel ist nur für Champions!“'};
(function () {
  const W = 30, H = 24, g = Array.from({length: H}, (_, y) => Array.from({length: W}, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 'T' : '.'));
  const ALT = [['Thalassyr', 4, 4], ['Floradorn', 10, 4], ['Voltaraum', 16, 4], ['Cindravel', 22, 4], ['Krysalon', 4, 11], ['Gravemir', 16, 11], ['Marisyl', 4, 18], ['Auronex', 10, 18], ['Veylora', 16, 18], ['Sonavyr', 22, 18]];
  for (let x = 1; x < W; x++) g[8][x] = ',';
  for (let y = 1; y < H - 1; y++) { g[y][13] = ','; g[y][26] = ','; }
  for (let x = 1; x < 27; x++) g[14][x] = ',';
  for (const [, cx, cy] of ALT) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) g[y][x] = 'a';
  for (const [x, y] of [[7, 2], [19, 2], [24, 11], [8, 11], [9, 21], [20, 21], [2, 14], [7, 6], [19, 6], [24, 15], [28, 3], [28, 20]]) g[y][x] = 'M';
  for (const [x, y] of [[20, 11], [21, 12], [9, 15], [17, 15]]) g[y][x] = 'G';
  MAPS.gipfel = {name: 'Himmelsgipfel', outdoor: true, snow: true, exits: {east: 'ligaplatz'}, rows: g.map(r => r.join('')),
    enc: [['Polartitan', 62, 66, 6], ['Bergorun', 62, 66, 6], ['Sonorak', 62, 66, 6], ['Iskariel', 70, 70, 0]]};
  NPCS.gipfel = ALT.map(([n, x, y]) => ({id: 'leg_' + n.toLowerCase(), x, y, dir: 'down', legend: n, level: 72}));
  NPCS.gipfel.push({id: 'gp_sage', x: 25, y: 9, dir: 'left', look: LOOK.monk, talk: async () => { await say('Willkommen auf dem Himmelsgipfel, Champion.\nHier ruhen zehn legendäre Wesen auf ihren Altären.'); await say('Ganz selten soll eines von ihnen in schillernden Farben erscheinen …'); }});
  chest('gipfel', 1, 1); chest('gipfel', 28, 22);
})();
MAPS.gipfel.enc = MAPS.gipfel.enc.filter(e => e[3] > 0);

// --- Prismentempel (Generation-7-Legendäre), auf der großen Insel im Seepfad ---
setTile('seepfad', 27, 9, 'Y');
WARPS['seepfad:27,9'] = {to: 'tempel', x: 9, y: 13, dir: 'up', req: () => G.flags.champion, reqMsg: 'Ein schimmerndes Siegel versperrt den Tempel.\nNur ein Champion kann es öffnen …'};
(function () {
  const W = 19, H = 16, g = Array.from({length: H}, (_, y) => Array.from({length: W}, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 'X' : 'x'));
  const ALT = [['Nebelastrum', 3, 3], ['Glutseraph', 9, 3], ['Tiefenarch', 15, 3], ['Florakant', 3, 9], ['Polarys', 15, 9]];
  for (const [, cx, cy] of ALT) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) g[y][x] = 'a';
  for (const [x, y] of [[6, 6], [12, 6], [6, 11], [12, 11]]) g[y][x] = 'o';
  for (let y = 6; y <= 12; y++) { g[y][1] = 'W'; g[y][17] = 'W'; }
  g[H - 1][9] = 'U';
  MAPS.tempel = {name: 'Prismentempel', cave: true, sea: true, encRate: 0.05, rows: g.map(r => r.join('')),
    enc: DATA.monster.filter(m => m.generation === 7 && !PREV[m.name] === false && !m.entwicktSichZu && !isLegend(m.name)).slice(0, 12).map(m => [m.name, 60, 64, 4])};
  NPCS.tempel = ALT.map(([n, x, y]) => ({id: 'leg_' + n.toLowerCase(), x, y, dir: 'down', legend: n, level: 75}));
  WARPS['tempel:9,15'] = {to: 'seepfad', x: 27, y: 10, dir: 'down'};
})();

// --- Champions-Halle: neue Stockwerke ---
setTile('champhall', 12, 1, 'D');
MAPS.champhall2 = {name: 'Champions-Halle – Meisterklasse', arena: 'league', rows: room(21, 14, 10, [['D', 18, 1], ['P', 1, 12], ['P', 19, 12]])};
MAPS.champhall3 = {name: 'Champions-Halle – Extrem', arena: 'nebel', rows: room(13, 10, 6, [['P', 1, 8], ['P', 11, 8]])};
WARPS['champhall:12,1'] = {to: 'champhall2', x: 10, y: 12, dir: 'up', req: () => G.flags.beat_ch_C06, reqMsg: 'Die Tür zur Meisterklasse ist verschlossen.\nBesiege zuerst Taron, den Meister aller Ringe!'};
WARPS['champhall2:10,13'] = {to: 'champhall', x: 12, y: 2, dir: 'down'};
const MEISTER = (DATA.champions || []).filter(c => c.schwierigkeit === 'Meisterklasse');
const EXTREM = (DATA.champions || []).filter(c => c.schwierigkeit === 'Extrem' && +c.id.slice(1) > 6);
WARPS['champhall2:18,1'] = {to: 'champhall3', x: 6, y: 8, dir: 'up', req: () => MEISTER.filter(c => G.flags['beat_ch_' + c.id]).length >= 10, reqMsg: 'Die Tür zur Extrem-Klasse ist versiegelt.\nBesiege zuerst 10 Champions der Meisterklasse!'};
WARPS['champhall3:6,9'] = {to: 'champhall2', x: 18, y: 2, dir: 'down'};
const CH_LOOKS = [LOOK.marina, LOOK.granit, LOOK.zephyr, LOOK.morgana, LOOK.flora, LOOK.ampera, LOOK.zephor, LOOK.flammara, LOOK.ferrum, LOOK.harmonia, LOOK.selene, LOOK.frida, LOOK.volta, LOOK.brocka, LOOK.ace, LOOK.beauty, LOOK.gent, LOOK.mystic, LOOK.turbo, LOOK.kralle];
function champNpc(c, x, y, i) {
  const t = T(`Champion ${c.name}`, c.team.map(m => [m.name, m.level, !!m.istShiny]), c.belohnung.muenzen,
    `Ich bin ${c.name} – ${c.titel}!\nWillkommen im ${c.arena}.\n${c.strategie}`, `Unglaublich … du hast mich besiegt!\nDer Titel „${c.belohnung.titel || c.titel}“ gehört jetzt dir.`, 'Revanche? Ich bin jederzeit bereit!');
  t.champTitle = c.belohnung.titel || c.titel; t.rematch = true; t.baseReward = c.belohnung.muenzen;
  return {id: 'ch_' + c.id, x, y, dir: 'down', look: CH_LOOKS[i % CH_LOOKS.length], leader: true, trainer: t};
}
NPCS.champhall2 = MEISTER.map((c, i) => champNpc(c, 2 + (i % 5) * 4, 3 + Math.floor(i / 5) * 3, i));
NPCS.champhall2.push({id: 'chg2', x: 14, y: 12, dir: 'left', look: LOOK.guard, talk: async () => {
  const n = MEISTER.filter(c => G.flags['beat_ch_' + c.id]).length;
  await say(`Willkommen in der Meisterklasse! 15 Champions warten hier.\nDu hast schon ${n} von ${MEISTER.length} besiegt.`);
  await say('Wer 10 von ihnen besiegt, darf durch die Tür oben rechts\nin die Extrem-Klasse.'); }});
NPCS.champhall3 = EXTREM.map((c, i) => champNpc(c, 2 + i * 2, 3, i + 7));
NPCS.champhall.push({id: 'chg_door', x: 13, y: 2, dir: 'down', look: LOOK.guard, talk: async () => { await say(G.flags.beat_ch_C06 ? 'Die Tür zur Meisterklasse steht dir offen!' : 'Hinter dieser Tür liegt die Meisterklasse.\nNur wer Taron besiegt hat, darf hinein.'); }});
MONSTER_SHOP.push(['Quellip', 20, 15000], ['Keimsa', 20, 15000], ['Flammel', 20, 15000]);

// ================= Darstellung Karten =================
const cv = document.getElementById('screen'), ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
function hash2(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
function R_(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
const ROOF = {R: ['#c8473b', '#a3352c', '#e06a5a'], r: ['#3c74c8', '#2d5aa0', '#6a9ae0'], A: ['#8a6d55', '#6b5240', '#b08c6c'], Z: ['#e57399', '#c2557a', '#f59ab8'], K: ['#3aa0a0', '#2a7a7a', '#62c4c4']};
function drawGrass(c, px, py, x, y, map) {
  const snow = map && map.snow, th = themeOf(map || {});
  R_(c, px, py, 16, 16, th.g);
  for (let i = 0; i < 3; i++) { const a = hash2(x * 3 + i, y * 7); const b = hash2(x * 5, y * 3 + i); R_(c, px + Math.floor(a * 14), py + Math.floor(b * 14), snow ? 2 : 1, snow ? 1 : 2, th.t); }
}
const CAVE = {cave: ['#4a3a2e', '#6b5442', '#8a7058', '#7a6250'], ice: ['#3d5f80', '#6a8fb0', '#bcd8ee', '#a6c6e0'], sea: ['#2f4a5a', '#4a6a78', '#7c949a', '#6c8288'], tower: ['#2a2238', '#3e3354', '#6a5a8a', '#5c4e7a'], lava: ['#3a1e14', '#5a2e1e', '#7a4a36', '#8a5a40'], void: ['#14101e', '#2a2040', '#3e3458', '#4c4068']};
function cavePal(map) { return CAVE[map.ice ? 'ice' : map.sea ? 'sea' : map.tower ? 'tower' : map.lava ? 'lava' : map.void ? 'void' : 'cave']; }
function drawTile(c, ch, x, y, map) {
  const px = x * 16, py = y * 16;
  switch (ch) {
    case '.': drawGrass(c, px, py, x, y, map); break;
    case ',': R_(c, px, py, 16, 16, '#e9d7a2'); for (let i = 0; i < 4; i++) R_(c, px + Math.floor(hash2(x + i, y) * 15), py + Math.floor(hash2(x, y + i) * 15), 1, 1, '#cdb67e'); break;
    case 'G': { const tg = themeOf(map).tall; R_(c, px, py, 16, 16, tg[0]); for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const bx = px + i * 4 + (j ? 2 : 0), by = py + j * 8; R_(c, bx, by + 2, 1, 6, tg[1]); R_(c, bx + 1, by + 1, 1, 6, tg[2]); R_(c, bx + 2, by + 3, 1, 5, tg[1]); } break; }
    case 'T': { const tt = themeOf(map).tree; drawGrass(c, px, py, x, y, map); R_(c, px + 6, py + 11, 4, 5, '#7a5230'); c.fillStyle = tt[0]; c.beginPath(); c.arc(px + 8, py + 7, 7, 0, 7); c.fill(); c.fillStyle = tt[1]; c.beginPath(); c.arc(px + 6, py + 5, 4, 0, 7); c.fill(); R_(c, px + 4, py + 3, 2, 2, tt[2]); } if (map.snow) { R_(c, px + 3, py + 1, 10, 2, '#ffffff'); R_(c, px + 2, py + 3, 4, 1, '#ffffff'); R_(c, px + 9, py + 3, 4, 1, '#f0f6ff'); } break;
    case 'M': drawGrass(c, px, py, x, y, map); R_(c, px, py, 16, 16, map.snow ? '#8a98a8' : '#9a7a5a'); R_(c, px, py + 12, 16, 4, map.snow ? '#6a7888' : '#7a5a3a'); R_(c, px + 2, py + 3, 5, 3, map.snow ? '#b8c6d4' : '#b8946c'); R_(c, px + 9, py + 7, 5, 2, map.snow ? '#b8c6d4' : '#b8946c'); if (map.snow) R_(c, px, py, 16, 2, '#ffffff'); break;
    case 'Y': R_(c, px, py, 16, 16, map.snow ? '#8a98a8' : '#9a7a5a'); c.fillStyle = '#1a1410'; c.beginPath(); c.ellipse(px + 8, py + 11, 6, 8, 0, 0, 7); c.fill(); R_(c, px + 2, py + 15, 12, 1, '#1a1410'); break;
    case 'p': R_(c, px, py, 16, 16, '#3f8fe0'); R_(c, px, py + 2, 16, 12, '#a8743e'); for (let i = 0; i < 4; i++) R_(c, px + i * 4, py + 2, 1, 12, '#7a5230'); R_(c, px, py + 13, 16, 1, '#5a3a20'); break;
    case 'X': { const p = cavePal(map); R_(c, px, py, 16, 16, p[0]); R_(c, px + (x * 7 % 11), py + (y * 5 % 11), 4, 3, p[1]); R_(c, px + ((x + 5) * 3 % 12), py + ((y + 3) * 7 % 12), 3, 2, p[1]); const below = map.rows[y + 1] && map.rows[y + 1][x]; if (below && below !== 'X') { R_(c, px, py + 11, 16, 5, p[1]); R_(c, px, py + 15, 16, 1, '#00000055'); } break; }
    case 'x': case 'a': case 'o': case 'L': case 'U': {
      const p = cavePal(map); R_(c, px, py, 16, 16, p[2]);
      R_(c, px + Math.floor(hash2(x, y) * 13), py + Math.floor(hash2(y, x) * 13), 2, 2, p[3]); R_(c, px + Math.floor(hash2(x + 9, y) * 13), py + Math.floor(hash2(y + 9, x) * 13), 1, 1, p[3]);
      if (ch === 'a') { R_(c, px, py, 16, 16, map.ice ? '#d8e8ff' : map.sea ? '#7fb8c8' : '#b89a6a'); R_(c, px + 1, py + 1, 14, 14, map.ice ? '#c4dafc' : map.sea ? '#6aa8b8' : '#a88a5a'); if ((x + y) % 2 === 0) R_(c, px + 6, py + 6, 4, 4, map.ice ? '#ffffff' : '#ffe9a0'); }
      if (ch === 'o') { c.fillStyle = p[1]; c.beginPath(); c.arc(px + 8, py + 9, 7, 0, 7); c.fill(); c.fillStyle = p[3]; c.beginPath(); c.arc(px + 6, py + 7, 3, 0, 7); c.fill(); }
      if (ch === 'L') { R_(c, px + 2, py + 2, 12, 12, '#1a1410'); R_(c, px + 4, py, 2, 16, '#a8743e'); R_(c, px + 10, py, 2, 16, '#a8743e'); for (let i = 0; i < 4; i++) R_(c, px + 4, py + 2 + i * 4, 8, 1, '#a8743e'); }
      if (ch === 'U') { R_(c, px + 2, py, 12, 16, '#f4e8c0'); R_(c, px + 4, py, 8, 16, '#fff8e0'); }
      break; }
    case 'J': { R_(c, px, py, 16, 16, '#5a1f7a'); R_(c, px, py + 3, 16, 1, '#3e1456'); R_(c, px, py + 11, 16, 1, '#3e1456'); for (let i = 0; i < 4; i++) R_(c, px + 2 + i * 4, py + 6, 2, 2, (x + i) % 2 ? '#ffd84a' : '#ff6ad5'); const ab = map.rows[y - 1] && map.rows[y - 1][x]; if (ab !== 'J') R_(c, px, py, 16, 2, '#ffd84a'); if (ab === 'J' && map.rows[y + 1][x] === 'J' && map.rows[y][x - 3] === 'J' && map.rows[y][x + 3] === 'J') { R_(c, px + 2, py + 3, 12, 10, '#1d1f2a'); R_(c, px + 3, py + 4, 10, 8, '#ffd84a'); R_(c, px + 5, py + 6, 6, 4, '#c0392b'); } break; }
    case 'V': { R_(c, px, py, 16, 16, '#3a2a52'); for (let i = 0; i < 4; i++) R_(c, px, py + i * 4 + 3, 16, 1, '#2a1c3e'); const ab = map.rows[y - 1] && map.rows[y - 1][x]; if (ab !== 'V') { R_(c, px, py, 16, 2, '#6a5a8a'); } if (map.rows[y + 1][x] !== 'V') R_(c, px, py + 13, 16, 3, '#2a1c3e'); if ((x + y) % 3 === 0) { R_(c, px + 6, py + 6, 4, 5, '#ffe9a0'); } break; }
    case 'I': R_(c, px, py, 16, 16, '#5c5470'); R_(c, px, py + 7, 16, 1, '#463e58'); R_(c, px + 7, py, 1, 7, '#463e58'); R_(c, px + 3, py + 8, 1, 8, '#463e58'); break;
    case 'g': drawGrass(c, px, py, x, y, map); R_(c, px + 4, py + 3, 8, 11, '#3a3a44'); R_(c, px + 5, py + 4, 6, 10, '#8a8a96'); R_(c, px + 7, py + 6, 2, 5, '#5a5a66'); R_(c, px + 5, py + 8, 6, 1, '#5a5a66'); break;
    case 'q': { R_(c, px, py, 16, 16, '#e8d070'); for (let i = 0; i < 4; i++) R_(c, px, py + i * 4 + 3, 16, 1, '#c8a840'); const ab = map.rows[y - 1] && map.rows[y - 1][x]; if (ab !== 'q') R_(c, px, py, 16, 2, '#fff4c0'); if (map.rows[y + 1][x] !== 'q') R_(c, px, py + 13, 16, 3, '#a88a30'); if (ab === 'q' && map.rows[y + 1][x] === 'q' && x === 10) { c.fillStyle = '#c0392b'; c.beginPath(); c.arc(px + 8, py + 8, 6, 0, 7); c.fill(); R_(c, px + 5, py + 5, 6, 6, '#ffd84a'); } break; }
    case '1': drawTile(c, 'f', x, y, map); R_(c, px + 2, py, 12, 16, '#2d3142'); R_(c, px + 3, py + 1, 10, 3, '#ff6ad5'); R_(c, px + 3, py + 5, 10, 5, '#ffffff'); R_(c, px + 4, py + 6, 2, 3, '#e74c3c'); R_(c, px + 7, py + 6, 2, 3, '#f1c40f'); R_(c, px + 10, py + 6, 2, 3, '#3498db'); R_(c, px + 13, py + 3, 2, 6, '#c0392b'); R_(c, px + 4, py + 12, 8, 2, '#ffd84a'); break;
    case '2': drawTile(c, 'f', x, y, map); R_(c, px, py + 2, 16, 13, '#1e6b3a'); R_(c, px, py + 2, 16, 1, '#c8a840'); if (map.rows[y][x - 1] !== '2') { c.fillStyle = '#5a3a20'; c.beginPath(); c.arc(px + 9, py + 8, 6, 0, 7); c.fill(); c.fillStyle = '#c0392b'; c.beginPath(); c.arc(px + 9, py + 8, 4, 0, 7); c.fill(); R_(c, px + 8, py + 7, 2, 2, '#fff'); } else { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) R_(c, px + 2 + i * 4, py + 5 + j * 4, 3, 3, (i + j) % 2 ? '#c0392b' : '#1d1f2a'); } break;
    case '3': drawTile(c, 'f', x, y, map); R_(c, px, py + 2, 16, 13, '#1e6b3a'); R_(c, px, py + 2, 16, 1, '#c8a840'); R_(c, px + 3, py + 6, 5, 7, '#fff'); R_(c, px + 8, py + 5, 5, 7, '#fff'); R_(c, px + 4, py + 7, 2, 2, '#c0392b'); R_(c, px + 9, py + 6, 2, 2, '#1d1f2a'); break;
    case 'l': R_(c, px, py, 16, 16, '#4a1a14'); R_(c, px + 3, py + 2, 10, 13, '#2a1410'); R_(c, px + 5, py + 4, 2, 9, '#ff7a1a'); R_(c, px + 9, py + 6, 2, 6, '#ffb030'); R_(c, px + 3, py + 14, 10, 1, '#ff5a00'); break;
    case 'z': R_(c, px, py, 16, 16, '#5a6470'); R_(c, px + 1, py + 1, 14, 14, '#9aa5b1'); R_(c, px + 1, py + 7, 14, 2, '#6a7480'); R_(c, px + 7, py + 1, 2, 14, '#6a7480'); for (const [a, b] of [[2, 2], [12, 2], [2, 12], [12, 12]]) R_(c, px + a, py + b, 2, 2, '#4a525c'); break;
    case 'y': R_(c, px, py, 16, 16, '#1d1f2a'); R_(c, px + 2, py + 1, 12, 14, '#2d3142'); c.fillStyle = '#5a5e74'; c.beginPath(); c.arc(px + 8, py + 10, 4, 0, 7); c.fill(); c.beginPath(); c.arc(px + 8, py + 4, 2, 0, 7); c.fill(); R_(c, px + 7, py + 9, 2, 2, '#cc5fc8'); break;
    case 'h': R_(c, px, py, 16, 16, '#d8eef8'); R_(c, px + 7, py + 6, 2, 10, '#ffffff'); R_(c, px + 7, py + 6, 2, 10, '#c0d0dc'); R_(c, px + 8, py + 1, 1, 6, '#ffffff'); R_(c, px + 2, py + 6, 6, 1, '#ffffff'); R_(c, px + 9, py + 6, 5, 1, '#ffffff'); R_(c, px + 7, py + 5, 3, 3, '#5fbf86'); break;
    case 'n': R_(c, px, py, 16, 16, '#3c3358'); c.fillStyle = '#9c8cd8'; c.beginPath(); c.arc(px + 8, py + 6, 5, 0, 7); c.fill(); R_(c, px + 6, py + 4, 2, 2, '#e0d8ff'); R_(c, px + 5, py + 11, 6, 4, '#6a5aa0'); break;
    case 'j': R_(c, px, py, 16, 16, '#cfe6f7'); R_(c, px + 2, py + 2, 12, 13, '#8fc8ec'); R_(c, px + 3, py + 3, 4, 8, '#e6f6ff'); R_(c, px + 2, py + 14, 12, 1, '#5a9ac8'); break;
    case 'W': if (map.lava) { R_(c, px, py, 16, 16, '#e0501a'); R_(c, px + ((x * 5 + y * 3) % 10), py + 4, 5, 2, '#ffb030'); R_(c, px + ((x * 7 + y) % 9) + 2, py + 11, 4, 1, '#ffd84a'); break; } R_(c, px, py, 16, 16, '#3f8fe0'); R_(c, px + ((x * 5 + y * 3) % 10), py + 4, 5, 1, '#8cc4ff'); R_(c, px + ((x * 7 + y) % 9) + 2, py + 11, 4, 1, '#8cc4ff'); break;
    case 'F': drawGrass(c, px, py, x, y, map); for (const [fx, fy, col] of [[3, 4, '#ff5a6e'], [10, 3, '#ffd84a'], [6, 10, '#ffffff'], [12, 11, '#ff5a6e']]) { R_(c, px + fx, py + fy, 2, 2, col); R_(c, px + fx, py + fy + 2, 1, 2, '#3f8a30'); } break;
    case 'S': drawGrass(c, px, py, x, y, map); R_(c, px + 7, py + 9, 2, 7, '#7a5230'); R_(c, px + 2, py + 2, 12, 8, '#5a3a20'); R_(c, px + 3, py + 3, 10, 6, '#c49a5a'); R_(c, px + 5, py + 5, 6, 1, '#7a5230'); break;
    case 'R': case 'r': case 'A': case 'Z': case 'K': {
      const [b, d, l] = ROOF[ch];
      R_(c, px, py, 16, 16, b);
      for (let i = 0; i < 4; i++) R_(c, px, py + i * 4 + 3, 16, 1, d);
      for (let i = 0; i < 4; i++) R_(c, px + ((i % 2) * 4) + 2, py + i * 4, 1, 3, d);
      const below = map.rows[y + 1] && map.rows[y + 1][x];
      if (below !== ch) R_(c, px, py + 13, 16, 3, d);
      const above = map.rows[y - 1] && map.rows[y - 1][x];
      if (above !== ch) R_(c, px, py, 16, 2, l);
      // Symbole
      if (ch === 'Z' && above !== ch && map.rows[y][x - 2] === ch && map.rows[y][x + 2] === ch) { R_(c, px + 6, py + 3, 4, 10, '#fff'); R_(c, px + 3, py + 6, 10, 4, '#fff'); }
      if (ch === 'A' && above === ch && below === ch && map.rows[y][x - 3] === ch && map.rows[y][x + 3] === ch) { c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(px + 8, py + 8, 5, 0, 7); c.fill(); R_(c, px + 7, py + 4, 2, 8, '#c49a2a'); }
      if (ch === 'r' && map.id === 'stadt3' && above !== ch && map.rows[y][x - 2] === ch && map.rows[y][x + 2] === ch) { c.fillStyle = '#ffd84a'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 2.5 : 6; c.lineTo(px + 8 + Math.cos(a) * rr, py + 8 + Math.sin(a) * rr); } c.fill(); }
      if (ch === 'K' && above !== ch && map.rows[y][x - 1] === ch && map.rows[y][x - 2] !== ch && map.rows[y][x + 2] === ch) { R_(c, px + 4, py + 4, 9, 7, '#fff'); R_(c, px + 6, py + 6, 5, 1, '#3aa0a0'); R_(c, px + 6, py + 8, 5, 1, '#3aa0a0'); }
      break;
    }
    case 'H': R_(c, px, py, 16, 16, '#f3e6c8'); R_(c, px, py + 14, 16, 2, '#b8a888'); R_(c, px, py, 16, 1, '#d8c8a8'); break;
    case 'N': R_(c, px, py, 16, 16, '#f3e6c8'); R_(c, px, py + 14, 16, 2, '#b8a888'); R_(c, px + 3, py + 3, 10, 8, '#5a4a3a'); R_(c, px + 4, py + 4, 8, 6, '#9fd4ff'); R_(c, px + 7, py + 4, 1, 6, '#5a4a3a'); R_(c, px + 5, py + 5, 2, 2, '#e0f4ff'); break;
    case 'D': R_(c, px, py, 16, 16, '#f3e6c8'); R_(c, px + 3, py + 2, 10, 14, '#5a3a20'); R_(c, px + 4, py + 3, 8, 13, '#8a5a30'); R_(c, px + 10, py + 9, 1, 2, '#ffd84a'); break;
    case 'f': R_(c, px, py, 16, 16, '#d9b27a'); R_(c, px, py + ((y % 2) ? 7 : 15), 16, 1, '#bf955c'); R_(c, px + ((x * 7 + y * 3) % 14), py, 1, 16, '#c9a067'); break;
    case 'w': R_(c, px, py, 16, 16, '#3a3346'); break;
    case 'k': R_(c, px, py, 16, 16, '#e8dcc0'); R_(c, px, py + 12, 16, 4, '#a88e6a'); R_(c, px, py, 16, 2, '#cfc0a0'); break;
    case 'm': R_(c, px, py, 16, 16, '#d9b27a'); R_(c, px + 1, py + 2, 14, 12, '#c0392b'); R_(c, px + 3, py + 4, 10, 8, '#e05a4a'); break;
    case 'B': { drawTile(c, 'f', x, y, map); const top = map.rows[y - 1][x] !== 'B'; R_(c, px + 1, py, 14, 16, '#7a5230'); R_(c, px + 2, py + (top ? 1 : 0), 12, top ? 15 : 14, '#ffffff'); if (top) R_(c, px + 3, py + 2, 10, 5, '#dfe7ff'); else R_(c, px + 2, py, 12, 14, '#4a7fd6'); break; }
    case 'C': drawTile(c, 'f', x, y, map); R_(c, px + 1, py + 8, 14, 8, '#7a5230'); R_(c, px + 3, py + 1, 10, 9, '#2d3142'); R_(c, px + 4, py + 2, 8, 6, '#59d8ff'); R_(c, px + 5, py + 3, 3, 1, '#d0f6ff'); R_(c, px + 6, py + 10, 4, 2, '#2d3142'); break;
    case 't': drawTile(c, 'f', x, y, map); R_(c, px, py + 3, 16, 10, '#8a5a30'); R_(c, px, py + 3, 16, 2, '#a8743e'); R_(c, px + 2, py + 13, 2, 3, '#5a3a20'); R_(c, px + 12, py + 13, 2, 3, '#5a3a20'); break;
    case 'Q': drawTile(c, 't', x, y, map); R_(c, px + 4, py + 2, 8, 8, '#2d3142'); R_(c, px + 5, py + 3, 6, 3, '#e74c3c'); R_(c, px + 5, py + 6, 6, 3, '#ffffff'); R_(c, px + 7, py + 5, 2, 2, '#2d3142'); break;
    case 'P': drawTile(c, 'f', x, y, map); R_(c, px + 5, py + 10, 6, 6, '#b5651d'); c.fillStyle = '#3f9a3f'; c.beginPath(); c.arc(px + 8, py + 7, 5, 0, 7); c.fill(); R_(c, px + 6, py + 4, 2, 2, '#62b860'); break;
    case 'b': R_(c, px, py, 16, 16, '#6b4524'); for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) R_(c, px + 1 + j * 4, py + 1 + i * 5, 3, 4, ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad'][(i * 4 + j + x) % 5]); break;
    case 'c': drawTile(c, 'f', x, y, map); R_(c, px, py + 2, 16, 14, '#c9b48a'); R_(c, px, py + 2, 16, 3, '#f1e4c2'); R_(c, px, py + 15, 16, 1, '#8a7a5a'); break;
    case 'O': R_(c, px, py, 16, 16, '#b49a7a'); c.fillStyle = '#7d6a55'; c.beginPath(); c.arc(px + 8, py + 9, 7, 0, 7); c.fill(); c.fillStyle = '#9c8670'; c.beginPath(); c.arc(px + 6, py + 7, 3, 0, 7); c.fill(); break;
    case 'E': R_(c, px, py, 16, 16, '#3a3f55'); R_(c, px + 4, py + 2, 8, 13, '#9aa5b1'); R_(c, px + 5, py + 3, 6, 4, '#ffe14a'); R_(c, px + 7, py + 8, 2, 6, '#ffe14a'); break;
    case 'u': { drawGrass(c, px, py, x, y, map); const tt = themeOf(map).tree; c.fillStyle = '#1d3a1e'; c.beginPath(); c.arc(px + 8, py + 9, 6.5, 0, 7); c.fill(); c.fillStyle = tt[0]; c.beginPath(); c.arc(px + 8, py + 9, 5.5, 0, 7); c.fill(); R_(c, px + 5, py + 6, 2, 2, tt[2]); R_(c, px + 9, py + 9, 2, 2, tt[2]); R_(c, px + 7, py + 11, 1, 3, '#1d3a1e'); R_(c, px + 9, py + 5, 1, 3, '#1d3a1e'); break; }
    case 'v': { if (map.cave) { const p = cavePal(map); R_(c, px, py, 16, 16, p[2]); } else drawGrass(c, px, py, x, y, map); c.fillStyle = '#4a4a52'; c.beginPath(); c.arc(px + 8, py + 9, 7, 0, 7); c.fill(); c.fillStyle = '#8a8a96'; c.beginPath(); c.arc(px + 8, py + 8, 6, 0, 7); c.fill(); R_(c, px + 5, py + 5, 3, 2, '#b0b0bc'); R_(c, px + 8, py + 6, 1, 6, '#4a4a52'); R_(c, px + 9, py + 9, 3, 1, '#4a4a52'); R_(c, px + 6, py + 10, 2, 1, '#4a4a52'); break; }
    case '=': { if (map.outdoor) drawGrass(c, px, py, x, y, map); else drawTile(c, 'f', x, y, map); R_(c, px, py + 5, 16, 2, '#8a5a30'); R_(c, px, py + 10, 16, 2, '#8a5a30'); R_(c, px + 2, py + 3, 2, 12, '#6b4524'); R_(c, px + 12, py + 3, 2, 12, '#6b4524'); break; }
    case '^': { if (map.outdoor) drawTile(c, ',', x, y, map); else R_(c, px, py, 16, 16, '#d8eef8'); c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(px + 1, py + 14); c.lineTo(px + 15, py + 14); c.lineTo(px + 15, py + 5); c.fill(); R_(c, px + 1, py + 14, 14, 1, '#7a1f15'); for (let i = 0; i < 3; i++) R_(c, px + 6 + i * 3, py + 12 - i * 2, 2, 1, '#fff'); break; }
    case 'Ü': drawTile(c, 'f', x, y, map); R_(c, px + 2, py + 1, 12, 15, '#2d3142'); R_(c, px + 3, py + 2, 10, 10, '#9fe6ff'); R_(c, px + 4, py + 3, 3, 6, '#e0f8ff'); R_(c, px + 6, py + 13, 4, 2, '#e74c3c'); break;
    default: R_(c, px, py, 16, 16, '#000');
  }
  if (map.arena === 'stein' && ch === 'f') { R_(c, px, py, 16, 16, '#c9ae86'); R_(c, px + (x * 5 % 13), py + (y * 7 % 13), 2, 2, '#b0946c'); }
  const FLOOR = {glut: ['#5a2a22', '#6e3428'], metall: ['#8a949e', '#7a848e'], flut: ['#bfe6f5', '#a6d8ee'], wuchs: ['#7fbf5a', '#6aa84a'], klang: ['#3a2a4a', '#4a3a5e'], wind: ['#d8eef8', '#c4e0ee'], league: ['#e8dcb0', '#d8c890'], casino: ['#7a1a2a', '#8a2232'], mall: ['#ececf2', '#dcdce6']};
  if (FLOOR[map.arena] && ch === 'f') { const fl = FLOOR[map.arena]; R_(c, px, py, 16, 16, (x + y) % 2 ? fl[0] : fl[1]); if (map.arena === 'casino' && (x * 3 + y) % 5 === 0) R_(c, px + 7, py + 7, 2, 2, '#ffd84a'); if (map.arena === 'league') { R_(c, px, py, 16, 1, '#c8b070'); R_(c, px, py, 1, 16, '#c8b070'); } if (map.arena === 'glut' && (x + y) % 3 === 0) R_(c, px + 3, py + 8, 8, 1, '#ff7a1a'); }
  if (map.arena === 'nebel' && ch === 'f') { R_(c, px, py, 16, 16, '#5a4a7a'); R_(c, px + (x * 3 % 11), py + (y * 5 % 11), 5, 2, '#6c5c90'); }
  if (map.arena === 'frost' && ch === 'f') { R_(c, px, py, 16, 16, '#dcefff'); R_(c, px, py, 16, 1, '#c0dcf2'); R_(c, px, py, 1, 16, '#c0dcf2'); if ((x * 3 + y) % 4 === 0) R_(c, px + 4, py + 5, 6, 1, '#ffffff'); }
  if (map.arena === 'funke' && ch === 'f') { R_(c, px, py, 16, 16, '#4a5068'); R_(c, px, py, 16, 1, '#5a6080'); R_(c, px, py, 1, 16, '#5a6080'); if ((x + y) % 3 === 0) R_(c, px + 6, py + 7, 4, 2, '#ffe14a'); }
}
function renderMap(map) {
  const c = document.createElement('canvas'); c.width = map.w * 16; c.height = map.h * 16; const x2 = c.getContext('2d');
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) drawTile(x2, map.rows[y][x], x, y, map);
  map.canvas = c;
}
for (const k in MAPS) { const m = MAPS[k]; m.id = k; m.h = m.rows.length; m.w = m.rows[0].length; m.rows.forEach((r, i) => { if (r.length !== m.w) console.error('Map row length', k, i, r.length, m.w); }); }

function drawPerson(c, x, y, dir, look, step) {
  const {hair = '#5a3a22', shirt = '#d33', pants = '#2b3d6b', skin = '#f2c8a0', hat = null} = look;
  x = Math.round(x); y = Math.round(y);
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(x + 8, y + 15, 6, 2, 0, 0, 7); c.fill();
  const o = '#1d1f2a';
  const lift = step ? 1 : 0;
  // Umriss
  R_(c, x + 3, y - 1 + lift, 10, 10, o); R_(c, x + 2, y + 8, 12, 5, o); R_(c, x + 3, y + 12, 10, 4, o);
  // Beine
  const l1 = step === 1 ? -1 : 0, l2 = step === 2 ? -1 : 0;
  R_(c, x + 4, y + 12 + l1, 3, 3, pants); R_(c, x + 9, y + 12 + l2, 3, 3, pants);
  // Körper
  R_(c, x + 3, y + 8, 10, 5, shirt); R_(c, x + 3, y + 8, 10, 1, shade(shirt.length === 7 ? shirt : '#888888', 0.2));
  if (dir === 'left' || dir === 'right') R_(c, x + 7, y + 9, 2, 3, skin); else { R_(c, x + 2, y + 9, 1, 3, skin); R_(c, x + 13, y + 9, 1, 3, skin); }
  // Kopf
  R_(c, x + 4, y + lift, 8, 8, skin);
  const hc = hair;
  R_(c, x + 4, y + lift, 8, 3, hc);
  if (dir === 'up') R_(c, x + 4, y + lift, 8, 7, hc);
  else if (dir === 'down') { R_(c, x + 4, y + 3 + lift, 1, 2, hc); R_(c, x + 11, y + 3 + lift, 1, 2, hc); R_(c, x + 6, y + 4 + lift, 1, 2, o); R_(c, x + 9, y + 4 + lift, 1, 2, o); }
  else if (dir === 'left') { R_(c, x + 9, y + lift, 3, 6, hc); R_(c, x + 5, y + 4 + lift, 1, 2, o); }
  else { R_(c, x + 4, y + lift, 3, 6, hc); R_(c, x + 10, y + 4 + lift, 1, 2, o); }
  if (hat) { R_(c, x + 3, y - 1 + lift, 10, 3, hat); if (dir === 'down') R_(c, x + 4, y + 2 + lift, 8, 1, shade(hat.length === 7 ? hat : '#888888', -0.3)); if (dir === 'left') R_(c, x + 1, y + 1 + lift, 4, 1, hat); if (dir === 'right') R_(c, x + 11, y + 1 + lift, 4, 1, hat); }
}

// ================= UI-Grundlagen =================
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const handlers = [];
const held = new Set();
let scriptLock = 0;
function pushH(h) { handlers.push(h); }
function popH(h) { const i = handlers.lastIndexOf(h); if (i >= 0) handlers.splice(i, 1); }
function keyFromEvent(e) {
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') return 'up';
  if (k === 'ArrowDown' || k === 's' || k === 'S') return 'down';
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') return 'left';
  if (k === 'ArrowRight' || k === 'd' || k === 'D') return 'right';
  if (k === 'Enter' || k === ' ' || k === 'e' || k === 'E' || k === 'z' || k === 'Z') return 'A';
  if (k === 'Escape' || k === 'x' || k === 'X' || k === 'Backspace' || k === 'q' || k === 'Q') return 'B';
  if (k === 'm' || k === 'M' || k === 'Tab') return 'MENU';
  if (k === 'r' || k === 'R') return 'BIKE';
  if (k === 'k' || k === 'K') return 'MAP';
  if (k === 't' || k === 'T') return 'TURBO';
  return null;
}
let running = false;
function press(k) {
  if (handlers.length) { handlers[handlers.length - 1](k); return; }
  if (!G || scriptLock || moving) return;
  if (k === 'BIKE') { toggleBike(); return; }
  if (k === 'MAP') { if (G.bag.Karte) script(openWorldMap); return; }
  if (k === 'TURBO') { toggleTurbo(); return; }
  if (k === 'A') script(interact);
  else if (k === 'B' || k === 'MENU') script(mainMenu);
}
document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if ($('title').style.display !== 'none') return;
  if (e.key === 'Shift') running = true;
  const k = keyFromEvent(e); if (!k) return;
  e.preventDefault();
  if (['up', 'down', 'left', 'right'].includes(k)) held.add(k);
  if (e.repeat && !['up', 'down', 'left', 'right'].includes(k)) return;
  press(k);
});
document.addEventListener('keyup', e => { if (e.key === 'Shift') running = false; const k = keyFromEvent(e); if (k) held.delete(k); });
window.addEventListener('blur', () => { held.clear(); running = false; });

// Touch
if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
document.querySelectorAll('#pad [data-k]').forEach(el => {
  const k = el.dataset.k; let rep = null;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); if (['up', 'down', 'left', 'right'].includes(k)) { held.add(k); if (handlers.length) { press(k); rep = setInterval(() => { if (handlers.length) press(k); }, 220); } } else press(k); });
  const up = () => { el.classList.remove('on'); held.delete(k); if (rep) clearInterval(rep); rep = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
});
$('menuBtn').addEventListener('click', () => press('MENU'));
$('bikeBtn').addEventListener('click', () => toggleBike());
$('mapBtn').addEventListener('click', () => { if (G && !handlers.length && !scriptLock && G.bag.Karte) script(openWorldMap); });
$('turboBtn').addEventListener('click', () => toggleTurbo());

function fitFont() { const w = $('game').clientWidth; $('game').style.setProperty('--fs', Math.max(9, w / 44) + 'px'); }
window.addEventListener('resize', fitFont); fitFont();

// Textbox
const msgEl = $('msg');
let msgHideTimer = null;
function say(text) {
  return new Promise(res => {
    clearTimeout(msgHideTimer);
    msgEl.style.display = 'block';
    text = dispText(String(text).replace(/\{name\}/g, G ? G.name : ''));
    (window.__log = window.__log || []).push(text);
    let i = 0, done = false;
    msgEl.textContent = '';
    const tick = setInterval(() => { i += 2; if (i >= text.length) { i = text.length; finish(); } else msgEl.textContent = text.slice(0, i); }, 16);
    function finish() { clearInterval(tick); done = true; msgEl.textContent = text; const m = document.createElement('span'); m.className = 'more'; m.textContent = '▼'; msgEl.appendChild(m); }
    const h = k => {
      if (k !== 'A' && k !== 'B') return;
      if (!done) { finish(); return; }
      popH(h); msgEl.onclick = null;
      msgHideTimer = setTimeout(() => { msgEl.style.display = 'none'; }, 30);
      res();
    };
    msgEl.onclick = () => h('A');
    pushH(h);
  });
}
function showText(text) { clearTimeout(msgHideTimer); msgEl.style.display = 'block'; msgEl.textContent = dispText(text.replace(/\{name\}/g, G ? G.name : '')); }
function hideText() { msgEl.style.display = 'none'; }

const chEl = $('choices');
function choose(options, opts = {}) {
  return new Promise(res => {
    const cancel = opts.cancel !== false;
    let sel = opts.start || 0;
    while (sel < options.length - 1 && typeof options[sel] === 'object' && options[sel].disabled) sel++;
    const grid = !!opts.grid;
    chEl.className = grid ? 'grid show' : '';
    chEl.style.display = grid ? '' : 'block';
    if (opts.text) showText(opts.text);
    function render() {
      chEl.innerHTML = (opts.title ? `<div class="title">${opts.title}</div>` : '') + options.map((o, i) => {
        const lab = typeof o === 'string' ? o : o.label; const dis = typeof o === 'object' && o.disabled;
        return `<div class="opt${i === sel ? ' sel' : ''}${dis ? ' dis' : ''}" data-i="${i}">${lab}</div>`;
      }).join('');
      chEl.querySelectorAll('.opt').forEach(el => el.onclick = () => { sel = +el.dataset.i; render(); h('A'); });
      const s = chEl.querySelector('.sel'); if (s) s.scrollIntoView({block: 'nearest'});
      if (opts.onSel) opts.onSel(sel);
    }
    const h = k => {
      const n = options.length;
      if (k === 'up') sel = grid ? (sel - 2 + n) % n : (sel - 1 + n) % n;
      else if (k === 'down') sel = grid ? (sel + 2) % n : (sel + 1) % n;
      else if (k === 'left' && grid) sel = (sel - 1 + n) % n;
      else if (k === 'right' && grid) sel = (sel + 1) % n;
      else if (k === 'A') { const o = options[sel]; if (typeof o === 'object' && o.disabled) return; close(); res(sel); return; }
      else if (k === 'B' || k === 'MENU') { if (cancel) { close(); res(-1); } return; }
      render();
    };
    function close() { popH(h); chEl.style.display = 'none'; chEl.className = ''; if (opts.text) hideText(); }
    pushH(h); render();
  });
}
async function yesNo(text) { return (await choose(['Ja', 'Nein'], {text})) === 0; }
const panelEl = $('panel');
function showPanel(html, full) { panelEl.innerHTML = html; panelEl.className = full ? 'full' : ''; panelEl.style.display = 'block'; }
function hidePanel() { panelEl.style.display = 'none'; }
function waitKey() { return new Promise(res => { const h = k => { if (k === 'up' || k === 'down') { panelEl.scrollBy(0, (k === 'up' ? -1 : 1) * panelEl.clientHeight * 0.4); return; } if (k === 'A' || k === 'B' || k === 'MENU') { popH(h); panelEl.onclick = null; res(); } }; panelEl.onclick = () => h('A'); pushH(h); }); }
async function fade(on, white) { const f = $('fade'); f.classList.toggle('white', !!white); f.style.opacity = on ? 1 : 0; await sleep(260); }
async function script(fn) { scriptLock++; try { await fn(); } catch (e) { console.error(e); } finally { scriptLock--; } }

// ================= Overworld =================
let map = null, moving = null, bump = 0, walkFrame = 0, exclaim = null, npcState = {};
function npcsHere() { return (NPCS[map.id] || []).filter(n => (!n.show || n.show()) && !((n.item || n.legend) && G.flags[n.id])); }
function npcAt(x, y) { return npcsHere().find(n => n.x === x && n.y === y); }
function tileAt(x, y) { if (y < 0 || y >= map.h || x < 0 || x >= map.w) return null; const t = map.rows[y][x]; if ((t === 'u' || t === 'v') && clearedTile(map.id, x, y)) return map.cave ? 'x' : '.'; return t; }
function isSolid(x, y) { const t = tileAt(x, y); if (t === null) return true; if (t === 'W' && G.surf && !map.lava) return !!npcAt(x, y); if (SOLID.has(t)) return true; if (npcAt(x, y)) return true; if (x === G.x && y === G.y) return true; return false; }
const DIRS = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]};
let mapNameTimer = null;
function enterMap(id, x, y, dir) {
  setTimeout(autosave, 0);
  map = MAPS[id]; if (!map.canvas) renderMap(map);
  repaintCleared();
  if (!map.outdoor) G.bike = false;
  if (map.bikeOnly && G.bag.Fahrrad) G.bike = true;
  setTimeout(updateBikeBtn, 0);
  G.map = id; G.x = x; G.y = y; if (dir) G.dir = dir;
  { const nd = wmNode(id); if (nd) G.lastNode = nd; }
  const mn = $('mapname'); mn.textContent = map.name; mn.style.opacity = 1; clearTimeout(mapNameTimer); mapNameTimer = setTimeout(() => mn.style.opacity = 0, 1800);
}
async function warpTo(w) {
  if (MAPS[w.to].cave && map.outdoor) G.ropeTo = {map: map.id, x: G.x, y: G.y, dir: 'down'};
  await fade(true); enterMap(w.to, w.x, w.y, w.dir); await sleep(60); await fade(false);
  await mapEvents();
}

function tryMove(dir) {
  G.dir = dir;
  const [dx, dy] = DIRS[dir]; const nx = G.x + dx, ny = G.y + dy;
  const w = WARPS[`${map.id}:${nx},${ny}`];
  if (w) { script(async () => { if (w.locked) await say(w.locked); else if (w.req && !w.req()) await say(w.reqMsg); else await warpTo(w); }); return; }
  if (ny < 0 || ny >= map.h || nx < 0 || nx >= map.w) {
    const side = ny < 0 ? 'north' : ny >= map.h ? 'south' : nx < 0 ? 'west' : 'east';
    const to = (map.exits && map.exits[side]) || (map.exitTo && 'exitTo');
    if (!to) return;
    script(async () => {
      if (map.id === 'dorf' && !G.flags.starter) { await say('Professorin Sternberg ruft:\n„Warte! Ohne eigenes Monster ist das hohe Gras viel zu gefährlich!“'); return; }
      const gate = GATES[map.id + ':' + side];
      if (gate && ((gate.badge && !G.badges.includes(gate.badge)) || (gate.count && G.badges.length < gate.count) || (gate.bike && !G.bag.Fahrrad) || (gate.champ && !G.flags.champion))) { await say(gate.msg); return; }
      if (G.surf) { await say('Beim Surfen kannst du hier nicht weiter.'); return; }
      if (map.exitTo) { if (map.safari && G.safari && !(await yesNo('Willst du den Safari-Park verlassen?'))) return; if (map.safari) { await endSafari(); return; } }
      if (to === 'none') { await say('Wache: „Dahinter beginnt die Siegesstraße – sie wird noch gebaut!\nHier geht es bald weiter …“'); return; }
      const m2 = MAPS[to];
      await fade(true);
      enterMap(to, side === 'east' ? 0 : side === 'west' ? m2.w - 1 : Math.min(nx, m2.w - 1), side === 'north' ? m2.h - 1 : side === 'south' ? 0 : ny, dir);
      if (MAPS[to].bikeOnly) await say('Du steigst aufs Fahrrad. Los geht’s! 🚲');
      await fade(false);
      await mapEvents();
    });
    return;
  }
  if (isSolid(nx, ny)) { bump = 8; return; }
  moving = {fx: G.x, fy: G.y, tx: nx, ty: ny, t: 0, dur: G.surf ? 160 : G.bike ? 85 : (G.bag['Turbo-Treter'] && (running || G.turboOn)) ? 105 : 190};
  walkFrame = (walkFrame % 2) + 1;
}
async function onStepDone() {
  const t = tileAt(G.x, G.y);
  if (G.surf && t !== 'W') { G.surf = false; }
  if (t === 'G') oParts(G.x, G.y, themeOf(map).tall[2], 5);
  else if (G.bike && Math.random() < 0.5) oParts(G.x, G.y, '#cfc6b0', 3);
  if (G.surf && t === 'W') oParts(G.x, G.y, '#bfe6ff', 4);
  // Trainer-Sicht
  for (const n of npcsHere()) {
    if (!n.trainer || G.flags['beat_' + n.id] || n.leader) continue;
    const [dx, dy] = DIRS[n.dir];
    for (let i = 1; i <= 4; i++) {
      const sx = n.x + dx * i, sy = n.y + dy * i;
      if (sx === G.x && sy === G.y) { await script(() => trainerEncounter(n)); return; }
      const tt = tileAt(sx, sy); if (tt === null || (SOLID.has(tt) && tt !== 'W') || npcAt(sx, sy)) break;
    }
  }
  if (G.repel > 0) { G.repel--; if (G.repel === 0) { await script(() => say('Die Wirkung des Schutzsprays lässt nach.')); return; } }
  if (G.lure > 0) { G.lure--; if (G.lure === 0) { await script(() => say('Die Wirkung des Lockdufts lässt nach.')); return; } }
  if (map.safari && G.safari) {
    G.safari.steps--;
    if (G.safari.steps <= 0) { await script(() => endSafari('Ding-dong! „Die Safari-Zeit ist vorbei!“')); return; }
    if (t === 'G' && Math.random() < 0.12) {
      await script(async () => { const total = map.enc.reduce((s, e) => s + e[3], 0); let r = Math.random() * total, e = map.enc[0]; for (const x of map.enc) { r -= x[3]; if (r <= 0) { e = x; break; } }
        await safariBattle(wildMon(e[0], e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1)))); });
    }
    return;
  }
  if (G.surf && t === 'W' && map.waterEnc && alive().length && !(G.repel > 0) && Math.random() < 0.08) {
    await script(async () => { const W2 = map.waterEnc, total = W2.reduce((s, e) => s + e[3], 0); let r = Math.random() * total, e = W2[0]; for (const x of W2) { r -= x[3]; if (r <= 0) { e = x; break; } }
      await battle({wild: wildMon(e[0], e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1)))}); });
    return;
  }
  const encTile = t === 'G' || (map.cave && t === 'x');
  if (encTile && map.enc && alive().length && !(G.repel > 0) && Math.random() < (map.cave ? map.encRate : 0.11) * (G.lure > 0 ? 2 : 1)) {
    await script(async () => {
      const total = map.enc.reduce((s, e) => s + e[3], 0); let r = Math.random() * total; let e = map.enc[0];
      for (const x of map.enc) { r -= x[3]; if (r <= 0) { e = x; break; } }
      const lv = e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1));
      await battle({wild: wildMon(e[0], lv)});
    });
  }
}
async function interact() {
  const [dx, dy] = DIRS[G.dir]; let fx = G.x + dx, fy = G.y + dy;
  let t = tileAt(fx, fy);
  if (t === 'c') { fx += dx; fy += dy; }
  const n = npcAt(fx, fy);
  if (n && n.chest) return openChest(n);
  if (n && n.item) { G.flags[n.id] = 1; G.bag[n.item] = (G.bag[n.item] || 0) + n.n; await say(`{name} findet ${n.n}× ${n.item}!`); return; }
  if (n && n.legend) return legendEncounter(n);
  if (n) {
    const back = {up: 'down', down: 'up', left: 'right', right: 'left'}[G.dir];
    const old = n.dir; n.dir = back;
    if (n.trainer) {
      if (n.trainer.req && !n.trainer.req()) await say(n.trainer.reqMsg);
      else if (G.flags['beat_' + n.id] && n.trainer.rematch) { if (await yesNo(`${n.trainer.name}: „${n.trainer.after}“`)) await trainerEncounter(n); }
      else if (G.flags['beat_' + n.id]) await say(n.trainer.after);
      else await trainerEncounter(n);
    } else await n.talk();
    if (!n.leader && !n.trainer) n.dir = old;
    return;
  }
  const sign = SIGNS[`${map.id}:${fx},${fy}`]; if (sign) { await say(sign); return; }
  if (t === 'C' && map.id !== 'lab') return pcMenu();
  if (t === 'Ü') return wandelMachine();
  if (t === 'u' || t === 'v') return fieldObstacle(t, fx, fy);
  if (t === 'W' && !map.lava && !G.surf && (map.outdoor || map.cave)) return startSurf(G.dir);
  if (t === '=') { await say('Ein stabiler Zaun.'); return; }
  if (t === 'C') { await say('Ein Forschungs-PC. Auf dem Bildschirm laufen Monster-Daten.'); return; }
  if (t === 'B') return sleepBed();
  if (t === 'b') { await say(['Ein Regal voller Bücher über Monster.', '„Die Typen-Lehre, Band 3“ … klingt kompliziert.', 'Ein Buch: „1000 Rezepte für Monsterfutter“.'][Math.floor(Math.random() * 3)]); return; }
  if (t === 'Q') { if (!G.flags.starter) return talkProf(); await say('Die Kapseln sind leer.'); return; }
  if (t === 'W' && map.outdoor) { await say('Das Wasser glitzert in der Sonne.'); return; }
  if (t === 'E') { await say('Bzzzt! Die Säule steht unter Strom.'); return; }
  if (t === '1') return playSlots();
  if (t === '2') return playRoulette();
  if (t === '3') return playBlackjack();
  if (t === 'g') { await say('Ein alter Grabstein. Darauf steht:\n„Hier ruht ein treues Monster. Für immer unvergessen.“'); return; }
  if (t === 'l') { await say('Heiß! Hier brodelt Lava.'); return; }
  if (t === 'z') { await say('Eine schwere Stahlkiste.'); return; }
  if (t === 'y') { await say('Ein riesiger Lautsprecher. Bumm, bumm!'); return; }
  if (t === 'h') { await say('Ein kleines Windrad dreht sich im Wind.'); return; }
  if (t === 'O') { await say('Ein schwerer Felsbrocken.'); return; }
}

// ================= Gespräche =================
async function mamaGifts() {
  if (G.flags.mamaGifts) return;
  G.flags.mamaGifts = 1;
  await say('Mama: „Ach, warte mal, {name}! Ich hab noch etwas für dich.“');
  G.bag.Karte = 1; await say('{name} erhält die KARTE! 🗺️');
  await say('Mama: „Damit siehst du immer, wo du gerade bist.\nÖffne sie im Menü, im Beutel, mit der Taste K\noder mit dem 🗺️-Knopf oben rechts.“');
  G.bag['Turbo-Treter'] = 1; await say('{name} erhält die TURBO-TRETER! 👟');
  await say('Mama: „Mit diesen Schuhen rennst du viel schneller!\nHalte Shift gedrückt, drück T oder tippe auf 👟,\num den Turbo ein- und auszuschalten.“');
  updateBikeBtn(); autosave();
}
async function talkMama() {
  await mamaGifts();
  if (!G.flags.starter) { await say('Guten Morgen, {name}!\nHeute ist dein großer Tag!'); await say('Professorin Sternberg wartet im Labor auf dich.\nDas ist das Haus mit dem blauen Dach!'); return; }
  if (await yesNo('Mama: „Na, mein Schatz? Soll ich dein Team versorgen?“')) {
    await fade(true, true); healAll(); await sleep(300); await fade(false, true);
    await say('Mama: „So, alle wieder fit! Pass gut auf dich auf!“');
  } else await say('Mama: „Vergiss nicht: Im Bett kannst du dich jederzeit ausruhen.“');
}
async function talkProf() {
  if (G.flags.starter) {
    await say(`Prof. Sternberg: „Wie geht es deinem ${G.flags.starter}?“`);
    await say(`„Dein Monsterdex: ${Object.keys(G.seen).length} gesehen, ${Object.keys(G.caught).length} gefangen.\nWeiter so!“`);
    return;
  }
  await say('„Ah, {name}! Da bist du ja!\nIch bin Professorin Sternberg.“');
  await say('„Ich erforsche die Monster dieser Region –\nWesen mit den Kräften der Elemente.“');
  await say('„Heute darfst du dir dein erstes Monster aussuchen!\nWähle weise – es wird dein treuer Partner.“');
  const starters = ['Zirkelu', 'Plitscho', 'Moosli'];
  while (true) {
    const i = await choose(starters.map(s => ({label: `${spriteImg(s, 2.2)} <span>${s} ${badges(SPECIES[s].typen)}</span>`})), {title: 'Wähle dein Monster', cancel: false,
      onSel: i => { const sp = SPECIES[starters[i]]; showPanel(`<div style="display:flex;gap:1em;align-items:center"><div>${spriteImg(sp.name, 7)}</div><div><h2>${sp.name} ${badges(sp.typen)}</h2><div>${sp.beschreibung}</div><div class="small" style="margin-top:.4em">${sp.persoenlichkeitLebensraum}</div></div></div>`); }});
    hidePanel();
    const s = starters[i];
    if (await yesNo(`„Du möchtest also ${s}, das ${SPECIES[s].typen[0]}-Monster?“`)) {
      const m = makeMon(s, 5); G.team.push(m); markCaught(s); G.flags.starter = s;
      await say(`{name} erhält ${s}!`);
      G.bag.Fangkapsel += 5;
      await say('„Nimm auch diese 5 Fangkapseln.\nDamit kannst du wilde Monster fangen!“');
      await say('„Zu Hause kannst du im Bett schlafen, um dein Team zu heilen.\nAm PC holst du Gegenstände und tauschst Monster aus der Box.“');
      await rivalLab();
      await say('Prof. Sternberg: „Im Norden, hinter Route 1, liegt Kieselstadt.\nDort wartet die erste Arena auf dich. Viel Glück!“');
      return;
    }
  }
}
async function talkNurse() {
  await say('„Willkommen in der Heilstation!\nIch pflege deine Monster wieder gesund.“');
  await fade(true, true); healAll(); await sleep(400); await fade(false, true);
  G.respawn = {map: map.id, x: 5, y: 4, dir: 'up'};
  save(true);
  await say('„Fertig! Deine Monster sind wieder topfit.\nBis bald!“');
}
const ITEMS = {
  Fangkapsel: {price: 200, ball: 1, desc: 'Fängt wilde Monster. Klappt besser, wenn sie geschwächt sind.'},
  Superkapsel: {price: 600, ball: 1.6, desc: 'Bessere Fangquote als die Fangkapsel.'},
  Hyperkapsel: {price: 1200, ball: 2.3, desc: 'Sehr hohe Fangquote.'},
  Legendenkapsel: {price: 9999, ball: 99, desc: 'Fängt jedes Monster sicher – die einzige Kapsel, die bei legendären Monstern wirkt!'},
  Heiltrank: {price: 300, heal: 40, desc: 'Heilt 40 KP eines Monsters.'},
  Supertrank: {price: 700, heal: 100, desc: 'Heilt 100 KP eines Monsters.'},
  Hypertrank: {price: 1500, heal: 250, desc: 'Heilt 250 KP eines Monsters.'},
  Beleber: {price: 1200, desc: 'Belebt ein besiegtes Monster mit halben KP wieder.'},
  Sonderbonbon: {price: 4800, desc: 'Ein Monster steigt sofort um ein Level auf.'},
  Schutzspray: {price: 400, desc: 'Hält 120 Schritte lang wilde Monster fern.'},
  Fluchtseil: {price: 500, desc: 'Bringt dich sofort aus einer Höhle zurück zum Eingang.'},
  'Top-Trank': {price: 2500, heal: 9999, desc: 'Heilt alle KP eines Monsters.'},
  'Top-Beleber': {price: 4000, desc: 'Belebt ein besiegtes Monster mit vollen KP wieder.'},
  Lockduft: {price: 600, desc: 'Lockt 120 Schritte lang doppelt so viele wilde Monster an.'},
  Gegengift: {price: 200, cure: ['gift'], desc: 'Heilt eine Vergiftung. Stoppt auch den Gift-Countdown!'},
  'Para-Heiler': {price: 250, cure: ['para'], desc: 'Heilt eine Paralyse.'},
  Brandsalbe: {price: 250, cure: ['brand'], desc: 'Heilt Verbrennungen.'},
  Aufwecker: {price: 250, cure: ['schlaf'], desc: 'Weckt ein schlafendes Monster auf.'},
  Eisheiler: {price: 250, cure: ['eis'], desc: 'Taut ein eingefrorenes Monster auf.'},
  Hyperheiler: {price: 600, cure: ['gift', 'para', 'brand', 'schlaf', 'eis'], desc: 'Heilt jeden Statuseffekt (Gift, Paralyse, Verbrennung, Schlaf, Eis).'},
  'EP-Teiler': {price: 8000, key: true, desc: 'Monster, die nicht kämpfen, erhalten die Hälfte der EP. (Wirkt einfach, wenn er im Beutel ist.)'}
};
const ITEM_ORDER = Object.keys(ITEMS);
const isBall = it => ITEMS[it] && ITEMS[it].ball;
function initItems4() {
const TP_PRICE = 4000;
for (const n in TP_MOVES) {
  const d = TP_MOVES[n];
  if (d.field) ITEMS['VM ' + n] = {price: 0, key: true, tp: n, desc: `Versteckte Maschine: bringt einem Monster „${n}“ bei (${badgeText(d.typ)}, Stärke ${d.staerke}). ${d.types ? 'Nur für ' + d.types.map(badgeText).join('/') + '-Monster. ' : ''}${d.effekt.replace('Kein Zusatzeffekt. ', '')} Wiederverwendbar.`};
  else ITEMS['TP ' + n] = {price: TP_PRICE, key: true, tp: n, desc: `Technikplatte: bringt einem Monster „${n}“ bei (${badgeText(d.typ)}${d.staerke ? ', Stärke ' + d.staerke : ''}). ${d.effekt} Wiederverwendbar.`};
}
Object.assign(ITEMS, {
  'X-Angriff': {price: 500, xstat: 'Angriff', desc: 'Nur im Kampf: Angriff des eigenen Monsters für 5 Runden um 30 % erhöhen.'},
  'X-Verteidigung': {price: 500, xstat: 'Verteidigung', desc: 'Nur im Kampf: Verteidigung für 5 Runden um 30 % erhöhen.'},
  'X-Tempo': {price: 500, xstat: 'Tempo', desc: 'Nur im Kampf: Tempo für 5 Runden um 30 % erhöhen.'},
  Protein: {price: 3000, vit: 'atk', desc: 'Erhöht den Angriff eines Monsters dauerhaft um 5 (höchstens 5-mal).'},
  Eisen: {price: 3000, vit: 'def', desc: 'Erhöht die Verteidigung eines Monsters dauerhaft um 5 (höchstens 5-mal).'},
  Carbon: {price: 3000, vit: 'spd', desc: 'Erhöht das Tempo eines Monsters dauerhaft um 5 (höchstens 5-mal).'},
  'KP-Plus': {price: 3000, vit: 'kp', desc: 'Erhöht die KP eines Monsters dauerhaft um 5 (höchstens 5-mal).'},
  Superschutz: {price: 700, desc: 'Hält 250 Schritte lang wilde Monster fern.'},
  'Glückstaler': {price: 30000, key: true, desc: 'Verdoppelt die Coins aus allen Kämpfen. Wirkt, solange er im Beutel ist.'},
  Karte: {price: 0, key: true, desc: 'Eine Karte der ganzen Region. Zeigt dir, wo du gerade bist. (Taste K)'},
  'Turbo-Treter': {price: 0, key: true, desc: 'Superschnelle Schuhe von Mama! Shift halten oder T / 👟 drücken zum Rennen.'},
  Fahrrad: {price: 100000, key: true, desc: 'Damit fährst du doppelt so schnell! Taste R oder 🚲-Knopf zum Auf- und Absteigen.'}
});
ITEMS.Sonderbonbon.price = 3000;
ITEMS.Sonderbonbon.desc = 'Ein Monster steigt sofort um ein Level auf.';
ITEM_ORDER.length = 0; Object.keys(ITEMS).forEach(k => ITEM_ORDER.push(k));
SHOP_LISTS.shop1.push('Sonderbonbon');
SHOP_LISTS.shop2.push('Sonderbonbon', 'X-Angriff', 'X-Verteidigung', 'X-Tempo');
SHOP_LISTS.shop3.push('Sonderbonbon', 'X-Angriff', 'X-Verteidigung', 'X-Tempo', 'Superschutz');
SHOP_LISTS.late.push('Sonderbonbon', 'X-Angriff', 'X-Verteidigung', 'X-Tempo', 'Superschutz', 'Protein', 'Eisen', 'Carbon', 'KP-Plus');
SHOP_LISTS.mall_spec.push('Glückstaler', 'Superschutz', 'Protein', 'Eisen', 'Carbon', 'KP-Plus');
SHOP_LISTS.liga.push('X-Angriff', 'X-Verteidigung', 'X-Tempo', 'Protein', 'Eisen', 'Carbon', 'KP-Plus');
SHOP_LISTS.tp = Object.keys(TP_MOVES).filter(n => !TP_MOVES[n].field).map(n => 'TP ' + n);
SHOP_LISTS.shop4.push('X-Angriff', 'X-Verteidigung', 'X-Tempo', 'Superschutz', 'Protein', 'Eisen', 'Carbon', 'KP-Plus', 'Glückstaler', ...SHOP_LISTS.tp);
SHOP_LISTS.rad = ['Fahrrad'];
{ const C = ['Gegengift', 'Para-Heiler', 'Brandsalbe', 'Aufwecker', 'Eisheiler'];
  SHOP_LISTS.shop1.push('Gegengift', 'Para-Heiler');
  for (const k of ['shop2', 'shop3', 'shop4', 'late', 'mall_med']) SHOP_LISTS[k].push(...C, 'Hyperheiler');
  SHOP_LISTS.liga.push('Gegengift', 'Hyperheiler'); }
}
initItems4();
async function talkShop(shopId, title) {
  const stern = shopId === 'stern';
  await say(stern ? '„Willkommen im Sternenladen!\nHier gibt es nur das Seltenste vom Seltenen.“' : title ? `„Willkommen an der ${title}! Was darf’s sein?“` : '„Hallo! Willkommen im Laden. Was darf’s sein?“');
  while (true) {
    const m = await choose(['Kaufen', 'Verkaufen', 'Tschüss'], {title: `Deine Coins: ${fmtC(G.money)}`});
    if (m === 0) {
      const names = SHOP_LISTS[shopId];
      while (true) {
        const i = await choose(names.map(n => `<span style="flex:1">${n}</span> <span class="small">${fmtC(ITEMS[n].price)} Coins</span>`).concat(['Zurück']), {title: `Deine Coins: ${fmtC(G.money)}`, onSel: k => showText(k < names.length ? ITEMS[names[k]].desc + (G.bag[names[k]] ? `\n(Im Beutel: ${G.bag[names[k]]})` : '') : 'Zurück zum Hauptmenü.')});
        hideText();
        if (i < 0 || i === names.length) break;
        const it = names[i];
        const q = await choose(['1 Stück', '5 Stück', '10 Stück', 'Zurück'], {title: `${it} (${fmtC(ITEMS[it].price)} Coins)`, text: ITEMS[it].desc});
        if (q < 0 || q === 3) continue;
        const n = ITEMS[it].key ? 1 : [1, 5, 10][q], cost = n * ITEMS[it].price;
        if (cost > G.money) { await say('„Oh, dafür reichen deine Coins leider nicht.“'); continue; }
        if (ITEMS[it].key && G.bag[it]) { await say('„Den hast du doch schon! Einer reicht.“'); continue; }
        G.money -= cost; G.bag[it] = (G.bag[it] || 0) + n;
        await say(`Du kaufst ${n}× ${it} für ${fmtC(cost)} Coins.`);
        if (n >= 10 && isBall(it)) { G.bag.Fangkapsel = (G.bag.Fangkapsel || 0) + 1; await say('„Als Dankeschön gibt’s eine Fangkapsel gratis dazu!“'); }
      }
    } else if (m === 1) {
      while (true) {
        const names = ITEM_ORDER.filter(k => G.bag[k] > 0 && !ITEMS[k].key);
        if (!names.length) { await say('Du hast nichts zum Verkaufen.'); break; }
        const i = await choose(names.map(n => `<span style="flex:1">${n} ×${G.bag[n]}</span> <span class="small">${fmtC(Math.floor(ITEMS[n].price / 2))} Coins</span>`), {title: 'Was verkaufen? (halber Preis)'});
        if (i < 0) break;
        const it = names[i], price = Math.floor(ITEMS[it].price / 2);
        if (!(await yesNo(`${it} für ${fmtC(price)} Coins verkaufen?`))) continue;
        G.bag[it]--; addMoney(price); await say(`Verkauft! Du erhältst ${fmtC(price)} Coins.`);
      }
    } else break;
  }
  await say('„Danke und bis bald!“');
}
async function sleepBed() {
  if (!(await yesNo('Möchtest du dich ausruhen?'))) return;
  await fade(true); await say('Zzz … Zzz …'); healAll(); G.respawn = {map: 'home', x: 7, y: 3, dir: 'down'}; await sleep(300); await fade(false);
  save(true);
  await say(G.team.length ? 'Du fühlst dich erholt!\nDein ganzes Team ist wieder fit. (Gespeichert)' : 'Du fühlst dich erholt! (Gespeichert)');
}
async function pcMenu() {
  await say('{name} schaltet den PC ein.');
  while (true) {
    const i = await choose(['Monster-Box', 'Gegenstand holen', 'Gegenstand ablegen', 'Ausschalten'], {title: 'PC', text: 'Was möchtest du tun?'});
    if (i === 0) await boxMenu();
    else if (i === 1) {
      const names = Object.keys(G.pc).filter(k => G.pc[k] > 0);
      if (!names.length) { await say('Im PC sind keine Gegenstände mehr.'); continue; }
      const j = await choose(names.map(n => `${n} ×${G.pc[n]}`), {title: 'Gegenstände im PC'});
      if (j < 0) continue; const n = names[j];
      const amt = G.pc[n]; G.pc[n] = 0; G.bag[n] = (G.bag[n] || 0) + amt;
      await say(`Du nimmst ${amt}× ${n} aus dem PC.`);
    } else if (i === 2) {
      const names = Object.keys(G.bag).filter(k => G.bag[k] > 0);
      if (!names.length) { await say('Dein Beutel ist leer.'); continue; }
      const j = await choose(names.map(n => `${n} ×${G.bag[n]}`), {title: 'Beutel'});
      if (j < 0) continue; const n = names[j];
      G.pc[n] = (G.pc[n] || 0) + 1; G.bag[n]--;
      await say(`Du legst 1× ${n} im PC ab.`);
    } else break;
  }
  await say('Der PC wird ausgeschaltet.');
}
function monLabel(m, extra) { return `${spriteImg(m.sp, 1.8, m.shiny)} <span>${m.shiny ? '✨' : ''}${m.nick || m.sp} ${statusTag(m)}${m.poisonDeadline != null && m.hp > 0 ? `<span class="small" style="color:#9b59b6">☠ ${fmtTime(m.poisonDeadline - (G.pclock || 0))}</span> ` : ''}<span class="small">Lv ${m.level} · KP ${m.hp}/${m.maxhp}${extra || ''}</span></span>`; }
async function boxMenu() {
  while (true) {
    const i = await choose(['Monster ablegen', 'Monster mitnehmen', 'Zurück'], {title: `Box: ${G.box.length} Monster · Team: ${G.team.length}/6`});
    if (i === 0) {
      if (G.team.length <= 1) { await say('Du brauchst mindestens ein Monster im Team!'); continue; }
      const j = await choose(G.team.map(m => ({label: monLabel(m)})), {title: 'Welches Monster ablegen?'});
      if (j < 0) continue;
      const m = G.team[j];
      if (alive().length === 1 && m.hp > 0) { await say('Das ist dein letztes kampffähiges Monster!'); continue; }
      G.team.splice(j, 1); m.hp = m.maxhp; cureStatus(m); G.box.push(m);
      await say(`${m.sp} wurde in der Box abgelegt (und dort geheilt).`);
    } else if (i === 1) {
      if (!G.box.length) { await say('Die Box ist leer.'); continue; }
      const j = await choose(G.box.map(m => ({label: monLabel(m)})), {title: 'Welches Monster mitnehmen?'});
      if (j < 0) continue;
      const m = G.box[j];
      if (G.team.length >= 6) {
        const k = await choose(G.team.map(t => ({label: monLabel(t)})), {title: `Team ist voll – tauschen gegen?`});
        if (k < 0) continue;
        const out = G.team[k]; out.hp = out.maxhp; G.team[k] = m; G.box[j] = out;
        await say(`${m.sp} kommt ins Team, ${out.sp} geht in die Box.`);
      } else { G.box.splice(j, 1); G.team.push(m); await say(`${m.sp} ist jetzt in deinem Team!`); }
    } else break;
  }
}

// ================= Menü =================
async function mainMenu() {
  while (true) {
    const opts = ['Team', 'Beutel', 'Monsterdex', 'Trainerpass', 'Speichern', 'Schließen'];
    if (G.online) opts.splice(0, 0, '🌐 Online');
    if (G.bag.Karte) opts.splice(G.online ? 3 : 2, 0, 'Karte');
    let i = await choose(opts, {title: 'Menü'});
    if (G.online) { if (i === 0) { await onlineMenu(); continue; } i--; }
    if (G.bag.Karte) { if (i === 2) { await openWorldMap(); continue; } if (i > 2) i--; }
    if (i === 0) await teamMenu();
    else if (i === 1) { if ((await bagMenu(false)) === 'closeMenu') break; }
    else if (i === 2) await dexView();
    else if (i === 3) await trainerCard();
    else if (i === 4) { save(); await say(G.online ? 'Spiel gespeichert!\n(Auf dem Server – du kannst auf jedem Gerät weiterspielen.)' : cloudDoc ? 'Spiel gespeichert!\n(Auch online in deinem Konto – so geht nichts verloren.)' : 'Spiel gespeichert!'); }
    else break;
  }
}
function summaryHtml(m) {
  const sp = SPECIES[m.sp];
  const nextExp = m.level < 100 ? expFor(m.level + 1) - m.exp : 0;
  const bar = (v) => `<span class="statbar"><i style="width:${Math.min(100, v / 1.6)}%"></i></span>`;
  const extraRows = (m.extra || []).map(n => { const a = TP_MOVES[n]; return `<tr><td><b>${a.anzeige}</b> <span class="small">(TP)</span></td><td>${badge(a.typ)}</td><td>${a.staerke || '–'}</td><td class="small">${a.effekt}</td></tr>`; }).join('');
  const mv = sp.attacken.map(a => { const ok = moveLevel(a, sp) <= m.level; return `<tr style="${ok ? '' : 'opacity:.45'}"><td><b>${a.anzeige}</b></td><td>${badge(a.typ)}</td><td>${a.staerke || '–'}</td><td class="small">${ok ? a.effekt : 'ab Lv ' + moveLevel(a, sp)}</td></tr>`; }).join('');
  const evo = sp.entwicktSichZu ? `Entwickelt sich ab Lv ${sp.entwicklungLevel} zu <b>${sp.entwicktSichZu}</b>.` : 'Letzte Entwicklungsstufe.';
  return `<div style="display:flex;gap:1em;align-items:flex-start"><div style="text-align:center">${spriteImg(m.sp, 6, m.shiny)}<div class="small">${sp.kategorie && sp.kategorie !== 'Normal' ? sp.kategorie : ''}</div></div>
  <div style="flex:1"><h2>${m.sp} <span class="small">Lv ${m.level}</span> ${badges(sp.typen)} ${statusTag(m)}</h2>${m.status && m.hp > 0 ? `<div class="small" style="color:${STATUS[m.status].col}">Status: ${STATUS[m.status].name}${m.poisonDeadline != null ? ` – noch ${fmtTime(m.poisonDeadline - (G.pclock || 0))} bis zur Heilstation!` : ''}</div>` : ''}<div class="small">${sp.beschreibung} ${sp.persoenlichkeitLebensraum}</div>
  <table style="margin-top:.4em"><tr><td>KP</td><td>${m.hp}/${m.maxhp}</td><td>${bar(sp.kp)}</td></tr><tr><td>Angriff</td><td>${m.atk}</td><td>${bar(sp.angriff)}</td></tr><tr><td>Verteidigung</td><td>${m.def}</td><td>${bar(sp.verteidigung)}</td></tr><tr><td>Tempo</td><td>${m.spd}</td><td>${bar(sp.tempo)}</td></tr></table>
  <div class="small" style="margin:.3em 0">EP bis Level ${m.level + 1}: ${nextExp} · ${evo}</div></div></div>
  <table>${mv}${extraRows}</table>`;
}
async function teamMenu() {
  if (!G.team.length) { await say('Du hast noch keine Monster.'); return; }
  while (true) {
    const i = await choose(G.team.map(m => ({label: monLabel(m, m.hp <= 0 ? ' · besiegt' : '')})), {title: 'Dein Team'});
    if (i < 0) return;
    const m = G.team[i];
    const j = await choose(['Werte ansehen', 'Position tauschen', 'Gegenstand geben', 'Zurück'], {title: m.sp});
    if (j === 0) { showPanel(summaryHtml(m), true); await waitKey(); hidePanel(); }
    else if (j === 1) {
      const k = await choose(G.team.map(t => ({label: monLabel(t)})), {title: `${m.sp} tauschen mit …`});
      if (k >= 0 && k !== i) { [G.team[i], G.team[k]] = [G.team[k], G.team[i]]; }
    } else if (j === 2) await useItemOn(m);
  }
}
async function useItemOn(m) {
  const names = ['Heiltrank', 'Supertrank', 'Hypertrank', 'Top-Trank', 'Beleber', 'Top-Beleber', 'Gegengift', 'Para-Heiler', 'Brandsalbe', 'Aufwecker', 'Eisheiler', 'Hyperheiler', 'Sonderbonbon', 'Protein', 'Eisen', 'Carbon', 'KP-Plus'].filter(n => G.bag[n] > 0);
  if (!names.length) { await say('Du hast keine passenden Gegenstände.'); return false; }
  const j = await choose(names.map(n => `${n} ×${G.bag[n]}`), {title: 'Welcher Gegenstand?'});
  if (j < 0) return false;
  return applyItem(names[j], m);
}
async function applyItem(it, m) {
  if (ITEMS[it].xstat) { const st = ITEMS[it].xstat; G.bag[it]--; addBuff(B.sideMe, {stat: st, mult: 1.3, turns: 5}); await statFx(true, true, st); await say(`${nameMe(B.me)}s ${st} steigt stark an!`); return true; }
  if (ITEMS[it].vit) {
    const k = ITEMS[it].vit; m.bonus = m.bonus || {};
    if ((m.bonus[k] || 0) >= 25) { await say(`${m.sp} kann davon nichts mehr aufnehmen.`); return false; }
    const oldMax = m.maxhp; m.bonus[k] = (m.bonus[k] || 0) + 5; calcStats(m); if (m.hp > 0) m.hp += m.maxhp - oldMax; G.bag[it]--;
    await say(`${m.sp} nimmt ${it}.\n${{atk: 'Der Angriff', def: 'Die Verteidigung', spd: 'Das Tempo', kp: 'Die KP'}[k]} steigt dauerhaft!`); return true;
  }
  if (ITEMS[it].cure) {
    if (m.hp <= 0) { await say(`${m.sp} ist besiegt. Dafür brauchst du einen Beleber.`); return false; }
    if (!m.status || !ITEMS[it].cure.includes(m.status)) { await say('Das hätte keine Wirkung.'); return false; }
    const was = STATUS[m.status].name; cureStatus(m); G.bag[it]--; if (B) { if (B.me === m) anim($('meMon'), 'flash'); refreshBattle(); }
    await say(`${nameMe(m)} ist nicht mehr ${was}!`); return true;
  }
  if (it === 'Beleber' || it === 'Top-Beleber') {
    if (m.hp > 0) { await say('Das hätte keine Wirkung.'); return false; }
    m.hp = it === 'Top-Beleber' ? m.maxhp : Math.floor(m.maxhp / 2); G.bag[it]--; if (B) refreshBattle(); await say(`${m.sp} ist wieder bei Kräften!`); return true;
  }
  if (it === 'Sonderbonbon') {
    if (m.level >= 100) { await say('Das hätte keine Wirkung.'); return false; }
    G.bag[it]--; await say(`${m.sp} isst das Sonderbonbon. Lecker!`);
    m.exp = Math.max(m.exp, expFor(m.level + 1)); await checkLevel(m);
    if (m.evo && !B && m.hp > 0) await evolve(m);
    return true;
  }
  if (m.hp <= 0) { await say(`${m.sp} ist besiegt. Dafür brauchst du einen Beleber.`); return false; }
  if (m.hp >= m.maxhp) { await say('Das hätte keine Wirkung.'); return false; }
  const amt = ITEMS[it].heal || 40; const before = m.hp; m.hp = Math.min(m.maxhp, m.hp + amt); G.bag[it]--;
  if (B) refreshBattle();
  await say(`${m.sp} wurde um ${m.hp - before} KP geheilt.`); return true;
}
async function bagMenu(inBattle) {
  const names = ITEM_ORDER.filter(k => G.bag[k] > 0);
  if (!names.length) { await say('Dein Beutel ist leer.'); return null; }
  const i = await choose(names.map(n => `<span style="flex:1">${n}</span> <span class="small">×${G.bag[n]}</span>`), {title: 'Beutel', onSel: i => showText(ITEMS[names[i]].desc)});
  hideText();
  if (i < 0) return null;
  const it = names[i];
  if (isBall(it)) { if (inBattle) return {item: it}; await say('Kapseln kannst du nur im Kampf gegen wilde Monster werfen.'); return null; }
  if (ITEMS[it].tp) { if (inBattle) { await say('TPs kannst du im Kampf nicht benutzen.'); return null; } await teachTP(it); return null; }
  if (it === 'Karte') { if (inBattle) { await say('Nicht im Kampf!'); return null; } hideText(); await openWorldMap(); return null; }
  if (it === 'Turbo-Treter') { if (inBattle) { await say('Nicht im Kampf!'); return null; } toggleTurbo(); await say(G.turboOn ? 'Turbo an! 👟 Du rennst jetzt.' : 'Turbo aus. Du gehst wieder normal.'); return null; }
  if (it === 'Fahrrad') { if (inBattle) { await say('Nicht im Kampf!'); return null; } hidePanel(); toggleBike(); return 'closeMenu'; }
  if (ITEMS[it].xstat) { if (!inBattle) { await say('X-Items kannst du nur im Kampf benutzen.'); return null; } return {item: it}; }
  if (it === 'Superschutz') { if (inBattle) { await say('Das kannst du im Kampf nicht benutzen.'); return null; } G.bag[it]--; G.repel = 250; G.lure = 0; await say('{name} sprüht den Superschutz.\nWilde Monster bleiben jetzt lange fern!'); return null; }
  if (ITEMS[it].vit && inBattle) { await say('Das kannst du im Kampf nicht benutzen.'); return null; }
  if (ITEMS[it].key) { await say(ITEMS[it].desc); return null; }
  if (it === 'Lockduft') { if (inBattle) { await say('Das kannst du im Kampf nicht benutzen.'); return null; } G.bag[it]--; G.lure = 120; G.repel = 0; await say('{name} versprüht den Lockduft.\nWilde Monster werden jetzt angelockt!'); return null; }
  if (it === 'Schutzspray' || it === 'Fluchtseil') {
    if (inBattle) { await say('Das kannst du im Kampf nicht benutzen.'); return null; }
    if (it === 'Schutzspray') { G.bag[it]--; G.repel = 120; G.lure = 0; await say('{name} sprüht das Schutzspray.\nWilde Monster bleiben jetzt eine Weile fern!'); return null; }
    if (!map.cave || !G.ropeTo) { await say('Das Fluchtseil funktioniert nur in Höhlen.'); return null; }
    G.bag[it]--; await say('{name} klettert am Fluchtseil hinaus!');
    hidePanel(); await fade(true); const r = G.ropeTo; enterMap(r.map, r.x, r.y, r.dir); await fade(false);
    return 'closeMenu';
  }
  if (it === 'Sonderbonbon' && inBattle) { await say('Das kannst du im Kampf nicht benutzen.'); return null; }
  const k = await choose(G.team.map(m => ({label: monLabel(m)})), {title: `${it} geben an …`});
  if (k < 0) return null;
  if (inBattle) return {item: it, target: G.team[k]};
  await applyItem(it, G.team[k]); return null;
}
async function dexView() {
  const list = DATA.monster.map(m => {
    const c = G.caught[m.name], s = G.seen[m.name];
    return `<div style="display:flex;align-items:center;gap:.5em;padding:.15em 0;border-bottom:1px solid #eee">${s ? spriteImg(m.name, 2) : '<span style="display:inline-block;width:2em;text-align:center">?</span>'}<span class="small">${m.id}</span> <b>${s ? m.name : '???'}</b> ${s ? badges(m.typen) : ''} ${c ? '<span title="gefangen">●</span>' : ''}</div>`;
  }).join('');
  showPanel(`<h2>Monsterdex · ${Object.keys(G.seen).length}/${DATA.monster.length} gesehen · ${Object.keys(G.caught).length} gefangen</h2><div class="small">▲▼ zum Blättern</div><div style="columns:2">${list}</div>`, true);
  await waitKey(); hidePanel();
}
async function trainerCard() {
  const all = {Steinorden: '🪨', Funkenorden: '⚡', Nebelorden: '🌫️', Frostorden: '❄️', Glutorden: '🔥', Stahlorden: '⚙️', Wellenorden: '🌊', Blütenorden: '🌸', Klangorden: '🎵', Windorden: '🌪️'};
  const b = Object.keys(all).map(n => `<div style="text-align:center;opacity:${G.badges.includes(n) ? 1 : .25}"><div style="font-size:2.2em">${all[n]}</div><div class="small">${n}</div></div>`).join('');
  showPanel(`<h2>Trainerpass</h2><table><tr><td>Name</td><td><b>${G.name}</b></td></tr><tr><td>Coins</td><td>${fmtC(G.money)} 🪙 <span class="small">(max. ${fmtC(MAX_MONEY)})</span></td></tr>${(G.titles || []).length ? `<tr><td>Titel</td><td>${G.titles.join(' · ')}</td></tr>` : ''}<tr><td>Schillernde</td><td>${[...G.team, ...G.box].filter(m => m.shiny).length} ✨</td></tr><tr><td>Monsterdex</td><td>${Object.keys(G.caught).length} gefangen</td></tr><tr><td>Spielzeit</td><td>${Math.floor(G.time / 60)} Min.</td></tr></table><h2 style="margin-top:.6em">Orden (${G.badges.length}/10)${G.flags.champion ? ' · 🏆 Champion' : ''}</h2><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.6em">${b}</div>`, true);
  await waitKey(); hidePanel();
}

// ================= Rivale & Legendäre =================
const LINES = {Zirkelu: ['Zirkelu', 'Brennaro', 'Vulkaron'], Plitscho: ['Plitscho', 'Rinnavo', 'Strömara'], Moosli: ['Moosli', 'Rankuro', 'Hainwacht']};
const COUNTER = {Zirkelu: 'Plitscho', Plitscho: 'Moosli', Moosli: 'Zirkelu'};
function rivalLine() { return LINES[COUNTER[G.flags.starter] || 'Plitscho']; }
async function rivalLab() {
  const rl = rivalLine(), n = NPCS.lab.find(x => x.id === 'rival_lab');
  n.dir = 'left';
  await say(`Lenny: „Dann nehme ich ${rl[0]}!\nDas ist genau das richtige gegen dein ${G.flags.starter}!“`);
  await say('Lenny: „Komm, {name}! Lass uns gleich testen, wer der bessere Trainer ist!“');
  await battle({look: LOOK.rival, trainer: {name: 'Rivale Lenny', team: [[rl[0], 5]], reward: 100, lose: 'Waaas? Ich hab verloren?!\nNa warte, beim nächsten Mal!', win: 'Ha! Ich wusste, dass ich gewinne!'}, noWhiteout: true});
  healAll(); G.flags.rival1 = 1;
  await say('Prof. Sternberg: „Was für ein spannender Kampf!\nIch habe eure Monster wieder geheilt.“');
  await say('Lenny: „Ich zieh schon mal los. Wir sehen uns, {name}!“');
}
const RIVAL_EVENTS = {
  route2: {id: 'rival_r2', flag: 'rival2', reward: 600, team: l => [['Lufti', 11], ['Kieselix', 11], [l[0], 13]],
    intro: 'He, {name}! Warte mal!\nIch hab auch den Steinorden. Zeig mal, wie stark du geworden bist!', lose: 'Mist! Du bist echt gut geworden …', win: 'Siehst du? Ich bin einfach besser!', bye: 'Lenny: „Ich geh schon mal vor nach Funkenhafen. Bis dann!“'},
  stadt3: {id: 'rival_s3', flag: 'rival3', reward: 1500, team: l => [['Brisaro', 20], ['Schollram', 21], ['Metalli', 20], [l[1], 23]],
    intro: 'Da bist du ja, {name}!\nIch war schon tief in der Glimmerhöhle. Dachtest du, ich trainiere nicht?', lose: 'Schon wieder verloren … Unglaublich!', win: 'Jawoll! Training zahlt sich aus!', bye: 'Lenny: „Selene ist echt stark. Viel Glück … aber nicht zu viel!“'},
  stadt6: {id: 'rival_s6', flag: 'rival5', reward: 5000, team: l => [['Sturmarik', 38], ['Schollram', 39], ['Ferron', 38], ['Resonox', 39], [l[2], 42]],
    intro: '{name}! Willkommen in Lumora!\nMein Starter hat sich komplett entwickelt. Und deiner?', lose: 'Wie machst du das nur?!', win: 'Ha! Diesmal war ich besser!', bye: 'Lenny: „Ich geh ins Casino. Äh … zum Trainieren natürlich!“'},
  stadt4: {id: 'rival_s4', flag: 'rival4', reward: 3000, team: l => [['Brisaro', 28], ['Schollram', 29], ['Ferron', 28], ['Resonox', 28], [l[1], 31]],
    intro: '{name}! Bevor du zu Frida gehst, kämpfst du gegen mich!\nDiesmal gewinne ich ganz sicher!', lose: 'Okay … du bist wirklich der Stärkere. Noch.', win: 'Endlich! Ich hab dich geschlagen!', bye: 'Lenny: „Wir sehen uns auf der Siegesstraße, {name}!“'}
};
async function mapEvents() {
  const ev = RIVAL_EVENTS[map.id];
  if (ev && G.flags.starter && alive().length && !G.flags[ev.flag]) await rivalEvent(ev);
}
async function rivalEvent(ev) {
  const n = NPCS[map.id].find(x => x.id === ev.id);
  const [dx, dy] = DIRS[G.dir];
  const free = (x, y) => { const t = tileAt(x, y); return t !== null && !SOLID.has(t) && !npcAt(x, y); };
  let px = G.x + dx * 2, py = G.y + dy * 2;
  if (!free(px, py) || !free(G.x + dx, G.y + dy)) { px = G.x + dx; py = G.y + dy; }
  if (!free(px, py)) return;
  n.x = px; n.y = py; n.dir = {up: 'down', down: 'up', left: 'right', right: 'left'}[G.dir];
  G.flags.rivalShow = ev.id;
  exclaim = {x: G.x, y: G.y}; await sleep(500); exclaim = null;
  await say('Lenny: „' + ev.intro + '“');
  const res = await battle({look: LOOK.rival, trainer: {name: 'Rivale Lenny', team: ev.team(rivalLine()), reward: ev.reward, lose: ev.lose, win: ev.win}});
  G.flags[ev.flag] = 1;
  if (res === 'win') await say(ev.bye);
  G.flags.rivalShow = null;
}
async function legendEncounter(n) {
  await say(`Ein uraltes, mächtiges Wesen ruht hier …\nEs ist ${n.legend}!`);
  if (!(await yesNo(`Willst du ${n.legend} herausfordern? (Lv ${n.level})`))) return;
  if (!G.bag.Legendenkapsel) await say('Achtung: Du hast keine Legendenkapsel dabei!\nNormale Kapseln wirken bei legendären Monstern nicht.');
  await say(`${n.legend} erhebt sich!`);
  const lm = wildMon(n.legend, n.level);
  if (LEG_SHINY[n.legend] && Math.random() < 1 / 20) lm.shiny = true;
  const res = await battle({wild: lm, legendId: n.id});
  if (res === 'run' || res === 'win') await say(`${n.legend} zieht sich in die Schatten zurück …\nEs wird hierher zurückkehren.`);
}

// ================= Trainerkämpfe =================
async function trainerEncounter(n) {
  exclaim = {x: n.x, y: n.y, t: 40};
  await sleep(550); exclaim = null;
  await say(`${n.trainer.name}:\n${n.trainer.intro}`);
  if (n.trainer.champion) n.trainer.team = [['Sonorak', 61], ['Titanor', 61], ['Dravulkan', 61], ['Glazaro', 61], ['Geotitan', 62], [rivalLine()[2], 64]];
  if (n.trainer.rematch) n.trainer.reward = G.flags['beat_' + n.id] ? 0 : n.trainer.baseReward;
  const res = await battle({trainer: n.trainer, look: n.look});
  if (res === 'win' && n.trainer.champTitle && !G.flags['beat_' + n.id]) { G.titles = G.titles || []; G.titles.push(n.trainer.champTitle); G.flags['beat_' + n.id] = 1; await say(`{name} erhält den Ehrentitel „${n.trainer.champTitle}“!`); save(true); return; }
  if (res === 'lose' && n.trainer.league) ['e1', 'e2', 'e3', 'e4', 'champ'].forEach(k => delete G.flags['beat_' + k]);
  if (res === 'win' && n.trainer.champion) { await hallOfFame(); return; }
  if (res === 'win') {
    G.flags['beat_' + n.id] = 1;
    if (n.trainer.league) await say('Die Tür hinter dem Meister hat sich geöffnet!');
    if (n.trainer.badge) {
      G.badges.push(n.trainer.badge);
      await say(`{name} erhält den ${n.trainer.badge}!`);
      G.bag.Heiltrank = (G.bag.Heiltrank || 0) + 3; G.bag.Fangkapsel = (G.bag.Fangkapsel || 0) + 5;
      await say(`Als Belohnung gibt es noch 3 Heiltränke und 5 Fangkapseln!`);
      if (n.trainer.extra) await n.trainer.extra();
      await say(n.trainer.after);
      save(true);
    } else if (n.trainer.extra) { await n.trainer.extra(); save(true); }
  }
}

// ================= Kampf-Animationen =================
const TYPE_ICON = {Glut: '🔥', Flut: '💧', Wuchs: '🍃', Funke: '⚡', Stein: '🪨', Frost: '❄️', Klang: '🎵', Nebel: '🌫️', Metall: '⚙️', Wind: '🌪️', Geist: '👻'};
const BALL_COL = {Fangkapsel: '#e74c3c', Superkapsel: '#3d8be0', Hyperkapsel: '#f1c40f', Legendenkapsel: '#8e44ad', Safari: '#43a047'};
const POS = {me: {x: 24, y: 43, ground: 64}, foe: {x: 75, y: 18, ground: 27}};
function play(el, frames, opts) {
  if (!el.animate) { const l = frames[frames.length - 1]; for (const k in l) if (k !== 'offset') el.style[k] = l[k]; return Promise.resolve(); }
  const a = el.animate(frames, Object.assign({duration: 400, easing: 'ease', fill: 'forwards'}, typeof opts === 'number' ? {duration: opts} : opts));
  return a.finished.then(() => { try { a.commitStyles(); } catch (e) {} a.cancel(); }).catch(() => {});
}
function drawAvatar(canvas, look, dir) { const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 18, 18); drawPerson(c, 1, 3, dir, look || LOOK.ace, 0); }
function setBall(col) { const b = $('ball'); b.style.background = `radial-gradient(circle at 50% 50%, #fff 0 13%, #1d1f2a 14% 22%, transparent 23%), linear-gradient(to bottom, ${col} 0 44%, #1d1f2a 44% 56%, #f4f4f4 56%)`; b.style.filter = ''; }
function arcFrames(from, to, peak, spin) {
  const fr = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; const x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t - peak * 4 * t * (1 - t); fr.push({left: x + '%', top: y + '%', transform: `translate(-50%,-50%) rotate(${spin * t}deg)`, offset: t}); }
  return fr;
}
async function throwBall(from, to, col, peak, dur) { const b = $('ball'); setBall(col); b.style.display = 'block'; b.style.opacity = 1; await play(b, arcFrames(from, to, peak == null ? 24 : peak, 900), {duration: dur || 620, easing: 'linear'}); }
function hideBall() { $('ball').style.display = 'none'; }
function burst(x, y, col, n, spread, size) {
  const fx = $('fx');
  for (let i = 0; i < (n || 12); i++) {
    const d = document.createElement('div'); d.className = 'ptc';
    const s = (size || 1.1) * (0.6 + Math.random() * 0.8);
    d.style.cssText = `left:${x}%;top:${y}%;width:${s}em;height:${s}em;background:${col};box-shadow:0 0 .5em ${col}`;
    fx.appendChild(d);
    const ang = Math.random() * Math.PI * 2, dist = (spread || 6) * (0.5 + Math.random());
    play(d, [{transform: 'translate(-50%,-50%) scale(1)', opacity: 1}, {transform: `translate(calc(-50% + ${Math.cos(ang) * dist}em), calc(-50% + ${Math.sin(ang) * dist}em)) scale(.2)`, opacity: 0}], {duration: 500 + Math.random() * 300, easing: 'ease-out'}).then(() => d.remove());
  }
}
function rise(x, y, col, n) {
  const fx = $('fx');
  for (let i = 0; i < (n || 10); i++) {
    const d = document.createElement('div'); d.className = 'ptc';
    d.style.cssText = `left:${x + (Math.random() - 0.5) * 16}%;top:${y + 8}%;width:.6em;height:.6em;background:${col};box-shadow:0 0 .5em ${col}`;
    fx.appendChild(d);
    play(d, [{transform: 'translate(-50%,0)', opacity: 0}, {opacity: 1, offset: .2}, {transform: 'translate(-50%,-6em)', opacity: 0}], {duration: 700 + Math.random() * 400, delay: Math.random() * 250}).then(() => d.remove());
  }
}
function floatText(x, y, txt, col) {
  const d = document.createElement('div'); d.className = 'ftxt'; d.textContent = txt; d.style.cssText = `left:${x}%;top:${y}%;color:${col}`;
  $('fx').appendChild(d);
  play(d, [{transform: 'translate(-50%,-50%) scale(.6)', opacity: 0}, {transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: .25}, {transform: 'translate(-50%,-220%) scale(1)', opacity: 0}], 1100).then(() => d.remove());
}
async function popIn(el, pos) {
  el.style.opacity = 1;
  burst(pos.x, pos.y, '#ffffff', 14, 5, 0.9);
  await play(el, [{transform: 'scale(0)', filter: 'brightness(6)'}, {transform: 'scale(1.18)', filter: 'brightness(2.5)', offset: .6}, {transform: 'scale(1)', filter: 'brightness(1)'}], 480);
}
async function recallAnim(el) {
  await play(el, [{transform: 'scale(1)', filter: 'none', opacity: 1}, {transform: 'scale(1)', filter: 'brightness(1.6) sepia(1) saturate(7) hue-rotate(-40deg)', opacity: 1, offset: .4}, {transform: 'scale(.05)', filter: 'brightness(2) sepia(1) saturate(7) hue-rotate(-40deg)', opacity: 0}], 450);
}
async function faintAnim(el) { await play(el, [{transform: 'translateY(0)', opacity: 1}, {transform: 'translateY(45%)', opacity: 0}], {duration: 520, easing: 'ease-in'}); el.style.transform = ''; el.style.opacity = 0; }
function shakeScreen(strong) { play($('battle'), [{transform: 'translate(0,0)'}, {transform: `translate(${strong ? -2 : -1}%,1%)`}, {transform: `translate(${strong ? 2 : 1}%,-1%)`}, {transform: `translate(${strong ? -1.5 : -.5}%,0)`}, {transform: 'translate(0,0)'}], 320); }
async function blink(el) { await play(el, [{opacity: 1}, {opacity: .15}, {opacity: 1}, {opacity: .15}, {opacity: 1}], 420); }
// ================= Attacken-Animationen (Canvas) =================
// Jede Attacke bekommt ihre eigene Animation: Typ bestimmt die Partikel (Flammen, Tropfen, Blätter …),
// der Name bestimmt die Bewegung (Stoß, Hieb, Welle, Wirbel, Blitz …), und ein Hash des Namens variiert Details.
const FXT = {
  Glut: {main: 'flame', sub: 'ember', c1: '#ffe066', c2: '#ff5a1f', glow: 1},
  Flut: {main: 'drop', sub: 'bubble', c1: '#d6f0ff', c2: '#2f7fe0'},
  Wuchs: {main: 'leaf', sub: 'leaf', c1: '#b8f27a', c2: '#2e9a3a'},
  Funke: {main: 'spark', sub: 'spark', c1: '#fffbd0', c2: '#ffcc00', glow: 1},
  Stein: {main: 'rock', sub: 'dust', c1: '#d7c2a3', c2: '#7d5f43'},
  Frost: {main: 'shard', sub: 'flake', c1: '#ffffff', c2: '#6fd3f0', glow: 1},
  Klang: {main: 'note', sub: 'ring', c1: '#ffd1fb', c2: '#c04fc0'},
  Nebel: {main: 'puff', sub: 'bubble', c1: '#d9c8ff', c2: '#7a5cc0'},
  Metall: {main: 'steel', sub: 'spark', c1: '#ffffff', c2: '#8c99a6', glow: 1},
  Wind: {main: 'slice', sub: 'puff', c1: '#f0fff6', c2: '#5fbf86'},
  Geist: {main: 'wisp', sub: 'wisp', c1: '#b49cff', c2: '#3b2477'}
};
const FX_PATTERNS = [
  ['field', ['feld', 'schmelze', 'gedächtnis', 'stillstand', 'faltung', 'akkord', 'chor', 'zenit', 'abgrund', 'ursprung', 'welten', 'erwachen', 'finsternis', 'verrückung', 'harmonie', 'blüte', 'brand']],
  ['bite', ['biss']],
  ['bind', ['griff', 'faden', 'zug', 'ranke', 'netz', 'fessel']],
  ['lightning', ['blitz', 'kette', 'zacke', 'ladung', 'spannung', 'donner', 'volt']],
  ['rain', ['regen', 'hagel', 'sturz']],
  ['beam', ['strahl', 'puls', 'fokus', 'kern', 'kegel', 'hauch']],
  ['rings', ['klang', 'hall', 'ruf', 'echo', 'resonanz', 'ton']],
  ['wave', ['welle', 'woge', 'flut', 'front', 'gezeiten', 'schwall']],
  ['vortex', ['wirbel', 'sturm', 'kreis', 'ring', 'rinne', 'strudel', 'sog', 'spirale', 'feger', 'walze']],
  ['fan', ['fächer']],
  ['arc', ['bogen', 'wurf']],
  ['volley', ['stich', 'nadel', 'splitter', 'tupfer', 'stachel', 'spitze']],
  ['slash', ['hieb', 'schnitt', 'klinge', 'sichel', 'kante', 'ritze', 'grat', 'riss', 'schere']],
  ['impact', ['stoß', 'schub', 'prall', 'druck', 'wucht', 'schlag', 'tritt', 'sprung', 'lauf', 'schritt', 'bruch', 'kamm', 'takt', 'ramme']]
];
const FX_SHIELD = ['schild', 'wall', 'mantel', 'haut', 'panzer', 'hülle', 'kleid', 'schirm', 'schutz', 'haltung', 'wand', 'hut'];
function fxHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function fxRng(seed) { let a = seed || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fxPattern(move) {
  const l = (move.anzeige || move.name || '').toLowerCase();
  if (move.staerke >= 120) return 'field';
  for (const [p, ws] of FX_PATTERNS) if (ws.some(w => l.includes(w))) return p;
  return 'proj';
}
function fxEnv() {
  const c = $('fxc'); if (!c) return null;
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  return {c, ctx: c.getContext('2d'), W, H, u: W / 100};
}
const fxP = (env, p) => ({x: p.x / 100 * env.W, y: p.y / 100 * env.H});
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

// ---- Partikel-Zeichner ----
function fxTok(ctx, kind, x, y, s, rot, a, th, seed) {
  if (a <= 0 || s <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.globalAlpha = Math.min(1, a);
  const c1 = th.c1, c2 = th.c2;
  switch (kind) {
    case 'flame': case 'ember': {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s); g.addColorStop(0, '#fffbe0'); g.addColorStop(.35, c1); g.addColorStop(.7, hexA(c2, .8)); g.addColorStop(1, hexA(c2, 0));
      ctx.fillStyle = g; ctx.beginPath(); if (kind === 'flame') { ctx.moveTo(0, -s * 1.5); ctx.quadraticCurveTo(s, -s * .2, 0, s); ctx.quadraticCurveTo(-s, -s * .2, 0, -s * 1.5); } else ctx.arc(0, 0, s * .6, 0, 7); ctx.fill(); break; }
    case 'drop': {
      const g = ctx.createLinearGradient(-s, -s, s, s); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.quadraticCurveTo(s, 0, 0, s); ctx.quadraticCurveTo(-s, 0, 0, -s * 1.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(-s * .3, -s * .1, s * .2, 0, 7); ctx.fill(); break; }
    case 'bubble': ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1, s * .18); ctx.beginPath(); ctx.arc(0, 0, s * .7, 0, 7); ctx.stroke(); ctx.fillStyle = hexA(c2, .25); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s * .25, -s * .25, s * .15, 0, 7); ctx.fill(); break;
    case 'leaf': {
      ctx.fillStyle = (seed & 1) ? c2 : '#5fbf3a'; ctx.beginPath(); ctx.ellipse(0, 0, s, s * .45, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1, s * .12); ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke(); break; }
    case 'spark': {
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = c1; ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, s * .25);
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .25 : s; ctx.lineTo(Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r); } ctx.closePath(); ctx.fill(); break; }
    case 'rock': case 'dust': {
      if (kind === 'dust') { ctx.fillStyle = hexA(c1, .55); ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); break; }
      const r = fxRng(seed + 7); ctx.fillStyle = c2; ctx.strokeStyle = '#3e2c1c'; ctx.lineWidth = Math.max(1, s * .15);
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const rr = s * (.7 + r() * .45); ctx.lineTo(Math.cos(i * 1.047) * rr, Math.sin(i * 1.047) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA(c1, .7); ctx.beginPath(); ctx.arc(-s * .25, -s * .25, s * .25, 0, 7); ctx.fill(); break; }
    case 'shard': {
      ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(0, -s * 1.4, 0, s * 1.4); g.addColorStop(0, '#fff'); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.lineTo(s * .45, 0); ctx.lineTo(0, s * 1.5); ctx.lineTo(-s * .45, 0); ctx.closePath(); ctx.fill(); break; }
    case 'flake': ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, s * .15); ctx.beginPath(); for (let i = 0; i < 3; i++) { const an = i * Math.PI / 3; ctx.moveTo(Math.cos(an) * s, Math.sin(an) * s); ctx.lineTo(-Math.cos(an) * s, -Math.sin(an) * s); } ctx.stroke(); break;
    case 'note': ctx.fillStyle = (seed & 1) ? c2 : '#ff7ad9'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, s * .12); ctx.font = `bold ${s * 2.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText((seed & 2) ? '♫' : '♪', 0, 0); ctx.fillText((seed & 2) ? '♫' : '♪', 0, 0); break;
    case 'ring': ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, s * .2); ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.stroke(); break;
    case 'puff': { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.4); g.addColorStop(0, hexA(c1, .9)); g.addColorStop(.6, hexA(c2, .45)); g.addColorStop(1, hexA(c2, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 1.4, 0, 7); ctx.fill(); break; }
    case 'steel': { const g = ctx.createLinearGradient(-s, 0, s, 0); g.addColorStop(0, '#5d6873'); g.addColorStop(.5, '#ffffff'); g.addColorStop(1, '#8c99a6'); ctx.fillStyle = g; ctx.strokeStyle = '#3b4350'; ctx.lineWidth = Math.max(1, s * .12); ctx.beginPath(); ctx.moveTo(-s * 1.3, 0); ctx.lineTo(0, -s * .45); ctx.lineTo(s * 1.3, 0); ctx.lineTo(0, s * .45); ctx.closePath(); ctx.fill(); ctx.stroke(); break; }
    case 'slice': ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1, s * .3); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, s, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = hexA(c2, .7); ctx.lineWidth = Math.max(1, s * .14); ctx.beginPath(); ctx.arc(-s * .25, 0, s * .8, -1, 1); ctx.stroke(); break;
    case 'wisp': { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.2); g.addColorStop(0, c1); g.addColorStop(.5, hexA(c2, .8)); g.addColorStop(1, hexA(c2, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -s * 1.8); ctx.quadraticCurveTo(s * 1.1, -s * .2, 0, s * 1.1); ctx.quadraticCurveTo(-s * 1.1, -s * .2, 0, -s * 1.8); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-s * .35, -s * .2, s * .2, s * .3); ctx.fillRect(s * .15, -s * .2, s * .2, s * .3); break; }
  }
  ctx.restore();
}

// ---- Ablauf-Engine ----
function fxRun(build) {
  const env = fxEnv(); if (!env) return Promise.resolve();
  const parts = [], layers = [], evs = [];
  const api = {
    env, parts,
    layer: (at, dur, draw) => layers.push({at, dur, draw}),
    at: (t, fn) => evs.push({t, fn}),
    part: o => parts.push(Object.assign({vx: 0, vy: 0, g: 0, drag: 1, rot: 0, vr: 0, life: 600, age: 0, s: 1, fade: 1, grow: 0}, o)),
  };
  build(api);
  const total = Math.max(0, ...layers.map(l => l.at + l.dur), ...evs.map(e => e.t));
  const gen = fxRun.gen = (fxRun.gen || 0) + 1;
  return new Promise(res => {
    const t0 = performance.now(); let last = t0, resolved = false;
    const frame = now => {
      if (gen !== fxRun.gen) { if (!resolved) { resolved = true; res(); } return; }
      const t = now - t0, dt = Math.min(50, now - last); last = now;
      const {ctx, W, H} = env; ctx.clearRect(0, 0, W, H);
      for (const e of evs) if (!e.done && t >= e.t) { e.done = 1; e.fn(); }
      for (const l of layers) { const lt = t - l.at; if (lt >= 0 && lt <= l.dur) { ctx.save(); l.draw(ctx, lt / l.dur, lt); ctx.restore(); } }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt; if (p.age >= p.life) { parts.splice(i, 1); continue; }
        if (p.age < 0) continue;
        const k = dt / 16.7; p.vx *= Math.pow(p.drag, k); p.vy *= Math.pow(p.drag, k); p.vy += p.g * k; p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
        const lf = p.age / p.life; const a = p.fade ? 1 - lf * lf : 1; const sz = p.s * (1 + p.grow * lf);
        fxTok(ctx, p.kind, p.x, p.y, sz, p.rot, a, p.th, p.seed);
      }
      if (!resolved && t >= total + 80) { resolved = true; res(); }
      if (t < total + 60 || (parts.length && t < total + 900)) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); if (!resolved) { resolved = true; res(); } }
    };
    requestAnimationFrame(frame);
  });
}
function fxBurst(api, x, y, th, n, speed, size, r, kinds) {
  const u = api.env.u;
  for (let i = 0; i < n; i++) { const an = r() * Math.PI * 2, sp = (0.4 + r() * 0.8) * speed * u * .35; const kind = kinds ? kinds[i % kinds.length] : (i % 3 ? th.main : th.sub);
    api.part({kind, x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - (kind === 'flame' || kind === 'wisp' ? u * .15 : 0), drag: .9, g: kind === 'rock' || kind === 'drop' ? u * .02 : 0, s: size * u * (.6 + r() * .6), rot: r() * 6, vr: (r() - .5) * .3, life: 380 + r() * 380, th, seed: (r() * 1e6) | 0}); }
}
function fxShock(api, at, x, y, th, maxR, w) {
  const u = api.env.u;
  api.layer(at, 380, (ctx, p) => { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(th.c2, 1 - p); ctx.lineWidth = w * u * (1 - p) + 1; ctx.beginPath(); ctx.ellipse(x, y, maxR * u * ease(p), maxR * u * ease(p) * .6, 0, 0, 7); ctx.stroke(); ctx.strokeStyle = hexA(th.c1, (1 - p) * .9); ctx.lineWidth = Math.max(1, w * u * .4 * (1 - p)); ctx.stroke(); });
}
function fxFlash(api, at, col, a, dur) { api.layer(at, dur || 180, (ctx, p) => { ctx.fillStyle = hexA(col, a * (1 - p)); ctx.fillRect(0, 0, api.env.W, api.env.H); }); }
function fxTrail(api, x, y, th, r, k) { const u = api.env.u; api.part({kind: k || th.main, x: x + (r() - .5) * u * 2, y: y + (r() - .5) * u * 2, vx: (r() - .5) * u * .1, vy: (r() - .5) * u * .1 - (th.main === 'flame' ? u * .05 : 0), drag: .92, s: u * (1 + r() * 1.2), rot: r() * 6, vr: (r() - .5) * .2, life: 260 + r() * 200, th, seed: (r() * 1e6) | 0}); }

// ---- Muster ----
function fxBuild(api, pat, A, B, th, r, power, big, isMe) {
  const u = api.env.u, dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const curve = (r() - .5) * 2 * u * 12, sz = (big ? 1.35 : 1) * (0.9 + r() * .4);
  const impact = (t, n) => { api.at(t, () => fxBurst(api, B.x, B.y, th, n || (big ? 26 : 16), big ? 3.2 : 2.4, 2.2 * sz, r)); fxShock(api, t, B.x, B.y, th, big ? 20 : 13, 3); };
  switch (pat) {
    case 'proj': {
      const dur = 380, wob = r() < .5;
      api.layer(0, dur, (ctx, p) => { const e = ease(p); const x = lerp(A.x, B.x, e) + nx * Math.sin(p * Math.PI) * curve + (wob ? Math.sin(p * 18) * u * 1.2 : 0), y = lerp(A.y, B.y, e) + ny * Math.sin(p * Math.PI) * curve;
        fxTok(ctx, th.main, x, y, u * 3.2 * sz * (0.7 + p * .5), p * 8, 1, th, 3); for (let i = 0; i < 2; i++) fxTrail(api, x, y, th, r); });
      impact(dur); break; }
    case 'volley': {
      const n = 3 + Math.floor(r() * 4), gap = 70 + r() * 40;
      for (let i = 0; i < n; i++) { const off = (r() - .5) * u * 10, t0 = i * gap, k = th.main === 'flame' ? 'ember' : th.main;
        api.layer(t0, 220, (ctx, p) => { const x = lerp(A.x, B.x + nx * off, p), y = lerp(A.y, B.y + ny * off, p); ctx.strokeStyle = hexA(th.c1, .6); ctx.lineWidth = u * .5; ctx.beginPath(); ctx.moveTo(lerp(A.x, B.x, Math.max(0, p - .15)), lerp(A.y, B.y, Math.max(0, p - .15))); ctx.lineTo(x, y); ctx.stroke(); fxTok(ctx, k, x, y, u * 2.3 * sz, Math.atan2(dy, dx) + Math.PI / 2, 1, th, i); });
        api.at(t0 + 220, () => fxBurst(api, B.x + nx * off, B.y + ny * off, th, 6, 1.6, 1.4, r)); }
      fxShock(api, n * gap + 150, B.x, B.y, th, 12, 2); break; }
    case 'arc': case 'fan': {
      const n = pat === 'fan' ? 5 : 1 + Math.floor(r() * 2), h = u * (18 + r() * 14);
      for (let i = 0; i < n; i++) { const spread = pat === 'fan' ? (i - (n - 1) / 2) * u * 7 : 0, t0 = pat === 'fan' ? i * 40 : i * 150;
        api.layer(t0, 480, (ctx, p) => { const x = lerp(A.x, B.x, p) + nx * spread * Math.sin(p * Math.PI), y = lerp(A.y, B.y, p) - Math.sin(p * Math.PI) * h + ny * spread * Math.sin(p * Math.PI); fxTok(ctx, th.main, x, y, u * 3.2 * sz, p * 10, 1, th, i); fxTrail(api, x, y, th, r, th.sub); }); }
      impact(pat === 'fan' ? 480 + (n - 1) * 40 : 480 + (n - 1) * 150); break; }
    case 'beam': {
      const dur = 620, wv = 2 + r() * 3;
      api.layer(0, dur, (ctx, p) => { const grow = Math.min(1, p * 3), fade = p > .75 ? 1 - (p - .75) * 4 : 1, ex = lerp(A.x, B.x, grow), ey = lerp(A.y, B.y, grow), w = u * (big ? 4.5 : 3.2) * (0.8 + .2 * Math.sin(p * 40));
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = hexA(th.c2, .55 * fade); ctx.lineWidth = w * 2; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = hexA(th.c1, .9 * fade); ctx.lineWidth = w; ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.lineWidth = w * .35; ctx.stroke();
        for (let i = 0; i < 2; i++) { const q = r() * grow; fxTrail(api, lerp(A.x, B.x, q) + nx * Math.sin(q * wv * 6 + p * 20) * u * 2, lerp(A.y, B.y, q) + ny * Math.sin(q * wv * 6 + p * 20) * u * 2, th, r, th.sub); } });
      api.at(200, () => fxBurst(api, B.x, B.y, th, 10, 1.5, 1.6, r)); impact(560, 18); break; }
    case 'wave': {
      const n = 2 + Math.floor(r() * 2), fx_ = dx / len, fy_ = dy / len, bul = u * (3 + r() * 3);
      for (let i = 0; i < n; i++) api.layer(i * 120, 520, (ctx, p) => { const e = ease(p), cx = lerp(A.x, B.x, e), cy = lerp(A.y, B.y, e), half = u * (8 + p * 7), fade = p > .8 ? (1 - p) * 5 : 1;
        const pts = []; for (let k = -12; k <= 12; k++) { const sN = k / 12, bulge = (1 - sN * sN) * bul + Math.sin(sN * 9 + p * 14) * u * .6; pts.push([cx + nx * sN * half + fx_ * bulge, cy + ny * sN * half + fy_ * bulge]); }
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [w, col] of [[u * 3.2, hexA(th.c2, .45 * fade)], [u * 1.6, hexA(th.c2, .9 * fade)], [u * .6, hexA(th.c1, fade)]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((q, j) => j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); }
        if (r() < .8) { const q = pts[(r() * pts.length) | 0]; fxTrail(api, q[0], q[1], th, r); } });
      impact(520 + (n - 1) * 120, 14); break; }
    case 'vortex': {
      const dur = 700, turns = 2 + r() * 2, dir = r() < .5 ? 1 : -1, cnt = 10 + Math.floor(r() * 8);
      api.layer(0, dur, (ctx, p) => { for (let i = 0; i < cnt; i++) { const an = dir * (p * turns * Math.PI * 2 + i / cnt * Math.PI * 2), rad = u * (16 - 12 * ease(p)) * (0.6 + (i % 3) * .25);
        fxTok(ctx, i % 2 ? th.main : th.sub, B.x + Math.cos(an) * rad, B.y + Math.sin(an) * rad * .55 - (1 - p) * u * 4, u * 2.1 * sz, an, Math.min(1, p * 4), th, i); }
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(th.c1, .4 * (1 - p)); ctx.lineWidth = u * .6; ctx.beginPath(); ctx.ellipse(B.x, B.y, u * 14 * (1 - p * .6), u * 7 * (1 - p * .6), p * 4, 0, 7); ctx.stroke(); });
      impact(dur, 20); break; }
    case 'rain': {
      const n = 8 + Math.floor(r() * 6), big2 = r() < .4;
      for (let i = 0; i < n; i++) { const ox = (r() - .5) * u * 22, t0 = i * 45 + r() * 40;
        api.layer(t0, 300, (ctx, p) => { const x = B.x + ox + (1 - p) * u * 6, y = lerp(-u * 5, B.y + (r() - .5) * u * 2, p * p); fxTok(ctx, th.main, x, y, u * (big2 && i === n - 1 ? 4.5 : 2.6) * sz, th.main === 'shard' || th.main === 'drop' ? 0 : 2.4, 1, th, i); fxTrail(api, x, y, th, r, th.sub); });
        api.at(t0 + 300, () => fxBurst(api, B.x + ox, B.y, th, 4, 1.2, 1.2, r)); }
      impact(n * 45 + 340, 14); break; }
    case 'lightning': {
      const bolts = 2 + Math.floor(r() * 2), fromSky = r() < .6;
      for (let b = 0; b < bolts; b++) { const t0 = b * 140, seed = (r() * 1e6) | 0;
        api.layer(t0, 160, (ctx, p) => { const rr = fxRng(seed + Math.floor(p * 4)), sx = fromSky ? B.x + (rr() - .5) * u * 10 : A.x, sy = fromSky ? 0 : A.y, segs = 9;
          ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
          for (const [w, col] of [[u * 3.6, hexA(th.c2, .5)], [u * 1.6, hexA(th.c1, 1)], [u * .6, '#ffffff']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, sy); for (let i = 1; i < segs; i++) { const q = i / segs; ctx.lineTo(lerp(sx, B.x, q) + (rr() - .5) * u * 7, lerp(sy, B.y, q) + (rr() - .5) * u * 3); } ctx.lineTo(B.x, B.y); ctx.stroke(); } });
        fxFlash(api, t0, '#ffffff', .35, 120); api.at(t0 + 80, () => fxBurst(api, B.x, B.y, th, 8, 2, 1.4, r)); }
      impact(bolts * 140 + 40, 16); break; }
    case 'slash': {
      const n = 2 + Math.floor(r() * 2), ang0 = r() * Math.PI;
      for (let i = 0; i < n; i++) { const t0 = 80 + i * 110, an = ang0 + i * (Math.PI / n) + (r() - .5) * .4, L = u * (14 + r() * 4);
        api.layer(t0, 190, (ctx, p) => { const e = ease(Math.min(1, p * 1.6)), fade = 1 - Math.max(0, p - .5) * 2, cx = B.x, cy = B.y, x1 = cx - Math.cos(an) * L, y1 = cy - Math.sin(an) * L * .8, x2 = cx + Math.cos(an) * L, y2 = cy + Math.sin(an) * L * .8;
          const ex = lerp(x1, x2, e), ey = lerp(y1, y2, e), mx = (x1 + ex) / 2 - Math.sin(an) * u * 4, my = (y1 + ey) / 2 + Math.cos(an) * u * 4;
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          for (const [w, col] of [[u * 3.4, hexA(th.c2, .6 * fade)], [u * 1.5, hexA(th.c1, fade)], [u * .55, `rgba(255,255,255,${fade})`]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); }
          if (p < .6) fxTrail(api, ex, ey, th, r, th.sub); });
        api.at(t0 + 120, () => fxBurst(api, B.x, B.y, th, 6, 1.8, 1.3, r)); }
      fxShock(api, 80 + n * 110, B.x, B.y, th, 12, 2.5); break; }
    case 'bite': {
      const dur = 420, w = u * 9, th2 = u * 4.5;
      api.layer(0, dur, (ctx, p) => { const close = p < .55 ? 1 - ease(p / .55) : 0, gap = u * 9 * close, a = p > .8 ? (1 - p) * 5 : 1;
        ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.lineWidth = u * .5;
        for (const sg of [-1, 1]) { const base = B.y + sg * (gap + th2 + u * 2), tip = B.y + sg * gap;
          ctx.fillStyle = hexA(th.c2, .85); ctx.beginPath(); ctx.ellipse(B.x, base + sg * u * 1.5, w * 1.15, u * 3, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2a2140'; ctx.beginPath(); ctx.moveTo(B.x - w, base);
          for (let i = 0; i < 5; i++) { const x0 = B.x - w + i * 2 * w / 5; ctx.lineTo(x0 + w / 5, tip + sg * (i === 0 || i === 4 ? u * 1.2 : 0)); ctx.lineTo(x0 + 2 * w / 5, base); }
          ctx.closePath(); ctx.fill(); ctx.stroke(); } });
      impact(240, 14); break; }
    case 'bind': {
      const dur = 760, wv = 3 + Math.floor(r() * 3);
      api.layer(0, dur, (ctx, p) => { const g = Math.min(1, p * 2.2), fade = p > .8 ? (1 - p) * 5 : 1; ctx.strokeStyle = hexA(th.c2, fade); ctx.lineWidth = u * 1.1; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i <= 30; i++) { const q = i / 30 * g, w = Math.sin(q * Math.PI * wv + p * 10) * u * 2.5; const x = lerp(A.x, B.x, q) + nx * w, y = lerp(A.y, B.y, q) + ny * w; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
        if (p > .45) { const q = (p - .45) / .55; for (let k = 0; k < 3; k++) { ctx.strokeStyle = hexA(th.c1, fade); ctx.lineWidth = u * .8; ctx.beginPath(); ctx.ellipse(B.x, B.y - u * 4 + k * u * 4, u * (12 - q * 6), u * (3 - q), 0, 0, 7); ctx.stroke(); } } });
      api.at(dur * .7, () => fxBurst(api, B.x, B.y, th, 10, 1.6, 1.5, r)); fxShock(api, dur * .8, B.x, B.y, th, 10, 2); break; }
    case 'rings': {
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) api.layer(i * 90, 420, (ctx, p) => { const x = lerp(A.x, B.x, p), y = lerp(A.y, B.y, p), rad = u * (3 + p * 7); ctx.strokeStyle = hexA(th.c2, 1 - p * .6); ctx.lineWidth = u * .8; ctx.beginPath(); ctx.arc(x, y, rad, Math.atan2(dy, dx) - 1, Math.atan2(dy, dx) + 1); ctx.stroke(); if (i % 2 === 0 && th.main === 'note') fxTrail(api, x, y, th, r, 'note'); else if (r() < .3) fxTrail(api, x, y, th, r, th.main); });
      impact(n * 90 + 380, 14); break; }
    case 'impact': {
      const t = 230;
      api.layer(0, t, (ctx, p) => { for (let i = 0; i < 2; i++) fxTrail(api, lerp(A.x, B.x, p * .8), lerp(A.y, B.y, p * .8), th, r, th.sub); });
      api.layer(t, 170, (ctx, p) => { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hexA(th.c1, 1 - p); ctx.beginPath(); const R = u * (6 + p * 10); for (let i = 0; i < 16; i++) { const rr = i % 2 ? R * .45 : R; ctx.lineTo(B.x + Math.cos(i * Math.PI / 8 + .2) * rr, B.y + Math.sin(i * Math.PI / 8 + .2) * rr); } ctx.closePath(); ctx.fill(); });
      impact(t, big ? 26 : 18); break; }
    case 'field': {
      const dur = 1000;
      api.layer(0, dur + 200, (ctx, p) => { const a = p < .15 ? p / .15 : p > .85 ? (1 - p) / .15 : 1; ctx.fillStyle = `rgba(10,8,30,${.55 * a})`; ctx.fillRect(0, 0, api.env.W, api.env.H); const g = ctx.createRadialGradient(B.x, B.y, 0, B.x, B.y, api.env.W * .6); g.addColorStop(0, hexA(th.c2, .45 * a)); g.addColorStop(1, hexA(th.c2, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, api.env.W, api.env.H); });
      api.layer(80, dur - 200, (ctx, p) => { for (let i = 0; i < 3; i++) api.part({kind: r() < .5 ? th.main : th.sub, x: r() * api.env.W, y: api.env.H + u * 3, vx: (r() - .5) * u * .2, vy: -u * (1.2 + r() * 1.5), drag: .995, s: u * (1 + r() * 1.5), rot: r() * 6, vr: (r() - .5) * .2, life: 700, th, seed: (r() * 1e6) | 0}); });
      api.layer(300, 600, (ctx, p) => { ctx.globalCompositeOperation = 'lighter'; const R = u * 22 * (1 - ease(p)) + u * 3; ctx.strokeStyle = hexA(th.c1, .8); ctx.lineWidth = u * 1.2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(B.x, B.y, R * (1 + k * .35), p * 6 + k, p * 6 + k + 4); ctx.stroke(); } });
      fxFlash(api, 900, '#ffffff', .8, 260); impact(900, 34); fxShock(api, 980, B.x, B.y, th, 30, 4); break; }
  }
}
async function attackFx(isMe, move, tm, crit) {
  const uEl = isMe ? $('meMon') : $('foeMon');
  const env = fxEnv();
  const th = FXT[move.typ] || FXT.Metall, h = fxHash((move.anzeige || move.name || '') + move.typ), r = fxRng(h);
  const pat = fxPattern(move), big = move.staerke >= 85;
  const A = env ? fxP(env, isMe ? POS.me : POS.foe) : null, B = env ? fxP(env, isMe ? POS.foe : POS.me) : null;
  // Anwender-Bewegung passend zum Muster
  const dirx = isMe ? 1 : -1;
  if (pat === 'impact' || pat === 'bite') play(uEl, [{transform: 'translate(0,0)'}, {transform: `translate(${dirx * 30}%,${-dirx * 22}%) scale(1.08)`, offset: .45}, {transform: `translate(${dirx * 34}%,${-dirx * 25}%) scale(1.08)`, offset: .55}, {transform: 'translate(0,0)'}], 480);
  else if (pat === 'field') play(uEl, [{transform: 'translateY(0)', filter: 'none'}, {transform: 'translateY(-10%) scale(1.12)', filter: `drop-shadow(0 0 12px ${th.c2}) brightness(1.4)`, offset: .5}, {transform: 'translateY(0)', filter: 'none'}], 700);
  else { play(uEl, [{transform: 'translate(0,0)'}, {transform: `translate(${dirx * 8}%,${-dirx * 6}%)`, offset: .4}, {transform: 'translate(0,0)'}], 260); await sleep(110); }
  if (crit) { const fl = document.createElement('div'); fl.style.cssText = 'position:absolute;inset:0;background:#fff'; $('fx').appendChild(fl); play(fl, [{opacity: .8}, {opacity: 0}], 300).then(() => fl.remove()); }
  if (!env) return;
  let shookAt = null;
  await fxRun(api => {
    fxBuild(api, pat, A, B, th, r, move.staerke, big, isMe);
    // Treffer-Zeitpunkt: Bildschirm wackeln
    const hitT = {proj: 380, volley: 300, arc: 480, fan: 640, beam: 560, wave: 640, vortex: 700, rain: 600, lightning: 320, slash: 200, bite: 260, bind: 530, rings: 600, impact: 230, field: 900}[pat] || 400;
    api.at(hitT, () => { if (crit || tm > 1 || pat === 'field' || big) shakeScreen(tm > 1 || pat === 'field'); });
  });
}
// Animation für Attacken ohne Schaden (Schilde, Ruhe, Auren, Flüche)
async function statusMoveFx(isMe, move) {
  const env = fxEnv(); const uEl = isMe ? $('meMon') : $('foeMon');
  const th = FXT[move.typ] || FXT.Metall, r = fxRng(fxHash((move.anzeige || '') + move.typ)), l = (move.anzeige || '').toLowerCase();
  if (!env) { await play(uEl, [{transform: 'scale(1)'}, {transform: 'scale(1.1)', offset: .5}, {transform: 'scale(1)'}], 350); return; }
  const fx = move.fx || {};
  const onFoe = fx.foe && !fx.self && !fx.heal;
  const P = fxP(env, (isMe ? !onFoe : onFoe) ? POS.me : POS.foe), u = env.u;
  const kind = FX_SHIELD.some(w => l.includes(w)) ? 'shield' : l.includes('ruhe') || fx.heal ? 'calm' : onFoe ? 'curse' : 'aura';
  play(uEl, [{transform: 'scale(1)'}, {transform: 'scale(1.08)', offset: .5}, {transform: 'scale(1)'}], 500);
  await fxRun(api => {
    if (kind === 'shield') {
      const hex = r() < .5;
      api.layer(0, 760, (ctx, p) => { const a = p < .3 ? p / .3 : p > .75 ? (1 - p) / .25 : 1, R = u * 15 * (p < .3 ? ease(p / .3) : 1);
        ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(P.x, P.y, R * .3, P.x, P.y, R); g.addColorStop(0, hexA(th.c2, 0)); g.addColorStop(1, hexA(th.c2, .45 * a)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, P.y, R, 0, 7); ctx.fill();
        ctx.strokeStyle = hexA(th.c1, a); ctx.lineWidth = u * .7; ctx.beginPath(); if (hex) { for (let i = 0; i < 7; i++) ctx.lineTo(P.x + Math.cos(i * Math.PI / 3 + p) * R, P.y + Math.sin(i * Math.PI / 3 + p) * R); } else ctx.arc(P.x, P.y, R, 0, 7); ctx.stroke();
        if (r() < .5) fxTrail(api, P.x + Math.cos(p * 20) * R, P.y + Math.sin(p * 20) * R, th, r, th.sub); });
    } else if (kind === 'calm') {
      api.layer(0, 800, (ctx, p) => { for (let i = 0; i < 2; i++) api.part({kind: r() < .5 ? th.sub : 'spark', x: P.x + (r() - .5) * u * 18, y: P.y + u * 8, vy: -u * (.3 + r() * .4), s: u * (.8 + r()), life: 650, th: {c1: '#eaffea', c2: th.c2}, seed: i}); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hexA(th.c1, .25 * Math.sin(p * Math.PI)); ctx.beginPath(); ctx.ellipse(P.x, P.y, u * 14, u * 10, 0, 0, 7); ctx.fill(); });
    } else if (kind === 'curse') {
      api.layer(0, 720, (ctx, p) => { const cnt = 8; for (let i = 0; i < cnt; i++) { const an = p * 9 + i / cnt * Math.PI * 2, rad = u * (14 - p * 6); fxTok(ctx, th.sub, P.x + Math.cos(an) * rad, P.y + Math.sin(an) * rad * .5, u * 1.4, an, Math.sin(p * Math.PI), th, i); } ctx.fillStyle = hexA(th.c2, .2 * Math.sin(p * Math.PI)); ctx.beginPath(); ctx.arc(P.x, P.y, u * 12, 0, 7); ctx.fill(); });
    } else {
      api.layer(0, 760, (ctx, p) => { for (let i = 0; i < 3; i++) api.part({kind: i % 2 ? th.main : th.sub, x: P.x + (r() - .5) * u * 16, y: P.y + u * 6, vy: -u * (.6 + r() * .6), vx: (r() - .5) * u * .1, s: u * (1 + r()), life: 520, th, seed: (r() * 1e6) | 0}); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(th.c1, .7 * Math.sin(p * Math.PI)); ctx.lineWidth = u * .6; for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(P.x, P.y + u * 6 - ((p * 2 + k * .5) % 1) * u * 14, u * 11, u * 3, 0, 0, 7); ctx.stroke(); } });
    }
  });
}

async function statFx(isMe, up, stat) {
  const pos = isMe ? POS.me : POS.foe;
  rise(pos.x, pos.y, up ? '#ff7a59' : '#59a6ff', 10);
  floatText(pos.x, pos.y - 10, `${up ? '▲' : '▼'} ${stat}`, up ? '#e74c3c' : '#2d7be0');
  await sleep(450);
}
async function healFx(isMe) { const pos = isMe ? POS.me : POS.foe; rise(pos.x, pos.y, '#5ee07a', 14); await sleep(500); }

// Übergang zum Kampf (wie im Klassiker: Flackern, dann schwarze Balken)
async function transIn(kind) {
  const t = $('trans'); t.innerHTML = ''; t.style.display = 'block'; t.style.opacity = 1; t.style.background = 'transparent';
  const flashes = kind === 'legend' ? 5 : 3;
  for (let i = 0; i < flashes; i++) { t.style.background = kind === 'legend' ? '#fff' : '#000'; await sleep(70); t.style.background = 'transparent'; await sleep(70); }
  const n = 8, bars = [];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'tbar';
    if (kind === 'trainer') { d.style.left = (i * 100 / n) + '%'; d.style.width = (100 / n + .3) + '%'; d.style[i % 2 ? 'bottom' : 'top'] = 0; d.style.height = 0; }
    else { d.style.top = (i * 100 / n) + '%'; d.style.height = (100 / n + .3) + '%'; d.style[i % 2 ? 'right' : 'left'] = 0; d.style.width = 0; }
    t.appendChild(d); bars.push(d);
  }
  await Promise.all(bars.map((d, i) => play(d, kind === 'trainer' ? [{height: '0%'}, {height: '100%'}] : [{width: '0%'}, {width: '100%'}], {duration: 380, delay: i * 35, easing: 'ease-in'})));
  t.style.background = '#000'; t.innerHTML = '';
}
async function transOut() { const t = $('trans'); await play(t, [{opacity: 1}, {opacity: 0}], 320); t.style.display = 'none'; t.style.opacity = 1; t.style.background = 'transparent'; }
async function slideTrainer(el, side, inOut) {
  const off = side === 'me' ? 'translateX(-170%)' : 'translateX(170%)';
  el.style.display = 'block';
  await play(el, inOut === 'in' ? [{transform: off}, {transform: 'translateX(0)'}] : [{transform: 'translateX(0)'}, {transform: off}], {duration: inOut === 'in' ? 600 : 450, easing: inOut === 'in' ? 'ease-out' : 'ease-in'});
  if (inOut === 'out') el.style.display = 'none';
}
async function throwPose(el, side) { await play(el, [{transform: 'translateX(0) rotate(0)'}, {transform: `translateX(${side === 'me' ? 12 : -12}%) rotate(${side === 'me' ? 8 : -8}deg)`, offset: .5}, {transform: 'translateX(0) rotate(0)'}], 300); }
async function slideInfo(el, fromLeft) { el.style.display = ''; await play(el, [{transform: `translateX(${fromLeft ? -130 : 130}%)`}, {transform: 'translateX(0)'}], {duration: 380, easing: 'ease-out'}); }
// Fang-Animation: gibt zurück, ob gefangen
async function catchAnim(col, ok, shakes, bounce) {
  const el = $('foeMon');
  await throwBall([6, 72], [POS.foe.x, POS.foe.y], col, 30, 700);
  if (bounce) {
    burst(POS.foe.x, POS.foe.y, '#ffffff', 10, 4); anim(el, 'flash');
    await play($('ball'), [{left: POS.foe.x + '%', top: POS.foe.y + '%'}, {left: '62%', top: '8%', offset: .4}, {left: '55%', top: '60%', opacity: 0}], {duration: 600, easing: 'ease-in'});
    hideBall(); return false;
  }
  burst(POS.foe.x, POS.foe.y, '#ffffff', 16, 6);
  await play(el, [{transform: 'scale(1)', filter: 'none', opacity: 1}, {transform: 'scale(1)', filter: 'brightness(3) sepia(1) saturate(8) hue-rotate(-30deg)', opacity: 1, offset: .35}, {transform: 'scale(0)', filter: 'brightness(3) sepia(1) saturate(8) hue-rotate(-30deg)', opacity: 0}], 450);
  el.style.opacity = 0;
  const b = $('ball'), g = POS.foe.ground + 4;
  await play(b, [{top: POS.foe.y + '%'}, {top: g + '%', offset: .45}, {top: (g - 6) + '%', offset: .65}, {top: g + '%', offset: .8}, {top: (g - 2) + '%', offset: .9}, {top: g + '%'}], {duration: 700, easing: 'ease-in'});
  b.style.transform = 'translate(-50%,-50%) rotate(0deg)';
  for (let i = 0; i < shakes; i++) {
    await sleep(450);
    await play(b, [{transform: 'translate(-50%,-50%) rotate(0deg)'}, {transform: 'translate(-50%,-50%) rotate(-28deg)', offset: .25}, {transform: 'translate(-50%,-50%) rotate(24deg)', offset: .6}, {transform: 'translate(-50%,-50%) rotate(0deg)'}], 520);
  }
  await sleep(400);
  if (ok) {
    b.style.filter = 'brightness(.6)';
    for (let i = 0; i < 3; i++) floatText(POS.foe.x - 6 + i * 6, g - 6, '★', '#ffd84a');
    burst(POS.foe.x, g, '#ffd84a', 12, 4, 0.8);
    await sleep(500);
    return true;
  }
  burst(POS.foe.x, g, '#ffffff', 18, 7);
  hideBall();
  el.style.transform = 'scale(1)';
  await popIn(el, POS.foe);
  return false;
}
async function throwThing(icon) {
  const p = document.createElement('div'); p.className = 'proj'; p.textContent = icon; $('fx').appendChild(p);
  await play(p, arcFrames([10, 70], [POS.foe.x, POS.foe.y + 6], 26, 540), {duration: 600, easing: 'linear'});
  p.remove(); burst(POS.foe.x, POS.foe.y + 6, '#ffffff', 6, 3, 0.6);
}

// ================= Kampfsystem =================
let B = null;
const STATKEY = {Angriff: 'atk', Verteidigung: 'def', Tempo: 'spd'};
function freshSide() { return {buffs: [], evade: false}; }
function statMult(side, stat) { return side.buffs.filter(b => b.stat === stat).reduce((p, b) => p * b.mult, 1); }
function eff(mon, side, stat) { const st = mon.status; const sm = (st === 'para' && stat === 'Tempo') || (st === 'brand' && stat === 'Angriff') ? 0.5 : 1; return Math.max(1, mon[STATKEY[stat]] * statMult(side, stat) * sm); }
function nameMe(m) { return m.nick || m.sp; }
function nameFoe(m) { return (B.wild ? 'Das wilde ' : 'Gegn. ') + m.sp; }
function setBg() {
  const bg = $('bbg');
  if (G.surf) bg.style.background = 'linear-gradient(#bfe6ff 0 55%,#3f8fe0 55%)';
  else if (map.arena === 'stein') bg.style.background = 'linear-gradient(#d9c4a0 0 55%,#b8996e 55%)';
  else if (map.arena === 'funke') bg.style.background = 'linear-gradient(#3a3f55 0 55%,#565d7a 55%)';
  else if (map.arena === 'nebel') bg.style.background = 'linear-gradient(#3c3358 0 55%,#5a4a7a 55%)';
  else if (map.arena === 'frost') bg.style.background = 'linear-gradient(#bfe0f5 0 55%,#dcefff 55%)';
  else if (map.cave && map.ice) bg.style.background = 'linear-gradient(#5a7fa0 0 55%,#a6c6e0 55%)';
  else if (map.cave && map.sea) bg.style.background = 'linear-gradient(#2f4a5a 0 55%,#6c8288 55%)';
  else if (map.cave && map.tower) bg.style.background = 'linear-gradient(#2a2238 0 55%,#5c4e7a 55%)';
  else if (map.cave && map.lava) bg.style.background = 'linear-gradient(#3a1e14 0 55%,#8a5a40 55%)';
  else if (map.cave && map.void) bg.style.background = 'linear-gradient(#14101e 0 55%,#3e3458 55%)';
  else if (map.cave) bg.style.background = 'linear-gradient(#3a2e24 0 55%,#7a6250 55%)';
  else if (map.arena && map.arena !== 'stein') bg.style.background = 'linear-gradient(#3a3f55 0 55%,#8a8fa8 55%)';
  else if (map.theme && map.theme !== 'normal') { const th = THEMES[map.theme]; bg.style.background = `linear-gradient(#c6e4f6 0 55%,${th.g} 55%)`; }
  else if (map.snow) bg.style.background = 'linear-gradient(#cfe4f6 0 55%,#f4f8fc 55%)';
  else if (map.fog) bg.style.background = 'linear-gradient(#d4cfe8 0 55%,#8fb08a 55%)';
  else if (map.id === 'route2') bg.style.background = 'linear-gradient(#b8d8f0 0 55%,#8cc070 55%)';
  else bg.style.background = 'linear-gradient(#c6ecff 0 55%,#9bd67a 55%)';
}
function hpColor(f) { return f > 0.5 ? '#3ccf6a' : f > 0.2 ? '#f2c12e' : '#e74c3c'; }
let hpShown = null, hpTimer = null;
function countHp(to, max) {
  const el = $('meHpNum'); if (hpShown === null || Math.abs(hpShown - to) > max) hpShown = to;
  clearInterval(hpTimer);
  const step = () => { if (hpShown === to) { clearInterval(hpTimer); } else hpShown += hpShown < to ? Math.max(1, Math.ceil((to - hpShown) / 8)) : -Math.max(1, Math.ceil((hpShown - to) / 8)); el.textContent = `${hpShown} / ${max}`; };
  step(); hpTimer = setInterval(step, 40);
}
function refreshBattle() {
  if (!B) return;
  const f = B.foe, m = B.me;
  $('foeName').innerHTML = (f.shiny ? '✨' : '') + f.sp + ' ' + statusTag(f); $('foeLv').textContent = 'Lv ' + f.level;
  $('foeTypes').innerHTML = badges(SPECIES[f.sp].typen) + (G.caught[f.sp] && B.wild ? ' <span class="small">●</span>' : '');
  const ff = Math.max(0, f.hp / f.maxhp); $('foeHp').style.width = ff * 100 + '%'; $('foeHp').style.background = hpColor(ff);
  if (m) {
    $('meName').innerHTML = (m.shiny ? '✨' : '') + nameMe(m) + ' ' + statusTag(m); $('meLv').textContent = 'Lv ' + m.level;
    const mf = Math.max(0, m.hp / m.maxhp); $('meHp').style.width = mf * 100 + '%'; $('meHp').style.background = hpColor(mf);
    countHp(Math.max(0, m.hp), m.maxhp);
    const lo = expFor(m.level), hi = expFor(m.level + 1); $('meXp').style.width = Math.min(100, (m.exp - lo) / (hi - lo) * 100) + '%';
  }
  renderParty();
}
function partyBalls(list, isFoe) {
  let h = '';
  for (let i = 0; i < 6; i++) {
    const p = list[i];
    if (!p) { h += '<i class="pb empty"></i>'; continue; }
    const down = p.hp <= 0 || (isFoe && i < B.fi && p !== B.foe);
    h += `<i class="pb ${down ? 'down' : p.status ? 'st' : ''}"${!down && p.status ? ` style="--sc:${STATUS[p.status].col}"` : ''}></i>`;
  }
  return h;
}
function renderParty() {
  const el = $('partyBar'); if (!el || !B) return;
  const mine = G.team, okMe = mine.filter(m => m.hp > 0).length;
  let h = `<div class="pside"><b>DU</b> ${partyBalls(mine, false)} <span>${okMe}/${mine.length}</span></div>`;
  if (!B.wild) { const fs = B.foes, okF = fs.filter((m, i) => m.hp > 0 && (i >= B.fi)).length; h += `<div class="pside"><span>${okF}/${fs.length}</span> ${partyBalls(fs, true)} <b>${(B.trainer && B.trainer.name || 'GEGNER').toUpperCase()}</b></div>`; }
  el.innerHTML = h; el.style.display = 'flex'; el.classList.toggle('solo', !!B.wild);
}
async function inflictStatus(isMe, target, kind, force) {
  if (!target || target.hp <= 0 || target.status) return false;
  if ((STATUS_IMMUNE[kind] || []).some(t => SPECIES[target.sp].typen.includes(t))) return false;
  target.status = kind; if (kind === 'schlaf') target.sleep = 1 + Math.floor(Math.random() * 3);
  const el = isMe ? $('meMon') : $('foeMon'), tp = isMe ? POS.me : POS.foe;
  floatText(tp.x, tp.y - 10, STATUS[kind].tag + '!', STATUS[kind].col);
  await play(el, [{filter: 'none'}, {filter: `drop-shadow(0 0 6px ${STATUS[kind].col}) brightness(1.3)`, offset: .3}, {filter: 'none', offset: .6}, {filter: `drop-shadow(0 0 6px ${STATUS[kind].col})`, offset: .8}, {filter: 'none'}], 700);
  el.style.filter = '';
  refreshBattle();
  const n = isMe ? nameMe(target) : nameFoe(target);
  await say({gift: `${n} wurde vergiftet!`, para: `${n} ist paralysiert! Es kann eventuell nicht angreifen!`, brand: `${n} hat Verbrennungen erlitten!`, schlaf: `${n} ist eingeschlafen!`, eis: `${n} wurde eingefroren!`}[kind]);
  return true;
}
async function statusTick(isMe) {
  const m = isMe ? B.me : B.foe;
  if (!m || m.hp <= 0 || (m.status !== 'gift' && m.status !== 'brand')) return;
  const d = Math.max(1, Math.floor(m.maxhp / (m.status === 'gift' ? 8 : 16)));
  m.hp = Math.max(0, m.hp - d);
  const el = isMe ? $('meMon') : $('foeMon'), tp = isMe ? POS.me : POS.foe;
  floatText(tp.x, tp.y - 6, '-' + d, STATUS[m.status].col);
  play(el, [{filter: 'none'}, {filter: m.status === 'gift' ? 'hue-rotate(250deg) saturate(2)' : 'sepia(1) saturate(4) hue-rotate(-20deg)', offset: .5}, {filter: 'none'}], 500);
  anim(el, 'shake'); refreshBattle(); await sleep(450); el.style.filter = '';
  const n = isMe ? nameMe(m) : nameFoe(m);
  await say(m.status === 'gift' ? `${n} leidet unter der Vergiftung!` : `${n} leidet unter seinen Verbrennungen!`);
}
function anim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener('animationend', function f(e) { if (e.target === el) { el.classList.remove(cls); el.removeEventListener('animationend', f); } }); }
async function sendOutMe(m, mode) {
  if (mode === true) mode = 'first'; else if (!mode) mode = 'switch';
  B.me = m; B.sideMe = freshSide(); B.part.add(m);
  const el = $('meMon'); paintSprite(el, m.sp, true, m.shiny); el.style.opacity = 0; el.style.transform = 'scale(1)';
  showText(mode === 'first' ? `Los, ${nameMe(m)}!` : `Du schaffst das, ${nameMe(m)}!`);
  if (mode === 'first') { await throwPose($('meTrainer'), 'me'); slideTrainer($('meTrainer'), 'me', 'out'); }
  await throwBall(mode === 'first' ? [20, 46] : [-4, 40], [POS.me.x, POS.me.y + 6], BALL_COL.Fangkapsel, 20, 560);
  hideBall();
  await popIn(el, POS.me);
  hideText();
  refreshBattle();
  if ($('meInfo').style.display === 'none') await slideInfo($('meInfo'), false);
}
async function sendOutFoe(m, mode) {
  B.foe = m; B.sideFoe = freshSide(); markSeen(m.sp);
  const el = $('foeMon'); paintSprite(el, m.sp, false, m.shiny); el.style.transform = 'scale(1)'; el.style.filter = '';
  refreshBattle();
  if (mode === 'throw' || mode === 'next') {
    el.style.opacity = 0;
    if (mode === 'throw') await throwPose($('foeTrainer'), 'foe');
    await throwBall(mode === 'throw' ? [82, 22] : [104, 10], [POS.foe.x, POS.foe.y + 4], BALL_COL.Fangkapsel, 14, 520);
    hideBall();
    await popIn(el, POS.foe);
    if (mode === 'throw') slideTrainer($('foeTrainer'), 'foe', 'out');
  } else el.style.opacity = 1;
  if (m.shiny && isLegend(m.sp)) { const rb = ['#ff5a5a', '#ffb347', '#ffe14a', '#5ee07a', '#4aa3ff', '#b47aff']; for (let i = 0; i < 6; i++) burst(POS.foe.x, POS.foe.y, rb[i], 6, 9, .8); }
  if (m.shiny) { for (let i = 0; i < 3; i++) burst(POS.foe.x + (Math.random() - .5) * 14, POS.foe.y + (Math.random() - .5) * 14, '#ffe680', 8, 3, .6); }
  if ($('foeInfo').style.display === 'none') await slideInfo($('foeInfo'), true);
}
function chooseFoeMove() {
  const f = B.foe, ms = movesOf(f);
  const scored = ms.map(a => {
    if (a.fx.onceMove && B.used.has(f.uid + a.name)) return [a, 0];
    if (a.staerke > 0) { const s = a.staerke * (SPECIES[f.sp].typen.includes(a.typ) ? 1.5 : 1) * typeMult(a.typ, SPECIES[B.me.sp].typen); return [a, s]; }
    if (a.fx.heal) { const used = B.used.has(f.uid + a.name); return [a, (!used && f.hp < f.maxhp * 0.45) ? 120 : 0]; }
    const already = a.fx.self && B.sideFoe.buffs.some(b => b.stat === a.fx.self.stat && b.mult > 1);
    return [a, already ? 5 : 35];
  });
  if (B.wild || Math.random() < 0.25) { const tot = scored.reduce((s, x) => s + x[1] + 5, 0); let r = Math.random() * tot; for (const [a, s] of scored) { r -= s + 5; if (r <= 0) return a; } return scored[0][0]; }
  scored.sort((a, b) => b[1] - a[1]); return scored[0][0];
}
function addBuff(side, b) { const ex = side.buffs.find(x => x.stat === b.stat && (x.mult > 1) === (b.mult > 1)); if (ex) { ex.turns = b.turns + 1; return false; } side.buffs.push({stat: b.stat, mult: b.mult, turns: b.turns + 1}); return true; }
function statPhrase(stat, up) { const art = stat === 'Verteidigung' || stat === 'Genauigkeit' ? 'Die' : stat === 'Tempo' ? 'Das' : 'Der'; return [art, stat, up ? 'steigt' : 'sinkt']; }
async function doMove(isMe, move) {
  const user = isMe ? B.me : B.foe, target = isMe ? B.foe : B.me;
  const uSide = isMe ? B.sideMe : B.sideFoe, tSide = isMe ? B.sideFoe : B.sideMe;
  const uName = isMe ? nameMe(user) : nameFoe(user), tName = isMe ? nameFoe(target) : nameMe(target);
  const uEl = isMe ? $('meMon') : $('foeMon'), tEl = isMe ? $('foeMon') : $('meMon');
  if (user.status === 'schlaf') {
    user.sleep = (user.sleep || 1) - 1;
    if (user.sleep <= 0) { user.status = null; refreshBattle(); await say(`${uName} ist aufgewacht!`); }
    else { anim(uEl, 'shake'); await say(`${uName} schläft tief und fest … 💤`); return; }
  }
  if (user.status === 'eis') {
    if (Math.random() < 0.2 || move.typ === 'Glut') { user.status = null; refreshBattle(); await say(`${uName} ist aufgetaut!`); }
    else { await say(`${uName} ist eingefroren und kann sich nicht bewegen! 🧊`); return; }
  }
  if (user.status === 'para' && Math.random() < 0.25) { anim(uEl, 'shake'); await say(`${uName} ist paralysiert!\nEs kann sich nicht bewegen! ⚡`); return; }
  showText(`${uName} setzt ${move.anzeige} ein!`); await sleep(550);
  if (move.staerke <= 0) await statusMoveFx(isMe, move);
  const fx = move.fx;
  if (fx.onceMove) { if (B.used.has(user.uid + move.name)) { await say('Diese Spezialattacke geht nur einmal pro Kampf!'); return; } B.used.add(user.uid + move.name); }
  if (move.staerke > 0) {
    if (Math.random() > statMult(uSide, 'Genauigkeit')) { anim(uEl, isMe ? 'lunge-me' : 'lunge-foe'); await sleep(300); await say(`Die Attacke von ${uName} geht daneben!`); return; }
    if (tSide.evade) { tSide.evade = false; anim(uEl, isMe ? 'lunge-me' : 'lunge-foe'); await play(tEl, [{transform: 'translateX(0)'}, {transform: 'translateX(18%)', offset: .4}, {transform: 'translateX(0)'}], 400); await say(`${tName} weicht geschickt aus!`); return; }
    const L = user.level;
    const A = eff(user, uSide, 'Angriff'), D = eff(target, tSide, 'Verteidigung');
    const base = Math.floor(Math.floor((2 * L / 5 + 2) * move.staerke * A / D) / 50) + 2;
    const stab = SPECIES[user.sp].typen.includes(move.typ) ? 1.5 : 1;
    const tm = typeMult(move.typ, SPECIES[target.sp].typen);
    const crit = Math.random() < 0.0625 ? 1.5 : 1;
    const dmg = Math.max(1, Math.floor(base * stab * tm * crit * (0.85 + Math.random() * 0.15)));
    await attackFx(isMe, move, tm, crit > 1);
    target.hp = Math.max(0, target.hp - dmg);
    const tp = isMe ? POS.foe : POS.me;
    floatText(tp.x, tp.y - 6, `-${dmg}${crit > 1 ? '!' : ''}`, tm > 1 ? '#ff3b30' : '#e74c3c');
    anim(tEl, 'shake'); blink(tEl); refreshBattle(); await sleep(720);
    if (tm > 1) floatText(tp.x, tp.y - 16, 'SEHR EFFEKTIV!', '#e6a100');
    if (crit > 1) await say('Ein Volltreffer!');
    if (tm > 1) await say('Das ist sehr effektiv!');
    else if (tm < 1) await say('Das ist nicht sehr effektiv …');
    if (fx.selfAfter) { addBuff(uSide, fx.selfAfter); const [a, s2, v] = statPhrase(fx.selfAfter.stat, false); await say(`${a} ${s2} von ${uName} ${v} nach der Kraftanstrengung.`); }
    if (target.hp > 0 && target.status === 'eis' && move.typ === 'Glut') { target.status = null; refreshBattle(); await say(`${tName} ist aufgetaut!`); }
    const sbt = STATUS_BY_TYPE[move.typ];
    if (sbt && target.hp > 0 && Math.random() < sbt[1]) await inflictStatus(!isMe, target, sbt[0]);
    if (fx.recoil) { const r = Math.max(1, Math.floor(user.maxhp * fx.recoil)); user.hp = Math.max(0, user.hp - r); refreshBattle(); await sleep(300); await say(`${uName} erleidet Rückstoß!`); }
    if (target.hp > 0 && Math.random() < fx.chance) {
      if (fx.foe) { addBuff(tSide, fx.foe); await statFx(!isMe, false, fx.foe.stat); const [a, s, v] = statPhrase(fx.foe.stat, false); await say(`${a} ${s} von ${tName} ${v}!`); }
      if (fx.self) { addBuff(uSide, fx.self); await statFx(isMe, fx.self.mult > 1, fx.self.stat); const [a, s, v] = statPhrase(fx.self.stat, fx.self.mult > 1); await say(`${a} ${s} von ${uName} ${v}!`); }
      if (fx.evade) { uSide.evade = true; await say(`${uName} bewegt sich blitzschnell!`); }
    }
  } else {
    if (fx.heal) {
      const key = user.uid + move.name;
      if (fx.once && B.used.has(key)) { await say('Das klappt nur einmal pro Kampf!'); return; }
      if (user.hp >= user.maxhp) { await say(`${uName} hat schon volle KP!`); return; }
      B.used.add(key); const h = Math.max(1, Math.floor(user.maxhp * fx.heal)); user.hp = Math.min(user.maxhp, user.hp + h);
      healFx(isMe); anim(uEl, 'flash'); refreshBattle(); await sleep(600); await say(`${uName} heilt sich!`);
    }
    if (fx.self) { const isNew = addBuff(uSide, fx.self); anim(uEl, 'flash'); await statFx(isMe, fx.self.mult > 1, fx.self.stat); const [a, s, v] = statPhrase(fx.self.stat, fx.self.mult > 1); await say(isNew ? `${a} ${s} von ${uName} ${v}!` : `Die Wirkung von ${move.anzeige} wird erneuert!`); }
    if (fx.foe) { addBuff(tSide, fx.foe); await statFx(!isMe, false, fx.foe.stat); const [a, s, v] = statPhrase(fx.foe.stat, false); await say(`${a} ${s} von ${tName} ${v}!`); }
    if (fx.evade) { uSide.evade = true; await say(`${uName} bewegt sich blitzschnell!`); }
    if (!fx.heal && !fx.self && !fx.foe && !fx.evade) await say('Aber nichts passiert …');
  }
}
function tickBuffs() { for (const s of [B.sideMe, B.sideFoe]) { s.buffs.forEach(b => b.turns--); s.buffs = s.buffs.filter(b => b.turns > 0); } }
async function gainExp(m, amt) {
  m.exp += amt;
  if (B && m === B.me) refreshBattle();
  await say(`${nameMe(m)} erhält ${amt} EP!`);
  await checkLevel(m);
}
async function checkLevel(m) {
  while (m.level < 100 && m.exp >= expFor(m.level + 1)) {
    const before = movesOf(m).map(a => a.name);
    const oldMax = m.maxhp; m.level++; calcStats(m); if (m.hp > 0) m.hp += m.maxhp - oldMax;
    if (B && m === B.me) refreshBattle();
    if (B && m === B.me) { rise(POS.me.x, POS.me.y, '#ffd84a', 14); anim($('meInfo'), 'flash'); }
    await say(`${nameMe(m)} erreicht Level ${m.level}!`);
    for (const a of movesOf(m)) if (!before.includes(a.name)) await say(`${nameMe(m)} hat ${a.anzeige} gelernt!`);
    const sp = SPECIES[m.sp]; if (sp.entwicktSichZu && sp.entwicklungLevel && m.level >= sp.entwicklungLevel) m.evo = true;
  }
}
async function evolve(m) {
  const from = m.sp, to = SPECIES[from].entwicktSichZu;
  delete m.evo; if (!to || !SPECIES[to]) return;
  showPanel(`<div style="text-align:center"><canvas id="evoC" width="32" height="32" class="pix" style="width:9em;height:9em"></canvas></div>`);
  const c = $('evoC'); paintSprite(c, from, false, m.shiny);
  await say(`Nanu? ${nameMe(m)} entwickelt sich!`);
  for (let i = 0; i < 8; i++) { paintSprite(c, i % 2 ? to : from, false, m.shiny); c.style.filter = 'brightness(' + (2 + i * 0.5) + ')'; await sleep(220 - i * 15); }
  c.style.filter = 'brightness(8)'; await sleep(250);
  const oldMax = m.maxhp; m.sp = to; calcStats(m); m.hp = Math.max(1, m.hp + m.maxhp - oldMax); markCaught(to);
  paintSprite(c, to, false, m.shiny); c.style.filter = '';
  await say(`Glückwunsch! ${from} hat sich zu ${to} entwickelt!`);
  hidePanel();
}
async function playerTurn() {
  while (true) {
    const opts = ['Kämpfen', 'Team', 'Beutel', B.wild ? 'Flucht' : {label: 'Flucht', disabled: true}];
    const i = await choose(opts, {grid: true, cancel: false, text: `Was soll ${nameMe(B.me)} tun?`, title: ''});
    if (i === 0) {
      const ms = movesOf(B.me);
      const j = await choose(ms.map(a => ({disabled: a.fx.onceMove && B.used.has(B.me.uid + a.name), label: `<span style="flex:1">${a.anzeige}</span> ${badge(a.typ)} <span class="small">${a.staerke || 'Status'}</span>`})), {grid: true,
        onSel: k => showText(`${ms[k].anzeige} · ${ms[k].typ} · Stärke ${ms[k].staerke || '–'}\n${ms[k].effekt}`)});
      hideText();
      if (j < 0) continue;
      return {type: 'move', move: ms[j]};
    }
    if (i === 1) {
      const k = await choose(G.team.map(m => ({label: monLabel(m, m === B.me ? ' · im Kampf' : m.hp <= 0 ? ' · besiegt' : '')})), {title: 'Welches Monster einwechseln?'});
      if (k < 0) continue;
      const m = G.team[k];
      if (m === B.me) { await say(`${nameMe(m)} kämpft bereits!`); continue; }
      if (m.hp <= 0) { await say(`${nameMe(m)} kann nicht mehr kämpfen!`); continue; }
      return {type: 'switch', mon: m};
    }
    if (i === 2) {
      const r = await bagMenu(true);
      if (!r) continue;
      if (isBall(r.item)) { if (!B.wild) { await say('Man kann keine Monster anderer Trainer fangen!'); continue; } return {type: 'catch', ball: r.item}; }
      return {type: 'item', item: r.item, target: r.target};
    }
    if (i === 3) return {type: 'run'};
  }
}
async function tryCatch(ball) {
  ball = ball || 'Fangkapsel';
  G.bag[ball]--;
  const f = B.foe;
  const el = $('foeMon');
  if (isLegend(f.sp) && ball !== 'Legendenkapsel') {
    showText(`{name} wirft eine ${ball}!`);
    await catchAnim(BALL_COL[ball] || '#e74c3c', false, 0, true); hideText();
    await say(`Die ${ball} prallt an der Aura von ${f.sp} ab!\nNur eine Legendenkapsel kann legendäre Monster fangen.`);
    return false;
  }
  const base = catchBase(f.sp);
  let p = Math.min(0.97, base * 1.5 * ITEMS[ball].ball * (3 * f.maxhp - 2 * f.hp) / (3 * f.maxhp) * (f.status === 'schlaf' || f.status === 'eis' ? 2 : f.status ? 1.5 : 1));
  if (ball === 'Legendenkapsel') p = 1;
  const ok = Math.random() < p;
  const shakes = ok ? 3 : Math.floor(Math.random() * 3);
  showText(`{name} wirft eine ${ball}!`);
  await catchAnim(BALL_COL[ball] || '#e74c3c', ok, shakes, false);
  hideText();
  if (ok) {
    await say(`Geschafft! ${f.sp} wurde gefangen!`);
    hideBall();
    markCaught(f.sp);
    if (B.legendId) G.flags[B.legendId] = 1;
    f.uid = Math.random().toString(36).slice(2);
    if (G.team.length < 6) { G.team.push(f); await say(`${f.sp} ist jetzt in deinem Team.`); }
    else { G.box.push(f); await say(`Dein Team ist voll. ${f.sp} wurde in die Box am PC geschickt.`); }
    return true;
  }
  await say(['Oh nein! Es hat sich befreit!', 'Mist! Fast hätte es geklappt!', 'Es ist wieder entkommen!'][Math.min(2, shakes)]);
  return false;
}
async function forcedSwitch() {
  while (true) {
    const k = await choose(G.team.map(m => ({label: monLabel(m, m.hp <= 0 ? ' · besiegt' : ''), disabled: m.hp <= 0})), {title: 'Wer soll als Nächstes kämpfen?', cancel: false});
    const m = G.team[k]; if (m.hp > 0) return m;
  }
}
async function battle(cfg) { scriptLock++; try { return await battleInner(cfg); } finally { scriptLock--; } }
async function battleInner(cfg) {
  const trainer = cfg.trainer;
  B = {legendId: cfg.legendId, wild: !!cfg.wild, trainer, foes: cfg.wild ? [cfg.wild] : trainer.team.map(([n, l, sh]) => { const m = makeMon(n, l); if (sh) m.shiny = true; return m; }), fi: 0, part: new Set(), used: new Set(), runs: 0};
  held.clear();
  await transIn(trainer ? 'trainer' : B.legendId ? 'legend' : 'wild');
  setBg(); $('battle').style.display = 'block'; $('meInfo').style.display = 'none'; $('foeInfo').style.display = 'none';
  $('meMon').style.opacity = 0; $('foeMon').style.opacity = 0; $('hud').style.display = 'none'; hideBall(); $('fx').innerHTML = '';
  const meT = $('meTrainer'), foeT = $('foeTrainer');
  drawAvatar(meT, LOOK.player, 'up'); meT.style.display = 'block'; meT.style.transform = 'translateX(-170%)';
  foeT.style.display = 'none';
  if (trainer) { drawAvatar(foeT, cfg.look || LOOK.ace, 'down'); foeT.style.display = 'block'; foeT.style.transform = 'translateX(170%)'; }
  else { const fe = $('foeMon'); paintSprite(fe, B.foes[0].sp, false, B.foes[0].shiny); fe.style.opacity = 1; fe.style.filter = 'brightness(0)'; fe.style.transform = 'translateX(140%)'; }
  await transOut();
  if (trainer) await Promise.all([slideTrainer(meT, 'me', 'in'), slideTrainer(foeT, 'foe', 'in')]);
  else {
    await Promise.all([slideTrainer(meT, 'me', 'in'), play($('foeMon'), [{transform: 'translateX(140%)'}, {transform: 'translateX(0)'}], {duration: 600, easing: 'ease-out'})]);
    await play($('foeMon'), [{filter: 'brightness(0)'}, {filter: 'brightness(1)'}], 350); $('foeMon').style.filter = '';
  }
  if (trainer) { await say(`${trainer.name} fordert dich heraus!`); showText(`${trainer.name} schickt ${B.foes[0].sp} in den Kampf!`); await sendOutFoe(B.foes[0], 'throw'); hideText(); }
  else await sendOutFoe(B.foes[0]);
  if (B.foe.shiny) { for (let i = 0; i < 3; i++) { anim($('foeMon'), 'flash'); await sleep(260); } await say(`✨ Wow! Ein SCHILLERNDES ${B.foe.sp}! ✨\nSo eins sieht man nur ganz selten (1:500)!`); }
  if (B.legendId) await say(`Das legendäre ${B.foe.sp} greift an!`);
  else if (B.wild) await say(`Ein wildes ${B.foe.sp} erscheint!`);
  await sendOutMe(alive()[0], 'first');
  let result = null;
  while (!result) {
    const act = await playerTurn();
    let meActs = false;
    if (act.type === 'run') {
      B.runs++;
      const p = Math.min(0.98, 0.55 + (B.me.spd - B.foe.spd) / (2 * Math.max(1, B.foe.spd)) + B.runs * 0.12);
      if (Math.random() < p) { play($('meMon'), [{transform: 'translateX(0)', opacity: 1}, {transform: 'translateX(-120%)', opacity: 0}], 450); await say('Du bist erfolgreich geflohen!'); result = 'run'; break; }
      await say('Flucht gescheitert!');
    } else if (act.type === 'switch') {
      showText(`${nameMe(B.me)}, komm zurück!`); await recallAnim($('meMon')); $('meMon').style.opacity = 0; hideText();
      await sendOutMe(act.mon, 'switch');
    } else if (act.type === 'item') {
      await applyItem(act.item, act.target); refreshBattle();
    } else if (act.type === 'catch') {
      if (await tryCatch(act.ball)) { result = 'caught'; break; }
    } else meActs = true;
    // Reihenfolge
    const foeMove = chooseFoeMove();
    const order = [];
    if (meActs) {
      const ms = eff(B.me, B.sideMe, 'Tempo'), fs = eff(B.foe, B.sideFoe, 'Tempo');
      if (ms > fs || (ms === fs && Math.random() < 0.5)) order.push('me', 'foe'); else order.push('foe', 'me');
    } else order.push('foe');
    for (const who of order) {
      if (B.me.hp <= 0 || B.foe.hp <= 0) break;
      if (who === 'me') await doMove(true, act.move); else await doMove(false, foeMove);
      // Rückstoß kann den Anwender besiegen – Prüfung unten
    }
    tickBuffs();
    const tickOrder = eff(B.me, B.sideMe, 'Tempo') >= eff(B.foe, B.sideFoe, 'Tempo') ? [true, false] : [false, true];
    for (const s of tickOrder) if (B.me.hp > 0 && B.foe.hp > 0) await statusTick(s);
    if (B.foe.hp <= 0) B.foe.status = null;
    if (B.me.hp <= 0) cureStatus(B.me);
    // Gegner besiegt?
    if (B.foe.hp <= 0) {
      await faintAnim($('foeMon'));
      await say(`${nameFoe(B.foe)} wurde besiegt!`);
      if ([...B.part].filter(m => m.hp > 0 && G.team.includes(m)).length > 1) await say('Alle Monster, die mitgekämpft haben, bekommen Erfahrung!');
      const sp = SPECIES[B.foe.sp]; const sum = sp.kp + sp.angriff + sp.verteidigung + sp.tempo;
      const exp = Math.max(1, Math.floor(sum / 4 * B.foe.level / 3 * (B.wild ? 1 : 1.5) * 1.5));
      for (const m of [...B.part]) if (m.hp > 0 && G.team.includes(m)) await gainExp(m, exp);
      if (G.bag['EP-Teiler']) { const rest = G.team.filter(m => m.hp > 0 && !B.part.has(m)); if (rest.length) { const half = Math.max(1, Math.floor(exp / 2)); await say(`EP-Teiler: Der Rest des Teams erhält je ${half} EP!`); for (const m of rest) { m.exp += half; await checkLevel(m); } } }
      if (B.wild) { const coins = (B.foe.level * 6 + Math.floor(Math.random() * 10)) * (G.bag['Glückstaler'] ? 2 : 1); addMoney(coins); await say(`Du sammelst ${fmtC(coins)} Coins ein!`); }
      if (!B.wild && B.fi < B.foes.length - 1) {
        B.fi++; B.part = new Set([B.me].filter(m => m.hp > 0));
        const nx = B.foes[B.fi];
        if (B.me.hp > 0 && alive().length > 1 && await yesNo(`${trainer.name} will ${nx.sp} einsetzen.\nMöchtest du dein Monster wechseln?`)) {
          const k = await choose(G.team.map(m => ({label: monLabel(m, m === B.me ? ' · im Kampf' : m.hp <= 0 ? ' · besiegt' : ''), disabled: m.hp <= 0 || m === B.me})), {title: 'Wen einwechseln?'});
          if (k >= 0) { showText(`${nameMe(B.me)}, komm zurück!`); await recallAnim($('meMon')); $('meMon').style.opacity = 0; hideText(); B.pendingSwitch = G.team[k]; }
        }
        showText(`${trainer.name} schickt ${nx.sp} in den Kampf!`);
        await sendOutFoe(nx, 'next'); hideText();
        if (B.pendingSwitch) { const m2 = B.pendingSwitch; B.pendingSwitch = null; await sendOutMe(m2, 'switch'); B.part = new Set([m2]); }
      } else { result = 'win'; }
    }
    // Eigenes Monster besiegt?
    if (B.me.hp <= 0) {
      await faintAnim($('meMon'));
      await say(`${nameMe(B.me)} wurde besiegt!`);
      if (!alive().length) { result = result === 'win' ? 'win' : 'lose'; }
      else if (!result) { const m = await forcedSwitch(); await sendOutMe(m, 'switch'); }
    }
  }
  // Kampfende
  if (result === 'win' && !B.wild) {
    await say(`Du hast ${trainer.name} besiegt!`);
    await say(`${trainer.name}:\n${trainer.lose}`);
    const rw = (trainer.reward || 0) * (G.bag['Glückstaler'] ? 2 : 1);
    if (rw) addMoney(rw); if (rw) await say(`Du erhältst ${fmtC(rw)} Coins Preisgeld.`);
  }
  if (result === 'lose' && trainer && trainer.win) await say(`${trainer.name}:\n${trainer.win}`);
  if (result === 'lose' && cfg.noWhiteout) await say('Du hast verloren … aber das war nur ein Übungskampf!');
  else if (result === 'lose') {
    await say('Du hast keine kampffähigen Monster mehr …');
    await say('Keine Sorge – deine Coins behältst du!\nDu eilst zurück, um dein Team zu pflegen …');
  }
  await fade(true);
  $('battle').style.display = 'none'; $('hud').style.display = ''; $('meTrainer').style.display = 'none'; $('foeTrainer').style.display = 'none'; hideBall(); $('fx').innerHTML = '';
  hideText();
  const wiped = !alive().length;
  if (result === 'lose' || wiped) {
    healAll(); if (!cfg.noWhiteout) { const r = G.respawn; enterMap(r.map, r.x, r.y, r.dir); }
  }
  await fade(false);
  for (const m of G.team) if (m.evo && m.hp > 0) await evolve(m);
  if ((result === 'lose' || wiped) && !cfg.noWhiteout) await say('Dein Team ist wieder fit. Versuch es noch einmal!');
  if (result === 'caught' && B.foe) cureStatus(B.foe);
  G.team.forEach(m => { if (m.hp <= 0) cureStatus(m); });
  const pois = G.team.filter(m => m.hp > 0 && m.status === 'gift' && m.poisonDeadline == null);
  pois.forEach(m => m.poisonDeadline = (G.pclock || 0) + POISON_TIME);
  B = null;
  if (pois.length) await say(`☠ Achtung! ${pois.map(nameMe).join(' und ')} ${pois.length > 1 ? 'sind' : 'ist'} vergiftet!\nDu hast ${POISON_TIME / 60} Minuten Zeit, um zu einer Heilstation zu gehen.\nSonst stirbt ${pois.length > 1 ? 'es' : 'es'} an dem Gift!`);
  autosave();
  return result;
}

// ===== Weltkarte =====
const WM = {
  dorf: [40, 160, 'town'], stadt1: [40, 124, 'town'], stadt2: [40, 88, 'town'], stadt3: [40, 52, 'town'], stadt4: [40, 16, 'town'],
  stadt5: [110, 16, 'town'], dorf2: [110, 52, 'town'], stadt6: [110, 92, 'city'], stadt7: [110, 160, 'town'],
  stadt8: [180, 160, 'town'], stadt9: [180, 124, 'town'], stadt10: [180, 88, 'town'], ligaplatz: [180, 16, 'liga'],
  route1: [40, 142, 'route'], route2: [40, 106, 'route'], route3: [40, 70, 'route'], route4: [40, 34, 'route'], route5: [75, 16, 'route'],
  route6: [110, 34, 'route'], route7: [110, 72, 'route'], bruecke: [110, 115, 'bridge'], route8: [110, 138, 'route'], route9: [145, 160, 'route'],
  route10: [180, 142, 'route'], route11: [180, 106, 'route'], sieg: [180, 52, 'route'],
  radpark: [142, 92, 'spot'], seepfad: [76, 160, 'spot'], gipfel: [150, 16, 'spot'], safari: [208, 160, 'spot'],
  hoehle1: [58, 106, 'cave'], grotte: [22, 88, 'cave'], hoehle3: [58, 34, 'cave'], turm1: [128, 52, 'tower'], krater: [128, 8, 'cave'],
  ursprung: [200, 88, 'cave'], ruinen: [216, 76, 'cave'], tempel: [76, 142, 'cave']
};
const WM_PATHS = [['dorf', 'stadt1', 'stadt2', 'stadt3', 'stadt4', 'stadt5', 'dorf2', 'stadt6', 'stadt7', 'stadt8', 'stadt9', 'stadt10', 'ligaplatz'], ['stadt6', 'radpark'], ['stadt7', 'seepfad'], ['ligaplatz', 'gipfel'], ['stadt8', 'safari'], ['route2', 'hoehle1'], ['stadt2', 'grotte'], ['route4', 'hoehle3'], ['dorf2', 'turm1'], ['stadt5', 'krater'], ['stadt10', 'ursprung', 'ruinen'], ['seepfad', 'tempel']];
const WM_ALIAS = {hoehle2: 'hoehle1', turm2: 'turm1', turm3: 'turm1', turm4: 'turm1', safari_tor: 'stadt8', elite1: 'ligaplatz', elite2: 'ligaplatz', elite3: 'ligaplatz', elite4: 'ligaplatz', champ: 'ligaplatz'};
const WM_KIND = {town: 'Ort', city: 'Großstadt', liga: 'Monster-Liga', route: 'Route', bridge: 'Brücke', spot: 'Gebiet', cave: 'Höhle / Dungeon', tower: 'Turm'};
const _wmCache = {};
function wmNode(id) {
  if (id in _wmCache) return _wmCache[id];
  const seen = new Set();
  const find = (m, d) => {
    if (WM[m]) return m; if (WM_ALIAS[m]) return WM_ALIAS[m];
    if (d > 6 || seen.has(m)) return null; seen.add(m);
    for (const k in WARPS) if (k.startsWith(m + ':')) { const r = find(WARPS[k].to, d + 1); if (r) return r; }
    return null;
  };
  return _wmCache[id] = find(id, 0);
}
function wmName(n) { return n === 'turm1' ? 'Geisterturm' : n === 'hoehle1' ? 'Glimmerhöhle' : (MAPS[n] && MAPS[n].name) || n; }
function drawWorldMap(c, sel, here, blink) {
  const x = c.getContext('2d'); x.setTransform(2, 0, 0, 2, 0, 0); x.imageSmoothingEnabled = false;
  // Meer
  x.fillStyle = '#3a78c9'; x.fillRect(0, 0, 240, 176);
  x.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 40; i++) x.fillRect((i * 53) % 240, (i * 37) % 176, 6, 1);
  // Land
  const blob = (px, py, w, h, col) => { x.fillStyle = col; x.beginPath(); x.roundRect(px, py, w, h, 10); x.fill(); };
  blob(8, 2, 224, 172, '#5f9e3f'); blob(10, 4, 220, 168, '#78b84e');
  // Regionen
  const area = (px, py, r, col) => { const g = x.createRadialGradient(px, py, 2, px, py, r); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); };
  area(40, 22, 30, 'rgba(240,248,255,.95)'); area(40, 60, 22, 'rgba(160,140,200,.6)'); area(118, 12, 24, 'rgba(220,80,40,.55)');
  area(165, 16, 30, 'rgba(150,150,160,.7)'); area(205, 160, 24, 'rgba(190,230,110,.7)'); area(140, 92, 18, 'rgba(210,190,140,.6)');
  // Bucht beim Seepfad
  x.fillStyle = '#3a78c9'; x.beginPath(); x.ellipse(80, 172, 26, 10, 0, 0, 7); x.fill();
  // Fluss unter der Brücke
  x.fillStyle = '#4b8ad8'; x.fillRect(10, 112, 220, 6);
  // Wege
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const p of WM_PATHS) { const pts = p.map(n => WM[n]); for (const [w, col] of [[6, '#6b4f2a'], [4, '#e8cf95']]) { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.stroke(); } }
  // Brücke
  const br = WM.bruecke; x.fillStyle = '#a0683a'; x.fillRect(br[0] - 4, br[1] - 6, 8, 12); x.fillStyle = '#d9a066'; x.fillRect(br[0] - 3, br[1] - 6, 6, 12);
  // Knoten
  for (const n in WM) {
    const [px, py, k] = WM[n];
    if (k === 'route' || k === 'bridge') { x.fillStyle = '#6b4f2a'; x.fillRect(px - 2, py - 2, 4, 4); x.fillStyle = '#fff6d8'; x.fillRect(px - 1, py - 1, 2, 2); continue; }
    if (k === 'cave' || k === 'tower') { x.fillStyle = '#2b1d10'; x.beginPath(); x.moveTo(px - 5, py + 4); x.lineTo(px, py - 5); x.lineTo(px + 5, py + 4); x.closePath(); x.fill(); x.fillStyle = k === 'tower' ? '#8e6bd1' : '#8a6239'; x.beginPath(); x.moveTo(px - 3, py + 3); x.lineTo(px, py - 3); x.lineTo(px + 3, py + 3); x.closePath(); x.fill(); continue; }
    const s = k === 'city' ? 7 : k === 'spot' ? 4 : 5;
    x.fillStyle = '#1d1f2a'; x.fillRect(px - s - 1, py - s - 1, s * 2 + 2, s * 2 + 2);
    x.fillStyle = k === 'liga' ? '#f2c12e' : k === 'spot' ? '#3ccf6a' : '#e74c3c'; x.fillRect(px - s, py - s, s * 2, s * 2);
    x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(px - s, py - s, s * 2, 2);
  }
  // Ortsnamen
  x.font = 'bold 6px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'top';
  for (const n in WM) { const [px, py, k] = WM[n]; if (!['town', 'city', 'liga'].includes(k)) continue; const t = wmName(n), ty = py + (k === 'city' ? 9 : 7); x.strokeStyle = 'rgba(20,22,34,.9)'; x.lineWidth = 2; x.strokeText(t, px, ty); x.fillStyle = '#fff'; x.fillText(t, px, ty); }
  // Spieler
  if (here && WM[here] && blink) { const [px, py] = WM[here]; x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py - 1, 5, 0, 7); x.fill(); x.fillStyle = '#e03131'; x.fillRect(px - 4, py - 6, 8, 3); x.fillStyle = '#f5c99b'; x.fillRect(px - 3, py - 3, 6, 4); x.fillStyle = '#1d1f2a'; x.fillRect(px - 2, py - 2, 1, 1); x.fillRect(px + 1, py - 2, 1, 1); }
  // Cursor
  if (sel && WM[sel]) { const [px, py] = WM[sel]; const r = 9; x.strokeStyle = '#ffe04a'; x.lineWidth = 2; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { x.beginPath(); x.moveTo(px + sx * r, py + sy * (r - 4)); x.lineTo(px + sx * r, py + sy * r); x.lineTo(px + sx * (r - 4), py + sy * r); x.stroke(); } }
}
async function openWorldMap() {
  const here = wmNode(G.map) || G.lastNode || 'dorf';
  let sel = here, tick = 0;
  showPanel(`<h2 style="margin:0 0 .3em">🗺️ Karte</h2><canvas id="wmap" width="480" height="352" style="width:100%;max-height:68vh;object-fit:contain;image-rendering:pixelated;border-radius:.4em;display:block;touch-action:none"></canvas><div id="wmapInfo" style="margin-top:.35em;min-height:2.4em"></div><div class="small">Pfeiltasten: Orte ansehen · Antippen: Ort wählen · Enter/Esc: schließen</div>`, true);
  const c = $('wmap');
  const info = () => { const k = WM[sel][2]; $('wmapInfo').innerHTML = `<b>${wmName(sel)}</b> <span class="small">· ${WM_KIND[k]}</span>${sel === here ? ' <span style="color:#e03131;font-weight:800">📍 Du bist hier' + (G.map !== here && MAPS[G.map] ? ` (${MAPS[G.map].name})` : '') + '</span>' : ''}`; };
  const redraw = () => drawWorldMap(c, sel, here, (tick >> 2) % 2 === 0);
  info(); redraw();
  const iv = setInterval(() => { tick++; redraw(); }, 120);
  const move = dir => {
    const [cx, cy] = WM[sel]; const v = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]}[dir];
    let best = null, bs = 1e9;
    for (const n in WM) { if (n === sel) continue; const dx = WM[n][0] - cx, dy = WM[n][1] - cy; const along = dx * v[0] + dy * v[1]; if (along <= 0) continue; const perp = Math.abs(dx * v[1] - dy * v[0]); const s = along + perp * 2.5; if (s < bs) { bs = s; best = n; } }
    if (best) { sel = best; info(); redraw(); }
  };
  c.onclick = e => { const r = c.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * 240, py = (e.clientY - r.top) / r.height * 176; let best = null, bd = 1e9; for (const n in WM) { const d = Math.hypot(WM[n][0] - px, WM[n][1] - py); if (d < bd) { bd = d; best = n; } } if (best && bd < 16) { sel = best; info(); redraw(); } e.stopPropagation(); };
  await new Promise(res => { const h = k => { if (['up', 'down', 'left', 'right'].includes(k)) move(k); else if (k === 'A' || k === 'B' || k === 'MENU' || k === 'MAP') { popH(h); panelEl.onclick = null; res(); } }; panelEl.onclick = e => { if (e.target !== c) h('A'); }; pushH(h); });
  clearInterval(iv); hidePanel();
}
function toggleTurbo() {
  if (!G || !G.bag['Turbo-Treter']) return;
  G.turboOn = !G.turboOn; updateHudExtra();
  toast(G.turboOn ? '👟 Turbo an' : '👟 Turbo aus');
}
function updateHudExtra() {
  const m = $('mapBtn'), t = $('turboBtn'); if (!m || !t) return;
  m.style.display = G && G.bag.Karte ? '' : 'none';
  t.style.display = G && G.bag['Turbo-Treter'] ? '' : 'none';
  t.classList.toggle('on', !!(G && G.turboOn));
}

// ===== Gift-Countdown außerhalb des Kampfes =====
let poisonBusy = false, _phud = '';
function poisonCheck() {
  const list = G.team.filter(m => m.poisonDeadline != null && m.status === 'gift' && m.hp > 0);
  G.team.forEach(m => { if (m.poisonDeadline != null && (m.status !== 'gift' || m.hp <= 0)) delete m.poisonDeadline; });
  const h = list.map(m => `☠ ${nameMe(m)} ${fmtTime(m.poisonDeadline - G.pclock)}`).join('<br>');
  if (h !== _phud) { _phud = h; const el = $('poisonHud'); if (el) { el.innerHTML = h ? h + '<div class="small">➜ Heilstation!</div>' : ''; el.style.display = h ? '' : 'none'; el.classList.toggle('urgent', list.some(m => m.poisonDeadline - G.pclock < 30)); } }
  if (poisonBusy || moving || handlers.length || scriptLock) return;
  const dead = list.find(m => m.poisonDeadline <= G.pclock);
  if (dead) { poisonBusy = true; script(() => poisonDeath(dead)).finally(() => poisonBusy = false); }
}
async function poisonDeath(m) {
  const n = nameMe(m);
  if (!G.team.some(x => x !== m && x.hp > 0)) {
    await say(`☠ ${n} bricht wegen des Giftes zusammen!\nEs ist dein letztes Monster …\nIn letzter Sekunde trägst du es zur Heilstation!`);
    await fade(true); healAll(); const r = G.respawn; enterMap(r.map, r.x, r.y, r.dir); await fade(false);
    await say('Puh … gerade noch gerettet! Dein Team ist wieder fit.'); autosave(); return;
  }
  G.team.splice(G.team.indexOf(m), 1);
  (G.graveyard = G.graveyard || []).push({sp: m.sp, nick: m.nick || null, level: m.level, shiny: !!m.shiny});
  autosave();
  showPanel(`<div style="text-align:center;padding:.6em"><div style="font-size:2.2em">💀</div><div style="filter:grayscale(1) brightness(.7);display:inline-block">${spriteImg(m.sp, 5, m.shiny)}</div><h2 style="color:#c0392b">${n} ist gestorben</h2><div>${n} (Lv ${m.level}) hat es nicht rechtzeitig zur Heilstation geschafft und ist an der Vergiftung gestorben.</div><div class="small" style="margin-top:.6em">Es ist für immer fort … Ruhe in Frieden. 🕯️</div><div class="small" style="margin-top:.6em">Taste drücken …</div></div>`, true);
  toast(`💀 ${n} ist an der Vergiftung gestorben`);
  await waitKey(); hidePanel();
}

// ================= Hauptschleife =================
let last = performance.now();
function update(dt) {
  if (!G || !map) return;
  G.time = (G.time || 0) + dt / 1000;
  if (!B) { G.pclock = (G.pclock || 0) + dt / 1000; poisonCheck(); } else if (_phud) { _phud = ''; $('poisonHud').style.display = 'none'; }
  onlineUpdate(dt);
  if (moving) {
    moving.t += dt;
    if (moving.t >= moving.dur) { G.x = moving.tx; G.y = moving.ty; moving = null; onStepDone(); }
    return;
  }
  if (scriptLock || handlers.length) return;
  if (bump > 0) { bump--; }
  const order = ['up', 'down', 'left', 'right']; let dir = null;
  for (const d of [...held].reverse()) if (order.includes(d)) { dir = d; break; }
  if (dir) tryMove(dir);
  // NPCs drehen sich ab und zu
  for (const n of npcsHere()) if (n.walk && Math.random() < 0.004) { n.dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]; }
}
function drawNpc(n, x, y) {
  if (n.chest) {
    const open = G.flags[n.id];
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 8, y + 14, 7, 2, 0, 0, 7); ctx.fill();
    R_(ctx, x + 1, y + 5, 14, 10, '#4a2c14'); R_(ctx, x + 2, y + 6, 12, 8, open ? '#6b4524' : '#a8743e');
    if (open) { R_(ctx, x + 2, y + 6, 12, 3, '#1d1f2a'); R_(ctx, x + 1, y + 1, 14, 4, '#8a5a30'); }
    else { R_(ctx, x + 1, y + 4, 14, 3, '#8a5a30'); R_(ctx, x + 2, y + 9, 12, 1, '#4a2c14'); R_(ctx, x + 7, y + 8, 2, 3, '#ffd84a'); if ((performance.now() / 400 | 0) % 4 === 0) R_(ctx, x + 12, y + 3, 2, 2, '#fff8c0'); }
    return;
  }
  if (n.id === 'wandel' && !G.flags.wandelFixed) { ctx.drawImage(monSprite('Klicko'), x - 2, y - 6, 20, 20); return; }
  if (n.item) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 8, y + 14, 5, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#1d1f2a'; ctx.beginPath(); ctx.arc(x + 8, y + 9, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = n.item === 'Legendenkapsel' ? '#8e44ad' : '#e74c3c'; ctx.beginPath(); ctx.arc(x + 8, y + 9, 4.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 8, y + 9, 4.5, 0, Math.PI); ctx.fill();
    R_(ctx, x + 3, y + 8, 10, 1, '#1d1f2a'); R_(ctx, x + 7, y + 8, 2, 2, '#fff'); return;
  }
  if (n.legend) {
    const t = performance.now() / 500; const r = 13 + Math.sin(t) * 2;
    const g = ctx.createRadialGradient(x + 8, y + 4, 2, x + 8, y + 4, r + 6); g.addColorStop(0, 'rgba(255,240,170,0.75)'); g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 16, y - 20, 48, 48);
    ctx.drawImage(monSprite(n.legend), x - 6, y - 14 + Math.round(Math.sin(t) * 1.5), 28, 28); return;
  }
  drawPerson(ctx, x, y - 3, n.dir, n.look, 0);
}
function draw() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!G || !map) { nameTags = []; flushNameTags(); return; }
  let px = G.x * 16, py = G.y * 16;
  if (moving) { const k = moving.t / moving.dur; px = (moving.fx + (moving.tx - moving.fx) * k) * 16; py = (moving.fy + (moving.ty - moving.fy) * k) * 16; }
  const mw = map.w * 16, mh = map.h * 16;
  let camX = mw <= cv.width ? -(cv.width - mw) / 2 : Math.max(0, Math.min(mw - cv.width, px + 8 - cv.width / 2));
  let camY = mh <= cv.height ? -(cv.height - mh) / 2 : Math.max(0, Math.min(mh - cv.height, py + 8 - cv.height / 2));
  camX = Math.round(camX); camY = Math.round(camY);
  ctx.drawImage(map.canvas, -camX, -camY);
  drawWater(camX, camY, performance.now());
  const ents = npcsHere().map(n => ({y: n.y * 16, f: () => drawNpc(n, n.x * 16 - camX, n.y * 16 - camY)}));
  const step = moving ? (moving.t / moving.dur < 0.5 ? walkFrame : 0) : 0;
  ents.push({y: py, f: () => {
    drawPlayerSprite(px - camX, py - camY, step);
    const t = tileAt(G.x, G.y); if (t === 'G' && !moving && !G.bike) { const gx = G.x * 16 - camX, gy = G.y * 16 - camY; for (let i = 0; i < 4; i++) { R_(ctx, gx + i * 4, gy + 10, 1, 6, '#3f8a30'); R_(ctx, gx + i * 4 + 1, gy + 9, 1, 7, '#78c95a'); R_(ctx, gx + i * 4 + 2, gy + 11, 2, 5, '#5fae46'); } }
  }});
  ents.push(...otherEnts(camX, camY));
  ents.sort((a, b) => a.y - b.y).forEach(e => e.f());
  flushNameTags();
  if (myEmote && performance.now() - myEmote.t < 2500) { const x = Math.round(px - camX), y = Math.round(py - camY); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d1f2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 1, y - 22, 14, 12, 3); ctx.fill(); ctx.stroke(); ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(myEmote.e, x + 8, y - 15.5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  drawOParts(camX, camY);
  const now = performance.now();
  if (map.fog) { ctx.fillStyle = 'rgba(225,222,245,0.16)'; ctx.fillRect(0, 0, cv.width, cv.height); for (let i = 0; i < 5; i++) { const fx = ((now / 60 + i * 97) % (cv.width + 120)) - 120 - camX * 0.3 % 40, fy = (i * 41 + 13) % cv.height; ctx.fillStyle = 'rgba(240,238,255,0.22)'; ctx.beginPath(); ctx.ellipse(fx + 60, fy, 70, 14, 0, 0, 7); ctx.fill(); } }
  if (map.snow) { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) { const sx = (hash2(i, 3) * 260 + now / (40 + i % 7) * (i % 3 ? 0.6 : -0.4)) % 260, sy = (hash2(i, 7) * 200 + now / (25 + i % 5)) % 190; ctx.fillRect(Math.floor((sx + 260) % 260) - 10, Math.floor(sy) - 8, i % 4 ? 1 : 2, i % 4 ? 1 : 2); } }
  if (map.cave) { const g = ctx.createRadialGradient(px - camX + 8, py - camY + 4, 30, px - camX + 8, py - camY + 4, 150); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (exclaim) { const ex = exclaim.x * 16 - camX + 4, ey = exclaim.y * 16 - camY - 16; R_(ctx, ex, ey, 9, 11, '#1d1f2a'); R_(ctx, ex + 1, ey + 1, 7, 9, '#fff'); R_(ctx, ex + 3, ey + 2, 3, 4, '#e74c3c'); R_(ctx, ex + 3, ey + 7, 3, 2, '#e74c3c'); }
}
function loop(now) { const dt = Math.min(50, now - last); last = now; update(dt); draw(); requestAnimationFrame(loop); }

// ================= Speichern / Start =================
const SAVE_KEY = 'monsterwelt_save_v1';
let cloudDoc = null, cloudSave = null, cloudWriting = false, cloudQueued = false, lastCloudWrite = 0, cloudTimer = null;
function toast(t) { const el = $('saveToast'); if (!el) return; el.textContent = t; el.style.opacity = 1; clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = 0, 1400); }
function writeLocal() { if (G && G.online) return true; try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); return true; } catch (e) { return false; } }
async function cloudWrite() {
  if (!cloudDoc || !G || G.online) return;
  if (cloudWriting) { cloudQueued = true; return; }
  cloudWriting = true; clearTimeout(cloudTimer); lastCloudWrite = Date.now();
  try { await cloudDoc.set({json: JSON.stringify(G), savedAt: G.savedAt || Date.now(), name: G.name}); }
  catch (e) { if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted' || e.code === 'capability_disabled')) cloudDoc = null; }
  cloudWriting = false;
  if (cloudQueued) { cloudQueued = false; cloudWrite(); }
}
// Speichern: lokal sofort, online (falls verfügbar) sofort
function save(silent) { if (!G) return; G.savedAt = Date.now(); if (G.online) { onlineSave(); if (!silent) toast('💾 Online gespeichert'); return; } writeLocal(); if (cloudDoc) cloudWrite(); if (!silent) toast('💾 Gespeichert'); }
// Automatisch: lokal sofort, online höchstens alle 15 Sekunden
function autosave() {
  if (!G || !G.team) return; G.savedAt = Date.now(); if (G.online) { onlineAutosave(); return; } writeLocal();
  if (cloudDoc) { if (Date.now() - lastCloudWrite > 15000) cloudWrite(); else { clearTimeout(cloudTimer); cloudTimer = setTimeout(cloudWrite, 15000 - (Date.now() - lastCloudWrite)); } }
}
function loadLocal() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function loadSave() { const l = loadLocal(), c = cloudSave; if (l && c) return (c.savedAt || 0) > (l.savedAt || 0) ? c : l; return l || c; }
setInterval(() => { if (G && !B && $('title').style.display === 'none') autosave(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && G && $('title').style.display === 'none') save(true); });
window.addEventListener('pagehide', () => { if (G && G.online && onTok) { try { fetch(MW_API + '/api/save', {method: 'PUT', keepalive: true, headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + onTok}, body: JSON.stringify(G)}); } catch (e) {} return; } if (G && $('title').style.display === 'none') { G.savedAt = Date.now(); writeLocal(); } });
(async () => {
  try {
    if (!window.claude || !window.claude.use) return;
    const db = await window.claude.use('db'); const user = await window.claude.use('user');
    if (!db || !user) return;
    const id = await user.id(); if (!id) return;
    const doc = db.doc('data/users/' + id + '/save');
    const snap = await Promise.race([doc.get(), sleep(10000).then(() => null)]);
    cloudDoc = doc;
    if (snap && snap.exists) { const d = snap.data(); try { cloudSave = JSON.parse(d.json); } catch (e) {} }
    if (!G && $('title').style.display !== 'none' && !$('titleMain').querySelector('input')) titleScreen();
  } catch (e) {}
})();
function newGame(name) {
  G = {name: name || 'Alex', map: 'home', x: 3, y: 3, dir: 'down', team: [], box: [], bag: {Fangkapsel: 0, Heiltrank: 0}, pc: {Heiltrank: 3}, money: 500, badges: [], flags: {}, respawn: {map: 'home', x: 7, y: 3, dir: 'down'}, seen: {}, caught: {}, time: 0};
}
function titleScreen() {
  const tm = $('titleMons'); tm.innerHTML = '';
  for (const n of ['Zirkelu', 'Plitscho', 'Moosli']) { const c = document.createElement('canvas'); c.width = c.height = 32; paintSprite(c, n); tm.appendChild(c); }
  const main = $('titleMain'); main.innerHTML = '';
  let apiOverride = false; try { apiOverride = !!localStorage.getItem('mw_api'); } catch (e) {}
  if (window.MW_PWA || apiOverride) {
    const ob = document.createElement('button'); ob.className = 'onlineBtn'; ob.textContent = '🌐 Online spielen'; ob.onclick = () => onlineTitle(main, titleScreen); main.appendChild(ob);
    const ol = document.createElement('div'); ol.className = 'hint'; ol.textContent = '— oder offline auf diesem Gerät —'; main.appendChild(ol);
  } else { const ol = document.createElement('div'); ol.className = 'hint'; ol.innerHTML = '🌐 Online mit Freunden: <b>tischkow16.github.io/monsterwelt</b>'; main.appendChild(ol); }
  const sv = loadSave();
  setTimeout(() => addInstallButton(main), 0);
  if (sv) { const b = document.createElement('button'); const top = (sv.team || []).reduce((mx, m) => Math.max(mx, m.level), 0); b.textContent = `Weiter (${sv.name}${top ? ' · Lv ' + top : ''} · ${(sv.badges || []).length} Orden)`; b.onclick = () => startGame(sv); main.appendChild(b); }
  const nb = document.createElement('button'); nb.textContent = 'Neues Spiel'; nb.onclick = askName; main.appendChild(nb);
  function askName() {
    main.innerHTML = '';
    const inp = document.createElement('input'); inp.placeholder = 'Dein Name'; inp.maxLength = 12; inp.value = '';
    const go = document.createElement('button'); go.textContent = 'Los geht’s!';
    const start = () => { if (sv && !confirmOverwrite.dataset.ok) { confirmOverwrite.dataset.ok = 1; confirmOverwrite.textContent = 'Achtung: Der alte Spielstand wird beim Speichern überschrieben. Nochmal klicken zum Starten.'; return; } newGame(inp.value.trim()); startGame(G, true); };
    go.onclick = start; inp.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
    const confirmOverwrite = document.createElement('div'); confirmOverwrite.className = 'hint';
    main.appendChild(inp); main.appendChild(go); main.appendChild(confirmOverwrite); inp.focus();
  }
  setTimeout(() => { const b = main.querySelector('button'); if (b) b.focus(); }, 50);
}
function startGame(state, fresh) {
  G = state; G.pc = G.pc || {}; G.bag = G.bag || {}; G.money = Math.min(MAX_MONEY, Math.max(0, G.money || 0));
  $('title').style.display = 'none';
  if (G.online) { wsConnect(); updateOnlineChip(); } else { wsClose(); updateOnlineChip(); }
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  enterMap(G.map, G.x, G.y, G.dir);
  if (fresh) script(async () => {
    await sleep(300);
    await say('Willkommen in der Monsterwelt, {name}!');
    await say('Heute ist dein großer Tag: Du bekommst dein erstes Monster!\nSprich mit Mama und geh dann ins Labor von Professorin Sternberg.');
    await say('Tipp: Mit Esc oder X öffnest du das Menü.\nMit Enter oder Leertaste sprichst du mit Leuten.');
  });
}
// ================= Online-Modus =================
const MW_API_DEFAULT = 'https://monsterwelt.WORKERS_SUBDOMAIN.workers.dev';
const MW_API = (() => { try { return localStorage.getItem('mw_api') || MW_API_DEFAULT; } catch (e) { return MW_API_DEFAULT; } })();
let onTok = null; try { onTok = localStorage.getItem('mw_token'); } catch (e) {}
let onSaving = false, onQueued = false, onLast = 0, onTimer = null, onState = 'ok', onReject = null;
let myEmote = null, ws = null, wsTry = 0, wsKey = '', wsMap = null, wsSentAt = 0, OTHERS = {}, onlineCount = 0;
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
let nameTags = [];
const _tagPool = {};
function flushNameTags() {
  const layer = $('nameLayer'); if (!layer) return;
  const r = cv.getBoundingClientRect(), pr = layer.parentElement.getBoundingClientRect(), k = r.width / cv.width;
  const seen = new Set();
  for (const [n, x, y] of nameTags) {
    let el = _tagPool[n]; if (!el) { el = _tagPool[n] = document.createElement('div'); el.className = 'ntag'; el.textContent = n; layer.appendChild(el); }
    el.style.display = ''; el.style.left = (r.left - pr.left + x * k) + 'px'; el.style.top = (r.top - pr.top + y * k) + 'px'; seen.add(n);
  }
  for (const n in _tagPool) if (!seen.has(n)) _tagPool[n].style.display = 'none';
  nameTags = [];
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
  nameTags.push([o.name, x + 8, y - 5]);
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
  if (i >= 0 && i < 5) { try { ws && ws.readyState === 1 && ws.send(JSON.stringify({t: 'emote', e: E[i]})); } catch (e) {} myEmote = {e: E[i], t: performance.now()}; toast(`${E[i]} gesendet`); }
  else if (i === 5) { if (await yesNo('Wirklich abmelden? Dein Spielstand wird vorher gespeichert.')) { await onlineSave(); try { await api('POST', '/api/logout'); } catch (e) {} setTok(null); wsClose(); location.reload(); } }
}
// --- App installieren (Handy / PC) ---
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; const m = $('titleMain'); if (m && $('title').style.display !== 'none') addInstallButton(m); });
function addInstallButton(main) {
  if (!window.MW_PWA || main.querySelector('.installBtn')) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (installPrompt) {
    const b = document.createElement('button'); b.className = 'installBtn'; b.textContent = '📲 Als App installieren';
    b.onclick = async () => { installPrompt.prompt(); const r = await installPrompt.userChoice; installPrompt = null; if (r.outcome === 'accepted') b.remove(); };
    main.appendChild(b);
  } else if (ios) {
    const h = document.createElement('div'); h.className = 'hint installBtn'; h.innerHTML = '📲 Als App: unten auf <b>Teilen</b> ⬆️ tippen → <b>„Zum Home-Bildschirm“</b>';
    main.appendChild(h);
  }
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

titleScreen();
requestAnimationFrame(loop);
window.__game = {get OTHERS() { return OTHERS; }, onlineSave, addMoney, fmtC, attackFx, statusMoveFx, fxPattern, openWorldMap, wmNode, applyItem, toggleBike, script, teachTP, wildMon, safariBattle, SOLID, NPCS2: NPCS, WARPS, get busy() { return handlers.length + scriptLock; }, NPCS, get G() { return G; }, MAPS, SPECIES, press, held, get map() { return map; }, battle, makeMon, enterMap, get B() { return B; }, typeMult};
