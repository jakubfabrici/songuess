const $ = (id) => document.getElementById(id);
const audio = $('audio');
let me = { user: null, googleClientId: '', history: [] };
let game = null;      // current game state from the server
let lastStart = null; // body of the last POST /api/games, for "play again"
let artists = [];     // picked artists { id, name }
let revealing = false;

async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  };
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Niečo sa pokazilo');
  return data;
}

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function show(id) {
  for (const s of ['home', 'game', 'summary']) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}

// Debounced suggestion list under an input. Returns a function that closes it.
function suggest(input, list, load, render, pick) {
  let timer, seq = 0;
  const close = () => { seq++; clearTimeout(timer); list.hidden = true; };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      const mine = ++seq;
      const items = await load(q).catch(() => []);
      if (mine !== seq) return;
      list.replaceChildren(...items.map((item) => {
        const li = render(item);
        li.addEventListener('mousedown', (e) => { e.preventDefault(); close(); pick(item); });
        return li;
      }));
      list.hidden = !items.length;
    }, 250);
  });
  input.addEventListener('blur', close);
  return close;
}

// --- Account --------------------------------------------------------------

function loadGoogle() {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    document.head.append(s);
  });
}

async function renderAccount() {
  const box = $('account');
  box.replaceChildren();
  if (me.user) {
    const out = el('button', 'Odhlásiť', 'link');
    out.onclick = async () => { await api('/api/auth/logout', {}); await loadHome(); };
    box.append(el('span', me.user.name), out);
  } else if (me.googleClientId) {
    if (!window.google) await loadGoogle();
    google.accounts.id.initialize({
      client_id: me.googleClientId,
      callback: async ({ credential }) => {
        try { await api('/api/auth/google', { credential }); await loadHome(); } catch (e) { alert(e.message); }
      },
    });
    google.accounts.id.renderButton(box, { theme: 'outline', size: 'medium', text: 'signin', locale: 'sk' });
  }
}

// --- Home -----------------------------------------------------------------

const date = (ts) => new Date(ts).toLocaleDateString('sk-SK');

async function loadHome() {
  const [meData, board] = await Promise.all([api('/api/me'), api('/api/leaderboard')]);
  me = meData;
  renderAccount();
  $('board').replaceChildren(...board.map((r) => el('li', `${r.name} · ${r.score} b. · ${r.source}`)));
  if (!board.length) $('board').append(el('li', 'Zatiaľ prázdny. Prihlás sa a zahraj si.', 'muted'));
  $('history-box').hidden = !me.user;
  $('history').replaceChildren(...me.history.map((h) =>
    el('li', `${date(h.played_at)} · ${h.source} · ${h.score} b. · ${h.correct}/5`)));
  if (me.user && !me.history.length) $('history').append(el('li', 'Zatiaľ žiadna hra.', 'muted'));
}

async function loadCategories() {
  const cats = await api('/api/categories');
  $('categories').replaceChildren(...cats.map((c) => {
    const b = el('button', c.name, 'tile');
    b.onclick = () => startGame({ category: c.id });
    return b;
  }));
}

function renderArtists() {
  $('artist-chips').replaceChildren(...artists.map((a) => {
    const chip = el('button', `${a.name} ✕`, 'chip');
    chip.onclick = () => { artists = artists.filter((x) => x.id !== a.id); renderArtists(); };
    return chip;
  }));
  $('artist-play').disabled = !artists.length;
  $('artist-input').disabled = artists.length >= 5;
  $('artist-input').placeholder = artists.length >= 5 ? 'Najviac 5 interpretov' : 'Hľadaj interpreta alebo skupinu';
}

suggest($('artist-input'), $('artist-list'),
  (q) => api('/api/artists?q=' + encodeURIComponent(q)),
  (a) => {
    const li = el('li');
    const img = el('img');
    img.src = a.picture;
    img.alt = '';
    li.append(img, el('span', a.name), el('small', `${a.fans.toLocaleString('sk-SK')} fanúšikov`));
    return li;
  },
  (a) => {
    if (!artists.some((x) => x.id === a.id)) artists.push({ id: a.id, name: a.name });
    $('artist-input').value = '';
    renderArtists();
  });

$('artist-play').onclick = () => startGame({ artists: artists.map((a) => a.id) });

// --- Game -----------------------------------------------------------------

async function startGame(body) {
  lastStart = body;
  try {
    game = await api('/api/games', body);
  } catch (e) {
    return alert(e.message);
  }
  show('game');
  renderRound();
}

