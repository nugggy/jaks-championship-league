import * as THREE from 'three';
import { HALF_L, GOAL_HALF, GOAL_H, BALL_R, DIFFICULTY } from './constants.js';
import { Footballer } from './footballer.js';
import { Ball } from './ball.js';
import { kitMaterials } from './playerModel.js';
import { buildKits } from './match.js';
import { DrawLayer } from './input.js';
import { audio } from './audio.js';
import { clamp, rand, gauss } from '../core/util.js';
import { settings } from '../core/storage.js';

const SPOT_X = HALF_L - 11;
const raycaster = new THREE.Raycaster();
const goalPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF_L);
const v2 = new THREE.Vector2();
const tmp = new THREE.Vector3();

function zoneOf(z) {
  return z < -1.1 ? -1 : z > 1.1 ? 1 : 0;
}

export class PenaltyShootout {
  constructor(world, opts) {
    this.world = world;
    this.opts = opts;
    this.emit = opts.onEvent || (() => {});
    this.diff = DIFFICULTY[opts.difficulty || settings.difficulty] || DIFFICULTY.pro;
    this.draw = new DrawLayer(opts.drawCanvas);
    this.group = new THREE.Group();
    world.dynamic.add(this.group);
    this.time = 0;
    this.kicks = [[], []];
    this.turn = opts.userFirst === false ? 1 : 0;
    this.state = 'setup';
    this.stateT = 0;
    this.touch = { active: false, screen: [] };
    const homeIsUser = opts.homeIsUser !== false;
    const [hk, ak] = buildKits(homeIsUser ? opts.userClub : opts.aiClub, homeIsUser ? opts.aiClub : opts.userClub);
    this.kits = homeIsUser ? [hk, ak] : [ak, hk];
    this.clubs = [opts.userClub, opts.aiClub];
    this.squads = [this.buildSquad(0), this.buildSquad(1)];
    this.ball = new Ball(this.group);
    world.setStadium((homeIsUser ? opts.userClub : opts.aiClub).colours);
    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    opts.drawCanvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    audio.startCrowd();
  }

  buildSquad(side) {
    const club = this.clubs[side];
    const kit = this.kits[side];
    const team = { side, dir: 1, isUser: side === 0, club };
    const ids = side === 0 ? this.opts.userLineup : this.opts.aiLineup;
    const players = ids.map((id) => club.players.find((p) => p.id === id)).filter(Boolean);
    const gkData = players.find((p) => p.role === 'GK') || club.players.find((p) => p.role === 'GK') || players[0];
    const takers = players.filter((p) => p !== gkData).sort((a, b) => b.sho - a.sho);
    const outfieldMats = kitMaterials({ shirt: kit.shirt, trim: kit.trim, shorts: kit.shorts, socks: kit.socks });
    const gkMats = kitMaterials({ shirt: kit.gk, trim: '#111', shorts: kit.gk, socks: kit.gk });
    const gk = new Footballer(team, 0, { role: 'GK', d: 0, w: 0 }, gkData, gkMats, { ...kit, shirt: kit.gk, number: '#ffffff' }, this.group);
    const takerModels = takers.map((d, i) => {
      const f = new Footballer(team, i + 1, { role: d.role, d: 0.5, w: 0 }, d, outfieldMats, kit, this.group);
      f.pos.set(-1 + (i % 6) * 0.9, 0, (side ? 2 : -2) + Math.floor(i / 6) * 1.2);
      f.faceTowards(HALF_L, 0);
      return f;
    });
    gk.pos.set(-6, 0, side ? 4 : -4);
    return { team, gk, takers: takerModels, next: 0 };
  }

  start() {
    this.nextKick();
  }

  score() {
    return this.kicks.map((k) => k.filter(Boolean).length);
  }

  decided() {
    const [a, b] = this.kicks;
    const [sa, sb] = this.score();
    if (a.length <= 5 && b.length <= 5) {
      const remA = 5 - a.length;
      const remB = 5 - b.length;
      if (sa + remA < sb || sb + remB < sa) return true;
      return a.length === 5 && b.length === 5 && sa !== sb;
    }
    return a.length === b.length && sa !== sb;
  }

