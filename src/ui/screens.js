import { icons } from './icons.js';
import { photoStyle, initials } from './hud.js';
import { clubs, clubById, pickLineup, playerById, bench } from '../core/data.js';
import { FORMATIONS, DIFFICULTY } from '../game/constants.js';
import { settings, saveSettings, load, save, remove, clearAll } from '../core/storage.js';
import { progress, ACHIEVEMENTS, saveProgress, unlock } from '../core/progress.js';
import { newSeason, userFixture, buildTable, topScorers, completeRound, simulateMatch, newCup, userCupTie, advanceCup, cupWinner, CUP_STAGES, SEASON_LABEL, simulateCupTie } from '../core/season.js';
import { APP_VERSION, REPO, openExternal, shareLatest } from '../core/updater.js';
import { escapeHtml, pick } from '../core/util.js';
import { audio } from '../game/audio.js';

const h = escapeHtml;

function stars(strength) {
  const v = Math.max(0.5, Math.min(5, (strength - 62) / 5.6));
  let out = '<div class="stars">';
  for (let i = 1; i <= 5; i++) out += `<i class="${v >= i ? 'on' : v >= i - 0.5 ? 'half' : ''}"></i>`;
  return out + '</div>';
}

const crest = (c, cls = '') => `<img class="crest ${cls}" src="${c.crest || ''}" alt="">`;

function topbar(title, extra = '') {
  return `<div class="topbar"><button class="back" data-back aria-label="Back">${icons.back}</button><h2>${h(title)}</h2>${extra}</div>`;
}

export function bindBack(app, root, fn) {
  const b = root.querySelector('[data-back]');
  if (b) b.addEventListener('click', () => { audio.click(); fn(); });
  app.backHandler = fn;
}

// ---------- lineups ----------

export function getLineup(club) {
  const saved = load(`lineup:${club.id}`, null);
  if (saved && FORMATIONS[saved.formation] && Array.isArray(saved.ids) && saved.ids.length === 11 && saved.ids.every((id) => playerById(club, id))) return saved;
  const formation = '4-3-3';
  return { formation, ids: pickLineup(club, formation) };
}

export function aiLineup(club) {
  const formation = pick(['4-3-3', '4-3-3', '4-2-3-1', '4-4-2', '3-5-2']);
  return { formation, ids: pickLineup(club, formation) };
}

// ---------- splash ----------

export function splash(app) {
  app.show(`<div class="screen splash">
    <div class="logo"><div class="l1">Jak's</div><div class="l2">Championship League</div><div class="l3">Season ${SEASON_LABEL}</div></div>
    <div class="status" data-status><div class="spinner"></div><span>Checking for updates</span></div>
  </div>`);
}

// ---------- main menu ----------

export function menu(app) {
  const season = load('season', null);
  const cup = load('cup', null);
  const seasonClub = season && clubById[season.clubId];
  const p = progress;
  app.show(`<div class="screen menu">
    <div class="left">
      <div class="logo"><div class="l1">Jak's</div><div class="l2">Championship League</div><div class="l3">${SEASON_LABEL}</div></div>
      <div class="profile">Played ${p.matches} &middot; Won ${p.wins} &middot; Drawn ${p.draws} &middot; Lost ${p.losses}<br>
      League titles ${p.leagues.length} &middot; Cups ${p.cups.length} &middot; Achievements ${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}</div>
      <div class="version">Version ${APP_VERSION} &middot; ${h(DIFFICULTY[settings.difficulty].label)} &middot; ${settings.matchMinutes} minute matches</div>
      <div class="row" style="margin-top:14px"><button class="btn small" data-share>${icons.share} Share the game</button></div>
    </div>
    <div class="tiles">
      <button class="tile hero" data-go="season">
        ${season && !season.finished ? '<span class="badge">Continue</span>' : ''}
        <span class="ic">${icons.trophy}</span>
        <div class="t">Premier League</div>
        <div class="s">${seasonClub ? `${h(seasonClub.name)}, matchday ${Math.min(season.round + 1, 38)} of 38` : 'Play a full 38 game season with any club'}</div>
      </button>
      <button class="tile wide" data-go="quick"><span class="ic">${icons.ball}</span><div class="t">Kick off</div><div class="s">Quick match, any two clubs</div></button>
      <button class="tile" data-go="cup">${cup && !cup.champion && !cup.eliminated ? '<span class="badge">Live</span>' : ''}<span class="ic">${icons.cup}</span><div class="t">Jak's Cup</div><div class="s">16 team knockout</div></button>
      <button class="tile" data-go="pens"><span class="ic">${icons.glove}</span><div class="t">Shootout</div><div class="s">Penalties only</div></button>
      <button class="tile" data-go="challenge"><span class="ic">${icons.target}</span><div class="t">Finishing</div><div class="s">Best ${p.bestChallenge}/10</div></button>
      <button class="tile" data-go="trophies"><span class="ic">${icons.medal}</span><div class="t">Trophy room</div><div class="s">Records and achievements</div></button>
      <button class="tile" data-go="howto"><span class="ic">${icons.help}</span><div class="t">How to play</div><div class="s">Draw your play</div></button>
      <button class="tile" data-go="settings"><span class="ic">${icons.gear}</span><div class="t">Settings</div><div class="s">Difficulty, sound, updates</div></button>
    </div>
  </div>`, (root) => {
    app.backHandler = null;
    root.querySelector('[data-share]').addEventListener('click', () => app.share());
    root.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.unlock();
        audio.click();
        const go = b.dataset.go;
        if (go === 'season') seasonEntry(app);
        else if (go === 'quick') quickMatch(app);
        else if (go === 'cup') cupEntry(app);
        else if (go === 'pens') shootoutSetup(app);
        else if (go === 'challenge') challengeSetup(app);
        else if (go === 'trophies') trophyRoom(app);
        else if (go === 'howto') howTo(app);
        else if (go === 'settings') settingsScreen(app);
      }),
    );
  });
}

