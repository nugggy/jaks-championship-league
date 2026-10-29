// Competition logic: fixtures, simulated results, league tables and cup draws.
// Pure functions over plain data so it can be unit tested in Node.
import { mulberry32, shuffle, poisson } from './util.js';

export const SEASON_LABEL = '2026/27';

// Double round robin via the circle method. Second half mirrors the first with venues swapped.
export function generateFixtures(teamIds, seed = 1) {
  const rng = mulberry32(seed);
  const teams = shuffle(teamIds, rng);
  if (teams.length % 2) teams.push(null);
  const n = teams.length;
  const firstHalf = [];
  const rot = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    const line = [teams[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = line[i];
      const b = line[n - 1 - i];
      if (a == null || b == null) continue;
      // Alternate venues so nobody has long runs of home or away games.
      const home = (r + i) % 2 === 0 ? a : b;
      const away = home === a ? b : a;
      round.push({ h: home, a: away, result: null });
    }
    firstHalf.push(round);
    rot.unshift(rot.pop());
  }
  const secondHalf = firstHalf.map((round) => round.map((m) => ({ h: m.a, a: m.h, result: null })));
  return [...firstHalf, ...shuffle(secondHalf, rng)];
}

// Expected goals from team strengths with a small home advantage.
export function expectedGoals(homeStrength, awayStrength) {
  const diff = (homeStrength - awayStrength) / 10;
  const home = Math.max(0.25, 1.45 + diff * 0.42 + 0.15);
  const away = Math.max(0.2, 1.15 - diff * 0.38);
  return [home, away];
}

// Weighted scorer selection: forwards and good finishers score most.
export function pickScorer(players, rng = Math.random) {
  const weights = players.map((p) => {
    if (p.role === 'GK') return 0.001;
    const base = { ST: 5, LW: 3.2, RW: 3.2, AM: 2.6, CM: 1.2, DM: 0.6, LB: 0.4, RB: 0.4, CB: 0.5 }[p.role] ?? 1;
    return base * Math.pow(Math.max(30, p.sho) / 70, 3);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[players.length - 1];
}

export function simulateMatch(home, away, rng = Math.random) {
  const [lh, la] = expectedGoals(home.strength, away.strength);
  const hg = Math.min(9, poisson(lh, rng));
  const ag = Math.min(9, poisson(la, rng));
  const scorers = [];
  const starters = (club) => club.players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 14);
  for (let i = 0; i < hg; i++) scorers.push({ club: home.id, name: pickScorer(starters(home), rng).name, minute: 1 + Math.floor(rng() * 90) });
  for (let i = 0; i < ag; i++) scorers.push({ club: away.id, name: pickScorer(starters(away), rng).name, minute: 1 + Math.floor(rng() * 90) });
  scorers.sort((a, b) => a.minute - b.minute);
  return { hg, ag, scorers };
}

export function emptyRow(id) {
  return { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
}

export function buildTable(teamIds, fixtures) {
  const rows = Object.fromEntries(teamIds.map((id) => [id, emptyRow(id)]));
  for (const round of fixtures) {
    for (const m of round) {
      if (!m.result) continue;
      const h = rows[m.h];
      const a = rows[m.a];
      if (!h || !a) continue;
      const { hg, ag } = m.result;
      h.p++; a.p++;
      h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
      if (hg > ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (hg < ag) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    }
  }
  return Object.values(rows)
    .map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.id.localeCompare(y.id));
}

export function topScorers(fixtures, limit = 20) {
  const tally = {};
  for (const round of fixtures) {
    for (const m of round) {
      if (!m.result) continue;
      for (const s of m.result.scorers || []) {
        if (s.og) continue;
        const key = `${s.club}|${s.name}`;
        tally[key] = (tally[key] || 0) + 1;
      }
    }
  }
  return Object.entries(tally)
    .map(([key, goals]) => {
      const [club, name] = key.split('|');
      return { club, name, goals };
    })
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function newSeason(clubId, teamIds, seed = Date.now() % 2147483647) {
  return {
    clubId,
    label: SEASON_LABEL,
    seed,
    round: 0,
    fixtures: generateFixtures(teamIds, seed),
    teamIds: teamIds.slice(),
    finished: false,
    created: Date.now(),
  };
}

export function userFixture(season) {
  const round = season.fixtures[season.round];
  if (!round) return null;
  return round.find((m) => m.h === season.clubId || m.a === season.clubId) || null;
}

// Simulates every other match in the current round, then advances.
export function completeRound(season, clubsById, rng = Math.random) {
  const round = season.fixtures[season.round];
  if (!round) return season;
  for (const m of round) {
    if (!m.result) m.result = simulateMatch(clubsById[m.h], clubsById[m.a], rng);
  }
  season.round++;
  if (season.round >= season.fixtures.length) season.finished = true;
  return season;
}

// Knockout cup. Byes are not needed because the draw is always 16 clubs.
export function newCup(clubId, teamIds, rng = Math.random) {
  const others = shuffle(teamIds.filter((t) => t !== clubId), rng).slice(0, 15);
  const entrants = shuffle([clubId, ...others], rng);
  const ties = [];
  for (let i = 0; i < entrants.length; i += 2) ties.push({ h: entrants[i], a: entrants[i + 1], result: null });
  return { clubId, rounds: [ties], stage: 0, eliminated: false, champion: null, created: Date.now() };
}

export const CUP_STAGES = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

export function cupWinner(tie) {
  if (!tie.result) return null;
  const { hg, ag, pens } = tie.result;
  if (hg !== ag) return hg > ag ? tie.h : tie.a;
  if (pens) return pens.h > pens.a ? tie.h : tie.a;
  return null;
}

export function simulateCupTie(home, away, rng = Math.random) {
  const r = simulateMatch(home, away, rng);
  if (r.hg === r.ag) {
    let ph = 0;
    let pa = 0;
    for (let i = 0; i < 5; i++) {
      if (rng() < 0.76) ph++;
      if (rng() < 0.76) pa++;
    }
    while (ph === pa) {
      if (rng() < 0.76) ph++;
      if (rng() < 0.76) pa++;
    }
    r.pens = { h: ph, a: pa };
  }
  return r;
}

export function userCupTie(cup) {
  const ties = cup.rounds[cup.stage];
  return ties ? ties.find((t) => t.h === cup.clubId || t.a === cup.clubId) || null : null;
}

export function advanceCup(cup, clubsById, rng = Math.random) {
  const ties = cup.rounds[cup.stage];
  for (const t of ties) {
    if (!t.result) t.result = simulateCupTie(clubsById[t.h], clubsById[t.a], rng);
  }
  const winners = ties.map(cupWinner);
  if (!winners.includes(cup.clubId)) cup.eliminated = true;
  if (winners.length === 1) {
    cup.champion = winners[0];
    cup.stage++;
    return cup;
  }
  const next = [];
  for (let i = 0; i < winners.length; i += 2) next.push({ h: winners[i], a: winners[i + 1], result: null });
  cup.rounds.push(next);
  cup.stage++;
  return cup;
}
