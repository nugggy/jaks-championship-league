import * as THREE from 'three';
import { HALF_L, HALF_W, PITCH_L, GOAL_HALF, BOX_L, BOX_HALF_W } from './constants.js';
import { clamp, rand, gauss } from '../core/util.js';

// Team-relative helpers. depth 0 = own goal line, 1 = opposition goal line; width + = right.
export const depthOf = (team, x) => (x * team.dir + HALF_L) / PITCH_L;
export const widthOf = (team, z) => (z * team.dir) / (HALF_W - 4);
export const worldX = (team, d) => team.dir * (-HALF_L + d * PITCH_L);
export const worldZ = (team, w) => w * (HALF_W - 4) * team.dir;
export const attackGoalX = (team) => team.dir * HALF_L;

export function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0;
  t = clamp(t, 0, 1);
  return { d: Math.hypot(px - (ax + vx * t), pz - (az + vz * t)), t };
}

// Positions every off-ball player. Chasers and receivers are overridden by the match afterwards.
export function positionTeam(match, team) {
  const ball = match.ball;
  const opp = match.other(team);
  const inPoss = match.possessionTeam() === team;
  const bd = clamp(depthOf(team, ball.pos.x), 0, 1);
  const bw = clamp(widthOf(team, ball.pos.z), -1.2, 1.2);
  // Opposition last line, used to keep runners roughly onside.
  let oppLine = 0;
  for (const p of opp.players) if (!p.isGK) oppLine = Math.max(oppLine, depthOf(team, p.pos.x));
  oppLine = Math.max(oppLine, bd);
  const t = match.time;
  const setPiece = match.setPiece;

  for (const p of team.players) {
    if (p.human) continue;
    if (p.isGK) {
      const gx = -team.dir * HALF_L;
      const dx = ball.pos.x - gx;
      const dz = ball.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const out = clamp(dist * 0.1, 0.8, inPoss ? 9 : 4.5);
      p.target.set(gx + (dx / dist) * out, 0, clamp((dz / dist) * out, -GOAL_HALF + 0.3, GOAL_HALF - 0.3));
      p.urgency = 0.8;
      continue;
    }
    const s = p.slot;
    let d;
    let w;
    if (inPoss) {
      d = s.d + (bd - 0.35) * 0.72 + 0.07;
      w = s.w * 1.08 + bw * 0.14;
      const attacker = ['ST', 'LW', 'RW', 'AM'].includes(s.role);
      if (attacker) {
        d += 0.035 * Math.sin(t * 0.55 + p.index * 1.7) + 0.03;
        d = Math.min(d, oppLine - 0.004);
      }
      if (['LB', 'RB'].includes(s.role) && bd > 0.5) d += 0.06;
    } else {
      d = s.d * 0.82 + (bd - 0.42) * 0.62 + 0.03;
      w = s.w * 0.72 + bw * 0.32;
      if (s.d < 0.3) d = Math.min(d, bd - 0.015);
    }
    d = clamp(d, 0.04, 0.93);
    w = clamp(w, -1.1, 1.1);
    let x = worldX(team, d);
    let z = worldZ(team, w);

    if (setPiece && setPiece.type === 'corner') {
      const spot = cornerSpot(match, team, p, setPiece);
      if (spot) {
        x = spot.x;
        z = spot.z;
      }
    }

    if (inPoss) {
      // Drift away from the nearest marker to offer a passing lane.
      const near = nearestTo(opp.players, x, z);
      if (near.dist < 4) {
        const ax = x - near.p.pos.x;
        const az = z - near.p.pos.z;
        const l = Math.hypot(ax, az) || 1;
        x += (ax / l) * (4 - near.dist);
        z += (az / l) * (4 - near.dist);
      }
    } else if (!setPiece) {
      // Mark the most dangerous attacker near this player's zone, goal side.
      const near = nearestTo(opp.players, x, z, true);
      if (near.p && near.dist < 9) {
        const gx = -team.dir * HALF_L;
        const mx = near.p.pos.x;
        const mz = near.p.pos.z;
        const l = Math.hypot(gx - mx, mz) || 1;
        const markX = mx + ((gx - mx) / l) * 1.8;
        const markZ = mz + ((0 - mz) / l) * 1.8;
        const k = 0.65;
        x = x * (1 - k) + markX * k;
        z = z * (1 - k) + markZ * k;
      }
    }
    p.target.set(clamp(x, -HALF_L + 0.5, HALF_L - 0.5), 0, clamp(z, -HALF_W + 0.8, HALF_W - 0.8));
    const dist = Math.hypot(p.target.x - p.pos.x, p.target.z - p.pos.z);
    p.urgency = dist > 10 ? 0.9 : dist > 4 ? 0.72 : 0.55;
  }
}

function cornerSpot(match, team, p, sp) {
  const attacking = sp.team === team;
  const goalX = attacking ? attackGoalX(team) : -team.dir * HALF_L;
  const inward = -Math.sign(goalX);
  const roles = ['ST', 'CB', 'AM', 'LW', 'RW', 'CM'];
  if (p === sp.taker) return null;
  if (attacking) {
    if (!roles.includes(p.slot.role)) return null;
    const seed = (p.index * 37) % 11;
    return { x: goalX + inward * (5 + (seed % 4) * 2.2), z: -7 + (seed / 10) * 14 };
  }
  // Defenders pick up attackers in the box.
  if (['CB', 'LB', 'RB', 'DM', 'ST', 'CM'].includes(p.slot.role)) {
    const seed = (p.index * 53) % 9;
    return { x: goalX + inward * (3.5 + (seed % 3) * 2.5), z: -6 + (seed / 8) * 12 };
  }
  return null;
}

