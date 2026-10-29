// Development-only balance harness. Loaded by main.js when running under Vite dev.
import * as THREE from 'three';
import { menu } from '../ui/screens.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startQuick(home = 'arsenal', away = 'liverpool') {
  window.app.endGame();
  window.app.closeDialog();
  menu(window.app);
  document.querySelector('[data-go=quick]')?.click();
  document.querySelector(`[data-id=${home}]`).click();
  document.querySelector(`[data-id=${away}]`).click();
  document.querySelector('[data-kick]').click();
  await wait(300);
  window.app.game.skipIntro();
  await wait(200);
  return window.app.game.state;
}

function quiet(g, fn) {
  const w = window.app.world;
  const rr = w.render;
  const oe = g.emit;
  w.render = () => {};
  g.emit = () => {};
  try {
    return fn();
  } finally {
    w.render = rr;
    g.emit = oe;
  }
}

function keeperTest(n = 200) {
  const g = window.app.game;
  return quiet(g, () => {
    const user = g.teams[0];
    const ai = g.teams[1];
    const shooter = user.players.find((p) => p.slot.role === 'ST');
    const out = { goal: 0, saved: 0, wide: 0, other: 0, corner: { goal: 0, saved: 0 }, centre: { goal: 0, saved: 0 } };
    for (let i = 0; i < n; i++) {
      g.clock = 0; g.half = 1; g.state = 'play'; g.setPiece = null; g.pendingKick = null; g.pendingFreeze = null; g.replay = [];
      for (const p of g.allPlayers) { p.pos.set(-40, 0, (p.index - 5) * 3 + (p.team.side ? 30 : -30)); p.action = null; p.stun = 0; p.vel.set(0, 0, 0); p.target.copy(p.pos); }
      const gk = ai.gk;
      gk.pos.set(51, 0, 0); gk.saveDecided = false; gk.saveResult = false; gk.saveApplied = false;
      const x = 52.5 - (10 + Math.random() * 14);
      const z = (Math.random() - 0.5) * 20;
      shooter.pos.set(x, 0, z);
      g.ball.place(x + 0.5, z);
      const corner = Math.random() < 0.5;
      const tz = (Math.random() < 0.5 ? -1 : 1) * (corner ? 2.3 + Math.random() * 1.1 : Math.random() * 1.5);
      g.shoot(shooter, new THREE.Vector3(52.5, Math.random() * 2.2, tz), false, 0);
      let res = 'other';
      for (let f = 0; f < 240; f++) {
        g.frame(1 / 60);
        if (g.state === 'goal') { res = 'goal'; break; }
        if (g.state === 'restart') { res = 'wide'; break; }
        if (g.ball.owner === gk || (gk.saveApplied && gk.saveResult)) { res = 'saved'; break; }
      }
      out[res]++;
      if (res === 'goal' || res === 'saved') out[corner ? 'corner' : 'centre'][res]++;
    }
    g.state = 'freeze';
    return out;
  });
}

// Plays a whole match with a simple scripted user, returning stats.
function autoMatch(maxFrames = 40000) {
  const g = window.app.game;
  return quiet(g, () => {
    const plans = {};
    let frames = 0;
    const errors = [];
    try {
      while (frames < maxFrames) {
        if (g.state === 'freeze') {
          const p = g.carrier;
          const dist = Math.hypot(52.5 - p.pos.x, p.pos.z);
          let plan;
          const restricted = g.setPiece && !g.setPiece.kicked && g.setPiece.taker === p;
          if (!restricted && dist < 24 && Math.random() < 0.6) {
            plan = { type: 'shot', valid: true, target: new THREE.Vector3(52.5, Math.random() * 2, (Math.random() < 0.5 ? -1 : 1) * Math.random() * 3.4), curve: 0 };
          } else if (!restricted && Math.random() < 0.3) {
            plan = { type: 'dribble', valid: true, path: [p.pos.clone(), new THREE.Vector3(Math.min(50, p.pos.x + 6), 0, p.pos.z), new THREE.Vector3(Math.min(50, p.pos.x + 12), 0, p.pos.z * 0.8)] };
          } else {
            const mates = p.team.players.filter((m) => m !== p && !m.isGK).sort((a, b) => b.pos.x - a.pos.x + (Math.random() - 0.5) * 20);
            plan = { type: 'pass', valid: true, receiver: mates[0], target: mates[0].pos.clone(), curve: 0 };
          }
          plans[plan.type] = (plans[plan.type] || 0) + 1;
          g.executePlan(plan);
        }
        if (g.state === 'halftime') { window.app.closeDialog(); g.resumeSecondHalf(); }
        if (g.state === 'fulltime') break;
        if (g.state === 'replay') g.endReplay();
        g.frame(1 / 30);
        frames++;
      }
    } catch (e) {
      errors.push(String(e.stack));
    }
    window.app.closeDialog();
    return { frames, state: g.state, score: g.score, plans, stats: g.teams.map((t) => ({ ...t.stats, poss: Math.round(t.stats.poss) })), events: g.events.map((e) => `${e.short} ${e.minute}${e.og ? ' og' : ''}`), errors };
  });
}

window.__test = { startQuick, keeperTest, autoMatch };
