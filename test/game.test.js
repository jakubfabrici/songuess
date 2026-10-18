import { test } from 'node:test';
import assert from 'node:assert/strict';
import { points, isCorrect, pickTracks, normalize, ROUNDS } from '../game.js';

test('points drop with level and wrong guesses', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => points(l, 0)), [1000, 700, 400, 200, 100]);
  assert.equal(points(1, 1), 800);
  assert.equal(points(2, 2), 448);
  assert.equal(points(5, 30), 1);
});

test('guess matching ignores case, accents, punctuation and versions', () => {
  assert.ok(isCorrect('dont stop me now', "Don't Stop Me Now"));
  assert.ok(isCorrect('Under pressure', 'Under Pressure (feat. David Bowie)'));
  assert.ok(isCorrect('zanedbany sex', 'Zanedbaný sex'));
  assert.ok(isCorrect('bohemian rhapsody', 'Bohemian Rhapsody - Remastered 2011'));
  assert.ok(isCorrect('rock and roll', 'Rock & Roll'));
  assert.ok(isCorrect('sunflower', 'Sunflower feat. Swae Lee'));
  assert.ok(!isCorrect('', 'Creep'));
  assert.ok(!isCorrect('creep', 'Yellow'));
});

test('pickTracks returns distinct titles', () => {
  const tracks = ['A', 'A (Live)', 'B', 'C', 'D', 'E', 'F'].map((title, id) => ({ id, title }));
  for (let i = 0; i < 20; i++) {
    const picked = pickTracks(tracks, ROUNDS);
    assert.equal(picked.length, 5);
    assert.equal(new Set(picked.map((t) => t.title.replace(' (Live)', ''))).size, 5);
  }
});

test('normalize keeps word boundaries for artist search', () => {
  assert.ok((' ' + normalize('Elán')).includes(' ' + normalize('elan')));
  assert.ok(!(' ' + normalize('Melanie Martinez')).includes(' ' + normalize('elan')));
});