// ---------- club picker ----------

export function pickClub(app, { title, onPick, onBack, exclude = null, sub = '' }) {
  app.show(`<div class="screen solid">
    ${topbar(title, sub ? `<span class="muted">${h(sub)}</span>` : '')}
    <div class="scroll grow"><div class="clubgrid">
      ${clubs.map((c) => `<button class="club" data-id="${c.id}" ${c.id === exclude ? 'disabled style="opacity:.35"' : ''}>
        ${crest(c)}<div class="n">${h(c.short)}</div>${stars(c.strength)}</button>`).join('')}
    </div></div>
  </div>`, (root) => {
    bindBack(app, root, onBack || (() => menu(app)));
    root.querySelectorAll('.club').forEach((b) => b.addEventListener('click', () => { audio.click(); onPick(clubById[b.dataset.id]); }));
  });
}

// ---------- quick match ----------

function quickMatch(app) {
  pickClub(app, {
    title: 'Choose your club',
    onPick: (mine) =>
      pickClub(app, {
        title: 'Choose your opponent',
        sub: `Playing as ${mine.name}`,
        exclude: mine.id,
        onBack: () => quickMatch(app),
        onPick: (opp) =>
          prematch(app, {
            userClub: mine,
            aiClub: opp,
            homeIsUser: true,
            label: 'Friendly',
            allowVenue: true,
            onBack: () => quickMatch(app),
            onKick: (cfg) =>
              app.startMatch({
                ...cfg,
                competition: 'friendly',
                onDone: (res) => resultsScreen(app, res, { label: 'Friendly', onContinue: () => menu(app) }),
              }),
          }),
      }),
  });
}

// ---------- pre-match ----------

export function prematch(app, opts) {
  const { userClub, aiClub, label, onKick, onBack, allowVenue } = opts;
  let homeIsUser = opts.homeIsUser !== false;
  const lineup = getLineup(userClub);
  let formation = lineup.formation;
  let ids = lineup.ids.slice();
  let selected = null;
  const ai = aiLineup(aiClub);

  const render = () => {
    const home = homeIsUser ? userClub : aiClub;
    const away = homeIsUser ? aiClub : userClub;
    const slots = FORMATIONS[formation];
    const benchPlayers = bench(userClub, ids).sort((a, b) => (a.role === 'GK') - (b.role === 'GK') || b.ovr - a.ovr);
    app.show(`<div class="screen solid">
      ${topbar(label, allowVenue ? `<div class="seg"><button data-venue="home" class="${homeIsUser ? 'on' : ''}">Home</button><button data-venue="away" class="${!homeIsUser ? 'on' : ''}">Away</button></div>` : '')}
      <div class="prematch">
        <div class="col" style="display:flex;flex-direction:column;gap:12px;min-height:0">
          <div class="card">
            <div class="versus">
              <div>${crest(home, 'lg')}<div class="nm">${h(home.short)}</div><div class="ha">Home</div>${stars(home.strength)}</div>
              <div class="vs">V</div>
              <div>${crest(away, 'lg')}<div class="nm">${h(away.short)}</div><div class="ha">Away</div>${stars(away.strength)}</div>
            </div>
            <div class="meta"><span>${h(home.stadium)}</span><span>${h(DIFFICULTY[settings.difficulty].label)}</span><span>${settings.matchMinutes} min match</span></div>
          </div>
          <div class="card">
            <div class="label">Formation</div>
            <div class="formations">${Object.keys(FORMATIONS).map((f) => `<button class="chip ${f === formation ? 'on' : ''}" data-f="${f}">${f}</button>`).join('')}</div>
            <div class="label" style="margin-top:12px">Opposition</div>
            <div class="muted" style="font-size:13px">${h(aiClub.name)} line up in a ${ai.formation}. Key player: ${h(topPlayer(aiClub).name)} (${topPlayer(aiClub).ovr}).</div>
          </div>
          <div class="side-actions" style="margin-top:auto"><button class="btn primary" data-kick style="flex:1">${icons.play} Kick off</button></div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:8px;min-height:0">
          <div class="row"><div class="label grow" style="margin:0">Starting XI <span style="text-transform:none;letter-spacing:0">(tap two players to swap)</span></div><button class="btn small ghost" data-auto>Best XI</button></div>
          <div class="pitchmini grow">
            ${slots.map((s, i) => {
              const p = playerById(userClub, ids[i]);
              const x = 6 + s.d * 125;
              const y = 50 + s.w * 42;
              return `<button class="dot ${selected && selected.kind === 'xi' && selected.i === i ? 'sel' : ''}" data-xi="${i}" style="left:${Math.min(94, x)}%;top:${y}%">
                <div class="face" ${photoStyle(p)}>${initials(p)}</div><span class="ov">${p.ovr}</span><div class="nm">${h(p.short)}</div></button>`;
            }).join('')}
          </div>
          <div class="benchlist">
            ${benchPlayers.map((p) => `<button class="bp ${selected && selected.kind === 'bench' && selected.id === p.id ? 'sel' : ''}" data-bench="${p.id}">
              <div class="face" ${photoStyle(p)}>${initials(p)}</div><div class="nm">${h(p.short)}</div><div class="ps">${p.role} ${p.ovr}</div></button>`).join('')}
          </div>
        </div>
      </div>
    </div>`, (root) => {
      bindBack(app, root, onBack || (() => menu(app)));
      root.querySelectorAll('[data-venue]').forEach((b) => b.addEventListener('click', () => { homeIsUser = b.dataset.venue === 'home'; render(); }));
      root.querySelectorAll('[data-f]').forEach((b) =>
        b.addEventListener('click', () => {
          formation = b.dataset.f;
          ids = pickLineup(userClub, formation);
          selected = null;
          persist();
          render();
        }),
      );
      root.querySelector('[data-auto]').addEventListener('click', () => {
        ids = pickLineup(userClub, formation);
        selected = null;
        persist();
        render();
      });
      root.querySelectorAll('[data-xi]').forEach((b) => b.addEventListener('click', () => tapPlayer({ kind: 'xi', i: +b.dataset.xi })));
      root.querySelectorAll('[data-bench]').forEach((b) => b.addEventListener('click', () => tapPlayer({ kind: 'bench', id: +b.dataset.bench })));
      root.querySelector('[data-kick]').addEventListener('click', () => {
        audio.unlock();
        persist();
        onKick({ userClub, aiClub, homeIsUser, userLineup: ids.slice(), userFormation: formation, aiLineup: ai.ids, aiFormation: ai.formation });
      });
    });
  };

  const persist = () => save(`lineup:${userClub.id}`, { formation, ids });

  const tapPlayer = (t) => {
    audio.click();
    if (!selected) {
      selected = t;
      render();
      return;
    }
    const a = selected;
    selected = null;
    if (a.kind === 'xi' && t.kind === 'xi') [ids[a.i], ids[t.i]] = [ids[t.i], ids[a.i]];
    else if (a.kind === 'xi' && t.kind === 'bench') ids[a.i] = t.id;
    else if (a.kind === 'bench' && t.kind === 'xi') ids[t.i] = a.id;
    persist();
    render();
  };
  render();
}

