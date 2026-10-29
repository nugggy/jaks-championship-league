import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Converts player headshots and crests to WebP and rewrites the club JSON paths.
const root = 'public/assets';
let before = 0;
let after = 0;
const convert = async (file) => {
  const out = file.replace(/\.png$/i, '.webp');
  before += statSync(file).size;
  await sharp(file).webp({ quality: 80, alphaQuality: 90, effort: 5 }).toFile(out);
  after += statSync(out).size;
  unlinkSync(file);
};
for (const dir of readdirSync(join(root, 'players'))) {
  for (const f of readdirSync(join(root, 'players', dir))) if (f.endsWith('.png')) await convert(join(root, 'players', dir, f));
}
for (const f of readdirSync(join(root, 'crests'))) if (f.endsWith('.png')) await convert(join(root, 'crests', f));
for (const f of readdirSync('src/data/clubs')) {
  if (f === 'index.json') continue;
  const p = join('src/data/clubs', f);
  const club = JSON.parse(readFileSync(p, 'utf8'));
  if (club.crest) club.crest = club.crest.replace(/\.png$/i, '.webp');
  for (const pl of club.players) if (pl.photo) pl.photo = pl.photo.replace(/\.png$/i, '.webp');
  writeFileSync(p, JSON.stringify(club, null, 2) + '\n');
}
console.log(`images: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
