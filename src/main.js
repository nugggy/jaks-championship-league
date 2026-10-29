import './ui/styles.css';
import * as THREE from 'three';
import { World } from './game/world.js';
import { Match } from './game/match.js';
import { PenaltyShootout } from './game/penalties.js';
import { audio } from './game/audio.js';
import { MatchHud, formatClock, photoStyle, initials } from './ui/hud.js';
import { splash, menu, howTo } from './ui/screens.js';
import { settings, saveSettings } from './core/storage.js';
import { recordMatch } from './core/progress.js';
import { checkForUpdate, openExternal, APP_VERSION, shareLatest } from './core/updater.js';
import { escapeHtml } from './core/util.js';
import { clubs } from './core/data.js';

const $ = (id) => document.getElementById(id);
const screensEl = $('screens');
const hudEl = $('hud');
const modalEl = $('modal');
const toastEl = $('toast');
const drawCanvas = $('draw');
const h = escapeHtml;

const world = new World($('gl'));
world.setStadium({ primary: '#c6f432', secondary: '#13315c' });

const app = {
  world,
  game: null,
  backHandler: null,

  show(html, bind) {
    screensEl.innerHTML = html;
    const root = screensEl.firstElementChild;
    if (bind && root) bind(root);
  },

  clearScreens() {
    screensEl.innerHTML = '';
  },

  toast(title, text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<b>${h(title)}</b><span>${h(text)}</span>`;
    toastEl.appendChild(t);
    setTimeout(() => t.remove(), 3700);
  },

  dialog(html, bind) {
    modalEl.innerHTML = `<div class="overlay"><div class="dialog">${html}</div></div>`;
    if (bind) bind(modalEl.querySelector('.dialog'));
  },

  closeDialog() {
    modalEl.innerHTML = '';
  },

  confirm(title, text, okLabel, onOk) {
    this.dialog(`<h3>${h(title)}</h3><p>${h(text)}</p><div class="actions"><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-ok>${h(okLabel)}</button></div>`, (d) => {
      d.querySelector('[data-no]').addEventListener('click', () => this.closeDialog());
      d.querySelector('[data-ok]').addEventListener('click', () => {
        this.closeDialog();
        onOk();
      });
    });
  },

  // text may contain trusted markup built by the caller with escaped values.
  alert(title, html, onOk) {
    this.dialog(`<h3>${h(title)}</h3><p>${html}</p><div class="actions"><button class="btn primary" data-ok>Continue</button></div>`, (d) => {
      d.querySelector('[data-ok]').addEventListener('click', () => {
        this.closeDialog();
        onOk && onOk();
      });
    });
  },

  async share() {
    audio.click();
    const r = await shareLatest();
    if (r === 'copied') this.toast('Link copied', 'Paste it anywhere to share the latest APK');
    else if (r === 'failed') this.toast('Could not share', 'Sharing is not available on this device');
  },

  async checkUpdates(manual = false) {
    if (manual) this.toast('Updates', 'Checking GitHub for a new version');
    const r = await checkForUpdate();
    if (r.status === 'available') {
      this.dialog(`<h3>Update available</h3><p>Version ${h(r.version)} is ready. You have ${h(APP_VERSION)}. Download the new APK and open it to install. Your seasons and records are kept.</p>
        ${r.notes ? `<div class="notes">${h(r.notes)}</div>` : ''}
        <div class="actions"><button class="btn ghost" data-later>Later</button><button class="btn primary" data-dl>Download update</button></div>`, (d) => {
        d.querySelector('[data-later]').addEventListener('click', () => this.closeDialog());
        d.querySelector('[data-dl]').addEventListener('click', () => {
          openExternal(r.url);
          this.closeDialog();
        });
      });
    } else if (manual) {
      if (r.status === 'current' || r.status === 'none') this.toast('Up to date', `You have the latest version (${APP_VERSION})`);
      else this.toast('Could not check', r.message || 'Try again later');
    }
    return r;
  },

  startMatch(cfg) {
    this.closeDialog();
    this.clearScreens();
    this.backHandler = () => this.pauseMenu();
    const userIsHome = cfg.homeIsUser !== false;
    let hud;
    const match = new Match(world, {
      userClub: cfg.userClub,
      aiClub: cfg.aiClub,
      homeIsUser: userIsHome,
      userLineup: cfg.userLineup,
      userFormation: cfg.userFormation,
      aiLineup: cfg.aiLineup,
      aiFormation: cfg.aiFormation,
      mode: cfg.mode || 'match',
      drawCanvas,
      onEvent: (type, data) => handle(type, data),
    });
    const kits = [match.teams[0].kit.shirt, match.teams[1].kit.shirt];
    const left = userIsHome ? { club: cfg.userClub, kit: kits[0] } : { club: cfg.aiClub, kit: kits[1] };
    const right = userIsHome ? { club: cfg.aiClub, kit: kits[1] } : { club: cfg.userClub, kit: kits[0] };
    hud = new MatchHud(hudEl, {
      left,
      right,
      onPause: () => this.pauseMenu(),
      onTackle: () => match.humanTackle(),
      onSwitch: () => match.switchPlayer(),
      onLob: () => {
        match.lob = !match.lob;
        if (match.touch.drawing) match.updatePreview();
        return match.lob;
      },
    });
    this.game = match;
    this.hud = hud;
    this.matchCfg = cfg;
    const challenge = cfg.mode === 'challenge';
    let challengeEl = null;

    const handle = (type, data) => {
      switch (type) {
        case 'intro':
          hud.intro(userIsHome ? cfg.userClub : cfg.aiClub, userIsHome ? cfg.aiClub : cfg.userClub, cfg.competition === 'league' ? 'Premier League' : cfg.competition === 'cup' ? "Jak's Cup" : 'Friendly');
          break;
        case 'tick': {
          hud.clearIntro();
          if (!challenge) {
            hud.setScore(data.score, !userIsHome);
            hud.setClock(formatClock(data.clock, data.half));
          } else hud.setClock('');
          const owner = match.ball.owner;
          let mode = null;
          if (data.state === 'freeze') mode = 'freeze';
          else if (data.state === 'play' && !(owner && owner.team.isUser) && !challenge) mode = 'defend';
          hud.setMode(mode);
          if (mode === 'defend' && match.controlled !== this.lastShown) {
            this.lastShown = match.controlled;
            hud.showPlayer(match.controlled && match.controlled.data);
          }
          break;
        }
        case 'freeze': {
          this.lastShown = null;
          hud.showPlayer(data.player);
          const who = `<b>${h(data.player.short)}</b>`;
          const hints = {
            corner: `Corner: draw from ${who} to a team-mate in the box`,
            throw: `Throw-in: draw from ${who} to a team-mate`,
            goalKick: `Goal kick: draw from ${who} to a team-mate`,
          };
          hud.setHint(data.restart && hints[data.restart] ? hints[data.restart] : `Draw from ${who}: to a team-mate to pass, into the goal to shoot, into space to dribble`);
          if (!settings.tutorialSeen && !challenge) {
            settings.tutorialSeen = true;
            saveSettings();
            match.pause();
            this.dialog(`<h3>Your ball</h3><p>The game freezes whenever you win the ball. Draw a line with your finger from the highlighted player.</p>
              <p>End on a team-mate to pass. End inside the goal to shoot, and bend the line to curl it. End in space to dribble. Press Lob first to chip or loft it.</p>
              <p>Without the ball, hold on the pitch to move your defender and tap the attacker or press Tackle to win it back.</p>
              <div class="actions"><button class="btn primary" data-ok>Let's play</button></div>`, (d) => d.querySelector('[data-ok]').addEventListener('click', () => {
                this.closeDialog();
                match.resume();
              }));
          }
          break;
        }
        case 'unfreeze':
          break;
        case 'commentary':
          hud.commentary(data);
          break;
        case 'banner':
          hud.banner(data.text, data.kind);
          break;
        case 'goal': {
          const name = data.og ? `${data.short || data.name} (own goal)` : data.short || data.name;
          hud.banner('Goal', 'goal', challenge ? name : `${name} ${data.minute}${data.stoppage ? `+${data.stoppage}` : ''}'`);
          if (challenge && challengeEl) updateChallenge(data.challenge);
          break;
        }
        case 'replay':
          hud.replay(data.on);
          break;
        case 'halftime':
          this.halfTime(data);
          break;
        case 'fulltime':
          if (!challenge) this.fullTime(data);
          break;
        case 'challenge':
          if (!challengeEl) {
            challengeEl = document.createElement('div');
            challengeEl.className = 'challenge-board';
            hudEl.appendChild(challengeEl);
            hud.sb.style.display = 'none';
          }
          updateChallenge(data);
          break;
        case 'challengeEnd':
          this.endGame();
          cfg.onChallengeEnd && cfg.onChallengeEnd(data);
          break;
        default:
          break;
      }
    };
    const updateChallenge = (c) => {
      challengeEl.innerHTML = `<span>Chance <b>${c.attempt}/${c.total}</b></span><span>Goals <b>${c.goals}</b></span>`;
    };
    match.start();
  },

  halfTime(res) {
    const m = this.game;
    const cfg = this.matchCfg;
    const userIsHome = cfg.homeIsUser !== false;
    const [u, a] = res.score;
    const hs = userIsHome ? u : a;
    const as = userIsHome ? a : u;
    const home = userIsHome ? cfg.userClub : cfg.aiClub;
    const away = userIsHome ? cfg.aiClub : cfg.userClub;
    const hi = userIsHome ? 0 : 1;
    const s = res.stats;
    this.dialog(`<h3>Half-time</h3>
      <div class="result-head" style="margin:6px 0 10px"><div><img class="crest lg" src="${home.crest}" alt=""></div><div class="big">${hs} - ${as}</div><div><img class="crest lg" src="${away.crest}" alt=""></div></div>
      <p style="text-align:center">Possession ${s[hi].possPct}% - ${s[1 - hi].possPct}% &middot; Shots ${s[hi].shots} - ${s[1 - hi].shots} &middot; On target ${s[hi].onTarget} - ${s[1 - hi].onTarget}</p>
      <div class="actions"><button class="btn primary" data-ok>Second half</button></div>`, (d) => {
      d.querySelector('[data-ok]').addEventListener('click', () => {
        this.closeDialog();
        m.resumeSecondHalf();
      });
    });
  },

  fullTime(res) {
    const cfg = this.matchCfg;
    res.kits = [this.game.teams[0].kit.shirt, this.game.teams[1].kit.shirt];
    const finish = (pens) => {
      if (pens) res.pens = pens;
      const ach = cfg.competition === 'challenge' ? [] : recordMatch({
        gf: res.score[0],
        ga: res.score[1],
        events: res.events,
        userStrength: cfg.userClub.strength,
        oppStrength: cfg.aiClub.strength,
        difficulty: settings.difficulty,
        label: cfg.competition,
        opponent: cfg.aiClub.id,
      });
      this.endGame();
      cfg.onDone && cfg.onDone(res, ach);
    };
    setTimeout(() => {
      if (cfg.competition === 'cup' && res.score[0] === res.score[1]) {
        this.alert('Penalties', 'Level after 90 minutes. This tie goes to a penalty shootout.', () => {
          this.endGame();
          this.startPens({
            userClub: cfg.userClub,
            aiClub: cfg.aiClub,
            homeIsUser: cfg.homeIsUser,
            userLineup: cfg.userLineup,
            aiLineup: cfg.aiLineup,
            onDone: (p) => finish({ user: p.user, ai: p.ai }),
          });
        });
      } else finish(null);
    }, 1600);
  },

  startPens(cfg) {
    this.clearScreens();
    this.backHandler = () => this.pauseMenu(true);
    hudEl.innerHTML = '';
    const board = document.createElement('div');
    board.className = 'pens-board';
    hudEl.appendChild(board);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hudEl.appendChild(hint);
    const card = document.createElement('div');
    card.className = 'player-card';
    hudEl.appendChild(card);
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn hud-pause';
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.pauseMenu(true);
    });
    hudEl.appendChild(pauseBtn);
    const renderBoard = (kicks) => {
      const row = (club, ks) => {
        const n = Math.max(5, kicks[0].length, kicks[1].length);
        let dots = '';
        for (let i = 0; i < n; i++) dots += `<i class="${ks[i] === true ? 'y' : ks[i] === false ? 'n' : ''}"></i>`;
        return `<img class="crest sm" src="${club.crest}" alt=""><div class="dots">${dots}</div><div class="tot">${ks.filter(Boolean).length}</div>`;
      };
      board.innerHTML = row(cfg.userClub, kicks[0]) + row(cfg.aiClub, kicks[1]);
    };
    const pens = new PenaltyShootout(world, {
      ...cfg,
      drawCanvas,
      onEvent: (type, d) => {
        if (type === 'pensTurn') {
          renderBoard(d.kicks);
          const p = d.userKicking ? d.taker : d.keeper;
          card.innerHTML = `<div class="ph" ${photoStyle(p)}>${initials(p)}</div><div><div class="nm">${h(p.short)}</div><div class="st">${d.userKicking ? 'Taking the penalty' : 'In goal'}</div></div><div class="ovr">${p.ovr}</div>`;
          hint.style.display = '';
          hint.innerHTML = d.userKicking ? 'Draw a line into the goal to aim your penalty' : 'Swipe left, right or up to dive before the shot';
        } else if (type === 'pensResult') {
          renderBoard(d.kicks);
          hint.style.display = 'none';
          const b = document.createElement('div');
          b.className = `banner ${d.scored ? 'goal' : 'save'}`;
          b.innerHTML = `<div class="b1">${d.scored ? 'Scored' : d.saved ? 'Saved' : 'Missed'}</div>`;
          hudEl.appendChild(b);
          setTimeout(() => b.remove(), 1800);
        } else if (type === 'pensEnd') {
          this.endGame();
          cfg.onDone && cfg.onDone(d);
        }
      },
    });
    this.game = pens;
    pens.start();
  },

  pauseMenu(isPens = false) {
    const g = this.game;
    if (!g || modalEl.innerHTML) return;
    if (g.pause) g.pause();
    const cfg = this.matchCfg || {};
    const competitive = !isPens && (cfg.competition === 'league' || cfg.competition === 'cup');
    this.dialog(`<h3>Paused</h3><p>${competitive ? 'Quitting now counts as a 3-0 defeat.' : 'Take a breather.'}</p>
      <div class="actions"><button class="btn ghost" data-quit>Quit</button><button class="btn ghost" data-help>How to play</button><button class="btn primary" data-resume>Resume</button></div>`, (d) => {
      d.querySelector('[data-resume]').addEventListener('click', () => {
        this.closeDialog();
        g.resume && g.resume();
      });
      d.querySelector('[data-help]').addEventListener('click', () => {
        this.closeDialog();
        const prevBack = this.backHandler;
        howTo(this, () => {
          this.clearScreens();
          this.backHandler = prevBack;
          g.resume && g.resume();
        });
      });
      d.querySelector('[data-quit]').addEventListener('click', () => {
        this.closeDialog();
        this.endGame();
        if (!isPens && cfg.onQuit) cfg.onQuit();
        else menu(this);
      });
    });
  },

  endGame() {
    if (this.game) this.game.dispose();
    this.game = null;
    this.hud?.destroy();
    this.hud = null;
    hudEl.innerHTML = '';
    world.resize();
  },
};

