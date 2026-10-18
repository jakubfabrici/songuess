import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ROUNDS, CLIPS, points, isCorrect, pickTracks, normalize } from './game.js';

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const MAX_ARTISTS = 5;
const SESSION_DAYS = 30;

const CATEGORIES = [
  { id: 'top', name: 'Aktuálne hity', playlist: 1266973701 },
  { id: '80s', name: '80. roky', playlist: 867825522 },
  { id: '90s', name: '90. roky', playlist: 878989033 },
  { id: '00s', name: 'Roky 2000', playlist: 248297032 },
  { id: '10s', name: 'Roky 2010', playlist: 14917741483 },
  { id: 'rock', name: 'Rock', playlist: 1306931615 },
  { id: 'hiphop', name: 'Hip hop', playlist: 177850401 },
  { id: 'skcz', name: 'SK/CZ hity', playlist: 777222775 },
];

const db = new DatabaseSync(process.env.DB_PATH || 'songuess.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, source TEXT NOT NULL,
    score INTEGER NOT NULL, correct INTEGER NOT NULL, played_at INTEGER NOT NULL);
`);

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// --- Deezer ---------------------------------------------------------------

async function deezer(path) {
  const res = await fetch('https://api.deezer.com' + path, { signal: AbortSignal.timeout(10_000) });
  const data = await res.json();
  if (!res.ok || data.error) throw Object.assign(new Error('Deezer neodpovedá'), { status: 502 });
  return data;
}

const pools = new Map(); // Deezer path -> { at, tracks }, metadata only

async function trackPool(path) {
  const cached = pools.get(path);
  if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.tracks;
  const { data } = await deezer(path);
  const tracks = data.filter((t) => t.preview && t.readable).map((t) => ({
    id: t.id, title: t.title_short, artist: t.artist.name, cover: t.album.cover_medium,
  }));
  pools.set(path, { at: Date.now(), tracks });
  return tracks;
}

// Preview links are signed and expire after 15 minutes, so fetch a fresh one when needed.
async function previewUrl(track) {
  if (!track.preview || Date.now() - track.previewAt > 10 * 60e3) {
    track.preview = (await deezer('/track/' + track.id)).preview;
    track.previewAt = Date.now();
  }
  return track.preview;
}

// --- Games (in memory) ----------------------------------------------------

const games = new Map();

async function createGame({ category, artists }) {
  let source, tracks;
  if (Array.isArray(artists)) {
    const ids = artists.map(Number).filter(Number.isInteger).slice(0, MAX_ARTISTS);
    if (!ids.length) throw Object.assign(new Error('Vyber aspoň jedného interpreta'), { status: 400 });
    const lists = await Promise.all(ids.map((id) => trackPool(`/artist/${id}/top?limit=50`)));
    source = lists.map((l) => l[0]?.artist).filter(Boolean).join(', ');
    tracks = lists.flat();
  } else {
    const cat = CATEGORIES.find((c) => c.id === category);
    if (!cat) throw Object.assign(new Error('Neznáma kategória'), { status: 400 });
    source = cat.name;
    tracks = await trackPool(`/playlist/${cat.playlist}/tracks?limit=500`);
  }
  const picked = pickTracks(tracks, ROUNDS).map((t) => ({ ...t }));
  if (picked.length < ROUNDS) throw Object.assign(new Error('Na hru je málo skladieb s ukážkou'), { status: 400 });

  for (const [id, g] of games) if (Date.now() - g.createdAt > 3 * 3600e3) games.delete(id);
  const game = { id: randomUUID(), source, tracks: picked, round: 0, level: 1, wrong: 0, done: false, scores: [], createdAt: Date.now() };
  games.set(game.id, game);
  return game;
}

function state(g) {
  return {
    id: g.id, source: g.source, round: g.round + 1, rounds: ROUNDS,
    level: g.level, clips: CLIPS, wrong: g.wrong, potential: points(g.level, g.wrong),
  };
}

async function endRound(g, correct) {
  const t = g.tracks[g.round];
  const score = correct ? points(g.level, g.wrong) : 0;
  g.done = true;
  g.scores.push(score);
  const preview = await previewUrl(t).catch(() => null);
  return { correct, score, title: t.title, artist: t.artist, cover: t.cover, preview };
}

function finish(g, user) {
  games.delete(g.id);
  const total = g.scores.reduce((a, b) => a + b, 0);
  const correct = g.scores.filter((s) => s > 0).length;
  if (user) {
    db.prepare('INSERT INTO games (user_id, source, score, correct, played_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, g.source, total, correct, Date.now());
  }
  return {
    finished: true, source: g.source, total, correct, saved: Boolean(user),
    songs: g.tracks.map((t, i) => ({ title: t.title, artist: t.artist, score: g.scores[i] })),
  };
}

// --- Users ----------------------------------------------------------------

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')));
}

function currentUser(req) {
  const token = cookies(req).sid;
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now()) || null;
}

function setSession(req, res, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}

async function login(req, res, credential) {
  if (!GOOGLE_CLIENT_ID) throw Object.assign(new Error('Prihlásenie nie je nastavené'), { status: 400 });
  const { payload } = await jwtVerify(String(credential), googleKeys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: GOOGLE_CLIENT_ID,
  }).catch(() => { throw Object.assign(new Error('Neplatné prihlásenie'), { status: 401 }); });
  db.prepare(`INSERT INTO users (google_sub, name) VALUES (?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET name = excluded.name`).run(payload.sub, payload.name || 'Hráč');
  const user = db.prepare('SELECT id FROM users WHERE google_sub = ?').get(payload.sub);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, user.id, Date.now() + SESSION_DAYS * 864e5);
  setSession(req, res, token, SESSION_DAYS * 86400);
}

// --- HTTP -----------------------------------------------------------------

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw Object.assign(new Error('Príliš veľká požiadavka'), { status: 413 });
  }
  return body ? JSON.parse(body) : {};
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const q = url.searchParams.get('q')?.trim();

  if (req.method === 'GET' && STATIC[path]) {
    const [file, type] = STATIC[path];
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade'); // Google sign-in on http://localhost
    return send(res, 200, readFileSync(new URL('./public/' + file, import.meta.url)), type);
  }
  if (req.method === 'GET' && path === '/api/categories') {
    return send(res, 200, CATEGORIES.map(({ id, name }) => ({ id, name })));
  }
  if (req.method === 'GET' && path === '/api/search') {
    if (!q) return send(res, 200, []);
    const { data } = await deezer('/search?limit=10&q=' + encodeURIComponent(q));
    const seen = new Set();
    return send(res, 200, data.map((t) => ({ title: t.title_short, artist: t.artist.name }))
      .filter((t) => !seen.has(t.title + t.artist) && seen.add(t.title + t.artist)));
  }
  if (req.method === 'GET' && path === '/api/artists') {
    if (!q) return send(res, 200, []);
    const { data } = await deezer('/search/artist?limit=10&q=' + encodeURIComponent(q));
    const word = (a) => (' ' + normalize(a.name)).includes(' ' + normalize(q));
    return send(res, 200, data.sort((a, b) => word(b) - word(a) || b.nb_fan - a.nb_fan).slice(0, 6)
      .map((a) => ({ id: a.id, name: a.name, picture: a.picture_small, fans: a.nb_fan })));
  }
  if (req.method === 'GET' && path === '/api/me') {
    const user = currentUser(req);
    const history = user ? db.prepare(`SELECT source, score, correct, played_at FROM games
      WHERE user_id = ? ORDER BY played_at DESC LIMIT 10`).all(user.id) : [];
    return send(res, 200, { user: user && { name: user.name }, googleClientId: GOOGLE_CLIENT_ID, history });
  }
  if (req.method === 'GET' && path === '/api/leaderboard') {
    return send(res, 200, db.prepare(`SELECT u.name, MAX(g.score) AS score, g.source, g.played_at
      FROM games g JOIN users u ON u.id = g.user_id GROUP BY g.user_id ORDER BY score DESC LIMIT 20`).all());
  }
  if (req.method === 'POST' && path === '/api/auth/google') {
    await login(req, res, (await readJson(req)).credential);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/api/auth/logout') {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(cookies(req).sid || '');
    setSession(req, res, '', 0);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/api/games') {
    return send(res, 200, state(await createGame(await readJson(req))));
  }

  const m = path.match(/^\/api\/games\/([\w-]+)\/(clip|hint|guess|giveup|next)$/);
  const g = m && games.get(m[1]);
  if (m && !g) return send(res, 404, { error: 'Hra neexistuje alebo vypršala' });
  if (m && m[2] !== 'clip' && req.method !== 'POST') return send(res, 405, { error: 'Nepovolená metóda' });

  if (m?.[2] === 'clip') {
    const level = Math.min(Math.max(Number(url.searchParams.get('level')) || 1, 1), g.done ? CLIPS.length : g.level);
    const bytes = 10 + CLIPS[level - 1] * 16000; // ID3 header + 128 kbps MP3
    const audio = await fetch(await previewUrl(g.tracks[g.round]), {
      headers: { Range: `bytes=0-${bytes - 1}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!audio.ok) throw Object.assign(new Error('Ukážka nie je dostupná'), { status: 502 });
    return send(res, 200, Buffer.from(await audio.arrayBuffer()).subarray(0, bytes), 'audio/mpeg');
  }
  if (m?.[2] === 'hint') {
    if (!g.done && g.level < CLIPS.length) g.level++;
    return send(res, 200, state(g));
  }
  if (m?.[2] === 'guess') {
    const { guess } = await readJson(req);
    if (g.done) return send(res, 409, { error: 'Kolo už skončilo' });
    if (isCorrect(String(guess || ''), g.tracks[g.round].title)) return send(res, 200, await endRound(g, true));
    g.wrong++;
    return send(res, 200, { correct: false, ...state(g) });
  }
  if (m?.[2] === 'giveup') {
    if (g.done) return send(res, 409, { error: 'Kolo už skončilo' });
    return send(res, 200, await endRound(g, false));
  }
  if (m?.[2] === 'next') {
    if (!g.done) return send(res, 409, { error: 'Kolo ešte neskončilo' });
    if (g.round + 1 >= ROUNDS) return send(res, 200, finish(g, currentUser(req)));
    Object.assign(g, { round: g.round + 1, level: 1, wrong: 0, done: false });
    return send(res, 200, state(g));
  }
  send(res, 404, { error: 'Nenájdené' });
}

http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Chyba servera' });
  });
}).listen(PORT, () => console.log(`songuess beží na http://localhost:${PORT}`));
