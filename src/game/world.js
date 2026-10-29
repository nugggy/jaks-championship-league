import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PITCH_L, PITCH_W, HALF_L, HALF_W, GOAL_HALF, GOAL_H, GOAL_DEPTH, BOX_L, BOX_HALF_W, SIX_L, SIX_HALF_W, POST_R } from './constants.js';
import { settings } from '../core/storage.js';
import { hexToRgb } from '../core/util.js';

const APRON = 7;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function pitchTexture(high) {
  const totalL = PITCH_L + APRON * 2;
  const totalW = PITCH_W + APRON * 2;
  const W = high ? 4096 : 2048;
  const ppm = W / totalL;
  const H = Math.round(totalW * ppm);
  return canvasTexture(W, H, (g) => {
    const X = (x) => (x + totalL / 2) * ppm;
    const Y = (z) => (z + totalW / 2) * ppm;
    g.fillStyle = '#29712d';
    g.fillRect(0, 0, W, H);
    // Mowing stripes with a soft edge, plus a faint cross cut for a manicured look.
    const stripes = 20;
    const sw = PITCH_L / stripes;
    for (let i = -2; i < stripes + 2; i++) {
      const x0 = X(-HALF_L + i * sw);
      const grd = g.createLinearGradient(x0, 0, x0 + sw * ppm, 0);
      const light = i % 2 === 0;
      grd.addColorStop(0, light ? '#2f8034' : '#286d2c');
      grd.addColorStop(0.5, light ? '#31853a' : '#266a2a');
      grd.addColorStop(1, light ? '#2f8034' : '#286d2c');
      g.fillStyle = grd;
      g.fillRect(x0, 0, sw * ppm + 1, H);
    }
    const cw = PITCH_W / 10;
    g.globalAlpha = 0.022;
    for (let j = 0; j < 12; j++) {
      g.fillStyle = j % 2 ? '#ffffff' : '#000000';
      g.fillRect(0, Y(-HALF_W - APRON + j * cw), W, cw * ppm);
    }
    g.globalAlpha = 1;
    // Fine grain, with wear in the goalmouths and centre circle.
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 12;
      d[i] += n * 0.5;
      d[i + 1] += n;
      d[i + 2] += n * 0.35;
    }
    g.putImageData(img, 0, 0);
    const wear = (x, z, r, a) => {
      const grd = g.createRadialGradient(X(x), Y(z), 0, X(x), Y(z), r * ppm);
      grd.addColorStop(0, `rgba(120,110,60,${a})`);
      grd.addColorStop(1, 'rgba(120,110,60,0)');
      g.fillStyle = grd;
      g.fillRect(X(x) - r * ppm, Y(z) - r * ppm, r * 2 * ppm, r * 2 * ppm);
    };
    wear(HALF_L - 3, 0, 5, 0.22);
    wear(-HALF_L + 3, 0, 5, 0.22);
    wear(0, 0, 4, 0.1);
    g.strokeStyle = 'rgba(240,244,240,0.85)';
    g.lineWidth = Math.max(2, 0.12 * ppm);
    g.shadowColor = 'rgba(255,255,255,0.35)';
    g.shadowBlur = 2;
    const rect = (x1, z1, x2, z2) => g.strokeRect(X(x1), Y(z1), (x2 - x1) * ppm, (z2 - z1) * ppm);
    rect(-HALF_L, -HALF_W, HALF_L, HALF_W);
    g.beginPath();
    g.moveTo(X(0), Y(-HALF_W));
    g.lineTo(X(0), Y(HALF_W));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Y(0), 9.15 * ppm, 0, Math.PI * 2);
    g.stroke();
    for (const s of [-1, 1]) {
      const gx = s * HALF_L;
      rect(Math.min(gx, gx - s * BOX_L), -BOX_HALF_W, Math.max(gx, gx - s * BOX_L), BOX_HALF_W);
      rect(Math.min(gx, gx - s * SIX_L), -SIX_HALF_W, Math.max(gx, gx - s * SIX_L), SIX_HALF_W);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(X(gx - s * 11), Y(0), 0.22 * ppm, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      const a = Math.acos((BOX_L - 11) / 9.15);
      if (s > 0) g.arc(X(gx - 11), Y(0), 9.15 * ppm, Math.PI - a, Math.PI + a);
      else g.arc(X(gx + 11), Y(0), 9.15 * ppm, -a, a);
      g.stroke();
      for (const c of [-1, 1]) {
        g.beginPath();
        if (s > 0) g.arc(X(gx), Y(c * HALF_W), 1 * ppm, c > 0 ? Math.PI : Math.PI / 2, c > 0 ? Math.PI * 1.5 : Math.PI);
        else g.arc(X(gx), Y(c * HALF_W), 1 * ppm, c > 0 ? Math.PI * 1.5 : 0, c > 0 ? Math.PI * 2 : Math.PI / 2);
        g.stroke();
      }
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(X(0), Y(0), 0.22 * ppm, 0, Math.PI * 2);
    g.fill();
  });
}

