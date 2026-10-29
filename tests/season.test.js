import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFixtures, buildTable, newSeason, completeRound, userFixture, newCup, advanceCup, cupWinner, simulateMatch } from '../src/core/season.js';
import { compareVersions, mulberry32 } from '../src/core/util.js';

const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
const club = (id, strength) => ({ id, strength, players: Array.from({ length: 16 }, (_, i) => ({ name: `${id}-p${i}`, role: i === 0 ? 'GK' : i > 12 ? 'ST' : 'CM', sho: 70, ovr: 70 })) });
const byId = Object.fromEntries(ids.map((id, i) => [id, club(id, 65 + i)]));

test('fixtures: 38 rounds, every pair meets home and away once', () => {
  const f = generateFixtures(ids, 42);
  assert.equal(f.length, 38);
  const seen = new Set();
  for (const round of f) {
    assert.equal(round.length, 10);
    const inRound = new Set();
    for (const m of round) {
      assert.ok(!inRound.has(m.h) && !inRound.has(m.a), 'team plays twice in a round');
      inRound.add(m.h); inRound.add(m.a);
      const key = `${m.h}>${m.a}`;
      assert.ok(!seen.has(key), `duplicate ${key}`);
      seen.add(key);
    }
  }
  assert.equal(seen.size, 380);
});

test('fixtures are deterministic for a seed', () => {
  assert.deepEqual(generateFixtures(ids, 7), generateFixtures(ids, 7));
});

test('table ordering and points', () => {
  const f = [[{ h: 't0', a: 't1', result: { hg: 2, ag: 0 } }, { h: 't2', a: 't3', result: { hg: 1, ag: 1 } }]];
  const t = buildTable(['t0', 't1', 't2', 't3'], f);
  assert.equal(t[0].id, 't0');
  assert.equal(t[0].pts, 3);
  assert.equal(t[3].id, 't1');
  assert.equal(t.find((r) => r.id === 't2').pts, 1);
});

test('full season completes with 38 games each', () => {
  const s = newSeason('t3', ids, 99);
  const rng = mulberry32(5);
  while (!s.finished) {
    assert.ok(userFixture(s));
    completeRound(s, byId, rng);
  }
  const t = buildTable(ids, s.fixtures);
  t.forEach((r) => assert.equal(r.p, 38));
});

test('simulated scorers match goals', () => {
  const r = simulateMatch(byId.t0, byId.t19, mulberry32(3));
  assert.equal(r.scorers.length, r.hg + r.ag);
});

test('cup produces one champion after 4 stages', () => {
  const c = newCup('t0', ids, mulberry32(11));
  assert.equal(c.rounds[0].length, 8);
  const rng = mulberry32(12);
  while (!c.champion) advanceCup(c, byId, rng);
  assert.equal(c.rounds.length, 4);
  assert.ok(cupWinner(c.rounds[3][0]));
});

test('version comparison', () => {
  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.9', '1.0.10'), -1);
});