function renderRound() {
  revealing = false;
  audio.pause();
  audio.removeAttribute('src');
  $('g-source').textContent = game.source;
  $('g-round').textContent = `Pieseň ${game.round} / ${game.rounds}`;
  $('playing').hidden = false;
  $('reveal').hidden = true;
  $('g-points').hidden = false;
  $('guess').value = '';
  $('feedback').textContent = 'Stlač ▶ a počúvaj.';
  $('bar-fill').style.width = '0';
  renderLevel();
}

function renderLevel() {
  $('pips').replaceChildren(...game.clips.map((s, i) => {
    const pip = el('span', `${s} s`, i < game.level ? 'on' : '');
    pip.style.flexGrow = s;
    return pip;
  }));
  $('g-points').textContent = `${game.potential} b.`;
  const more = game.level < game.clips.length;
  $('hint').disabled = !more;
  $('hint').textContent = more ? `Dlhšia ukážka (${game.clips[game.level]} s)` : 'Toto je najdlhšia ukážka';
}

function playClip() {
  const src = `/api/games/${game.id}/clip?round=${game.round}&level=${game.level}`;
  if (!audio.src.endsWith(src)) audio.src = src;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function tick() {
  const length = revealing ? audio.duration : game.clips[game.level - 1];
  $('bar-fill').style.width = `${Math.min(100, (audio.currentTime / length) * 100) || 0}%`;
  if (!audio.paused) requestAnimationFrame(tick);
}

audio.addEventListener('play', () => { $('play').textContent = '❚❚'; requestAnimationFrame(tick); });
audio.addEventListener('pause', () => { $('play').textContent = '▶'; });

$('play').onclick = () => {
  if (!audio.paused) return audio.pause();
  if (revealing) return audio.play().catch(() => {});
  playClip();
};

async function act(fn) {
  try { await fn(); } catch (e) { $('feedback').textContent = e.message; }
}

$('hint').onclick = () => act(async () => {
  game = await api(`/api/games/${game.id}/hint`, {});
  renderLevel();
  playClip();
});

const closeGuessList = suggest($('guess'), $('guess-list'),
  (q) => api('/api/search?q=' + encodeURIComponent(q)),
  (t) => {
    const li = el('li');
    li.append(el('span', t.title), el('small', t.artist));
    return li;
  },
  (t) => { $('guess').value = t.title; submitGuess(); });

$('guess-form').onsubmit = (e) => { e.preventDefault(); submitGuess(); };

function submitGuess() {
  closeGuessList();
  const guess = $('guess').value.trim();
  if (!guess) return;
  act(async () => {
    const r = await api(`/api/games/${game.id}/guess`, { guess });
    if (r.correct) return reveal(r);
    game = r;
    $('guess').value = '';
    $('feedback').textContent = `„${guess}“ to nie je. Skús znova alebo si vypočuj dlhšiu ukážku.`;
    $('guess').classList.remove('shake');
    void $('guess').offsetWidth;
    $('guess').classList.add('shake');
    renderLevel();
  });
}

$('giveup').onclick = () => act(async () => reveal(await api(`/api/games/${game.id}/giveup`, {})));

function reveal(r) {
  revealing = true;
  $('playing').hidden = true;
  $('reveal').hidden = false;
  $('g-points').hidden = true;
  $('reveal').className = r.correct ? 'correct' : 'wrong';
  $('r-cover').src = r.cover;
  $('r-title').textContent = r.title;
  $('r-artist').textContent = r.artist;
  $('r-score').textContent = r.correct ? `Správne! +${r.score} b.` : 'Bez bodov';
  $('next').textContent = game.round < game.rounds ? 'Ďalšia pieseň' : 'Výsledky';
  if (r.preview) {
    audio.src = r.preview;
    audio.play().catch(() => {});
  }
}

$('next').onclick = () => act(async () => {
  const r = await api(`/api/games/${game.id}/next`, {});
  if (!r.finished) {
    game = r;
    return renderRound();
  }
  audio.pause();
  $('s-total').textContent = `${r.total} bodov`;
  $('s-info').textContent = `Uhádnuté ${r.correct} z ${r.songs.length} · ${r.source}. ` + (r.saved
    ? 'Skóre je uložené.'
    : me.googleClientId ? 'Prihlás sa a tvoje skóre sa bude ukladať do rebríčka.' : '');
  $('s-songs').replaceChildren(...r.songs.map((s) =>
    el('li', `${s.title} · ${s.artist} · ${s.score ? s.score + ' b.' : 'neuhádnuté'}`, s.score ? '' : 'muted')));
  show('summary');
});

$('again').onclick = () => startGame(lastStart);
$('to-home').onclick = () => { show('home'); loadHome(); };

loadCategories();
loadHome();
renderArtists();