function crowdTexture(colourA, colourB) {
  const a = hexToRgb(colourA);
  const b = hexToRgb(colourB);
  return canvasTexture(1024, 512, (g, w, h) => {
    g.fillStyle = '#141925';
    g.fillRect(0, 0, w, h);
    const rows = 40;
    const cols = 160;
    const cw = w / cols;
    const rh = h / rows;
    for (let row = 0; row < rows; row++) {
      // Concrete step between rows.
      g.fillStyle = '#2a303d';
      g.fillRect(0, row * rh + rh - 2, w, 2);
      for (let col = 0; col < cols; col++) {
        if (col % 40 === 0) continue; // aisle
        if (Math.random() < 0.04) continue; // empty seat
        const r = Math.random();
        let c;
        if (r < 0.42) c = a;
        else if (r < 0.58) c = b;
        else {
          const v = 50 + Math.random() * 150;
          c = [v, v * (0.85 + Math.random() * 0.25), v * (0.75 + Math.random() * 0.35)];
        }
        const x = col * cw + (row % 2) * (cw / 2);
        const y = row * rh;
        g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        g.fillRect(x + 1, y + rh * 0.38, cw - 2, rh * 0.5);
        const skin = ['#e9c09b', '#c99671', '#8d5a3b', '#5b3a26'][(Math.random() * 4) | 0];
        g.fillStyle = skin;
        g.beginPath();
        g.arc(x + cw / 2, y + rh * 0.28, cw * 0.32, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

function boardTexture(lines) {
  const t = canvasTexture(2048, 64, (g, w, h) => {
    const seg = w / lines.length;
    lines.forEach((l, i) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, l.bg);
      grd.addColorStop(1, shade(l.bg, -0.25));
      g.fillStyle = grd;
      g.fillRect(i * seg, 0, seg, h);
      g.fillStyle = l.fg;
      g.font = '800 40px "Barlow Condensed", Arial Narrow, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(l.text, i * seg + seg / 2, h / 2 + 2);
    });
  });
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function netTexture() {
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    // Hexagonal-ish diamond mesh.
    for (let i = -8; i <= 16; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + h, h); g.stroke();
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 - h, h); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(330, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#050b18') }, mid: { value: new THREE.Color('#0d2142') }, horizon: { value: new THREE.Color('#2b4a78') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float h = clamp(vP.y, 0.0, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        c = mix(c, top, smoothstep(0.25, 0.9, h));
        vec3 q = floor(vP * 420.0);
        float s = step(0.9975, hash(q)) * smoothstep(0.15, 0.6, h);
        c += vec3(s) * 0.8;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.high = settings.quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.high, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    if (this.high) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#081325');
    this.scene.fog = new THREE.Fog('#0b1a33', 150, 320);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 700);
    this.camera.position.set(-20, 14, 0);
    this.camera.lookAt(0, 0, 0);
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.boardTextures = [];
    this.shadowFocus = new THREE.Vector3();
    this.netShake = [];
    this.buildStatic();
    this.buildComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildComposer() {
    if (!this.high) return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.6, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = this.high ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(w, h);
      this.fxaa.material.uniforms.resolution.value.set(1 / (w * ratio), 1 / (h * ratio));
    }
  }

  buildStatic() {
    const s = this.scene;
    s.add(skyDome());
    s.add(new THREE.HemisphereLight('#cfe0ff', '#1f3a22', 0.55));
    // Key light from the floodlights, tracking the action so shadows stay crisp.
    const key = new THREE.DirectionalLight('#fff4e0', 1.55);
    key.position.set(-25, 55, 30);
    if (this.high) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const sc = key.shadow.camera;
      sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32;
      sc.near = 10; sc.far = 140;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.03;
      key.shadow.radius = 3;
    }
    s.add(key);
    s.add(key.target);
    this.key = key;
    const fill = new THREE.DirectionalLight('#9fc0ff', 0.35);
    fill.position.set(40, 40, -30);
    s.add(fill);

    const pitchTex = pitchTexture(this.high);
    pitchTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    pitchTex.generateMipmaps = true;
    pitchTex.minFilter = THREE.LinearMipmapLinearFilter;
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH_L + APRON * 2, PITCH_W + APRON * 2),
      new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.88, metalness: 0, envMapIntensity: 0.4 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = this.high;
    s.add(pitch);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 600), new THREE.MeshStandardMaterial({ color: '#141c22', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    s.add(ground);

    this.goals = [this.buildGoal(1), this.buildGoal(-1)];
    this.buildBoards();
    this.buildFlags();
    this.buildLights();
    this.buildDugouts();
  }

  buildGoal(side) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.1 });
    const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, GOAL_H, 16);
    for (const z of [-GOAL_HALF, GOAL_HALF]) {
      const p = new THREE.Mesh(postGeo, white);
      p.position.set(0, GOAL_H / 2, z);
      p.castShadow = this.high;
      g.add(p);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(GOAL_DEPTH, GOAL_H), 8), white);
      back.position.set((side * GOAL_DEPTH) / 2, GOAL_H / 2, z);
      back.rotation.z = side * Math.atan2(GOAL_DEPTH, GOAL_H);
      g.add(back);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, GOAL_HALF * 2 + POST_R * 2, 16), white);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, GOAL_H, 0);
    bar.castShadow = this.high;
    g.add(bar);
    const tex = netTexture();
    const netMat = (rx, ry) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85, alphaTest: 0.05, roughness: 0.9 });
    };
    // The back net is subdivided so it can ripple when a goal goes in.
    const backNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF * 2, GOAL_H, 24, 8), netMat(7, 2.4));
    backNet.rotation.y = Math.PI / 2;
    backNet.position.set(side * GOAL_DEPTH, GOAL_H / 2, 0);
    g.add(backNet);
    backNet.userData.base = backNet.geometry.attributes.position.array.slice();
    const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HALF * 2), netMat(2, 7));
    top.rotation.x = Math.PI / 2;
    top.position.set((side * GOAL_DEPTH) / 2, GOAL_H, 0);
    g.add(top);
    for (const z of [-GOAL_HALF, GOAL_HALF]) {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_H), netMat(2, 2.4));
      sideNet.position.set((side * GOAL_DEPTH) / 2, GOAL_H / 2, z);
      g.add(sideNet);
    }
    g.position.x = side * HALF_L;
    this.scene.add(g);
    g.userData.back = backNet;
    g.userData.side = side;
    return g;
  }

  // Called when the ball hits the back of the net.
  rippleNet(side, z, y, strength = 1) {
    const goal = this.goals.find((g) => g.userData.side === side);
    if (goal) this.netShake.push({ net: goal.userData.back, z, y, t: 0, strength });
  }

  buildBoards() {
    const lines = [
      { text: "JAK'S CHAMPIONSHIP LEAGUE", bg: '#0b2545', fg: '#c6f432' },
      { text: 'MATCHDAY LIVE', bg: '#c6f432', fg: '#0b2545' },
      { text: 'DRAW YOUR PLAY', bg: '#13315c', fg: '#ffffff' },
      { text: 'SEASON 2026/27', bg: '#e63946', fg: '#ffffff' },
    ];
    const mk = (len, x, z, ry) => {
      const t = boardTexture(lines);
      t.repeat.set(len / 60, 1);
      this.boardTextures.push(t);
      // LED boards are emissive so they glow under the bloom pass.
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(0.85, 0.85, 0.85) }));
      m.position.set(x, 0.45, z);
      m.rotation.y = ry;
      this.scene.add(m);
      const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.12), new THREE.MeshStandardMaterial({ color: '#10151f' }));
      back.position.set(x, 0.47, z);
      back.rotation.y = ry;
      back.translateZ(-0.07);
      this.scene.add(back);
    };
    mk(PITCH_L + 6, 0, -HALF_W - 4, 0);
    mk(PITCH_L + 6, 0, HALF_W + 4, Math.PI);
    mk(PITCH_W - 16, -HALF_L - 4.5, -18, Math.PI / 2);
    mk(PITCH_W - 16, -HALF_L - 4.5, 18, Math.PI / 2);
    mk(PITCH_W - 16, HALF_L + 4.5, -18, -Math.PI / 2);
    mk(PITCH_W - 16, HALF_L + 4.5, 18, -Math.PI / 2);
  }

  buildFlags() {
    const poleMat = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4 });
    const flagMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', side: THREE.DoubleSide, roughness: 0.7 });
    this.flags = [];
    for (const x of [-HALF_L, HALF_L]) {
      for (const z of [-HALF_W, HALF_W]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), poleMat);
        pole.position.set(x, 0.75, z);
        pole.castShadow = this.high;
        this.scene.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3, 6, 1), flagMat);
        flag.position.set(x, 1.35, z + 0.2 * Math.sign(-z));
        flag.rotation.y = Math.PI / 2;
        flag.userData.base = flag.geometry.attributes.position.array.slice();
        this.scene.add(flag);
        this.flags.push(flag);
      }
    }
  }

  buildLights() {
    const mat = new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.6, metalness: 0.4 });
    const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6), toneMapped: false });
    const glowTex = canvasTexture(128, 128, (g) => {
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,245,1)');
      grd.addColorStop(0.25, 'rgba(255,250,220,0.45)');
      grd.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });
    for (const x of [-HALF_L - 24, HALF_L + 24]) {
      for (const z of [-HALF_W - 24, HALF_W + 24]) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 46, 10), mat);
        mast.position.set(x, 23, z);
        this.scene.add(mast);
        const head = new THREE.Group();
        head.position.set(x, 46, z);
        head.lookAt(0, 0, 0);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 0.5), mat);
        head.add(frame);
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 2; j++) {
            const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), panelMat);
            p.position.set(-2.4 + i * 1.6, -0.9 + j * 1.8, 0.3);
            head.add(p);
          }
        }
        this.scene.add(head);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        glow.scale.set(26, 26, 1);
        glow.position.set(x, 46, z);
        this.scene.add(glow);
      }
    }
  }

  buildDugouts() {
    const shell = new THREE.MeshPhysicalMaterial({ color: '#9fb4cc', roughness: 0.15, transmission: 0.0, transparent: true, opacity: 0.55 });
    const seat = new THREE.MeshStandardMaterial({ color: '#1b2638' });
    for (const x of [-12, 12]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 1.6), seat);
      base.position.y = 0.25;
      g.add(base);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 8, 16, 1, true, 0, Math.PI), shell);
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 0.5;
      g.add(roof);
      g.position.set(x, 0, -HALF_W - 6);
      this.scene.add(g);
    }
  }

  // Stands are rebuilt per match so the crowd wears the home side's colours.
  setStadium(homeColours) {
    if (this.stands) this.scene.remove(this.stands);
    const stands = new THREE.Group();
    const tex = crowdTexture(homeColours.primary, homeColours.secondary);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    this.crowdTextures = [];
    const roofMat = new THREE.MeshStandardMaterial({ color: '#c9ced8', roughness: 0.5, metalness: 0.5 });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#1d2331', roughness: 0.9 });
    const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(homeColours.primary), toneMapped: true });
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2), toneMapped: false });
    const make = (length, along) => {
      const g = new THREE.Group();
      const tiers = [
        { rise: 0, run: 0, h: 9, d: 14 },
        { rise: 11, run: 13, h: 10, d: 12 },
      ];
      for (const t of tiers) {
        const crowdTex = tex.clone();
        crowdTex.needsUpdate = true;
        crowdTex.repeat.set(length / 26, 1.2);
        this.crowdTextures.push(crowdTex);
        const slope = new THREE.Mesh(new THREE.PlaneGeometry(length, Math.hypot(t.h, t.d)), new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 1 }));
        const ang = Math.atan2(t.h, t.d);
        slope.rotation.x = -Math.PI / 2 + ang;
        slope.position.set(0, 1.2 + t.rise + t.h / 2, -(t.run + t.d / 2));
        g.add(slope);
        // Tier fascia in the home colour.
        const fascia = new THREE.Mesh(new THREE.BoxGeometry(length, 1.1, 0.3), trimMat);
        fascia.position.set(0, 0.6 + t.rise + (t.rise ? 0.6 : 0), -t.run - (t.rise ? 0.2 : 0));
        g.add(fascia);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(length, 26, 1), wallMat);
      back.position.set(0, 13, -27);
      g.add(back);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 4, 0.6, 22), roofMat);
      roof.position.set(0, 26, -18);
      roof.rotation.x = -0.08;
      g.add(roof);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.25, 0.25), stripMat);
      strip.position.set(0, 25.2, -7.4);
      g.add(strip);
      g.position.copy(along.pos);
      g.rotation.y = along.ry;
      stands.add(g);
    };
    make(PITCH_L + 10, { pos: new THREE.Vector3(0, 0, -HALF_W - 8), ry: 0 });
    make(PITCH_L + 10, { pos: new THREE.Vector3(0, 0, HALF_W + 8), ry: Math.PI });
    make(PITCH_W + 10, { pos: new THREE.Vector3(-HALF_L - 9, 0, 0), ry: Math.PI / 2 });
    make(PITCH_W + 10, { pos: new THREE.Vector3(HALF_L + 9, 0, 0), ry: -Math.PI / 2 });
    this.stands = stands;
    this.scene.add(stands);
  }

  // Keeps the shadow frustum centred on the play.
  focusShadows(x, z) {
    if (!this.high) return;
    this.shadowFocus.set(x, 0, z);
    this.key.target.position.copy(this.shadowFocus);
    this.key.position.set(x - 25, 55, z + 30);
  }

  tick(dt) {
    this.time = (this.time || 0) + dt;
    for (const t of this.boardTextures) t.offset.x = (t.offset.x + dt * 0.02) % 1;
    // Crowd shimmer: a subtle vertical bob reads as movement in the stands.
    if (this.crowdTextures) {
      const bob = Math.sin(this.time * 7) * 0.0025;
      for (const t of this.crowdTextures) t.offset.y = bob;
    }
    for (const f of this.flags) {
      const pos = f.geometry.attributes.position;
      const base = f.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.array[i * 3 + 2] = Math.sin(this.time * 6 + x * 12) * 0.04 * (x + 0.2);
      }
      pos.needsUpdate = true;
    }
    for (let i = this.netShake.length - 1; i >= 0; i--) {
      const s = this.netShake[i];
      s.t += dt;
      const net = s.net;
      const pos = net.geometry.attributes.position;
      const base = net.userData.base;
      const k = Math.max(0, 1 - s.t / 1.6);
      for (let j = 0; j < pos.count; j++) {
        const lx = base[j * 3];
        const ly = base[j * 3 + 1];
        // The net is rotated a quarter turn, so local x runs along -z and local z points out of the goal on +x.
        const d = Math.hypot(lx + s.z, ly - (s.y - GOAL_H / 2));
        pos.array[j * 3 + 2] = Math.exp(-d * 1.2) * Math.sin(s.t * 18 - d * 3) * 0.45 * k * s.strength * net.parent.userData.side;
      }
      pos.needsUpdate = true;
      if (k <= 0) {
        for (let j = 0; j < pos.count; j++) pos.array[j * 3 + 2] = base[j * 3 + 2];
        pos.needsUpdate = true;
        this.netShake.splice(i, 1);
      }
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
