import { load, save } from './storage.js';

export const ACHIEVEMENTS = [
  { id: 'firstWin', name: 'Off the mark', desc: 'Win your first match.' },
  { id: 'firstGoal', name: 'First of many', desc: 'Score your first goal.' },
  { id: 'hatTrick', name: 'Match ball', desc: 'One player scores three goals in a match.' },
  { id: 'cleanSheet', name: 'Shut out', desc: 'Win without conceding.' },
  { id: 'thrashing', name: 'Statement win', desc: 'Win by four goals or more.' },
  { id: 'comeback', name: 'Never say die', desc: 'Win after trailing.' },
  { id: 'lateWinner', name: 'Squeaky bum time', desc: 'Score a winner in the 85th minute or later.' },
  { id: 'giantKiller', name: 'Giant killer', desc: 'Beat a side rated 6 or more points above you.' },
  { id: 'legendary', name: 'Built different', desc: 'Win a match on Legendary.' },
  { id: 'league', name: 'Champions', desc: 'Win the Premier League.' },
  { id: 'topFour', name: 'Big nights ahead', desc: 'Finish a league season in the top four.' },
  { id: 'invincible', name: 'Invincibles', desc: 'Finish a league season unbeaten.' },
  { id: 'cup', name: 'Cup kings', desc: "Win Jak's Cup." },
  { id: 'shootout', name: 'Ice in the veins', desc: 'Win a penalty shootout.' },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: 'Score 7 or more in the Finishing Challenge.' },
  { id: 'centurion', name: 'Centurion', desc: 'Score 100 goals in all modes.' },
  { id: 'veteran', name: 'Veteran', desc: 'Play 50 matches.' },
];

const DEFAULT = { matches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, leagues: [], cups: [], bestChallenge: 0, achievements: {}, history: [], seasons: [] };

export const progress = { ...DEFAULT, ...load('progress', {}) };

export function saveProgress() {
  save('progress', progress);
}

export function unlock(id) {
  if (progress.achievements[id]) return null;
  progress.achievements[id] = Date.now();
  saveProgress();
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

// Records a finished match and returns any newly unlocked achievements.
export function recordMatch({ gf, ga, events, userSide = 0, userStrength, oppStrength, difficulty, label, opponent }) {
  progress.matches++;
  progress.gf += gf;
  progress.ga += ga;
  if (gf > ga) progress.wins++;
  else if (gf === ga) progress.draws++;
  else progress.losses++;
  progress.history.unshift({ gf, ga, opponent, label, date: Date.now() });
  progress.history = progress.history.slice(0, 30);
  const got = [];
  const add = (id) => {
    const a = unlock(id);
    if (a) got.push(a);
  };
  const mine = events.filter((e) => e.team === userSide);
  if (gf > 0) add('firstGoal');
  if (gf > ga) {
    add('firstWin');
    if (ga === 0) add('cleanSheet');
    if (gf - ga >= 4) add('thrashing');
    if (oppStrength - userStrength >= 6) add('giantKiller');
    if (difficulty === 'legendary') add('legendary');
    let u = 0;
    let o = 0;
    let trailed = false;
    let lastLeadChange = null;
    for (const e of events) {
      if (e.team === userSide) u++;
      else o++;
      if (u < o) trailed = true;
      if (e.team === userSide && u === o + 1) lastLeadChange = e;
    }
    if (trailed) add('comeback');
    if (lastLeadChange && lastLeadChange.minute + (lastLeadChange.stoppage || 0) >= 85 && u - o === 1) add('lateWinner');
  }
  const tally = {};
  for (const e of mine) if (!e.og) tally[e.name] = (tally[e.name] || 0) + 1;
  if (Object.values(tally).some((n) => n >= 3)) add('hatTrick');
  if (progress.gf >= 100) add('centurion');
  if (progress.matches >= 50) add('veteran');
  saveProgress();
  return got;
}