  nextKick() {
    if (this.decided()) {
      const [u, a] = this.score();
      this.state = 'done';
      audio.whistle(3);
      setTimeout(() => this.emit('pensEnd', { user: u, ai: a, userWon: u > a, kicks: this.kicks }), 1200);
      return;
    }
    const kickSide = this.kicks[0].length > this.kicks[1].length ? 1 : this.kicks[1].length > this.kicks[0].length ? 0 : this.turn;
    this.kickSide = kickSide;
    const kickSquad = this.squads[kickSide];
    const keepSquad = this.squads[1 - kickSide];
    // Reset everyone to the centre circle, then bring out the taker and keeper.
    for (const s of this.squads) {
      s.takers.forEach((f, i) => {
        f.pos.set(-1 + (i % 6) * 0.9, 0, (s.team.side ? 2 : -2) + Math.floor(i / 6) * 1.2);
        f.action = null;
        f.faceTowards(HALF_L, 0);
      });
      s.gk.pos.set(-6, 0, s.team.side ? 4 : -4);
      s.gk.action = null;
    }
    const taker = kickSquad.takers[kickSquad.next % kickSquad.takers.length];
    kickSquad.next++;
    taker.pos.set(SPOT_X - 2.2, 0, -0.6);
    taker.faceTowards(HALF_L, 0);
    const gk = keepSquad.gk;
    gk.pos.set(HALF_L - 0.25, 0, 0);
    gk.faceTowards(SPOT_X, 0);
    this.taker = taker;
    this.keeper = gk;
    this.ball.place(SPOT_X, 0);
    this.ball.inGoal = false;
    this.resolved = false;
    this.userDive = null;
    this.state = kickSide === 0 ? 'aim' : 'dive';
    this.stateT = 0;
    this.emit('pensTurn', { userKicking: kickSide === 0, taker: taker.data, keeper: gk.data, score: this.score(), kicks: this.kicks });
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  frame(dtReal) {
    if (this.paused) {
      this.world.render();
      return;
    }
    const dt = Math.min(dtReal, 0.05);
    this.time += dt;
    this.stateT += dt;
    this.world.tick(dt);
    if (this.state === 'dive' && this.stateT > 1.9 && !this.shotTaken) this.aiShoot();
    if (this.state === 'runup') {
      this.taker.target.set(SPOT_X - 0.4, 0, -0.15);
      this.taker.urgency = 0.45;
      if (this.stateT > 0.55 && !this.kicked) {
        this.kicked = true;
        this.taker.setAction('kick', 0.42);
        setTimeout(() => this.strike(), 150);
      }
    }
    for (const s of this.squads) {
      for (const f of [...s.takers, s.gk]) {
        if (f !== this.taker) f.target.copy(f.pos);
        f.update(dt, this.ball.pos, false);
        f.sync(dt);
      }
    }
    if (this.state === 'flight') this.updateFlight(dt);
    this.ball.update(dt);
    this.ball.sync(dt);
    this.updateCamera(dt);
    this.renderOverlay();
    this.world.render();
  }

  updateCamera(dt) {
    const cam = this.world.camera;
    const want = this.state === 'done' ? tmp.set(SPOT_X - 14, 5, 6) : tmp.set(SPOT_X - 7.5, 2.7, 0);
    cam.position.lerp(want, 1 - Math.exp(-dt * 4));
    cam.lookAt(HALF_L, 1.1, 0);
  }

  aimFromScreen(x, y) {
    v2.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(v2, this.world.camera);
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(goalPlane, p)) return null;
    return p;
  }

  pointerDown(e) {
    audio.unlock();
    this.touch.active = true;
    this.touch.screen = [{ x: e.clientX, y: e.clientY }];
  }

  pointerMove(e) {
    if (!this.touch.active) return;
    this.touch.screen.push({ x: e.clientX, y: e.clientY });
  }