export function nearestTo(players, x, z, skipGK = false) {
  let best = null;
  let bd = Infinity;
  for (const p of players) {
    if (skipGK && p.isGK) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return { p: best, dist: bd };
}

export function laneOpenness(match, from, toX, toZ, team) {
  const opp = match.other(team);
  let min = Infinity;
  for (const o of opp.players) {
    const { d, t } = distToSegment(o.pos.x, o.pos.z, from.x, from.z, toX, toZ);
    // Defenders near the passer matter less: the ball is already past them by the time they react.
    const eff = d + (t < 0.15 ? 1.2 : 0);
    if (eff < min) min = eff;
  }
  return min;
}

// AI ball carrier: choose between a shot, a pass or a dribble.
export function aiDecide(match, p) {
  const team = p.team;
  const diff = match.diff;
  const gx = attackGoalX(team);
  const distGoal = Math.hypot(gx - p.pos.x, p.pos.z);
  const opp = match.other(team);
  const pressure = nearestTo(opp.players, p.pos.x, p.pos.z).dist;
  const myDepth = depthOf(team, p.pos.x);

  const angleOk = Math.abs(p.pos.z) < 18 || distGoal < 14;
  if (angleOk && distGoal < 28) {
    let pShot = ((28 - distGoal) / 28) * 0.85 + (distGoal < 14 ? 0.4 : 0);
    if (pressure < 2.5) pShot += 0.15;
    if (Math.random() < pShot * diff.ai) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const err = (1.25 - p.data.sho / 100) * distGoal * 0.06;
      const target = new THREE.Vector3(
        gx,
        clamp(0.3 + Math.random() * 1.8 + gauss() * err * 0.5, 0.15, 3.2),
        side * (GOAL_HALF - 0.75 - Math.random() * 1.6) + gauss() * err,
      );
      return { type: 'shoot', target, speed: 21 + p.data.sho / 10 + rand(-1, 2), curve: rand(-0.8, 0.8) };
    }
  }

  let best = null;
  let bestScore = -Infinity;
  for (const m of team.players) {
    if (m === p) continue;
    const dx = m.pos.x - p.pos.x;
    const dz = m.pos.z - p.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 5 || len > 45) continue;
    if (m.isGK && pressure > 3) continue;
    const gain = depthOf(team, m.pos.x) - myDepth;
    const open = laneOpenness(match, p.pos, m.pos.x, m.pos.z, team);
    const recvPressure = nearestTo(opp.players, m.pos.x, m.pos.z).dist;
    const inBox = Math.abs(m.pos.x - gx) < BOX_L && Math.abs(m.pos.z) < BOX_HALF_W;
    let score = gain * 3.2 + Math.min(open, 6) * 0.22 + Math.min(recvPressure, 6) * 0.15 + (inBox ? 0.6 : 0) - (len > 32 ? 0.5 : 0) + Math.random() * 0.35;
    if (open < 1.1) score -= 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = { m, open, len };
    }
  }
  const spaceAhead = pressure > 4;
  const dribbleScore = (spaceAhead ? 1.1 : 0.1) + (myDepth > 0.6 && myDepth < 0.85 ? 0.25 : 0) + Math.random() * 0.3;
  if (best && (bestScore > dribbleScore || pressure < 2.2)) {
    const lofted = best.open < 1.6 || best.len > 34;
    // Lead the pass into the receiver's run.
    const lead = Math.min(4, best.len * 0.12);
    const tx = best.m.pos.x + team.dir * lead * (best.m.slot.d > 0.5 ? 1 : 0.3);
    return { type: 'pass', to: best.m, target: new THREE.Vector3(tx, 0, best.m.pos.z), lofted };
  }
  // Dribble towards goal, bending away from the nearest defender.
  const near = nearestTo(opp.players, p.pos.x, p.pos.z);
  let dirX = gx - p.pos.x;
  let dirZ = -p.pos.z * 0.6;
  const l = Math.hypot(dirX, dirZ) || 1;
  dirX /= l;
  dirZ /= l;
  if (near.p && near.dist < 6) {
    const ax = p.pos.x - near.p.pos.x;
    const az = p.pos.z - near.p.pos.z;
    const al = Math.hypot(ax, az) || 1;
    dirX += (ax / al) * (6 - near.dist) * 0.25;
    dirZ += (az / al) * (6 - near.dist) * 0.35;
  }
  if (myDepth > 0.86 && Math.abs(p.pos.z) > 12) {
    // Near the byline out wide: look for a cross.
    const box = team.players.filter((m) => m !== p && Math.abs(m.pos.x - gx) < BOX_L && Math.abs(m.pos.z) < 12);
    if (box.length) {
      const m = box[Math.floor(Math.random() * box.length)];
      return { type: 'pass', to: m, target: new THREE.Vector3(m.pos.x, 0, m.pos.z), lofted: true };
    }
  }
  return { type: 'dribble', dirX, dirZ };
}
