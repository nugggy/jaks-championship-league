import * as THREE from 'three';
import { HALF_L, HALF_W, GOAL_HALF, GOAL_H, BALL_R, BOX_L, BOX_HALF_W, FORMATIONS, DIFFICULTY, GRAVITY } from './constants.js';
import { Footballer } from './footballer.js';
import { Ball } from './ball.js';
import { kitMaterials, createRing, animatePlayer } from './playerModel.js';
import { positionTeam, aiDecide, nearestTo, depthOf, worldX, worldZ, attackGoalX, distToSegment } from './ai.js';
import { DrawLayer, ACTION_COLOURS } from './input.js';
import { audio } from './audio.js';
import { line } from './commentary.js';
import { clamp, rand, gauss, chance, colourDistance, hexToRgb } from '../core/util.js';
import { settings } from '../core/storage.js';

const STEP = 1 / 60;
const REPLAY_HZ = 30;
const REPLAY_SECONDS = 6;
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const goalPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF_L);
const v2 = new THREE.Vector2();
const tmpV = new THREE.Vector3();

const CAMERA = {
  close: { dist: 11, height: 7, look: 9 },
  normal: { dist: 15, height: 9.5, look: 11 },
  far: { dist: 21, height: 14, look: 13 },
};

function contrast(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

export function buildKits(home, away) {
  const kit = (c, alt) => {
    const shirt = alt ? c.away : c.primary;
    const trim = alt ? c.awaySecondary : c.secondary;
    return {
      shirt,
      trim,
      shorts: alt ? c.away : c.shorts,
      socks: alt ? c.away : c.socks,
      number: colourDistance(trim, shirt) > 200 ? trim : contrast(shirt),
      gk: c.gk,
    };
  };
  const h = kit(home.colours, false);
  let a = kit(away.colours, false);
  if (colourDistance(h.shirt, a.shirt) < 230) a = kit(away.colours, true);
  if (colourDistance(h.shirt, a.shirt) < 160) a = { ...a, shirt: '#f4f4f4', trim: '#222222', shorts: '#222222', socks: '#f4f4f4', number: '#222222' };
  if (colourDistance(h.gk, a.gk) < 150) a.gk = colourDistance(h.gk, '#f2c230') > 150 ? '#f2c230' : '#2d2d2d';
  return [h, a];
}

export class Match {
  constructor(world, opts) {
    this.world = world;
    this.opts = opts;
    this.mode = opts.mode || 'match';
    this.diff = DIFFICULTY[opts.difficulty || settings.difficulty] || DIFFICULTY.pro;
    this.emit = opts.onEvent || (() => {});
    this.draw = new DrawLayer(opts.drawCanvas);
    this.group = new THREE.Group();
    world.dynamic.add(this.group);
    this.time = 0;
    this.clock = 0;
    this.half = 1;
    this.state = 'init';
    this.stateT = 0;
    this.score = [0, 0];
    this.events = [];
    this.replay = [];
    this.replayAcc = 0;
    this.positionAcc = 0;
    this.pendingKick = null;
    this.pendingTackles = [];
    this.pendingFreeze = null;
    this.command = null;
    this.setPiece = null;
    this.touch = { active: false, drawing: false, points: [], start: 0, moved: 0, screen: [] };
    this.lob = false;
    this.preview = null;
    this.controlled = null;
    this.switchLock = 0;
    this.minutes = opts.minutes || settings.matchMinutes;
    this.clockRate = 5400 / (this.minutes * 60);
    this.stoppage = [rand(60, 180), rand(120, 300)];
    this.camFocus = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.challenge = this.mode === 'challenge' ? { attempt: 0, total: 10, goals: 0, t: 0, over: false } : null;

    this.buildTeams();
    this.ball = new Ball(this.group);
    this.userRing = createRing('#c6f432');
    this.targetRing = createRing('#4fd1ff');
    this.targetRing.visible = false;
    this.group.add(this.userRing, this.targetRing);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: '#c6f432' }));
    arrow.rotation.x = Math.PI;
    this.arrow = arrow;
    this.group.add(arrow);
    world.setStadium(opts.homeIsUser !== false ? this.teams[0].club.colours : this.teams[1].club.colours);

    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    const c = opts.drawCanvas;
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    audio.startCrowd();
  }

  // ---------- setup ----------

  buildTeams() {
    const o = this.opts;
    const userClub = o.userClub;
    const aiClub = o.aiClub;
    const homeIsUser = o.homeIsUser !== false;
    const [homeKit, awayKit] = buildKits(homeIsUser ? userClub : aiClub, homeIsUser ? aiClub : userClub);
    const userKit = homeIsUser ? homeKit : awayKit;
    const aiKit = homeIsUser ? awayKit : homeKit;
    this.teams = [
      this.makeTeam(0, userClub, o.userLineup, o.userFormation || '4-3-3', userKit, true, 1),
      this.makeTeam(1, aiClub, o.aiLineup, o.aiFormation || '4-3-3', aiKit, false, -1),
    ];
    this.homeIsUser = homeIsUser;
  }

  makeTeam(side, club, lineupIds, formation, kit, isUser, dir) {
    const team = { side, club, isUser, dir, kit, formation, players: [], stats: { poss: 0, shots: 0, onTarget: 0, passes: 0, passesDone: 0, tackles: 0, corners: 0, saves: 0 } };
    const slots = FORMATIONS[formation];
    let use = lineupIds.map((id, i) => ({ id, slot: slots[i] }));
    if (this.mode === 'challenge') {
      const wanted = isUser ? ['ST', 'LW', 'RW'] : ['GK', 'CB', 'CB', 'DM'];
      const picked = [];
      for (const role of wanted) {
        const found = use.find((u) => u.slot.role === role && !picked.includes(u)) || use.find((u) => !picked.includes(u) && u.slot.role !== 'GK');
        picked.push(found);
      }
      use = picked;
    }
    const outfield = kitMaterials({ shirt: kit.shirt, trim: kit.trim, shorts: kit.shorts, socks: kit.socks });
    const gk = kitMaterials({ shirt: kit.gk, trim: '#111', shorts: kit.gk, socks: kit.gk });
    use.forEach(({ id, slot }, i) => {
      const data = club.players.find((p) => p.id === id) || club.players[i];
      const isGK = slot.role === 'GK';
      const k = isGK ? { ...kit, shirt: kit.gk, number: contrast(kit.gk) } : kit;
      const p = new Footballer(team, i, slot, data, isGK ? gk : outfield, k, this.group);
      team.players.push(p);
    });
    team.gk = team.players.find((p) => p.isGK) || null;
    return team;
  }

  other(team) {
    return team === this.teams[0] ? this.teams[1] : this.teams[0];
  }

  get allPlayers() {
    return [...this.teams[0].players, ...this.teams[1].players];
  }

  possessionTeam() {
    if (this.ball.owner) return this.ball.owner.team;
    if (this.ball.intended) return this.ball.intended.team;
    return this.lastPossession || null;
  }

  // ---------- flow ----------

  start() {
    this.state = 'intro';
    this.stateT = 0;
    this.placeKickoff(this.teams[0]);
    if (this.mode === 'challenge') {
      this.nextAttempt();
      return;
    }
    this.firstKick = this.homeIsUser ? this.teams[0] : this.teams[1];
    this.emit('intro', {});
  }

  skipIntro() {
    if (this.state === 'intro') this.kickoff(this.firstKick);
  }

  placeKickoff(kickTeam) {
    for (const team of this.teams) {
      let first = true;
      if (team === kickTeam) team.kicker = null;
      for (const p of team.players) {
        const s = p.slot;
        let d = Math.min(s.d * 0.92, 0.46);
        let x = worldX(team, d);
        let z = worldZ(team, s.w * 0.9);
        if (team === kickTeam && first && (s.role === 'ST' || s.role === 'AM')) {
          x = -team.dir * 0.4;
          z = 0;
          first = false;
          team.kicker = p;
        } else if (!p.isGK && Math.hypot(x, z) < 9.6) {
          const l = Math.hypot(x, z) || 1;
          x = (x / l) * 9.8;
          z = (z / l) * 9.8;
          if (Math.sign(x) === team.dir) x = -team.dir * 1;
        }
        p.pos.set(x, 0, z);
        p.vel.set(0, 0, 0);
        p.target.copy(p.pos);
        p.action = null;
        p.stun = 0;
        p.facing = team.dir > 0 ? 0 : Math.PI;
      }
      if (team === kickTeam && team.kicker) {
        // A second forward stands beside the ball as a short option.
        const partner = team.players.find((p) => p !== team.kicker && ['ST', 'AM', 'LW', 'RW'].includes(p.slot.role));
        if (partner) partner.pos.set(-team.dir * 1.2, 0, 4.5);
      }
      if (team === kickTeam && !team.kicker) {
        team.kicker = team.players[team.players.length - 1];
        team.kicker.pos.set(-team.dir * 0.4, 0, 0);
      }
    }
    this.ball.place(0, 0);
    this.ball.lastTouch = kickTeam;
  }

  kickoff(team) {
    this.placeKickoff(team);
    this.kickTeam = team;
    this.setPiece = null;
    this.command = null;
    this.pendingKick = null;
    this.pendingFreeze = null;
    this.state = 'play';
    audio.whistle(1);
    this.say(this.half === 2 && this.clock <= 2700 + 1 ? line('secondHalf', { team: team.club.short }) : line('kickoff', { team: team.club.short, venue: this.venueName() }));
    this.control(team.kicker, true);
  }

  venueName() {
    return (this.homeIsUser ? this.teams[0] : this.teams[1]).club.stadium;
  }

  say(text) {
    if (text) this.emit('commentary', text);
  }

  // ---------- main loop ----------

  frame(dtReal) {
    const dt = Math.min(dtReal, 0.1);
    this.time += dt;
    this.stateT += dt;
    this.world.tick(dt);
    let simDt = dt;
    if (this.state === 'freeze' || this.state === 'paused' || this.state === 'halftime' || this.state === 'fulltime' || this.state === 'init' || this.state === 'intro') simDt = 0;
    if (this.pendingFreeze) simDt *= 0.3;
    if (this.state === 'replay') {
      this.updateReplay(dt);
    } else {
      // Substep the real frame time so motion stays smooth at any display refresh rate.
      if (simDt > 0) {
        const n = Math.min(8, Math.ceil(simDt / STEP - 1e-6));
        const sub = simDt / n;
        for (let i = 0; i < n; i++) this.step(sub);
      }
      if (this.pendingFreeze) {
        this.pendingFreeze.t -= dt;
        if (this.pendingFreeze.t <= 0) {
          const p = this.pendingFreeze.p;
          this.pendingFreeze = null;
          this.enterFreeze(p);
        }
      }
      if (this.state === 'intro') this.updateIntro(dt);
      if (this.state === 'goal' && this.stateT > 3.2) this.startReplay();
      if (this.state === 'restart' && this.stateT > 1.1) this.takeRestart();
      for (const p of this.allPlayers) p.sync(simDt || dt * 0.15);
      this.ball.sync(dt);
      this.updateCamera(dt);
    }
    this.updateMarkers();
    this.renderOverlay();
    if (this.state !== 'intro' && this.state !== 'replay') this.emit('tick', this.summaryTick());
    const exc = 1 - clamp((HALF_L - Math.abs(this.ball.pos.x)) / 40, 0, 1);
    audio.setExcitement(this.state === 'freeze' ? exc * 0.6 : exc);
    this.world.render();
  }

  summaryTick() {
    return { clock: this.clock, half: this.half, score: this.score, state: this.state };
  }

  step(dt) {
    if (this.state === 'play') {
      if (!this.challenge) this.clock += dt * this.clockRate;
      this.checkPeriod();
    }
    if (this.challenge && this.state === 'play') {
      this.challenge.t += dt;
      if (this.challenge.t > 12) this.endAttempt(false);
    }
    const ball = this.ball;
    const owner = ball.owner;
    if (owner) {
      owner.team.stats.poss += dt;
      this.lastPossession = owner.team;
    }

    this.positionAcc -= dt;
    if (this.positionAcc <= 0) {
      this.positionAcc = 0.15;
      for (const t of this.teams) positionTeam(this, t);
    }
    if (this.state === 'play') {
      this.assignChasers();
      this.updateControlled(dt);
      this.updateCommand(dt);
      this.updateAICarrier(dt);
      this.updateTackles(dt);
    } else if (this.state === 'goal') {
      this.updateCelebration();
    }

    if (this.pendingKick) {
      this.pendingKick.t -= dt;
      if (this.pendingKick.t <= 0) {
        const k = this.pendingKick;
        this.pendingKick = null;
        if (ball.owner === k.p) k.fn();
      }
    }

    if (this.setPiece && this.setPiece.kicked && this.time - this.setPiece.kicked > 2.5) this.setPiece = null;
    ball.prev.copy(ball.pos);
    const look = ball.pos;
    for (const p of this.allPlayers) p.update(dt, look, ball.owner === p);
    this.separate();

    if (ball.owner) {
      const o = ball.owner;
      const f = o.forward();
      if (o.isGK && o.holding) {
        ball.pos.set(o.pos.x + f.x * 0.35, 1.05, o.pos.z + f.z * 0.35);
      } else if (this.setPiece && this.setPiece.type === 'throw' && this.state !== 'play') {
        ball.pos.set(o.pos.x, 2.1, o.pos.z);
      } else {
        const bob = 0.45 + Math.abs(Math.sin(o.model.phase * 0.5)) * 0.25 * Math.min(1, o.speed / 5);
        ball.pos.set(o.pos.x + f.x * bob, BALL_R, o.pos.z + f.z * bob);
      }
      ball.vel.copy(o.vel);
    }
    const evs = ball.update(dt);
    if (evs.includes('post')) {
      audio.post();
      this.say(line('post'));
      this.emit('banner', { text: 'Woodwork', kind: 'info' });
    }
    if (evs.includes('bounce') && ball.vel.y > 2) audio.kick(0.15);

    if (this.state === 'play') {
      this.keepers(dt);
      if (!ball.owner) this.tryControls();
      this.checkBounds();
    }
    if (this.state === 'play' || this.state === 'goal') this.record(dt);
  }

  checkPeriod() {
    const end1 = 2700 + this.stoppage[0];
    const end2 = 5400 + this.stoppage[1];
    const danger = Math.abs(this.ball.pos.x) > HALF_L - 25;
    if (this.half === 1 && this.clock >= end1 && (!danger || this.clock > end1 + 40)) {
      this.half = 2;
      this.clock = 2700;
      this.state = 'halftime';
      audio.whistle(2);
      this.say(line('half'));
      this.emit('halftime', this.result());
    } else if (this.half === 2 && this.clock >= end2 && (!danger || this.clock > end2 + 40)) {
      this.clock = Math.min(this.clock, 5400 + this.stoppage[1] + 40);
      this.state = 'fulltime';
      audio.whistle(3);
      this.say(line('full'));
      this.emit('fulltime', this.result());
    }
  }

  resumeSecondHalf() {
    const kick = this.firstKick === this.teams[0] ? this.teams[1] : this.teams[0];
    this.kickoff(kick);
  }

  pause() {
    if (this.state === 'paused') return;
    this.prevState = this.state;
    this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = this.prevState || 'play';
  }

  // ---------- possession ----------

  assignChasers() {
    const ball = this.ball;
    for (const team of this.teams) {
      const opp = this.other(team);
      const own = ball.owner && ball.owner.team === team;
      if (own) continue;
      const receiver = ball.intended && ball.intended.team === team ? ball.intended : null;
      if (receiver && !receiver.human) {
        // Meet the ball at the earliest point on its path the receiver can reach.
        const meet = this.meetPoint(receiver);
        receiver.target.set(meet.x, 0, meet.z);
        receiver.urgency = 1;
      }
      const candidates = team.players.filter((p) => !p.human && p !== receiver && p.stun <= 0 && !(p.isGK && (ball.isShot || !this.inOwnBox(p, ball.pos, 6))));
      if (!candidates.length) continue;
      const scored = candidates
        .map((p) => {
          const t = Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z) / p.maxSpeed;
          const fut = this.predictBall(Math.min(1.5, t));
          return { p, d: Math.hypot(fut.x - p.pos.x, fut.z - p.pos.z), fut };
        })
        .sort((a, b) => a.d - b.d);
      const humanActive = team.isUser && this.controlled && this.controlled.human;
      const pressers = ball.owner ? (humanActive ? 1 : 2) : receiver || humanActive ? 1 : 1;
      for (let i = 0; i < Math.min(pressers, scored.length); i++) {
        const s = scored[i];
        if (ball.owner && i === 1 && s.d > 14) break;
        const lead = ball.owner ? 0.3 : 0;
        s.p.target.set(clamp(s.fut.x + ball.vel.x * lead, -HALF_L + 0.3, HALF_L - 0.3), 0, clamp(s.fut.z + ball.vel.z * lead, -HALF_W + 0.3, HALF_W - 0.3));
        s.p.urgency = i === 0 ? 1 : 0.8;
        if (ball.owner && i === 0 && s.d < 3) {
          // Close down but stay goal side instead of running straight through the carrier.
          const gx = -team.dir * HALF_L;
          const ox = ball.owner.pos.x;
          const oz = ball.owner.pos.z;
          const l = Math.hypot(gx - ox, oz) || 1;
          s.p.target.set(ox + ((gx - ox) / l) * 1.1, 0, oz + (-oz / l) * 1.1);
        }
      }
      void opp;
    }
  }

  meetPoint(p) {
    for (let t = 0.1; t <= 3; t += 0.1) {
      const q = this.predictBall(t);
      const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z) - 0.6;
      if (d <= p.maxSpeed * t * 0.9) return q;
    }
    return this.predictBall(3);
  }

  predictBall(t) {
    const b = this.ball;
    if (b.owner) return tmpV.set(b.pos.x + b.vel.x * t, 0, b.pos.z + b.vel.z * t).clone();
    const k = 0.85;
    const f = b.onGround ? (1 - Math.exp(-k * t)) / k : t;
    return new THREE.Vector3(b.pos.x + b.vel.x * f, 0, b.pos.z + b.vel.z * f);
  }

  inOwnBox(p, pos, margin = 0) {
    const gx = -p.team.dir * HALF_L;
    return Math.abs(pos.x - gx) < BOX_L + margin && Math.abs(pos.z) < BOX_HALF_W + margin;
  }

  tryControls() {
    const ball = this.ball;
    const speed = ball.hSpeed();
    const list = this.allPlayers
      .map((p) => ({ p, d: Math.hypot(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z) }))
      .sort((a, b) => a.d - b.d);
    for (const { p, d } of list) {
      if (d > 1.6) break;
      if (p.stun > 0 || p.kickCooldown > 0) continue;
      if (p.action && (p.action.type === 'kick' || p.action.type === 'stumble')) continue;
      const keeperZone = p.isGK && this.inOwnBox(p, ball.pos);
      if (p.isGK && ball.isShot && p.saveDecided) continue;
      const intended = p === ball.intended;
      const reach = keeperZone ? 1.3 : intended || speed < 7.5 ? 0.9 : 0.7;
      const maxH = keeperZone ? 2.5 : 1.8;
      if (d > reach || ball.pos.y > maxH) continue;
      const sameSide = ball.lastTouch === p.team;
      if (p === ball.intended || speed < (sameSide || !ball.intended ? 7.5 : 4)) {
        this.control(p);
        return;
      }
      if (ball.tried.has(p)) continue;
      ball.tried.add(p);
      const sameTeam = ball.lastTouch === p.team;
      let prob;
      if (sameTeam) prob = 0.85;
      else {
        // Only players moving towards the ball get a real chance to cut it out.
        const toBall = (ball.pos.x - p.pos.x) * p.vel.x + (ball.pos.z - p.pos.z) * p.vel.z;
        prob = (0.1 + p.data.def / 450) * (p.team.isUser ? 1.15 : this.diff.intercept) * (toBall > 0 ? 1 : 0.55);
        if (speed > 13) prob *= 0.75;
        if (speed > 20) prob *= 0.7;
        if (ball.pos.y > 1.2) prob *= 0.6;
      }
      if (Math.random() < prob) {
        if (!sameTeam) this.say(line('intercept', { a: p.data.short }));
        if (!sameTeam) p.rating += 0.2;
        this.control(p);
        return;
      }
      if (Math.random() < 0.4) {
        // Deflection.
        ball.vel.multiplyScalar(0.45);
        ball.vel.x += rand(-3, 3);
        ball.vel.z += rand(-3, 3);
        ball.lastTouch = p.team;
        ball.intended = null;
        ball.target = null;
        ball.isShot = false;
        ball.curveTime = 0;
      }
    }
  }

  control(p, kickoff = false) {
    const ball = this.ball;
    const prevTouch = ball.lastTouch;
    const passer = ball.lastPasser;
    const wasPass = ball.kickType && !ball.isShot && passer && passer !== p;
    ball.owner = p;
    ball.vel.set(0, 0, 0);
    ball.curveTime = 0;
    ball.isShot = false;
    ball.intended = null;
    ball.target = null;
    ball.lastTouch = p.team;
    p.holding = p.isGK && this.inOwnBox(p, ball.pos);
    for (const t of this.teams) if (t.gk) t.gk.saveDecided = false;
    if (wasPass && prevTouch === p.team && passer.team === p.team) {
      p.team.stats.passesDone++;
      passer.rating += 0.06;
      this.assistCandidate = passer;
      if (Math.random() < 0.35) {
        const long = Math.hypot(p.pos.x - passer.pos.x, p.pos.z - passer.pos.z) > 28;
        this.say(line(long ? 'longPass' : 'pass', { a: passer.data.short, b: p.data.short }));
      }
    } else if (prevTouch !== p.team) {
      this.assistCandidate = null;
    }
    ball.kickType = null;
    p.aiThink = rand(0.35, 0.75) * this.diff.think * (p.isGK ? 2.4 : 1);
    if (this.challenge && !p.team.isUser && this.state === 'play') {
      this.endAttempt(false);
      return;
    }
    if (p.team.isUser && this.state === 'play') {
      if (kickoff) this.enterFreeze(p);
      else this.pendingFreeze = { p, t: 0.18 };
      this.command = null;
    }
  }

  enterFreeze(p) {
    if (this.state !== 'play' && this.state !== 'restart') return;
    if (this.ball.owner !== p) return;
    this.state = 'freeze';
    this.stateT = 0;
    this.carrier = p;
    this.command = null;
    this.lob = false;
    this.touch.drawing = false;
    this.preview = null;
    p.vel.set(0, 0, 0);
    audio.freeze();
    this.emit('freeze', { player: p.data, restart: this.setPiece && this.setPiece.taker === p && !this.setPiece.kicked ? this.setPiece.type : null, isGK: p.isGK });
    this.emit('control', { player: p.data, team: p.team.side });
  }

  // ---------- user commands ----------

  executePlan(plan) {
    const p = this.carrier;
    if (!p || this.ball.owner !== p) return;
    this.state = 'play';
    this.stateT = 0;
    this.preview = null;
    this.emit('unfreeze', {});
    p.holding = false;
    if (plan.type === 'dribble') {
      this.command = { type: 'dribble', path: plan.path, i: 0 };
      return;
    }
    const ball = this.ball;
    p.faceTowards(plan.target.x, plan.target.z);
    p.setAction('kick', 0.42);
    const isShot = plan.type === 'shot' || plan.type === 'chip';
    this.pendingKick = {
      p,
      t: 0.15,
      fn: () => {
        if (isShot) this.shoot(p, plan.target, plan.type === 'chip', plan.curve);
        else this.pass(p, plan.receiver, plan.target, plan.type === 'lob', plan.curve);
        void ball;
      },
    };
    if (this.setPiece) this.setPiece.kicked = this.time;
  }

  pass(p, receiver, target, lofted, curve = 0) {
    const ball = this.ball;
    const len = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
    const err = (1.08 - p.data.pas / 100) * len * 0.035 * (p.team.isUser ? 1 : 1.1 / this.diff.ai);
    const t = new THREE.Vector3(target.x + gauss() * err, 0, target.z + gauss() * err);
    t.x = clamp(t.x, -HALF_L + 0.5, HALF_L - 0.5);
    t.z = clamp(t.z, -HALF_W + 0.5, HALF_W - 0.5);
    const from = new THREE.Vector3(ball.pos.x, ball.pos.y, ball.pos.z);
    ball.kick(t, { type: lofted ? 'lofted' : 'ground', curve, from });
    ball.intended = receiver;
    ball.target = t;
    ball.lastPasser = p;
    ball.lastKicker = p;
    ball.lastTouch = p.team;
    p.kickCooldown = 0.35;
    p.team.stats.passes++;
    audio.kick(lofted ? 0.6 : 0.4);
    if (this.setPiece && this.setPiece.type === 'throw') ball.kickType = 'throw';
  }

  shoot(p, target, chip, curve = 0) {
    const ball = this.ball;
    const dist = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
    const opp = this.other(p.team);
    const pressure = nearestTo(opp.players, p.pos.x, p.pos.z, true).dist;
    const pressK = pressure < 1.5 ? 1.6 : pressure < 3 ? 1.25 : 1;
    const skill = p.team.isUser ? 1 : 1 / this.diff.ai;
    const err = (1.12 - p.data.sho / 100) * dist * 0.055 * pressK * skill;
    const t = new THREE.Vector3(target.x, clamp(target.y + gauss() * err * 0.6, 0.12, 4), target.z + gauss() * err);
    const speed = chip ? 12 + dist * 0.15 : clamp(20 + p.data.sho / 9 - (dist > 30 ? 0 : 1), 18, 33);
    const from = new THREE.Vector3(ball.pos.x, BALL_R, ball.pos.z);
    if (chip) {
      ball.kick(new THREE.Vector3(t.x, Math.max(0.6, t.y), t.z), { type: 'lofted', curve, from });
      ball.isShot = true;
      ball.kickType = 'chip';
    } else {
      ball.kick(t, { type: 'shot', speed, curve, from });
    }
    ball.intended = null;
    ball.target = null;
    ball.lastKicker = p;
    ball.lastTouch = p.team;
    ball.shooter = p;
    ball.shotDistance = dist;
    p.kickCooldown = 0.5;
    p.team.stats.shots++;
    const onTarget = Math.abs(t.z) < GOAL_HALF - BALL_R && t.y < GOAL_H;
    if (onTarget) p.team.stats.onTarget++;
    this.lastShotOnTarget = onTarget;
    for (const tm of this.teams) if (tm.gk) tm.gk.saveDecided = false;
    audio.kick(1);
    this.say(line('shot', { a: p.data.short }));
    this.emit('shot', { team: p.team.side });
  }

  updateCommand() {
    const c = this.command;
    if (!c || c.type !== 'dribble') return;
    const p = this.ball.owner;
    if (!p || p !== this.carrier) {
      this.command = null;
      return;
    }
    let wp = c.path[c.i];
    while (wp && Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z) < 0.9) {
      c.i++;
      wp = c.path[c.i];
    }
    if (!wp) {
      this.command = null;
      this.pendingFreeze = { p, t: 0.12 };
      return;
    }
    p.target.set(wp.x, 0, wp.z);
    p.urgency = 1;
  }

  // ---------- AI ----------

  updateAICarrier(dt) {
    const p = this.ball.owner;
    if (!p || p.team.isUser || this.pendingKick) return;
    if (p.action && p.action.type === 'stumble') return;
    p.aiThink -= dt;
    if (p.aiDribble && p.aiThink > 0) {
      const tx = clamp(p.pos.x + p.aiDribble.dirX * 5, -HALF_L + 1.5, HALF_L - 1.5);
      const tz = clamp(p.pos.z + p.aiDribble.dirZ * 5, -HALF_W + 1.5, HALF_W - 1.5);
      p.target.set(tx, 0, tz);
      p.urgency = 0.95 * this.diff.ai;
    } else if (!p.aiDribble) {
      p.target.copy(p.pos);
    }
    if (p.aiThink > 0) return;
    p.aiThink = rand(0.45, 0.9) * this.diff.think;
    if (this.setPiece && this.setPiece.taker === p && !this.setPiece.kicked) {
      this.aiRestartPass(p);
      return;
    }
    const d = aiDecide(this, p);
    p.holding = false;
    if (d.type === 'dribble') {
      p.aiDribble = d;
      return;
    }
    p.aiDribble = null;
    p.faceTowards(d.target.x, d.target.z);
    p.setAction('kick', 0.42);
    this.pendingKick = {
      p,
      t: 0.15,
      fn: () => {
        if (d.type === 'shoot') this.shoot(p, d.target, false, d.curve);
        else this.pass(p, d.to, d.target, d.lofted, rand(-0.5, 0.5));
      },
    };
  }

  aiRestartPass(p) {
    const team = p.team;
    const sp = this.setPiece;
    let options = team.players.filter((m) => m !== p);
    let lofted = false;
    if (sp.type === 'corner') {
      const gx = attackGoalX(team);
      options = options.filter((m) => Math.abs(m.pos.x - gx) < BOX_L && Math.abs(m.pos.z) < BOX_HALF_W);
      lofted = true;
    } else if (sp.type === 'goalKick') {
      options = options.filter((m) => !m.isGK);
      lofted = Math.random() < 0.6;
    } else {
      options = options.filter((m) => Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 22);
    }
    if (!options.length) options = team.players.filter((m) => m !== p && !m.isGK);
    const pickM = options[Math.floor(Math.random() * options.length)];
    p.faceTowards(pickM.pos.x, pickM.pos.z);
    p.setAction('kick', 0.42);
    sp.kicked = this.time;
    this.pendingKick = { p, t: 0.15, fn: () => this.pass(p, pickM, pickM.pos.clone(), lofted || sp.type === 'throw', 0) };
    p.holding = false;
  }

  updateTackles(dt) {
    const ball = this.ball;
    const owner = ball.owner;
    for (let i = this.pendingTackles.length - 1; i >= 0; i--) {
      const pt = this.pendingTackles[i];
      pt.t -= dt;
      if (pt.t > 0) continue;
      this.pendingTackles.splice(i, 1);
      this.resolveTackle(pt.d, pt.c);
    }
    if (!owner || this.pendingKick || owner.isGK && owner.holding) return;
    const opp = this.other(owner.team);
    for (const d of opp.players) {
      if (d.human || d.isGK || d.stun > 0 || d.action || d.tackleCooldown > 0) continue;
      const dist = Math.hypot(d.pos.x - owner.pos.x, d.pos.z - owner.pos.z);
      if (dist > 1.5) continue;
      const rate = d.team.isUser ? 0.6 : 1.4 * this.diff.tackle;
      if (Math.random() < rate * dt) this.startTackle(d);
    }
  }

  startTackle(d) {
    const ball = this.ball;
    const dir = new THREE.Vector3(ball.pos.x - d.pos.x, 0, ball.pos.z - d.pos.z);
    const dist = dir.length();
    dir.normalize();
    d.faceTowards(ball.pos.x, ball.pos.z);
    d.setAction('tackle', 0.55, { dir, speed: clamp(dist * 3 + 3, 4, 9), recover: 0.45 });
    d.tackleCooldown = 1.6;
    this.pendingTackles.push({ d, c: ball.owner, t: Math.min(0.28, dist / 9 + 0.08) });
  }

  resolveTackle(d, c) {
    const ball = this.ball;
    if (!c || ball.owner !== c) return;
    const dist = Math.hypot(d.pos.x - ball.pos.x, d.pos.z - ball.pos.z);
    if (dist > 1.4) {
      this.say(line('skip', { a: c.data.short, b: d.data.short }));
      return;
    }
    let p = clamp(0.45 + ((d.data.def - c.data.dri) / 100) * 0.9, 0.14, 0.86);
    if (!d.team.isUser) p *= this.diff.tackle;
    if (d.team.isUser && d.human) p = Math.min(0.9, p + 0.08);
    if (Math.random() < p) {
      const dir = d.action && d.action.dir ? d.action.dir : d.forward();
      ball.owner = null;
      ball.vel.set(dir.x * 5 + rand(-1.5, 1.5), 0.5, dir.z * 5 + rand(-1.5, 1.5));
      ball.lastTouch = d.team;
      ball.intended = null;
      ball.tried.clear();
      ball.kickType = null;
      c.setAction('stumble', 0.6);
      c.stun = 0.3;
      d.team.stats.tackles++;
      d.rating += 0.25;
      this.command = null;
      this.say(line('tackle', { a: d.data.short }));
      if (settings.vibration && navigator.vibrate) navigator.vibrate(25);
    } else {
      this.say(line('skip', { a: c.data.short, b: d.data.short }));
    }
  }

  // ---------- goalkeepers ----------

  keepers() {
    const ball = this.ball;
    for (const team of this.teams) {
      const gk = team.gk;
      if (!gk) continue;
      const gx = -team.dir * HALF_L;
      if (ball.owner || !ball.isShot || !ball.lastKicker || ball.lastKicker.team === team) continue;
      const vx = ball.vel.x;
      if (Math.sign(vx) !== Math.sign(gx) || Math.abs(vx) < 3) continue;
      if (!gk.saveDecided) {
        const t = (gk.pos.x - ball.pos.x) / vx;
        if (t <= 0 || t > 2.2) continue;
        gk.saveDecided = true;
        const tg = (gx - ball.pos.x) / vx;
        const ca = ball.curveTime > 0 ? ball.curve : tmpV.set(0, 0, 0);
        const zAt = (tt) => ball.pos.z + ball.vel.z * tt + 0.5 * ca.z * tt * tt;
        const yAt = (tt) => Math.max(BALL_R, ball.pos.y + ball.vel.y * tt - 0.5 * GRAVITY * tt * tt);
        const zg = zAt(tg);
        const yg = yAt(tg);
        const onTarget = Math.abs(zg) < GOAL_HALF && yg < GOAL_H;
        const zp = zAt(t);
        const yp = yAt(t);
        const lateral = zp - gk.pos.z;
        const reaction = 0.2 / (team.isUser ? 1 : this.diff.keeper);
        const reachT = Math.max(0, t - reaction);
        const maxReach = 0.55 + (gk.data.ovr / 100) * 2.1 * Math.min(1, reachT / 0.42) + 0.35;
        const kf = team.isUser ? 0.97 : this.diff.keeper;
        const speed = ball.vel.length();
        let saveP = 0;
        if (onTarget && Math.abs(lateral) <= maxReach && yp < 2.7) {
          // Shots near the keeper are routine, shots into the corners are hard.
          const reachFrac = Math.abs(lateral) / maxReach;
          const dist = ball.shotDistance || 20;
          saveP = (0.78 + (gk.data.ovr / 100) * 0.25) * kf;
          saveP -= Math.abs(lateral) < 0.7 ? 0 : Math.pow(reachFrac, 2) * 0.8;
          saveP -= Math.max(0, speed - 25) * 0.015;
          if (yp > 1.85 && Math.abs(lateral) > 1.6) saveP -= 0.12;
          if (dist < 9) saveP -= 0.15;
          else if (dist > 18) saveP += Math.min(0.15, (dist - 18) * 0.012);
          if (ball.kickType === 'chip' && yp > 1.9) saveP -= 0.35;
          saveP = clamp(saveP, 0.04, 0.97);
        }
        gk.saveResult = onTarget && Math.random() < saveP;
        gk.lastSave = { saveP, lateral, maxReach, yp, onTarget, t };
        gk.saveApplied = false;
        if (Math.abs(lateral) > 0.6 || yp > 1.9) {
          const side = Math.sign(lateral) * team.dir;
          const dur = Math.max(0.5, t + 0.35);
          const reach = clamp(lateral, -maxReach, maxReach);
          gk.faceTowards(gk.pos.x + team.dir, gk.pos.z);
          gk.setAction('dive', dur, { side: side || 1, height: clamp(yp - 0.5, 0, 1.6), vx: 0, vz: (reach * 0.85) / Math.max(0.25, t), recover: 0.6 });
        }
        continue;
      }
      if (gk.saveResult && !gk.saveApplied) {
        const near = Math.abs(ball.pos.x - gk.pos.x) < 0.8 || Math.sign(ball.pos.x - gk.pos.x) === Math.sign(gx - gk.pos.x) && Math.abs(ball.pos.x) > Math.abs(gk.pos.x);
        if (near) {
          gk.saveApplied = true;
          const speed = ball.vel.length();
          team.stats.saves++;
          gk.rating += 0.4;
          if (speed > 21 || Math.random() < 0.5) {
            ball.vel.set(-ball.vel.x * 0.28, rand(2, 5), rand(-6, 6));
            ball.isShot = false;
            ball.curveTime = 0;
            ball.lastTouch = team;
            ball.intended = null;
            ball.tried.clear();
            gk.kickCooldown = 0.6;
            this.say(line('save', { a: gk.data.short }));
            this.emit('banner', { text: 'Saved', kind: 'save' });
            audio.groan();
          } else {
            this.say(line('catch', { a: gk.data.short }));
            this.emit('banner', { text: 'Saved', kind: 'save' });
            gk.action = null;
            this.control(gk);
            gk.holding = true;
          }
        }
      }
    }
  }

  // ---------- out of play and goals ----------

  checkBounds() {
    const b = this.ball;
    const x = b.pos.x;
    const z = b.pos.z;
    const px = b.prev.x;
    if (Math.abs(x) >= HALF_L && Math.abs(px) < HALF_L) {
      const side = Math.sign(x);
      if (Math.abs(z) < GOAL_HALF - BALL_R && b.pos.y < GOAL_H - BALL_R) {
        this.goalScored(side);
        return;
      }
    }
    if (Math.abs(x) > HALF_L + BALL_R && !b.inGoal) {
      const side = Math.sign(x);
      const attacking = this.teams.find((t) => t.dir === side);
      const defending = this.other(attacking);
      if (this.challenge) return this.endAttempt(false);
      if (b.isShot || (b.lastKicker && b.lastKicker.team === attacking && b.kickType)) {
        if (!this.lastShotOnTarget || b.isShot) this.say(line('wide'));
      }
      if (b.lastTouch === attacking) {
        this.startRestart('goalKick', defending, new THREE.Vector3(side * (HALF_L - 5.5), 0, Math.sign(z) * 4));
      } else {
        this.startRestart('corner', attacking, new THREE.Vector3(side * (HALF_L - 0.4), 0, Math.sign(z) * (HALF_W - 0.4)));
      }
      return;
    }
    if (Math.abs(z) > HALF_W + BALL_R) {
      if (this.challenge) return this.endAttempt(false);
      const team = b.lastTouch ? this.other(b.lastTouch) : this.teams[0];
      this.startRestart('throw', team, new THREE.Vector3(clamp(x, -HALF_L + 2, HALF_L - 2), 0, Math.sign(z) * (HALF_W + 0.3)));
    }
  }

  goalScored(side) {
    const b = this.ball;
    const team = this.teams.find((t) => t.dir === side);
    const idx = team.side;
    this.score[idx]++;
    b.inGoal = true;
    b.owner = null;
    b.isShot = false;
    this.world.rippleNet(side, b.pos.z, b.pos.y, Math.min(1.4, b.hSpeed() / 18));
    const kicker = b.lastKicker;
    const own = !kicker || kicker.team !== team;
    const scorer = own ? kicker : kicker;
    const assist = !own && this.assistCandidate && this.assistCandidate !== scorer && this.assistCandidate.team === team ? this.assistCandidate : null;
    const minute = Math.max(1, Math.ceil(this.clock / 60));
    const ev = { team: idx, club: team.club.id, name: scorer ? scorer.data.name : 'Unknown', short: scorer ? scorer.data.short : '', minute: Math.min(minute, this.half === 1 ? 45 : 90), stoppage: minute > (this.half === 1 ? 45 : 90) ? minute - (this.half === 1 ? 45 : 90) : 0, og: own, assist: assist ? assist.data.name : null };
    this.events.push(ev);
    if (scorer && !own) scorer.rating += 1.1;
    if (own && scorer) scorer.rating -= 0.6;
    if (assist) assist.rating += 0.6;
    const conceded = this.other(team);
    for (const p of conceded.players) if (p.isGK || ['CB', 'LB', 'RB'].includes(p.slot.role)) p.rating -= 0.2;
    this.scoringTeam = team;
    this.concedingTeam = conceded;
    if (this.challenge) {
      this.scorer = null;
      this.challenge.goals++;
      this.emit('goal', { ...ev, score: this.score.slice(), challenge: this.challenge });
      audio.roar(1);
      this.state = 'goal';
      this.stateT = 2.0;
      return;
    }
    this.state = 'goal';
    this.stateT = 0;
    this.scorer = own ? null : scorer;
    this.scoringTeam = team;
    this.concedingTeam = conceded;
    if (this.scorer) this.scorer.setAction('celebrate', 3.2);
    audio.roar(team.isUser ? 1 : 0.55);
    audio.whistle(1);
    if (settings.vibration && navigator.vibrate) navigator.vibrate(team.isUser ? [60, 40, 120] : 40);
    this.say(own ? line('ownGoal', { a: scorer ? scorer.data.short : '' }) : line('goal', { a: scorer.data.short }));
    this.emit('goal', { ...ev, score: this.score.slice(), userScored: team.isUser });
  }

  updateCelebration() {
    const s = this.scorer;
    if (!s) return;
    const side = this.scoringTeam.dir;
    s.target.set(side * (HALF_L - 6), 0, Math.sign(s.pos.z || 1) * (HALF_W - 6));
    s.urgency = 0.9;
    for (const p of this.scoringTeam.players) {
      if (p === s || p.isGK) continue;
      p.target.set(s.pos.x - side * 2, 0, s.pos.z + (p.index % 3 - 1) * 1.5);
      p.urgency = 0.8;
    }
  }

  startRestart(type, team, spot) {
    const b = this.ball;
    this.state = 'restart';
    this.stateT = 0;
    this.command = null;
    this.pendingKick = null;
    this.pendingFreeze = null;
    let taker;
    if (type === 'goalKick') taker = team.gk || team.players[0];
    else {
      taker = team.players
        .filter((p) => !p.isGK)
        .sort((a, c) => Math.hypot(a.pos.x - spot.x, a.pos.z - spot.z) - Math.hypot(c.pos.x - spot.x, c.pos.z - spot.z))[0];
    }
    this.setPiece = { type, team, taker, spot: spot.clone() };
    taker.pos.set(spot.x, 0, spot.z);
    taker.vel.set(0, 0, 0);
    taker.action = null;
    taker.stun = 0;
    b.place(spot.x, spot.z);
    b.owner = taker;
    b.lastTouch = team;
    taker.faceTowards(0, 0);
    if (type === 'corner') {
      team.stats.corners++;
      for (const t of this.teams) positionTeam(this, t);
      for (const p of this.allPlayers) if (p !== taker) p.pos.lerp(p.target, 0.85);
    }
    if (type === 'goalKick') {
      for (const t of this.teams) positionTeam(this, t);
      for (const p of this.allPlayers) if (p !== taker) p.pos.lerp(p.target, 0.7);
    }
    const label = { corner: 'Corner', goalKick: 'Goal kick', throw: 'Throw-in' }[type];
    this.emit('banner', { text: label, kind: 'info' });
    this.say(line(type === 'goalKick' ? 'goalKick' : type, { team: team.club.short }));
    if (type === 'corner') audio.setExcitement(1);
  }

  takeRestart() {
    const sp = this.setPiece;
    this.state = 'play';
    this.stateT = 0;
    if (!sp) return;
    sp.taker.aiThink = 0.3;
    sp.taker.holding = false;
    if (sp.team.isUser) {
      this.enterFreeze(sp.taker);
    }
  }

  // ---------- human control in defence ----------

  updateControlled(dt) {
    const user = this.teams[0];
    const ball = this.ball;
    this.switchLock -= dt;
    const userHasBall = ball.owner && ball.owner.team === user;
    if (userHasBall) {
      if (this.controlled) this.controlled.human = false;
      this.controlled = ball.owner;
      return;
    }
    if (!this.touch.active || !this.controlled || this.controlled.isGK) {
      if (this.switchLock <= 0) {
        const cand = user.players.filter((p) => !p.isGK);
        let best = null;
        let bd = Infinity;
        for (const p of cand) {
          const d = Math.hypot(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        const cur = this.controlled && !this.controlled.isGK ? Math.hypot(this.controlled.pos.x - ball.pos.x, this.controlled.pos.z - ball.pos.z) : Infinity;
        if (best && (best === this.controlled || bd < cur - 2.5 || !this.controlled || this.controlled.isGK)) {
          if (this.controlled && this.controlled !== best) this.controlled.human = false;
          this.controlled = best;
        }
      }
    }
    const c = this.controlled;
    if (!c) return;
    if (this.touch.active && this.touch.ground && !this.touch.drawing) {
      c.human = true;
      c.target.copy(this.touch.ground);
      c.urgency = 1;
    } else {
      c.human = false;
    }
  }

  switchPlayer() {
    const user = this.teams[0];
    const ball = this.ball;
    const cand = user.players
      .filter((p) => !p.isGK && p !== this.controlled)
      .sort((a, b) => Math.hypot(a.pos.x - ball.pos.x, a.pos.z - ball.pos.z) - Math.hypot(b.pos.x - ball.pos.x, b.pos.z - ball.pos.z));
    if (cand[0]) {
      if (this.controlled) this.controlled.human = false;
      this.controlled = cand[0];
      this.switchLock = 1.2;
      audio.click();
    }
  }

  humanTackle() {
    if (this.state !== 'play') return;
    const c = this.controlled;
    const ball = this.ball;
    if (!c || c.action || c.stun > 0 || c.tackleCooldown > 0.8) return;
    if (ball.owner && ball.owner.team === c.team) return;
    const dist = Math.hypot(c.pos.x - ball.pos.x, c.pos.z - ball.pos.z);
    if (dist > 4.5) {
      // Too far to slide: sprint at the ball instead.
      c.target.copy(ball.pos);
      return;
    }
    if (ball.owner) this.startTackle(c);
    else {
      const dir = new THREE.Vector3(ball.pos.x - c.pos.x, 0, ball.pos.z - c.pos.z).normalize();
      c.faceTowards(ball.pos.x, ball.pos.z);
      c.setAction('tackle', 0.5, { dir, speed: 8, recover: 0.4 });
      c.tackleCooldown = 1.2;
    }
  }

  // ---------- input ----------

  screenToGround(sx, sy) {
    v2.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(v2, this.world.camera);
    const hit = new THREE.Vector3();
    const g = raycaster.ray.intersectPlane(groundPlane, hit) ? hit.clone() : null;
    const gp = new THREE.Vector3();
    const goal = raycaster.ray.intersectPlane(goalPlane, gp) ? gp.clone() : null;
    return { ground: g, goal };
  }

  project(v, out = { x: 0, y: 0 }) {
    tmpV.copy(v).project(this.world.camera);
    out.x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
    out.behind = tmpV.z > 1;
    return out;
  }

  pointerDown(e) {
    audio.unlock();
    if (this.state === 'intro') {
      this.skipIntro();
      return;
    }
    if (this.state === 'replay') {
      this.endReplay();
      return;
    }
    const t = this.touch;
    t.active = true;
    t.id = e.pointerId;
    t.start = this.time;
    t.sx = e.clientX;
    t.sy = e.clientY;
    t.moved = 0;
    t.screen = [{ x: e.clientX, y: e.clientY }];
    const hit = this.screenToGround(e.clientX, e.clientY);
    t.ground = hit.ground;
    if (this.state === 'freeze') {
      t.drawing = true;
      const cs = this.project(this.carrier.pos);
      // Lines that start away from the carrier still count: they are joined to the carrier.
      t.screen = [{ x: cs.x, y: cs.y }];
      if (Math.hypot(cs.x - e.clientX, cs.y - e.clientY) > 70) t.screen.push({ x: e.clientX, y: e.clientY });
      this.updatePreview();
    }
  }

  pointerMove(e) {
    const t = this.touch;
    if (!t.active || e.pointerId !== t.id) return;
    const last = t.screen[t.screen.length - 1];
    const d = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    t.moved += d;
    if (t.drawing) {
      if (d > 5) {
        t.screen.push({ x: e.clientX, y: e.clientY });
        this.updatePreview();
      }
    } else {
      t.screen.push({ x: e.clientX, y: e.clientY });
      if (t.screen.length > 30) t.screen.shift();
      const hit = this.screenToGround(e.clientX, e.clientY);
      if (hit.ground) t.ground = hit.ground;
    }
  }

  pointerUp(e) {
    const t = this.touch;
    if (!t.active || (e.pointerId !== undefined && e.pointerId !== t.id)) return;
    t.active = false;
    if (t.drawing) {
      t.drawing = false;
      const plan = this.preview;
      this.preview = null;
      if (plan && plan.valid && this.state === 'freeze') this.executePlan(plan);
      return;
    }
    if (this.state === 'play' && this.time - t.start < 0.28 && t.moved < 18) {
      // Tap: tackle when near the ball carrier.
      const b = this.ball;
      const bs = this.project(b.pos);
      if (Math.hypot(bs.x - e.clientX, bs.y - e.clientY) < 120) this.humanTackle();
      else if (t.ground && this.controlled) {
        this.controlled.target.copy(t.ground);
      }
    }
    if (this.controlled) this.controlled.human = false;
  }

  // Turns the drawn screen line into a dribble, pass or shot.
  updatePreview() {
    const t = this.touch;
    const p = this.carrier;
    if (!p) return;
    const pts = [];
    const endScreen = t.screen[t.screen.length - 1];
    let shotTarget = null;
    for (let i = 0; i < t.screen.length; i++) {
      const s = t.screen[i];
      const hit = this.screenToGround(s.x, s.y);
      const g = hit.ground;
      const useGoal = hit.goal && (!g || g.x > HALF_L) && hit.goal.y >= 0;
      if (useGoal) {
        if (i === t.screen.length - 1) shotTarget = hit.goal;
        pts.push(new THREE.Vector3(HALF_L, 0, hit.goal.z));
      } else if (g) {
        pts.push(g);
      }
    }
    if (!pts.length) pts.push(p.pos.clone());
    pts[0] = p.pos.clone();
    const end = pts[pts.length - 1];
    const screenLen = t.screen.reduce((s, q, i) => (i ? s + Math.hypot(q.x - t.screen[i - 1].x, q.y - t.screen[i - 1].y) : 0), 0);
    const plan = { valid: screenLen > 18, screen: t.screen, path: pts, type: 'dribble' };
    const sp = this.setPiece && this.state === 'freeze' && !this.setPiece.kicked ? this.setPiece : null;
    const restricted = sp && sp.taker === p;
    const straight = Math.hypot(end.x - p.pos.x, end.z - p.pos.z);

    // Curve = signed sideways bulge of the drawn line from the chord.
    let bulge = 0;
    if (pts.length > 2) {
      const dx = end.x - p.pos.x;
      const dz = end.z - p.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const rx = -dz / l;
      const rz = dx / l;
      for (const q of pts) {
        const off = (q.x - p.pos.x) * rx + (q.z - p.pos.z) * rz;
        if (Math.abs(off) > Math.abs(bulge)) bulge = off;
      }
      bulge = clamp(bulge, -l * 0.3, l * 0.3);
    }

    const team = p.team;
    if (shotTarget && Math.abs(shotTarget.z) < GOAL_HALF + 3 && shotTarget.y < GOAL_H + 2.5 && !(restricted && sp.type === 'throw')) {
      plan.type = this.lob ? 'chip' : 'shot';
      plan.target = new THREE.Vector3(HALF_L, clamp(shotTarget.y, 0.15, 4), shotTarget.z);
      plan.curve = bulge * 0.8;
      plan.label = this.lob ? 'Chip' : 'Shoot';
      plan.risk = this.shotQuality(p, plan.target);
    } else {
      let best = null;
      let bd = Infinity;
      for (const m of team.players) {
        if (m === p) continue;
        const d = Math.hypot(m.pos.x - end.x, m.pos.z - end.z);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      const passRange = straight > 4 && best && bd < (restricted ? 12 : 6.5);
      if (passRange || restricted) {
        const receiver = best;
        const intoSpace = bd > 1.6 && !restricted;
        let target = intoSpace ? end.clone() : receiver.pos.clone();
        if (restricted && sp.type === 'throw') {
          const dd = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
          if (dd > 24) target = p.pos.clone().lerp(target, 24 / dd);
        }
        const len = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
        const lofted = this.lob || len > 36 || (restricted && sp.type !== 'goalKick' && sp.type !== 'throw' ? sp.type === 'corner' : false) || (restricted && sp.type === 'throw');
        plan.type = lofted ? 'lob' : 'pass';
        plan.receiver = receiver;
        plan.target = target;
        plan.curve = lofted ? 0 : bulge * 0.7;
        plan.label = `${intoSpace ? 'Through ball' : lofted ? 'Lofted pass' : 'Pass'} to ${receiver.data.short}`;
        plan.risk = this.passRisk(p, target, lofted);
      } else {
        // Dribble: resample to roughly 1 m steps and cap the length.
        const path = [p.pos.clone()];
        let total = 0;
        const max = 16;
        for (let i = 1; i < pts.length && total < max; i++) {
          const a = path[path.length - 1];
          const q = pts[i];
          const seg = Math.hypot(q.x - a.x, q.z - a.z);
          if (seg < 0.8) continue;
          const take = Math.min(seg, max - total);
          const k = take / seg;
          path.push(new THREE.Vector3(clamp(a.x + (q.x - a.x) * k, -HALF_L + 0.6, HALF_L - 0.6), 0, clamp(a.z + (q.z - a.z) * k, -HALF_W + 0.6, HALF_W - 0.6)));
          total += take;
        }
        plan.path = path;
        plan.type = 'dribble';
        plan.label = 'Dribble';
        plan.capped = total >= max;
        plan.valid = plan.valid && path.length > 1;
        plan.risk = null;
      }
    }
    this.preview = plan;
  }

  passRisk(p, target, lofted) {
    const opp = this.other(p.team);
    let min = Infinity;
    for (const o of opp.players) {
      const { d, t } = distToSegment(o.pos.x, o.pos.z, p.pos.x, p.pos.z, target.x, target.z);
      const eff = lofted ? (t > 0.85 ? d : d + 3) : d + (t < 0.12 ? 1.5 : 0);
      if (eff < min) min = eff;
    }
    if (min < 1.3) return { label: 'High risk', colour: '#ff5a5a' };
    if (min < 3) return { label: 'Some risk', colour: '#ffb347' };
    return { label: 'Safe', colour: '#7CFC9A' };
  }

  shotQuality(p, target) {
    const dist = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
    const onFrame = Math.abs(target.z) < GOAL_HALF - 0.1 && target.y < GOAL_H - 0.05;
    if (!onFrame) return { label: 'Off target', colour: '#ff5a5a' };
    const q = clamp(1.2 - dist / 30 + (p.data.sho - 70) / 100, 0, 1);
    if (q > 0.7) return { label: 'Great chance', colour: '#7CFC9A' };
    if (q > 0.4) return { label: 'Decent chance', colour: '#ffd23f' };
    return { label: 'Long shot', colour: '#ffb347' };
  }

  // ---------- rendering helpers ----------

  renderOverlay() {
    const d = this.draw;
    d.clear();
    if (this.state === 'freeze' && this.carrier) {
      const cs = this.project(this.carrier.pos);
      if (!this.touch.drawing) {
        d.pulse(cs.x, cs.y, '#c6f432', this.time);
        // Name tags help users find passing options.
        for (const m of this.carrier.team.players) {
          if (m === this.carrier) continue;
          const head = this.project(tmpV.set(m.pos.x, 2.3, m.pos.z).clone());
          if (!head.behind) d.label(head.x, head.y, m.data.short, '#ffffff');
        }
      }
      const plan = this.preview;
      if (plan && this.touch.drawing) {
        const colour = plan.valid ? ACTION_COLOURS[plan.type] || '#fff' : ACTION_COLOURS.invalid;
        d.path(plan.screen, colour, { width: 6, alpha: 0.35, glow: false });
        let shown;
        if (plan.type === 'dribble') shown = plan.path.map((q) => this.project(q, {}));
        else {
          const mid = plan.target;
          shown = [cs, this.project(mid, {})];
          if (plan.type === 'shot' || plan.type === 'chip') shown = [cs, this.project(plan.target, {})];
        }
        d.path(shown, colour, { width: 7, dash: plan.type === 'lob' || plan.type === 'chip' ? [14, 10] : null });
        if (shown.length > 1) d.arrowHead(shown[shown.length - 2], shown[shown.length - 1], colour);
        const endS = shown[shown.length - 1];
        if (plan.type !== 'dribble') d.target(endS.x, endS.y, colour, 14, this.time);
        if (plan.valid) {
          d.label(endS.x, endS.y - 34, plan.label, colour);
          if (plan.risk && settings.showRisk) d.label(endS.x, endS.y - 12 + 34, plan.risk.label, plan.risk.colour);
        }
      }
    }
  }

  updateMarkers() {
    const c = this.state === 'freeze' ? this.carrier : this.controlled;
    if (c) {
      this.userRing.visible = true;
      this.userRing.position.set(c.pos.x, 0.03, c.pos.z);
      this.arrow.visible = this.state !== 'goal';
      this.arrow.position.set(c.pos.x, 2.35 + Math.sin(this.time * 5) * 0.08, c.pos.z);
      this.arrow.rotation.y += 0.05;
    } else {
      this.userRing.visible = false;
      this.arrow.visible = false;
    }
    const b = this.ball;
    if (b.intended && b.target && b.intended.team.isUser) {
      this.targetRing.visible = true;
      this.targetRing.position.set(b.target.x, 0.03, b.target.z);
    } else this.targetRing.visible = false;
  }

  updateCamera(dt) {
    const cam = this.world.camera;
    const cfg = CAMERA[settings.camera] || CAMERA.normal;
    const b = this.ball;
    let fx = b.pos.x;
    let fz = b.pos.z;
    let dist = cfg.dist;
    let height = cfg.height;
    let look = cfg.look;
    if (this.state === 'freeze') {
      // Higher and further back so passing options behind the carrier are visible.
      height *= 2.1;
      dist *= 1.35;
      look *= 1.1;
    } else if (this.state === 'goal' && this.scorer) {
      fx = this.scorer.pos.x;
      fz = this.scorer.pos.z;
      const a = this.stateT * 0.5;
      const want = new THREE.Vector3(fx + Math.cos(a) * 9, 4, fz + Math.sin(a) * 9);
      cam.position.lerp(want, 1 - Math.exp(-dt * 2));
      this.camLook.lerp(new THREE.Vector3(fx, 1.2, fz), 1 - Math.exp(-dt * 4));
      cam.lookAt(this.camLook);
      return;
    } else if (this.state === 'intro') {
      return;
    }
    if (b.owner) {
      fx = b.owner.pos.x;
      fz = b.owner.pos.z;
    }
    if (this.state === 'freeze') fx -= 5;
    this.camFocus.lerp(tmpV.set(fx, 0, fz), 1 - Math.exp(-dt * 4));
    const f = this.camFocus;
    this.world.focusShadows(f.x + 6, f.z);
    const want = new THREE.Vector3(f.x - dist, height, f.z * 0.72);
    cam.position.lerp(want, 1 - Math.exp(-dt * (this.state === 'freeze' ? 5 : 3.2)));
    this.camLook.lerp(tmpV.set(f.x + look * 0.5, 0, f.z * 0.88), 1 - Math.exp(-dt * 4.5));
    cam.lookAt(this.camLook);
  }

  updateIntro() {
    const cam = this.world.camera;
    const t = this.stateT;
    const a = -0.6 + t * 0.22;
    cam.position.set(Math.cos(a) * 62, 22 - t * 1.5, Math.sin(a) * 50);
    cam.lookAt(0, 0, 0);
    for (const p of this.allPlayers) p.sync(0.016);
    this.ball.sync(0);
    if (t > 6) this.skipIntro();
  }

  // ---------- replay ----------

  record(dt) {
    this.replayAcc += dt;
    if (this.replayAcc < 1 / REPLAY_HZ) return;
    this.replayAcc = 0;
    const ps = this.allPlayers;
    const f = new Float32Array(3 + ps.length * 6);
    f[0] = this.ball.pos.x;
    f[1] = this.ball.pos.y;
    f[2] = this.ball.pos.z;
    const codes = { kick: 1, tackle: 2, dive: 3, celebrate: 4, stumble: 5 };
    ps.forEach((p, i) => {
      const o = 3 + i * 6;
      f[o] = p.pos.x;
      f[o + 1] = p.pos.z;
      f[o + 2] = p.facing;
      f[o + 3] = p.speed;
      f[o + 4] = p.action ? codes[p.action.type] || 0 : 0;
      f[o + 5] = p.action ? p.action.t / p.action.dur : 0;
      if (p.action && p.action.type === 'dive') f[o + 5] += Math.sign(p.action.side) * 10;
    });
    this.replay.push(f);
    if (this.replay.length > REPLAY_HZ * REPLAY_SECONDS) this.replay.shift();
  }

  startReplay() {
    if (this.challenge) {
      this.endAttempt(true);
      return;
    }
    if (this.replay.length < 20) return this.afterGoal();
    this.state = 'replay';
    this.stateT = 0;
    this.replayFrames = this.replay.slice();
    this.replayPos = Math.max(0, this.replayFrames.length - REPLAY_HZ * 4.8);
    this.emit('replay', { on: true });
  }

  updateReplay(dt) {
    this.replayPos += dt * REPLAY_HZ * 0.55;
    const frames = this.replayFrames;
    const i = Math.floor(this.replayPos);
    if (i >= frames.length - 1) {
      this.endReplay();
      return;
    }
    const a = frames[i];
    const bfr = frames[i + 1];
    const k = this.replayPos - i;
    const L = (o) => a[o] + (bfr[o] - a[o]) * k;
    this.ball.prev.copy(this.ball.pos);
    this.ball.pos.set(L(0), L(1), L(2));
    const names = [null, 'kick', 'tackle', 'dive', 'celebrate', 'stumble'];
    this.allPlayers.forEach((p, j) => {
      const o = 3 + j * 6;
      p.pos.set(L(o), 0, L(o + 1));
      p.facing = a[o + 2];
      const sp = a[o + 3];
      const code = a[o + 4];
      let prog = a[o + 5];
      let side = 1;
      if (prog > 5) { prog -= 10; side = 1; } else if (prog < -5) { prog += 10; side = -1; }
      const action = code ? { type: names[code], t: prog, dur: 1, side, height: 0.5, dir: p.forward() } : null;
      p.model.root.position.set(p.pos.x, 0, p.pos.z);
      p.model.root.rotation.y = p.facing;
      p.vel.set(sp, 0, 0);
      animateReplay(p, sp, dt * 0.55, action);
    });
    this.ball.sync(dt);
    const cam = this.world.camera;
    const side = this.scoringTeam ? this.scoringTeam.dir : 1;
    const bp = this.ball.pos;
    const want = new THREE.Vector3(side * (HALF_L + 6), 3.2, bp.z * 0.4 + 14);
    if (this.stateT < 0.05) cam.position.copy(want);
    cam.position.lerp(want, 1 - Math.exp(-dt * 2));
    this.camLook.lerp(bp, 1 - Math.exp(-dt * 6));
    cam.lookAt(this.camLook);
  }

  endReplay() {
    if (this.state !== 'replay') return;
    this.emit('replay', { on: false });
    this.afterGoal();
  }

  afterGoal() {
    this.replay = [];
    for (const p of this.allPlayers) {
      p.action = null;
      p.stun = 0;
    }
    this.kickoff(this.concedingTeam || this.teams[1]);
  }

  // ---------- skill challenge ----------

  nextAttempt() {
    const c = this.challenge;
    if (c.attempt >= c.total) {
      c.over = true;
      this.state = 'fulltime';
      this.emit('challengeEnd', { goals: c.goals, total: c.total });
      return;
    }
    c.attempt++;
    c.t = 0;
    const user = this.teams[0];
    const ai = this.teams[1];
    const x = HALF_L - rand(18, 32);
    const z = rand(-15, 15);
    user.players.forEach((p, i) => {
      p.action = null;
      p.stun = 0;
      p.vel.set(0, 0, 0);
      if (i === 0) p.pos.set(x, 0, z);
      else p.pos.set(x + rand(-2, 6), 0, clamp(z + (i === 1 ? -12 : 12) + rand(-3, 3), -HALF_W + 2, HALF_W - 2));
      p.faceTowards(HALF_L, 0);
    });
    ai.players.forEach((p, i) => {
      p.action = null;
      p.stun = 0;
      p.vel.set(0, 0, 0);
      p.saveDecided = false;
      if (p.isGK) p.pos.set(HALF_L - 1.5, 0, 0);
      else p.pos.set(x + rand(5, 11), 0, z * 0.5 + (i - 2) * 5);
      p.faceTowards(-HALF_L, 0);
    });
    this.ball.place(x, z);
    this.ball.inGoal = false;
    this.setPiece = null;
    this.command = null;
    this.pendingKick = null;
    this.state = 'play';
    this.control(user.players[0], true);
    this.emit('challenge', { attempt: c.attempt, total: c.total, goals: c.goals });
  }

  endAttempt(scored) {
    if (this.state === 'between') return;
    this.state = 'between';
    this.stateT = 0;
    if (!scored) {
      this.emit('banner', { text: 'Missed', kind: 'info' });
      audio.groan();
    }
    setTimeout(() => {
      if (!this.disposed) this.nextAttempt();
    }, 1300);
  }

  // ---------- results ----------

  result() {
    const ratings = this.allPlayers.map((p) => ({ side: p.team.side, name: p.data.name, short: p.data.short, photo: p.data.photo, rating: clamp(p.rating, 3, 10) }));
    const potm = ratings.slice().sort((a, b) => b.rating - a.rating)[0];
    const totalPoss = this.teams[0].stats.poss + this.teams[1].stats.poss || 1;
    return {
      score: this.score.slice(),
      events: this.events.slice(),
      stats: this.teams.map((t) => ({ ...t.stats, possPct: Math.round((t.stats.poss / totalPoss) * 100) })),
      ratings,
      potm,
      userClub: this.teams[0].club.id,
      aiClub: this.teams[1].club.id,
      homeIsUser: this.homeIsUser,
    };
  }

  dispose() {
    this.disposed = true;
    const c = this.opts.drawCanvas;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.world.dynamic.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.draw.clear();
    audio.stopCrowd();
  }

  separate() {
    const ps = this.allPlayers;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }
  }
}

function animateReplay(p, speed, dt, action) {
  animatePlayer(p.model, speed, dt, action);
}

void depthOf;