function topPlayer(club) {
  return club.players.slice().sort((a, b) => b.ovr - a.ovr)[0];
}

// ---------- results ----------

export function resultsScreen(app, res, { label, onContinue, achievements = [], extra = '' }) {
  const user = clubById[res.userClub];
  const opp = clubById[res.aiClub];
  const home = res.homeIsUser ? user : opp;
  const away = res.homeIsUser ? opp : user;
  const hs = res.homeIsUser ? res.score[0] : res.score[1];
  const as = res.homeIsUser ? res.score[1] : res.score[0];
  const [u, o] = res.score;
  let outcome = u > o ? 'Victory' : u === o ? 'Draw' : 'Defeat';
  if (res.pens) outcome = res.pens.user > res.pens.ai ? 'Won on penalties' : 'Lost on penalties';
  const homeSide = res.homeIsUser ? 0 : 1;
  const evs = (side) => res.events.filter((e) => e.team === side).map((e) => `${h(e.short || e.name)} ${e.minute}${e.stoppage ? `+${e.stoppage}` : ''}'${e.og ? ' (og)' : ''}`);
  const hEv = evs(homeSide);
  const aEv = evs(1 - homeSide);
  const st = (k, lab, pct = false) => {
    const a = res.stats[homeSide][k];
    const b = res.stats[1 - homeSide][k];
    const tot = a + b || 1;
    return `<div><div class="statrow"><div class="v">${a}${pct ? '%' : ''}</div><div><div class="lab">${lab}</div><div class="bar"><i style="width:${(a / tot) * 100}%;background:${res.kits ? res.kits[homeSide] : 'var(--cyan)'}"></i><i style="width:${(b / tot) * 100}%;background:${res.kits ? res.kits[1 - homeSide] : 'var(--gold)'}"></i></div></div><div class="v">${b}${pct ? '%' : ''}</div></div></div>`;
  };
  const potm = res.potm;
  const potmPlayer = potm && (potm.side === 0 ? user : opp).players.find((p) => p.name === potm.name);
  app.show(`<div class="screen solid">
    <div class="topbar"><h2>${h(label)}</h2><button class="btn primary" data-continue>Continue</button></div>
    <div class="result-head">
      <div>${crest(home, 'lg')}<div class="nm">${h(home.short)}</div></div>
      <div><div class="big">${hs} - ${as}</div><div class="outcome" style="color:${u > o || (res.pens && res.pens.user > res.pens.ai) ? 'var(--accent)' : u === o && !res.pens ? 'var(--text)' : 'var(--red)'}">${outcome}</div>
      ${res.pens ? `<div class="muted" style="text-align:center;font-size:13px">Penalties ${res.homeIsUser ? res.pens.user : res.pens.ai} - ${res.homeIsUser ? res.pens.ai : res.pens.user}</div>` : ''}</div>
      <div>${crest(away, 'lg')}<div class="nm">${h(away.short)}</div></div>
    </div>
    <div class="result-grid">
      <div class="card scroll"><div class="label">Goals</div>
        <div class="scorers"><div>${hEv.join('<br>') || '<span class="muted">None</span>'}</div><div class="r">${aEv.join('<br>') || '<span class="muted">None</span>'}</div></div>
        ${achievements.length ? `<div class="label" style="margin-top:14px">Unlocked</div>${achievements.map((a) => `<div style="font-size:13px;margin:4px 0"><b style="color:var(--gold)">${h(a.name)}</b> <span class="muted">${h(a.desc)}</span></div>`).join('')}` : ''}
        ${extra}
      </div>
      <div class="card scroll"><div class="label">Match stats</div>
        ${st('possPct', 'Possession', true)}${st('shots', 'Shots')}${st('onTarget', 'On target')}${st('passesDone', 'Passes completed')}${st('tackles', 'Tackles won')}${st('saves', 'Saves')}${st('corners', 'Corners')}
      </div>
      <div class="card potm"><div class="label">Player of the match</div>
        <div class="ph" ${photoStyle(potmPlayer)}>${initials(potmPlayer)}</div>
        <div class="nm">${h(potm ? potm.name : '')}</div><div class="rt">${potm ? potm.rating.toFixed(1) : ''}</div>
      </div>
    </div>
  </div>`, (root) => {
    app.backHandler = onContinue;
    root.querySelector('[data-continue]').addEventListener('click', () => { audio.click(); onContinue(); });
  });
}