  pointerUp() {
    if (!this.touch.active) return;
    this.touch.active = false;
    const s = this.touch.screen;
    if (s.length < 2) return;
    const a = s[0];
    const b = s[s.length - 1];
    if (this.state === 'aim') {
      const target = this.aimFromScreen(b.x, b.y);
      if (!target) return;
      this.userTarget = new THREE.Vector3(HALF_L, clamp(target.y, 0.12, 3.5), clamp(target.z, -6, 6));
      this.state = 'runup';
      this.stateT = 0;
      this.kicked = false;
      this.emit('pensHint', { text: '' });
    } else if (this.state === 'dive' && !this.userDive) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) < 25) return;
      this.userDive = { zone: Math.abs(dx) < 45 ? 0 : dx > 0 ? 1 : -1, high: dy < -60 };
      this.diveKeeper(this.keeper, this.userDive.zone, this.userDive.high);
      if (!this.shotTaken) setTimeout(() => this.aiShoot(), 120);
    }
  }

  diveKeeper(gk, zone, high) {
    if (zone === 0) {
      gk.setAction('dive', 0.6, { side: 0, height: high ? 0.9 : 0.1, vx: 0, vz: 0, recover: 0.4 });
      return;
    }
    // Keeper faces -x, so its right hand side is world -z.
    gk.setAction('dive', 0.9, { side: -zone, height: high ? 1.2 : 0.4, vx: 0, vz: zone * 3.2, recover: 1.5 });
  }

  aiShoot() {
    if (this.shotTaken || this.state !== 'dive') return;
    this.shotTaken = true;
    const r = Math.random();
    const zone = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
    const z = zone === 0 ? rand(-0.8, 0.8) : zone * rand(1.6, GOAL_HALF - 0.35);
    this.userTarget = new THREE.Vector3(HALF_L, rand(0.2, 2.1), z);
    this.state = 'runup';
    this.stateT = 0;
    this.kicked = false;
  }

  strike() {
    const t = this.userTarget;
    const taker = this.taker;
    const sho = taker.data.sho;
    const err = (1.15 - sho / 100) * 0.55 * (this.kickSide === 1 ? 1 / this.diff.ai : 1);
    const target = new THREE.Vector3(HALF_L, clamp(t.y + gauss() * err * 0.6, 0.12, 4), t.z + gauss() * err);
    this.finalTarget = target;
    this.ball.kick(target, { type: 'shot', speed: 22 + sho / 12, from: new THREE.Vector3(SPOT_X, BALL_R, 0) });
    audio.kick(1);
    // AI keeper commits as the ball is struck.
    if (this.kickSide === 0) {
      const ballZone = zoneOf(target.z);
      const guess = Math.random() < 0.28 * this.diff.keeper + 0.05 ? ballZone : [-1, 0, 1][Math.floor(Math.random() * 3)];
      this.aiDive = guess;
      this.diveKeeper(this.keeper, guess, target.y > 1.5);
    }
    this.state = 'flight';
    this.stateT = 0;
  }

  updateFlight() {
    if (this.resolved) return;
    const b = this.ball;
    const target = this.finalTarget;
    const onTarget = Math.abs(target.z) < GOAL_HALF - BALL_R && target.y < GOAL_H - BALL_R;
    if (b.pos.x >= HALF_L - 0.5) {
      this.resolved = true;
      let saved = false;
      if (onTarget) {
        const zone = zoneOf(target.z);
        const keeperZone = this.kickSide === 0 ? this.aiDive : this.userDive ? this.userDive.zone : 0;
        const ovr = this.keeper.data.ovr / 100;
        if (keeperZone === zone) {
          const edge = Math.abs(target.z) > GOAL_HALF - 0.6 || target.y > 2.05;
          const p = (zone === 0 ? 0.85 : 0.55 + ovr * 0.3) * (edge ? 0.45 : 1) * (this.kickSide === 0 ? this.diff.keeper : 1);
          saved = Math.random() < p;
        }
      }
      if (saved) {
        b.vel.set(-b.vel.x * 0.25, rand(2, 4), rand(-5, 5));
        b.isShot = false;
        audio.groan();
      } else if (onTarget) {
        b.inGoal = true;
        audio.roar(this.kickSide === 0 ? 1 : 0.5);
      } else {
        audio.groan();
      }
      const scored = onTarget && !saved;
      this.kicks[this.kickSide].push(scored);
      if (settings.vibration && navigator.vibrate) navigator.vibrate(scored ? 40 : [20, 30, 20]);
      this.emit('pensResult', { scored, saved, kickSide: this.kickSide, score: this.score(), kicks: this.kicks, taker: this.taker.data, keeper: this.keeper.data });
      setTimeout(() => {
        if (this.disposed) return;
        this.turn = 1 - this.kickSide;
        this.shotTaken = false;
        this.nextKick();
      }, 2200);
    }
  }

  renderOverlay() {
    const d = this.draw;
    d.clear();
    if (this.state === 'aim' && this.touch.active && this.touch.screen.length > 1) {
      const s = this.touch.screen;
      d.path(s, '#ffd23f', { width: 6 });
      const end = s[s.length - 1];
      d.target(end.x, end.y, '#ffd23f', 16, this.time);
    }
    if (this.state === 'aim' && !this.touch.active) {
      const p = this.projectV(new THREE.Vector3(HALF_L, 1.2, 0));
      d.pulse(p.x, p.y, '#ffd23f', this.time);
    }
    if (this.state === 'dive' && !this.userDive) {
      const k = clamp(1 - this.stateT / 1.9, 0, 1);
      const w = 220;
      const x = window.innerWidth / 2 - w / 2;
      const y = window.innerHeight - 60;
      d.g.fillStyle = 'rgba(7,17,31,0.7)';
      d.g.fillRect(x, y, w, 8);
      d.g.fillStyle = '#c6f432';
      d.g.fillRect(x, y, w * k, 8);
    }
  }

  projectV(v) {
    const p = v.clone().project(this.world.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
  }

  dispose() {
    this.disposed = true;
    this.opts.drawCanvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.world.dynamic.remove(this.group);
    this.draw.clear();
    audio.stopCrowd();
  }
}
