import { icons } from './icons.js';
import { escapeHtml } from '../core/util.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function photoStyle(p) {
  return p && p.photo ? `style="background-image:url('${p.photo}')"` : '';
}

export function initials(p) {
  return p && !p.photo ? escapeHtml(String(p.number ?? '')) : '';
}

export function formatClock(sec, half) {
  const base = half === 1 ? 45 : 90;
  const m = Math.floor(sec / 60);
  if (m >= base) {
    const extra = m - base + 1;
    return `${base}+${extra}`;
  }
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// In-match overlay: scoreboard, commentary, player card and contextual buttons.
export class MatchHud {
  constructor(root, { left, right, onPause, onTackle, onSwitch, onLob }) {
    this.root = root;
    root.innerHTML = '';
    this.left = left;
    this.right = right;
    this.sb = el(`<div class="scoreboard">
      <div class="kit" style="background:${left.kit}"></div>
      <div class="tm"><img class="crest xs" src="${left.club.crest || ''}" alt="">${escapeHtml(left.club.abbr)}</div>
      <div class="sc"><span data-s0>0</span>&nbsp;-&nbsp;<span data-s1>0</span></div>
      <div class="tm">${escapeHtml(right.club.abbr)}<img class="crest xs" src="${right.club.crest || ''}" alt=""></div>
      <div class="kit" style="background:${right.kit}"></div>
      <div class="clk" data-clk>00:00</div>
    </div>`);
    root.appendChild(this.sb);
    const pause = el(`<button class="hud-btn hud-pause" aria-label="Pause">${icons.pause}</button>`);
    pause.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onPause();
    });
    root.appendChild(pause);
    this.comm = el('<div class="commentary" style="opacity:0"></div>');
    root.appendChild(this.comm);
    this.card = el('<div class="player-card" style="opacity:0"></div>');
    root.appendChild(this.card);
    this.hint = el('<div class="hint" style="display:none"></div>');
    root.appendChild(this.hint);
    this.legend = el(`<div class="legend" style="display:none"><span style="color:#fff">Dribble</span><span style="color:#4fd1ff">Pass</span><span style="color:#b98cff">Lofted</span><span style="color:#ffd23f">Shot</span></div>`);
    root.appendChild(this.legend);
    this.actions = el('<div class="action-btns"></div>');
    root.appendChild(this.actions);
    this.lobBtn = el(`<button class="round-btn" aria-label="Lofted">Lob</button>`);
    this.switchBtn = el(`<button class="round-btn" aria-label="Switch player">Switch</button>`);
    this.tackleBtn = el(`<button class="round-btn big" aria-label="Tackle">Tackle</button>`);
    const bind = (b, fn) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    bind(this.lobBtn, () => {
      const on = onLob();
      this.lobBtn.classList.toggle('on', on);
    });
    bind(this.switchBtn, onSwitch);
    bind(this.tackleBtn, onTackle);
    this.mode = null;
    this.lastClock = '';
    this.lastScore = '';
    this.commTimer = null;
  }

  setScore(s, swap) {
    const key = s.join('-');
    if (key === this.lastScore) return;
    this.lastScore = key;
    const [a, b] = swap ? [s[1], s[0]] : s;
    this.sb.querySelector('[data-s0]').textContent = a;
    this.sb.querySelector('[data-s1]').textContent = b;
  }

  setClock(text) {
    if (text === this.lastClock) return;
    this.lastClock = text;
    this.sb.querySelector('[data-clk]').textContent = text;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.actions.innerHTML = '';
    this.hint.style.display = 'none';
    this.legend.style.display = 'none';
    if (mode === 'freeze') {
      this.lobBtn.classList.remove('on');
      this.actions.appendChild(this.lobBtn);
      this.hint.style.display = '';
      this.legend.style.display = '';
    } else if (mode === 'defend') {
      this.actions.appendChild(this.switchBtn);
      this.actions.appendChild(this.tackleBtn);
    }
  }

  setHint(html) {
    this.hint.innerHTML = html;
  }

  showPlayer(p, extra = '') {
    if (!p) {
      this.card.style.opacity = 0;
      return;
    }
    this.card.innerHTML = `<div class="ph" ${photoStyle(p)}>${initials(p)}</div>
      <div><div class="nm">${escapeHtml(p.short)}</div><div class="st">${escapeHtml(p.role)} &middot; #${p.number}${extra}</div></div>
      <div class="ovr">${p.ovr}</div>`;
    this.card.style.opacity = 1;
  }

  commentary(text) {
    this.comm.textContent = text;
    this.comm.style.opacity = 1;
    clearTimeout(this.commTimer);
    this.commTimer = setTimeout(() => (this.comm.style.opacity = 0), 3200);
  }

  banner(text, kind = 'info', sub = '') {
    const b = el(`<div class="banner ${kind}"><div class="b1">${escapeHtml(text)}</div>${sub ? `<div class="b2">${escapeHtml(sub)}</div>` : ''}</div>`);
    this.root.appendChild(b);
    setTimeout(() => b.remove(), kind === 'goal' ? 3000 : 1600);
  }

  replay(on) {
    if (on) {
      this.replayTag = el('<div class="replay-tag">REPLAY<small>Tap to skip</small></div>');
      this.root.appendChild(this.replayTag);
      this.sb.style.opacity = 0.4;
    } else {
      this.replayTag?.remove();
      this.sb.style.opacity = 1;
    }
  }

  intro(home, away, sub) {
    this.introEl = el(`<div class="intro-card"><div class="sub">${escapeHtml(sub)}</div>
      <img class="crest" src="${home.crest || ''}" alt=""><div class="nm">${escapeHtml(home.short)}</div>
      <div class="vs">v</div><div class="nm">${escapeHtml(away.short)}</div><img class="crest" src="${away.crest || ''}" alt="">
      <div class="tap">Tap to kick off</div></div>`);
    this.root.appendChild(this.introEl);
  }

  clearIntro() {
    this.introEl?.remove();
    this.introEl = null;
  }

  destroy() {
    clearTimeout(this.commTimer);
    this.root.innerHTML = '';
  }
}
