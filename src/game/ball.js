import * as THREE from 'three';
import { BALL_R, GRAVITY, HALF_L, GOAL_HALF, GOAL_H, GOAL_DEPTH, POST_R } from './constants.js';
import { createBallMesh } from './playerModel.js';

const ROLL_DAMP = 0.85;
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const axis = new THREE.Vector3();

export class Ball {
  constructor(scene) {
    const { mesh, shadow } = createBallMesh();
    this.mesh = mesh;
    this.shadow = shadow;
    scene.add(mesh, shadow);
    const TRAIL = 28;
    this.trailPts = new Float32Array(TRAIL * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPts, 3));
    const alpha = new Float32Array(TRAIL);
    for (let i = 0; i < TRAIL; i++) alpha[i] = 1 - i / TRAIL;
    tg.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    this.trail = new THREE.Line(tg, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: { colour: { value: new THREE.Color(1.6, 1.5, 0.9) }, opacity: { value: 0 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 colour; uniform float opacity; varying float vA; void main(){ gl_FragColor = vec4(colour, vA * vA * opacity); }',
    }));
    this.trail.frustumCulled = false;
    this.trailCount = TRAIL;
    scene.add(this.trail);
    this.pos = new THREE.Vector3(0, BALL_R, 0);
    this.prev = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.curve = new THREE.Vector3();
    this.curveTime = 0;
    this.owner = null;
    this.lastTouch = null;
    this.lastKicker = null;
    this.lastPasser = null;
    this.intended = null;
    this.target = null;
    this.isShot = false;
    this.kickType = null;
    this.tried = new Set();
    this.inGoal = false;
  }

  place(x, z) {
    this.pos.set(x, BALL_R, z);
    this.prev.copy(this.pos);
    if (this.lastSync) this.lastSync.copy(this.pos);
    if (this.trailPts) for (let i = 0; i < this.trailPts.length; i += 3) this.trailPts.set([x, BALL_R, z], i);
    this.vel.set(0, 0, 0);
    this.curve.set(0, 0, 0);
    this.curveTime = 0;
    this.owner = null;
    this.intended = null;
    this.isShot = false;
    this.inGoal = false;
    this.tried.clear();
  }

  get onGround() {
    return this.pos.y <= BALL_R + 0.02 && Math.abs(this.vel.y) < 0.5;
  }

  hSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  // Sets velocities so the ball reaches target. curve is the sideways bulge in metres (+ = right of travel).
  kick(target, { type = 'ground', speed = null, curve = 0, from = this.pos } = {}) {
    this.owner = null;
    this.tried.clear();
    this.pos.copy(from);
    this.pos.y = Math.max(BALL_R, this.pos.y);
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.max(0.5, Math.hypot(dx, dz));
    const dir = new THREE.Vector3(dx / d, 0, dz / d);
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    let T;
    if (type === 'ground') {
      const v0 = Math.min(30, Math.max(9, d * ROLL_DAMP + 7.5));
      this.vel.set(dir.x * v0, 0, dir.z * v0);
      // Approximate travel time on a damped roll, for the curve calculation.
      T = -Math.log(Math.max(0.05, 1 - (d * ROLL_DAMP) / v0)) / ROLL_DAMP;
    } else if (type === 'lofted') {
      T = 0.75 + d / 21;
      const vh = d / T;
      this.vel.set(dir.x * vh, (GRAVITY * T) / 2 + ((target.y || 0) - this.pos.y) / T, dir.z * vh);
    } else {
      // Shot or chip: straight-line flight to a 3D point.
      const vh = speed || 26;
      T = d / vh;
      const ty = target.y ?? BALL_R;
      this.vel.set(dir.x * vh, (ty - this.pos.y + 0.5 * GRAVITY * T * T) / T, dir.z * vh);
    }
    // Constant sideways acceleration that still finishes at the target (see bulge maths in README).
    const a = Math.max(-14, Math.min(14, (-8 * curve) / (T * T)));
    if (Math.abs(a) > 0.05) {
      this.curve.copy(right).multiplyScalar(a);
      this.vel.addScaledVector(right, -0.5 * a * T);
      this.curveTime = T;
    } else {
      this.curve.set(0, 0, 0);
      this.curveTime = 0;
    }
    this.kickType = type;
    this.isShot = type === 'shot' || type === 'chip';
    this.flightTime = T;
    return T;
  }

  // Returns a list of event strings, such as 'post' or 'bounce'.
  update(dt) {
    const events = [];
    if (this.owner) return events;
    if (this.curveTime > 0) {
      this.vel.addScaledVector(this.curve, dt);
      this.curveTime -= dt;
    }
    const airborne = this.pos.y > BALL_R + 0.01 || this.vel.y > 0.05;
    if (airborne) {
      this.vel.y -= GRAVITY * dt;
      this.vel.multiplyScalar(1 - 0.06 * dt);
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < BALL_R) {
      this.pos.y = BALL_R;
      if (this.vel.y < -1.6) {
        this.vel.y = -this.vel.y * 0.5;
        this.vel.x *= 0.8;
        this.vel.z *= 0.8;
        events.push('bounce');
      } else {
        this.vel.y = 0;
      }
    }
    if (!airborne || this.pos.y <= BALL_R + 0.01) {
      const k = Math.exp(-ROLL_DAMP * dt);
      this.vel.x *= k;
      this.vel.z *= k;
      if (this.hSpeed() < 0.15) {
        this.vel.x = 0;
        this.vel.z = 0;
      }
    }
    if (this.collideFrame()) events.push('post');
    if (this.inGoal) this.containNet();
    return events;
  }

  collideFrame() {
    const r = POST_R + BALL_R;
    let hit = false;
    for (const side of [-1, 1]) {
      const gx = side * HALF_L;
      if (Math.abs(this.pos.x - gx) > 1) continue;
      for (const pz of [-GOAL_HALF, GOAL_HALF]) {
        if (this.pos.y > GOAL_H + r) continue;
        const dx = this.pos.x - gx;
        const dz = this.pos.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < r && d > 0) {
          const nx = dx / d;
          const nz = dz / d;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= 1.6 * vn * nx;
            this.vel.z -= 1.6 * vn * nz;
            this.pos.x = gx + nx * r;
            this.pos.z = pz + nz * r;
            hit = true;
          }
        }
      }
      if (Math.abs(this.pos.z) < GOAL_HALF) {
        const dx = this.pos.x - gx;
        const dy = this.pos.y - GOAL_H;
        const d = Math.hypot(dx, dy);
        if (d < r && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          const vn = this.vel.x * nx + this.vel.y * ny;
          if (vn < 0) {
            this.vel.x -= 1.6 * vn * nx;
            this.vel.y -= 1.6 * vn * ny;
            this.pos.x = gx + nx * r;
            this.pos.y = GOAL_H + ny * r;
            hit = true;
          }
        }
      }
    }
    if (hit) {
      this.curveTime = 0;
      this.isShot = false;
    }
    return hit;
  }

  containNet() {
    const side = Math.sign(this.pos.x);
    const back = side * (HALF_L + GOAL_DEPTH - BALL_R);
    if (Math.abs(this.pos.x) > Math.abs(back)) {
      this.pos.x = back;
      this.vel.x *= -0.15;
      this.vel.z *= 0.4;
    }
    const zl = GOAL_HALF - BALL_R;
    if (Math.abs(this.pos.z) > zl) {
      this.pos.z = Math.sign(this.pos.z) * zl;
      this.vel.z *= -0.2;
    }
    if (this.pos.y > GOAL_H - BALL_R) {
      this.pos.y = GOAL_H - BALL_R;
      this.vel.y = Math.min(0, this.vel.y);
    }
    this.vel.multiplyScalar(0.96);
  }

  sync(dt) {
    this.mesh.position.copy(this.pos);
    const tp = this.trailPts;
    tp.copyWithin(3, 0, tp.length - 3);
    tp[0] = this.pos.x;
    tp[1] = this.pos.y;
    tp[2] = this.pos.z;
    this.trail.geometry.attributes.position.needsUpdate = true;
    const fast = !this.owner && (this.isShot || this.hSpeed() > 19);
    const u = this.trail.material.uniforms.opacity;
    u.value += ((fast ? 0.75 : 0) - u.value) * Math.min(1, dt * 8);
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    const s = 1 / (1 + this.pos.y * 0.25);
    this.shadow.scale.setScalar(s);
    if (!this.lastSync) this.lastSync = this.pos.clone();
    tmp.subVectors(this.pos, this.lastSync);
    this.lastSync.copy(this.pos);
    tmp.y = 0;
    const dist = tmp.length();
    if (dist > 1e-4) {
      axis.crossVectors(UP, tmp).normalize();
      this.mesh.rotateOnWorldAxis(axis, dist / BALL_R);
    }
  }
}
