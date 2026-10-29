import * as THREE from 'three';
import { HALF_L, HALF_W } from './constants.js';
import { createPlayerModel, animatePlayer } from './playerModel.js';
import { clamp } from '../core/util.js';

export class Footballer {
  constructor(team, index, slot, data, mats, kit, scene) {
    this.team = team;
    this.index = index;
    this.slot = slot;
    this.data = data;
    this.isGK = slot.role === 'GK';
    this.model = createPlayerModel(mats, data, kit);
    scene.add(this.model.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.facing = team.dir > 0 ? 0 : Math.PI;
    this.urgency = 0.6;
    this.maxSpeed = 6.0 + (data.pac / 100) * 3.1;
    this.accel = 11 + data.pac * 0.04;
    this.action = null;
    this.stun = 0;
    this.kickCooldown = 0;
    this.tackleCooldown = 0;
    this.human = false;
    this.rating = 6.5;
    this.saveDecided = false;
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  setAction(type, dur, extra = {}) {
    this.action = { type, t: 0, dur, ...extra };
  }

  faceTowards(x, z) {
    this.facing = Math.atan2(-(z - this.pos.z), x - this.pos.x);
  }

  forward() {
    return new THREE.Vector3(Math.cos(this.facing), 0, -Math.sin(this.facing));
  }

  update(dt, lookAt, withBall) {
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);
    if (this.action) {
      this.action.t += dt;
      const a = this.action;
      if (a.type === 'tackle') {
        const k = Math.max(0, 1 - a.t / a.dur);
        this.vel.set(a.dir.x * a.speed * k, 0, a.dir.z * a.speed * k);
      } else if (a.type === 'dive') {
        const k = a.t < a.dur * 0.6 ? 1 : 0.2;
        this.vel.set(a.vx * k, 0, a.vz * k);
      } else if (a.type === 'kick' || a.type === 'header') {
        this.vel.multiplyScalar(Math.exp(-6 * dt));
      } else if (a.type === 'celebrate') {
        this.steer(dt, 0.75);
      } else {
        this.vel.multiplyScalar(Math.exp(-3 * dt));
      }
      if (a.t >= a.dur) {
        if (a.type === 'tackle' || a.type === 'dive') this.stun = Math.max(this.stun, a.recover ?? 0.35);
        this.action = null;
      }
    } else if (this.stun > 0) {
      this.stun -= dt;
      this.vel.multiplyScalar(Math.exp(-5 * dt));
    } else {
      this.steer(dt, withBall ? 0.88 : 1);
    }
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = clamp(this.pos.x, -HALF_L - 4, HALF_L + 4);
    this.pos.z = clamp(this.pos.z, -HALF_W - 3, HALF_W + 3);

    const sp = this.speed;
    if (this.action && (this.action.type === 'tackle' || this.action.type === 'dive')) {
      // Keep the facing set when the action began.
    } else if (sp > 0.6 && !(this.action && this.action.type === 'kick')) {
      const want = Math.atan2(-this.vel.z, this.vel.x);
      this.facing = turnTowards(this.facing, want, dt * 10);
    } else if (lookAt) {
      const want = Math.atan2(-(lookAt.z - this.pos.z), lookAt.x - this.pos.x);
      this.facing = turnTowards(this.facing, want, dt * 5);
    }
  }

  steer(dt, mult) {
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    let desired = this.maxSpeed * this.urgency * mult;
    if (d < 2) desired *= d / 2;
    const vx = d > 0.05 ? (dx / d) * desired : 0;
    const vz = d > 0.05 ? (dz / d) * desired : 0;
    const ax = vx - this.vel.x;
    const az = vz - this.vel.z;
    const al = Math.hypot(ax, az);
    const maxA = this.accel * dt;
    if (al > maxA) {
      this.vel.x += (ax / al) * maxA;
      this.vel.z += (az / al) * maxA;
    } else {
      this.vel.x = vx;
      this.vel.z = vz;
    }
  }

  sync(dt) {
    const r = this.model.root;
    r.position.set(this.pos.x, 0, this.pos.z);
    r.rotation.y = this.facing;
    animatePlayer(this.model, this.speed, dt, this.action);
  }
}

export function turnTowards(a, b, maxStep) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}
