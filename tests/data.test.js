import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const dir = new URL('../src/data/clubs/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
const ROLES = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

test('20 clubs listed in index.json', () => {
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
  assert.equal(index.length, 20);
  assert.equal(files.length, 20);
  for (const id of index) assert.ok(files.includes(`${id}.json`), id);
});

for (const f of files) {
  test(`club ${f} is valid and its images exist`, () => {
    const c = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.ok(c.id && c.name && c.abbr && c.colours && c.crest);
    assert.ok(existsSync(new URL(`../public/${c.crest}`, import.meta.url)), c.crest);
    assert.ok(c.players.length >= 18, `${c.id} has ${c.players.length} players`);
    assert.ok(c.players.some((p) => p.role === 'GK'));
    for (const p of c.players) {
      assert.ok(ROLES.includes(p.role), `${p.name} role ${p.role}`);
      assert.ok(p.ovr >= 40 && p.ovr <= 99);
      if (p.photo) assert.ok(existsSync(new URL(`../public/${p.photo}`, import.meta.url)), p.photo);
    }
  });
}
