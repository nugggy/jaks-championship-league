// 2D overlay for the drawn play line and on-pitch hints.
export const ACTION_COLOURS = {
  dribble: '#ffffff',
  pass: '#4fd1ff',
  through: '#4fd1ff',
  lob: '#b98cff',
  shot: '#ffd23f',
  chip: '#ffd23f',
  invalid: '#ff5a5a',
};

export class DrawLayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  path(points, colour, { width = 7, dash = null, alpha = 1, glow = true } = {}) {
    if (points.length < 2) return;
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (glow) {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = width + 5;
      this.trace(points);
      g.stroke();
    }
    g.strokeStyle = colour;
    g.lineWidth = width;
    if (dash) g.setLineDash(dash);
    this.trace(points);
    g.stroke();
    g.restore();
  }

  trace(points) {
    const g = this.g;
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      g.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    const last = points[points.length - 1];
    g.lineTo(last.x, last.y);
  }

  arrowHead(from, to, colour) {
    const g = this.g;
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    g.save();
    g.fillStyle = colour;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(to.x + Math.cos(a) * 14, to.y + Math.sin(a) * 14);
    g.lineTo(to.x + Math.cos(a + 2.4) * 14, to.y + Math.sin(a + 2.4) * 14);
    g.lineTo(to.x + Math.cos(a - 2.4) * 14, to.y + Math.sin(a - 2.4) * 14);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }

  target(x, y, colour, r = 16, t = 0) {
    const g = this.g;
    g.save();
    g.strokeStyle = colour;
    g.lineWidth = 3;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(x, y, r + Math.sin(t * 6) * 2, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(x - r * 0.5, y);
    g.lineTo(x + r * 0.5, y);
    g.moveTo(x, y - r * 0.5);
    g.lineTo(x, y + r * 0.5);
    g.stroke();
    g.restore();
  }

  pulse(x, y, colour, t) {
    const g = this.g;
    const k = (t * 1.4) % 1;
    g.save();
    g.strokeStyle = colour;
    g.globalAlpha = 1 - k;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, 22 + k * 40, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  label(x, y, text, colour = '#fff', bg = 'rgba(7,17,31,0.82)') {
    const g = this.g;
    g.save();
    g.font = '700 14px "Barlow Condensed", Arial Narrow, sans-serif';
    const w = g.measureText(text).width + 14;
    g.fillStyle = bg;
    roundRect(g, x - w / 2, y - 11, w, 22, 6);
    g.fill();
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y + 1);
    g.restore();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
