import * as THREE from 'three';
import { settings } from '../core/storage.js';

// Models face +x (forward) with +z to their right, matching the pitch convention.
// Rounded capsule limbs and smooth shading keep the silhouettes clean at broadcast distance.
const capsule = (r, len, segs = 6, radial = 12) => new THREE.CapsuleGeometry(r, len, segs, radial);

const geo = {
  chest: (() => {
    const g = capsule(0.17, 0.26, 6, 16);
    g.scale(0.78, 1, 1.32);
    return g;
  })(),
  waist: (() => {
    const g = new THREE.CylinderGeometry(0.17, 0.15, 0.16, 16);
    g.scale(0.85, 1, 1.25);
    return g;
  })(),
  shorts: (() => {
    const g = new THREE.CylinderGeometry(0.165, 0.19, 0.2, 16);
    g.scale(0.85, 1, 1.25);
    return g;
  })(),
  collar: new THREE.TorusGeometry(0.06, 0.018, 8, 16),
  head: new THREE.SphereGeometry(0.118, 24, 18),
  hair: new THREE.SphereGeometry(0.125, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
  ear: new THREE.SphereGeometry(0.025, 8, 6),
  neck: new THREE.CylinderGeometry(0.048, 0.056, 0.1, 12),
  upperArm: capsule(0.05, 0.2),
  foreArm: capsule(0.042, 0.19),
  hand: new THREE.SphereGeometry(0.045, 10, 8),
  thigh: capsule(0.072, 0.3),
  shin: capsule(0.055, 0.3),
  sock: capsule(0.058, 0.2),
  boot: (() => {
    const g = capsule(0.05, 0.14, 4, 10);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 0.75, 1);
    return g;
  })(),
  shadow: new THREE.CircleGeometry(0.55, 24),
  ring: new THREE.RingGeometry(0.62, 0.78, 48),
};
for (const g of Object.values(geo)) g.userData.shared = true;

const SKIN = ['#f1c7a5', '#e5b48f', '#c98d63', '#a06a47', '#7a4b31', '#553424'];
const HAIR = ['#1b1410', '#2e1f14', '#4a2f1b', '#8a6236', '#c9a061', '#0d0d0d'];

let shadowTex;
function blobShadowMaterial(opacity = 0.5) {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2 });
}

function numberTexture(num, fg, bg, name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (name) {
    g.font = '700 34px "Barlow Condensed", Arial Narrow, sans-serif';
    g.fillText(String(name).toUpperCase().slice(0, 12), 128, 42);
  }
  g.font = '800 168px "Barlow Condensed", Arial Narrow, sans-serif';
  g.fillText(String(num), 128, 152);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const fabric = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.0 });

export function kitMaterials(kit) {
  return {
    shirt: fabric(kit.shirt),
    trim: fabric(kit.trim),
    shorts: fabric(kit.shorts),
    socks: fabric(kit.socks),
    boot: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.35, metalness: 0.2 }),
  };
}

