const PREFIX = 'jcl:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full. The game keeps running without persistence.
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

const DEFAULT_SETTINGS = {
  difficulty: 'pro',
  matchMinutes: 5,
  sound: true,
  vibration: true,
  quality: 'high',
  camera: 'normal',
  showRisk: true,
  autoUpdateCheck: true,
  tutorialSeen: false,
};

export const settings = { ...DEFAULT_SETTINGS, ...load('settings', {}) };

export function saveSettings() {
  save('settings', settings);
}