// ---------- league season ----------

function seasonEntry(app) {
  const season = load('season', null);
  if (season && clubById[season.clubId]) return seasonHub(app);
  pickClub(app, {
    title: `Premier League ${SEASON_LABEL}`,
    sub: 'Choose your club',
    onPick: (club) => {
      const s = newSeason(club.id, clubs.map((c) => c.id));
      save('season', s);
      seasonHub(app);
    },
  });
}

function seasonHub(app, tab = 'table', viewRound = null) {
  const s = load('season', null);
  if (!s) return seasonEntry(app);
  const me = clubById[s.clubId];
  const table = buildTable(s.teamIds, s.fixtures);
  const pos = table.findIndex((r) => r.id === s.clubId) + 1;
  const row = table[pos - 1];
  const fx = userFixture(s);
  const round = viewRound ?? Math.min(s.round, 37);

  const tableHtml = `<table class="tbl"><thead><tr><th class="n">#</th><th>Club</th><th class="n">P</th><th class="n">W</th><th class="n">D</th><th class="n">L</th><th class="n">GD</th><th class="n">Pts</th><th>Form</th></tr></thead><tbody>
    ${table.map((r, i) => {
      const c = clubById[r.id];
      const zone = i < 4 ? 'zone-cl' : i < 6 ? 'zone-el' : i >= 17 ? 'zone-rel' : '';
      return `<tr class="${r.id === s.clubId ? 'me' : ''} ${zone}"><td class="n">${i + 1}</td><td><div class="club-cell">${crest(c, 'xs')}${h(c.short)}</div></td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="n pts">${r.pts}</td><td><span class="form">${r.form.map((f) => `<i class="${f}">${f}</i>`).join('')}</span></td></tr>`;
    }).join('')}</tbody></table>`;

  const fixturesHtml = `<div class="round-pick"><button class="btn small ghost" data-rp="-1">${icons.back}</button><div class="grow" style="text-align:center;font-family:var(--head);font-weight:800;font-size:18px">Matchday ${round + 1}</div><button class="btn small ghost" data-rp="1" style="transform:scaleX(-1)">${icons.back}</button></div>
    ${s.fixtures[round].map((m) => {
      const hc = clubById[m.h];
      const ac = clubById[m.a];
      const mine = m.h === s.clubId || m.a === s.clubId;
      return `<div class="fixture-row ${mine ? 'me' : ''}"><div></div><div class="h">${h(hc.short)} ${crest(hc, 'xs')}</div><div class="s">${m.result ? `${m.result.hg} - ${m.result.ag}` : 'v'}</div><div class="a">${crest(ac, 'xs')} ${h(ac.short)}</div></div>`;
    }).join('')}`;

  const scorers = topScorers(s.fixtures, 20);
  const scorersHtml = scorers.length
    ? `<table class="tbl"><thead><tr><th class="n">#</th><th>Player</th><th>Club</th><th class="n">Goals</th></tr></thead><tbody>${scorers.map((x, i) => `<tr class="${x.club === s.clubId ? 'me' : ''}"><td class="n">${i + 1}</td><td>${h(x.name)}</td><td><div class="club-cell">${crest(clubById[x.club], 'xs')}${h(clubById[x.club].short)}</div></td><td class="n pts">${x.goals}</td></tr>`).join('')}</tbody></table>`
    : '<div class="muted" style="padding:10px">No goals yet. Get the season started.</div>';

  const squadHtml = `<table class="tbl"><thead><tr><th class="n">No</th><th>Player</th><th>Pos</th><th class="n">OVR</th><th class="n">PAC</th><th class="n">SHO</th><th class="n">PAS</th><th class="n">DRI</th><th class="n">DEF</th><th class="n">Goals</th></tr></thead><tbody>
    ${me.players.slice().sort((a, b) => b.ovr - a.ovr).map((p) => {
      const g = scorers.find((x) => x.club === me.id && x.name === p.name);
      return `<tr><td class="n">${p.number}</td><td>${h(p.name)}</td><td>${p.role}</td><td class="n pts">${p.ovr}</td><td class="n">${p.pac}</td><td class="n">${p.sho}</td><td class="n">${p.pas}</td><td class="n">${p.dri}</td><td class="n">${p.def}</td><td class="n">${g ? g.goals : 0}</td></tr>`;
    }).join('')}</tbody></table>`;

  const opp = fx ? clubById[fx.h === s.clubId ? fx.a : fx.h] : null;
  const userHome = fx && fx.h === s.clubId;
  const nextCard = s.finished
    ? `<div class="card next-fixture"><div class="label">Season complete</div>
        <div style="font-family:var(--head);font-weight:800;font-size:40px">${ordinal(pos)}</div>
        <div class="muted" style="margin-bottom:10px">${seasonVerdict(pos)}</div>
        <div class="btns"><button class="btn primary" data-new>New season</button></div></div>`
    : `<div class="card next-fixture"><div class="label">Matchday ${s.round + 1} of 38</div>
        <div class="teams"><div>${crest(userHome ? me : opp, 'lg')}<div class="nm">${h((userHome ? me : opp).short)}</div></div><div class="muted" style="font-family:var(--head);font-weight:800;font-size:22px">V</div><div>${crest(userHome ? opp : me, 'lg')}<div class="nm">${h((userHome ? opp : me).short)}</div></div></div>
        <div class="muted" style="font-size:12px;margin-bottom:10px">${h((userHome ? me : opp).stadium)}</div>
        <div class="btns"><button class="btn primary" data-play>${icons.play} Play</button><button class="btn" data-sim>Simulate</button></div></div>`;

  app.show(`<div class="screen solid">
    ${topbar(`${me.name} ${SEASON_LABEL}`, `<button class="btn small ghost" data-abandon>Abandon</button>`)}
    <div class="hub">
      <div class="col">
        ${nextCard}
        <div class="card posbox"><div><div class="v">${ordinal(pos)}</div><div class="k">Position</div></div><div><div class="v">${row.pts}</div><div class="k">Points</div></div><div><div class="v">${row.w}-${row.d}-${row.l}</div><div class="k">W-D-L</div></div></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;min-height:0">
        <div class="tabs">${['table', 'fixtures', 'scorers', 'squad'].map((t) => `<button class="tab ${t === tab ? 'on' : ''}" data-tab="${t}">${{ table: 'Table', fixtures: 'Fixtures', scorers: 'Top scorers', squad: 'Squad' }[t]}</button>`).join('')}</div>
        <div class="scroll grow">${tab === 'table' ? tableHtml : tab === 'fixtures' ? fixturesHtml : tab === 'scorers' ? scorersHtml : squadHtml}</div>
      </div>
    </div>
  </div>`, (root) => {
    bindBack(app, root, () => menu(app));
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => seasonHub(app, b.dataset.tab, viewRound)));
    root.querySelectorAll('[data-rp]').forEach((b) => b.addEventListener('click', () => seasonHub(app, 'fixtures', Math.max(0, Math.min(37, round + +b.dataset.rp)))));
    root.querySelector('[data-abandon]').addEventListener('click', () =>
      app.confirm('Abandon season?', 'Your current season will be deleted. This cannot be undone.', 'Abandon', () => {
        remove('season');
        menu(app);
      }),
    );
    root.querySelector('[data-new]')?.addEventListener('click', () => {
      remove('season');
      seasonEntry(app);
    });
    root.querySelector('[data-sim]')?.addEventListener('click', () => {
      fx.result = simulateMatch(clubById[fx.h], clubById[fx.a]);
      finishRound(app, s);
      seasonHub(app, tab);
    });
    root.querySelector('[data-play]')?.addEventListener('click', () =>
      prematch(app, {
        userClub: me,
        aiClub: opp,
        homeIsUser: userHome,
        label: `Premier League, matchday ${s.round + 1}`,
        onBack: () => seasonHub(app),
        onKick: (cfg) =>
          app.startMatch({
            ...cfg,
            competition: 'league',
            onQuit: () => {
              fx.result = userHome ? { hg: 0, ag: 3, scorers: [] } : { hg: 3, ag: 0, scorers: [] };
              finishRound(app, s);
              seasonHub(app);
            },
            onDone: (res, ach) => {
              const scorers = res.events.map((e) => ({ club: e.og ? (e.team === 0 ? me.id : opp.id) : e.club, name: e.name, minute: e.minute + (e.stoppage || 0), og: e.og }));
              fx.result = { hg: userHome ? res.score[0] : res.score[1], ag: userHome ? res.score[1] : res.score[0], scorers };
              const seasonAch = finishRound(app, s);
              resultsScreen(app, res, { label: `Premier League, matchday ${s.round}`, achievements: [...ach, ...seasonAch], onContinue: () => seasonHub(app) });
            },
          }),
      }),
    );
  });
}

