export const ROUNDS = 5;
export const CLIPS = [1, 2, 4, 8, 15]; // seconds of preview per level
const BASE = [1000, 700, 400, 200, 100];

export function points(level, wrong) {
  return Math.max(1, Math.round(BASE[level - 1] * 0.8 ** wrong));
}

export function normalize(s) {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/\s(feat|ft)\.?\s.*$/, ' ')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isCorrect(guess, title) {
  const g = normalize(guess);
  return g !== '' && g === normalize(title);
}

export function pickTracks(tracks, n) {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const seen = new Set();
  return shuffled.filter((t) => {
    const key = normalize(t.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, n);
}
