import { settings } from '../core/storage.js';

// All sound is synthesised with WebAudio so the APK ships without audio files.
class Audio {
  constructor() {
    this.ctx = null;
    this.crowdGain = null;
    this.excitement = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.sound ? 0.8 : 0;
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise();
  }

  setEnabled(on) {
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Pinkish noise sounds more like a crowd than white noise.
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    return buf;
  }

  startCrowd() {
    if (!this.ctx || this.crowdSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.5;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.12;
    src.connect(bp).connect(this.crowdGain).connect(this.master);
    src.start();
    this.crowdSrc = src;
    this.crowdFilter = bp;
  }

  stopCrowd() {
    if (this.crowdSrc) {
      try { this.crowdSrc.stop(); } catch { /* already stopped */ }
      this.crowdSrc = null;
    }
  }

  // Crowd volume follows how close the ball is to goal.
  setExcitement(v) {
    if (!this.crowdGain) return;
    this.excitement += (v - this.excitement) * 0.05;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.1 + this.excitement * 0.22, t, 0.3);
    this.crowdFilter.frequency.setTargetAtTime(600 + this.excitement * 500, t, 0.3);
  }

  roar(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9 * strength, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 4.6);
  }

  groan() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(300, t + 1.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.7);
  }

  kick(power = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180 + power * 60, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5 * (0.5 + power), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.16);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.25 * power, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(hp).connect(ng).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.05);
  }

  whistle(blasts = 1) {
    if (!this.ctx) return;
    let t = this.ctx.currentTime;
    for (let i = 0; i < blasts; i++) {
      const dur = i === blasts - 1 ? 0.7 : 0.28;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 2900;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 38;
      const lg = this.ctx.createGain();
      lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2900;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.setValueAtTime(0.18, t + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(bp).connect(g).connect(this.master);
      o.start(t); lfo.start(t);
      o.stop(t + dur); lfo.stop(t + dur);
      t += dur + 0.12;
    }
  }

  post() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [520, 1310, 2150]) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.9);
    }
  }

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.07);
  }

  freeze() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.31);
  }
}

export const audio = new Audio();