function finishRound(app, s) {
  completeRound(s, clubById);
  save('season', s);
  const got = [];
  if (s.finished) {
    const table = buildTable(s.teamIds, s.fixtures);
    const pos = table.findIndex((r) => r.id === s.clubId) + 1;
    const row = table[pos - 1];
    progress.seasons.unshift({ club: s.clubId, pos, pts: row.pts, label: s.label, date: Date.now() });
    if (pos === 1) {
      progress.leagues.push({ club: s.clubId, label: s.label, date: Date.now() });
      const a = unlock('league');
      if (a) got.push(a);
    }
    if (pos <= 4) {
      const a = unlock('topFour');
      if (a) got.push(a);
    }
    if (row.l === 0) {
      const a = unlock('invincible');
      if (a) got.push(a);
    }
    saveProgress();
    if (pos === 1) setTimeout(() => app.toast('Champions', `${clubById[s.clubId].name} win the Premier League`), 600);
  }
  return got;
}

function seasonVerdict(pos) {
  if (pos === 1) return 'Champions of England.';
  if (pos <= 4) return 'Champions League qualification secured.';
  if (pos <= 6) return 'European football next season.';
  if (pos >= 18) return 'Relegated to the Championship.';
  return 'A mid-table finish.';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- cup ----------

function cupEntry(app) {
  const cup = load('cup', null);
  if (cup && clubById[cup.clubId]) return cupHub(app);
  pickClub(app, {
    title: "Jak's Cup",
    sub: 'Choose your club',
    onPick: (club) => {
      save('cup', newCup(club.id, clubs.map((c) => c.id)));
      cupHub(app);
    },
  });
}

function cupHub(app) {
  const cup = load('cup', null);
  if (!cup) return cupEntry(app);
  const me = clubById[cup.clubId];
  const tie = !cup.champion && !cup.eliminated ? userCupTie(cup) : null;
  const opp = tie ? clubById[tie.h === cup.clubId ? tie.a : tie.h] : null;
  const userHome = tie && tie.h === cup.clubId;
  const rounds = [0, 1, 2, 3].map((i) => cup.rounds[i] || null);
  const tieHtml = (t) => {
    if (!t) return '<div class="tie"><div class="tr muted">TBC</div><div class="tr muted">TBC</div></div>';
    const w = cupWinner(t);
    const line = (id, goals, pens) => {
      const c = clubById[id];
      return `<div class="tr ${w ? (w === id ? 'win' : 'lose') : ''}">${crest(c, 'xs')}<span class="grow">${h(c.short)}</span><span class="sc">${t.result ? goals : ''}${t.result && t.result.pens ? `<small class="muted"> (${pens})</small>` : ''}</span></div>`;
    };
    return `<div class="tie ${t.h === cup.clubId || t.a === cup.clubId ? 'me' : ''}">${line(t.h, t.result?.hg, t.result?.pens?.h)}${line(t.a, t.result?.ag, t.result?.pens?.a)}</div>`;
  };
  const sizes = [8, 4, 2, 1];
  const status = cup.champion
    ? cup.champion === cup.clubId ? `${h(me.name)} have won Jak's Cup.` : `${h(clubById[cup.champion].name)} won the cup.`
    : cup.eliminated ? `${h(me.name)} are out of the cup.` : `${CUP_STAGES[cup.stage]}: ${h(me.short)} v ${h(opp.short)}`;
  app.show(`<div class="screen solid">
    ${topbar("Jak's Cup", `<span class="muted" style="margin-right:8px">${status}</span>${tie ? `<button class="btn small" data-sim>Simulate</button><button class="btn small primary" data-play>${icons.play} Play</button>` : `<button class="btn small primary" data-new>New cup</button>`}`)}
    <div class="bracket">
      ${rounds.map((r, i) => `<div class="rd"><div class="label lab">${CUP_STAGES[i]}</div>${Array.from({ length: sizes[i] }, (_, j) => tieHtml(r ? r[j] : null)).join('')}</div>`).join('')}
    </div>
  </div>`, (root) => {
    bindBack(app, root, () => menu(app));
    root.querySelector('[data-new]')?.addEventListener('click', () => {
      remove('cup');
      cupEntry(app);
    });
    const finish = (res, ach = []) => {
      advanceCup(cup, clubById);
      save('cup', cup);
      const got = [...ach];
      if (cup.champion === cup.clubId) {
        progress.cups.push({ club: cup.clubId, date: Date.now() });
        saveProgress();
        const a = unlock('cup');
        if (a) got.push(a);
      }
      return got;
    };
    root.querySelector('[data-sim]')?.addEventListener('click', () => {
      tie.result = simulateCupTie(clubById[tie.h], clubById[tie.a]);
      finish();
      cupHub(app);
    });
    root.querySelector('[data-play]')?.addEventListener('click', () =>
      prematch(app, {
        userClub: me,
        aiClub: opp,
        homeIsUser: userHome,
        label: `Jak's Cup ${CUP_STAGES[cup.stage]}`,
        onBack: () => cupHub(app),
        onKick: (cfg) =>
          app.startMatch({
            ...cfg,
            competition: 'cup',
            onQuit: () => {
              tie.result = userHome ? { hg: 0, ag: 3, scorers: [] } : { hg: 3, ag: 0, scorers: [] };
              finish();
              cupHub(app);
            },
            onDone: (res, ach) => {
              const hg = userHome ? res.score[0] : res.score[1];
              const ag = userHome ? res.score[1] : res.score[0];
              tie.result = { hg, ag, scorers: [] };
              if (res.pens) tie.result.pens = userHome ? { h: res.pens.user, a: res.pens.ai } : { h: res.pens.ai, a: res.pens.user };
              const stage = CUP_STAGES[cup.stage];
              const got = finish(res, ach);
              resultsScreen(app, res, { label: `Jak's Cup ${stage}`, achievements: got, onContinue: () => cupHub(app) });
            },
          }),
      }),
    );
  });
}

// ---------- shootout and challenge ----------

function shootoutSetup(app) {
  pickClub(app, {
    title: 'Shootout: your club',
    onPick: (mine) =>
      pickClub(app, {
        title: 'Shootout: opponent',
        exclude: mine.id,
        onBack: () => shootoutSetup(app),
        onPick: (opp) => {
          const lu = getLineup(mine);
          const ai = aiLineup(opp);
          app.startPens({
            userClub: mine,
            aiClub: opp,
            homeIsUser: true,
            userLineup: lu.ids,
            aiLineup: ai.ids,
            onDone: (r) => {
              const got = [];
              if (r.userWon) {
                const a = unlock('shootout');
                if (a) got.push(a);
              }
              app.alert(r.userWon ? 'You win the shootout' : 'Beaten on penalties', `${h(mine.short)} ${r.user} - ${r.ai} ${h(opp.short)}${got.length ? `<br><br>Unlocked: <b>${h(got[0].name)}</b>` : ''}`, () => menu(app));
            },
          });
        },
      }),
  });
}

function challengeSetup(app) {
  pickClub(app, {
    title: 'Finishing challenge',
    sub: 'Ten chances against a keeper and three defenders',
    onPick: (mine) => {
      const opp = pick(clubs.filter((c) => c.id !== mine.id));
      const lu = getLineup(mine);
      const ai = aiLineup(opp);
      app.startMatch({
        userClub: mine,
        aiClub: opp,
        homeIsUser: true,
        userLineup: lu.ids,
        userFormation: lu.formation,
        aiLineup: ai.ids,
        aiFormation: ai.formation,
        mode: 'challenge',
        competition: 'challenge',
        onQuit: () => menu(app),
        onChallengeEnd: ({ goals, total }) => {
          const best = goals > progress.bestChallenge;
          if (best) progress.bestChallenge = goals;
          saveProgress();
          const got = goals >= 7 ? unlock('sharpshooter') : null;
          app.alert(`${goals} out of ${total}`, `${best ? 'New personal best. ' : ''}Your best is ${progress.bestChallenge}/10.${got ? `<br><br>Unlocked: <b>${h(got.name)}</b>` : ''}`, () => menu(app));
        },
      });
    },
  });
}

// ---------- trophy room ----------

function trophyRoom(app) {
  const p = progress;
  const tile = (v, k) => `<div class="card"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const trophies = [...p.leagues.map((l) => ({ name: 'Premier League', club: l.club, label: l.label })), ...p.cups.map((c) => ({ name: "Jak's Cup", club: c.club, label: '' }))];
  app.show(`<div class="screen solid">
    ${topbar('Trophy room')}
    <div class="scroll grow">
      <div class="stat-tiles">${tile(p.matches, 'Played')}${tile(p.wins, 'Won')}${tile(p.draws, 'Drawn')}${tile(p.losses, 'Lost')}${tile(p.gf, 'Scored')}${tile(p.ga, 'Conceded')}</div>
      <div class="label">Cabinet</div>
      <div class="cabinet">${trophies.length ? trophies.map((t) => `<div class="cup-item">${t.name === "Jak's Cup" ? icons.cup : icons.trophy}<div>${h(t.name)}</div><div>${h(clubById[t.club]?.short || '')} ${h(t.label)}</div></div>`).join('') : '<div class="muted" style="font-size:13px">Empty for now. Win the league or the cup to fill it.</div>'}</div>
      ${p.seasons.length ? `<div class="label">Season history</div><table class="tbl" style="margin-bottom:14px"><tbody>${p.seasons.slice(0, 10).map((s) => `<tr><td>${h(s.label)}</td><td><div class="club-cell">${crest(clubById[s.club] || {}, 'xs')}${h(clubById[s.club]?.short || '')}</div></td><td>${ordinal(s.pos)}</td><td class="n">${s.pts} pts</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="label">Achievements ${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}</div>
      <div class="trophies">${ACHIEVEMENTS.map((a) => `<div class="ach ${p.achievements[a.id] ? 'on' : ''}"><span class="ic">${icons.star}</span><div><div class="nm">${h(a.name)}</div><div class="ds">${h(a.desc)}</div></div></div>`).join('')}</div>
    </div>
  </div>`, (root) => bindBack(app, root, () => menu(app)));
}

// ---------- settings ----------

export function settingsScreen(app, onBack = () => menu(app)) {
  const seg = (key, options) => `<div class="seg">${options.map(([v, l]) => `<button data-set="${key}" data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const tog = (key) => `<button class="toggle ${settings[key] ? 'on' : ''}" data-tog="${key}" aria-label="${key}"></button>`;
  app.show(`<div class="screen solid">
    ${topbar('Settings')}
    <div class="scroll grow"><div class="settings">
      <div class="set"><div><div class="k">Difficulty</div><div class="d">How sharp the opposition is</div></div>${seg('difficulty', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]))}</div>
      <div class="set"><div><div class="k">Match length</div><div class="d">Real minutes per match</div></div>${seg('matchMinutes', [[3, '3'], [5, '5'], [8, '8'], [12, '12']])}</div>
      <div class="set"><div><div class="k">Camera</div><div class="d">Distance behind the play</div></div>${seg('camera', [['close', 'Close'], ['normal', 'Normal'], ['far', 'Far']])}</div>
      <div class="set"><div><div class="k">Graphics</div><div class="d">Applies after restarting the app</div></div>${seg('quality', [['high', 'High'], ['low', 'Battery saver']])}</div>
      <div class="set"><div><div class="k">Sound</div><div class="d">Crowd, whistle and ball</div></div>${tog('sound')}</div>
      <div class="set"><div><div class="k">Vibration</div><div class="d">Goals and tackles</div></div>${tog('vibration')}</div>
      <div class="set"><div><div class="k">Pass risk hints</div><div class="d">Shows how safe a pass is while drawing</div></div>${tog('showRisk')}</div>
      <div class="set"><div><div class="k">Check for updates on launch</div><div class="d">Uses the GitHub release channel</div></div>${tog('autoUpdateCheck')}</div>
      <div class="set"><div><div class="k">Version ${APP_VERSION}</div><div class="d">github.com/${REPO}</div></div><div class="row"><button class="btn small" data-share>${icons.share} Share</button><button class="btn small" data-repo>Releases</button><button class="btn small primary" data-update>${icons.download} Check now</button></div></div>
      <div class="set"><div><div class="k">Reset everything</div><div class="d">Deletes seasons, cups, records and settings</div></div><button class="btn small ghost" data-reset style="color:var(--red)">Reset</button></div>
    </div>
    <p class="muted" style="font-size:11px;line-height:1.5;margin:12px 2px 0">Club names, crests and player photos belong to their respective owners and the Premier League. This is an unofficial fan-made game and is not endorsed by or affiliated with any club or league. Squads reflect the 2026/27 season as listed in October 2026. Player ratings are estimates.</p>
    </div>
  </div>`, (root) => {
    bindBack(app, root, onBack);
    root.querySelectorAll('[data-set]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.set;
        settings[k] = k === 'matchMinutes' ? +b.dataset.v : b.dataset.v;
        saveSettings();
        audio.click();
        settingsScreen(app, onBack);
      }),
    );
    root.querySelectorAll('[data-tog]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.tog;
        settings[k] = !settings[k];
        saveSettings();
        if (k === 'sound') audio.setEnabled(settings.sound);
        audio.click();
        settingsScreen(app, onBack);
      }),
    );
    root.querySelector('[data-update]').addEventListener('click', () => app.checkUpdates(true));
    root.querySelector('[data-share]').addEventListener('click', () => app.share());
    root.querySelector('[data-repo]').addEventListener('click', () => openExternal(`https://github.com/${REPO}/releases`));
    root.querySelector('[data-reset]').addEventListener('click', () =>
      app.confirm('Reset everything?', 'All seasons, cups, records, achievements and settings will be deleted.', 'Reset', () => {
        clearAll();
        location.reload();
      }),
    );
  });
}