window.app = app;

// ---------- render loop ----------

let last = performance.now();
let orbit = 0;
const look = new THREE.Vector3(0, 0, 0);
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (app.game) {
    app.game.frame(dt);
  } else {
    orbit += dt * 0.04;
    world.camera.position.set(Math.cos(orbit) * 70, 26, Math.sin(orbit) * 52);
    world.camera.lookAt(look);
    world.tick(dt);
    world.render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- native integration ----------

async function initNative() {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.hide();
  } catch {
    // Status bar plugin unavailable.
  }
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (modalEl.innerHTML) {
        app.closeDialog();
        if (app.game && app.game.resume) app.game.resume();
        return;
      }
      if (app.backHandler) app.backHandler();
      else App.exitApp();
    });
    App.addListener('pause', () => {
      if (app.game && app.game.state !== 'paused' && app.game.pause) app.pauseMenu(app.game instanceof PenaltyShootout);
    });
  } catch {
    // App plugin unavailable.
  }
}

document.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
document.addEventListener('contextmenu', (e) => e.preventDefault());

async function boot() {
  initNative();
  splash(app);
  if (!clubs.length) {
    app.show('<div class="screen splash"><div class="logo"><div class="l2">No club data</div></div><p class="muted">The squad files are missing from this build.</p></div>');
    return;
  }
  // Preload crests so menus do not pop in.
  clubs.forEach((c) => {
    if (c.crest) new Image().src = c.crest;
  });
  const minSplash = new Promise((r) => setTimeout(r, 1200));
  let update = null;
  if (settings.autoUpdateCheck) update = app.checkUpdates(false);
  await Promise.race([Promise.all([minSplash, update]), new Promise((r) => setTimeout(r, 4000))]);
  menu(app);
}

boot();

if (import.meta.env.DEV) import('./dev/harness.js');
