import { FORMATIONS, ROLE_FIT } from '../game/constants.js';
import { surname } from './util.js';

const modules = import.meta.glob('../data/clubs/*.json', { eager: true, import: 'default' });

const POS_ROLE = { GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' };

function normalisePlayer(p, i) {
  const ovr = p.ovr ?? 70;
  const role = ROLE_FIT[p.role] ? p.role : POS_ROLE[p.pos] || 'CM';
  return {
    id: i,
    name: p.name,
    short: p.short || surname(p.name),
    number: p.number ?? i + 1,
    pos: p.pos || (role === 'GK' ? 'GK' : 'MF'),
    role,
    photo: p.photo || null,
    ovr,
    pac: p.pac ?? ovr,
    sho: p.sho ?? ovr - 10,
    pas: p.pas ?? ovr - 5,
    dri: p.dri ?? ovr - 5,
    def: p.def ?? ovr - 15,
    phy: p.phy ?? ovr - 5,
  };
}

function normaliseClub(c) {
  const players = (c.players || []).map(normalisePlayer);
  // Squads too small for a full XI plus bench get academy players so a match can still run.
  const fillRoles = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'DM', 'LW', 'RW', 'ST', 'ST', 'CM', 'CB', 'GK', 'AM'];
  for (let i = 0; players.length < 16; i++) {
    const role = fillRoles[i % fillRoles.length];
    players.push(normalisePlayer({ name: `Academy Player ${i + 1}`, short: `Academy ${i + 1}`, number: 40 + i, role, pos: role === 'GK' ? 'GK' : 'MF', ovr: 58 }, players.length));
  }
  const top = players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 14);
  const strength = c.strength ?? Math.round(top.reduce((s, p) => s + p.ovr, 0) / Math.max(1, top.length));
  return {
    id: c.id,
    name: c.name,
    short: c.short || c.name,
    abbr: c.abbr || c.name.slice(0, 3).toUpperCase(),
    stadium: c.stadium || `${c.name} Stadium`,
    colours: {
      primary: '#c8102e', secondary: '#ffffff', shorts: '#ffffff', socks: '#c8102e', gk: '#1f9e3a', away: '#10203a', awaySecondary: '#ffffff',
      ...(c.colours || {}),
    },
    crest: c.crest || null,
    strength,
    players,
  };
}

export const clubs = Object.entries(modules)
  .filter(([path, mod]) => !path.endsWith('index.json') && mod && mod.id)
  .map(([, mod]) => normaliseClub(mod))
  .sort((a, b) => a.name.localeCompare(b.name));

export const clubById = Object.fromEntries(clubs.map((c) => [c.id, c]));

// Picks a starting XI for a formation: best fitting player per slot, highest rated first.
export function pickLineup(club, formationName = '4-3-3') {
  const slots = FORMATIONS[formationName];
  const used = new Set();
  const lineup = new Array(slots.length).fill(null);
  // Fill GK first, then slots in order of how scarce their roles are.
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a].role === 'GK' ? -1 : slots[b].role === 'GK' ? 1 : 0));
  for (let pass = 0; pass < ROLE_FIT.CM.length + 1; pass++) {
    for (const i of order) {
      if (lineup[i]) continue;
      const fits = ROLE_FIT[slots[i].role];
      const wanted = pass < fits.length ? fits[pass] : null;
      const candidates = club.players
        .filter((p) => !used.has(p.id) && (wanted ? p.role === wanted : slots[i].role !== 'GK' ? p.role !== 'GK' : true))
        .sort((a, b) => b.ovr - a.ovr);
      if (candidates.length) {
        lineup[i] = candidates[0];
        used.add(candidates[0].id);
      }
    }
  }
  for (let i = 0; i < lineup.length; i++) {
    if (lineup[i]) continue;
    const any = club.players.find((p) => !used.has(p.id));
    lineup[i] = any;
    used.add(any.id);
  }
  return lineup.map((p) => p.id);
}

export function playerById(club, id) {
  return club.players.find((p) => p.id === id);
}

export function bench(club, lineupIds) {
  const s = new Set(lineupIds);
  return club.players.filter((p) => !s.has(p.id));
}