// ---------- how to play ----------

export function howTo(app, onBack = () => menu(app)) {
  const pitch = (inner) => `<svg viewBox="0 0 200 86"><rect x="1" y="1" width="198" height="84" rx="8" fill="#2c7a30" stroke="rgba(255,255,255,.5)"/><line x1="100" y1="1" x2="100" y2="85" stroke="rgba(255,255,255,.4)"/>${inner}</svg>`;
  app.show(`<div class="screen solid">
    ${topbar('How to play')}
    <div class="scroll grow"><div class="howto">
      <div class="card">${pitch('<circle cx="40" cy="50" r="6" fill="#c6f432"/><circle cx="120" cy="26" r="6" fill="#fff"/><path d="M40 50 Q80 20 120 26" stroke="#4fd1ff" stroke-width="3" fill="none"/><path d="M40 50 Q70 70 100 62" stroke="#fff" stroke-width="3" fill="none" stroke-dasharray="1 0"/>')}
        <h4>Draw your play</h4><p>When you win the ball the game freezes. Draw a line from your player. End it on a team-mate to pass, in space near a team-mate for a through ball, or anywhere else to dribble along the line. Blue means pass, white means dribble.</p></div>
      <div class="card">${pitch('<rect x="186" y="30" width="12" height="26" fill="none" stroke="#fff" stroke-width="2"/><circle cx="120" cy="56" r="6" fill="#c6f432"/><path d="M120 56 Q170 70 192 38" stroke="#ffd23f" stroke-width="3" fill="none"/>')}
        <h4>Shoot and curl</h4><p>Finish your line inside the goal to shoot. Where the line ends is where you aim, high or low. Bend the line to curl the ball. Tap Lob before drawing to chip the keeper or loft a pass over defenders. Purple lines are lofted.</p></div>
      <div class="card">${pitch('<circle cx="90" cy="40" r="6" fill="#ff5a5a"/><circle cx="60" cy="52" r="6" fill="#c6f432"/><path d="M60 52 L84 43" stroke="#c6f432" stroke-width="3" stroke-dasharray="4 4"/>')}
        <h4>Defend in real time</h4><p>Without the ball the game runs live. Hold your finger on the pitch and your highlighted player runs there. Tap the ball carrier or press Tackle to slide in. Switch moves you to the player nearest the ball.</p></div>
      <div class="card"><h4>Set pieces</h4><p>Corners, throw-ins and goal kicks freeze too. Draw to a team-mate. Corners are crossed into the box automatically.</p></div>
      <div class="card"><h4>Stats matter</h4><p>Pace changes speed. Passing, shooting and dribbling change accuracy and how often you beat a tackle. Defending changes interceptions. Pick your best XI before kick-off.</p></div>
      <div class="card"><h4>Competitions</h4><p>Play a full 2026/27 Premier League season, the 16 team Jak's Cup with penalty shootouts, quick matches, the Finishing Challenge and standalone shootouts.</p></div>
    </div></div>
  </div>`, (root) => bindBack(app, root, onBack));
}