function hashName(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function createPlayerModel(mats, data, kit) {
  const shadows = settings.quality === 'high';
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const h = hashName(data.name || 'x');
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[h % SKIN.length], roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR[(h >> 3) % HAIR.length], roughness: 0.8 });
  const scale = 0.95 + ((h >> 5) % 10) / 100;
  const add = (parent, geometry, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = shadows;
    parent.add(m);
    return m;
  };

  const hips = new THREE.Group();
  hips.position.y = 0.93;
  body.add(hips);
  add(hips, geo.shorts, mats.shorts, 0, -0.02, 0);
  add(hips, geo.waist, mats.shirt, 0, 0.14, 0);
  add(hips, geo.chest, mats.shirt, 0, 0.38, 0);
  const collar = add(hips, geo.collar, mats.trim, 0.02, 0.6, 0);
  collar.rotation.x = Math.PI / 2;
  collar.castShadow = false;

  const numMat = new THREE.MeshBasicMaterial({ map: numberTexture(data.number ?? '', kit.number, kit.shirt, data.short), toneMapped: true });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), numMat);
  back.rotation.y = -Math.PI / 2;
  back.position.set(-0.137, 0.38, 0);
  hips.add(back);
  const frontMat = new THREE.MeshBasicMaterial({ map: numMat.map });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), frontMat);
  front.rotation.y = Math.PI / 2;
  front.position.set(0.137, 0.47, 0.1);
  hips.add(front);

  add(hips, geo.neck, skin, 0.01, 0.66, 0);
  const headG = new THREE.Group();
  headG.position.set(0.01, 0.8, 0);
  hips.add(headG);
  add(headG, geo.head, skin);
  const hair = add(headG, geo.hair, hairMat, -0.012, 0.012, 0);
  hair.rotation.z = 0.25;
  add(headG, geo.ear, skin, -0.005, -0.01, -0.115);
  add(headG, geo.ear, skin, -0.005, -0.01, 0.115);

  const limb = (parentY, side, upperGeo, lowerGeo, upperMat, lowerMat, upperLen, lowerLen, isLeg) => {
    const upper = new THREE.Group();
    upper.position.set(0, parentY, side);
    add(upper, upperGeo, upperMat, 0, -upperLen / 2, 0);
    const lower = new THREE.Group();
    lower.position.y = -upperLen;
    upper.add(lower);
    if (isLeg) {
      add(lower, geo.shin, skin, 0, -lowerLen * 0.25, 0);
      add(lower, geo.sock, mats.socks, 0, -lowerLen * 0.62, 0);
      add(lower, geo.boot, mats.boot, 0.055, -lowerLen - 0.035, 0);
    } else {
      add(lower, lowerGeo, lowerMat, 0, -lowerLen / 2, 0);
      add(lower, geo.hand, skin, 0, -lowerLen - 0.02, 0);
    }
    hips.add(upper);
    return { upper, lower };
  };
  const legL = limb(-0.06, -0.095, geo.thigh, null, mats.shorts, null, 0.42, 0.44, true);
  const legR = limb(-0.06, 0.095, geo.thigh, null, mats.shorts, null, 0.42, 0.44, true);
  // Upper legs show skin below the shorts line.
  for (const leg of [legL, legR]) leg.upper.children[0].material = skin;
  const armL = limb(0.56, -0.255, geo.upperArm, geo.foreArm, mats.shirt, skin, 0.27, 0.25, false);
  const armR = limb(0.56, 0.255, geo.upperArm, geo.foreArm, mats.shirt, skin, 0.27, 0.25, false);
  // Short sleeves: the shirt covers only the top of the upper arm.
  for (const arm of [armL, armR]) {
    const sleeve = add(arm.upper, geo.upperArm, mats.shirt, 0, -0.07, 0);
    sleeve.scale.set(1.18, 0.55, 1.18);
    arm.upper.children[0].material = skin;
  }
  // Short legs: the shorts cover the top of the thigh.
  for (const leg of [legL, legR]) {
    const cuff = add(leg.upper, geo.thigh, mats.shorts, 0, -0.08, 0);
    cuff.scale.set(1.15, 0.5, 1.15);
  }

  const shadow = new THREE.Mesh(geo.shadow, blobShadowMaterial(shadows ? 0.32 : 0.55));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  body.scale.setScalar(scale);
  return { root, body, hips, head: headG, legL, legR, armL, armR, phase: Math.random() * 6, smooth: { lean: 0, roll: 0, y: 0 } };
}

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Procedural animation driven by speed and the current action. Poses blend smoothly between states.
export function animatePlayer(m, speed, dt, action) {
  const run = Math.min(1, speed / 7.5);
  m.phase += dt * (4.2 + speed * 1.5);
  const s = Math.sin(m.phase);
  const c = Math.cos(m.phase);
  const amp = 0.12 + run * 0.88;
  let legLx = s * amp;
  let legRx = -s * amp;
  let kneeL = Math.max(0, -c) * run * 1.35 + 0.08;
  let kneeR = Math.max(0, c) * run * 1.35 + 0.08;
  let armLx = -s * amp * 0.75;
  let armRx = s * amp * 0.75;
  let lean = run * 0.2;
  let bodyRoll = 0;
  let bodyY = Math.abs(c) * run * 0.055;
  let armSpread = 0.14;
  let elbow = 0.35 + 0.6 * run;
  let headTilt = -lean * 0.6;

  if (action) {
    const t = action.t / action.dur;
    if (action.type === 'kick') {
      const swing = t < 0.45 ? -1.2 * (t / 0.45) : -1.2 + 2.8 * Math.min(1, (t - 0.45) / 0.3);
      legRx = swing;
      kneeR = t < 0.45 ? 1.3 * (t / 0.45) : Math.max(0, 1.3 - (t - 0.45) * 5);
      legLx = 0.12;
      kneeL = 0.2;
      armLx = 0.7;
      armRx = -0.5;
      armSpread = 0.7;
      lean = t < 0.45 ? -0.05 : 0.12;
      elbow = 0.4;
    } else if (action.type === 'tackle') {
      const k = Math.min(1, t * 3);
      lean = -1.15 * k;
      bodyY = -0.55 * k;
      legRx = 1.35;
      legLx = 0.45;
      kneeL = 1.0;
      kneeR = 0.1;
      armSpread = 1.0;
      elbow = 0.2;
    } else if (action.type === 'dive') {
      const k = Math.min(1, t * 2.5);
      bodyRoll = action.side * 1.35 * k;
      bodyY = action.height * 0.6 * Math.sin(Math.min(1, t * 1.6) * Math.PI) * k;
      armSpread = 2.7 * k;
      armLx = 0;
      armRx = 0;
      legLx = 0.2;
      legRx = -0.2;
      elbow = 0.1;
    } else if (action.type === 'celebrate') {
      armSpread = 2.6;
      armLx = Math.sin(m.phase * 0.5) * 0.3;
      armRx = -armLx;
      elbow = 0.25;
      bodyY = Math.abs(Math.sin(m.phase * 0.7)) * 0.22;
      headTilt = 0.3;
    } else if (action.type === 'header') {
      lean = t < 0.5 ? -0.4 : 0.6;
      bodyY = Math.sin(t * Math.PI) * 0.5;
      armSpread = 0.8;
    } else if (action.type === 'stumble') {
      lean = 0.55;
      bodyRoll = Math.sin(t * Math.PI) * 0.3;
    }
  }

  // Body pose is damped so action changes never snap.
  const sm = m.smooth;
  const k = action && (action.type === 'dive' || action.type === 'tackle') ? 18 : 10;
  sm.lean = damp(sm.lean, lean, k, dt);
  sm.roll = damp(sm.roll, bodyRoll, k, dt);
  sm.y = damp(sm.y, bodyY, k, dt);

  m.legL.upper.rotation.z = legLx;
  m.legR.upper.rotation.z = legRx;
  m.legL.lower.rotation.z = -kneeL;
  m.legR.lower.rotation.z = -kneeR;
  m.armL.upper.rotation.z = armLx;
  m.armR.upper.rotation.z = armRx;
  m.armL.upper.rotation.x = armSpread;
  m.armR.upper.rotation.x = -armSpread;
  m.armL.lower.rotation.z = elbow;
  m.armR.lower.rotation.z = elbow;
  m.head.rotation.z = headTilt;
  m.body.rotation.z = -sm.lean;
  m.body.rotation.x = sm.roll;
  m.body.position.y = sm.y;
}

export function createRing(colour) {
  const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.renderOrder = 2;
  return ring;
}

export function createBallMesh() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbfb';
  g.fillRect(0, 0, 512, 256);
  // Panel seams.
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.bezierCurveTo(i * 32 + 20, 80, i * 32 - 20, 170, i * 32, 256);
    g.stroke();
  }
  const spots = [[40, 40], [168, 44], [296, 36], [424, 48], [104, 128], [232, 132], [360, 124], [488, 128], [40, 216], [168, 212], [296, 220], [424, 208]];
  for (const [x, y] of spots) {
    g.fillStyle = '#16213a';
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 24, y + Math.sin(a) * 20);
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#c6f432';
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0 }));
  mesh.castShadow = settings.quality === 'high';
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), blobShadowMaterial(0.5));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  return { mesh, shadow };
}
