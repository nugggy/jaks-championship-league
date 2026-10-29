import { compareVersions } from './util.js';

export const REPO = 'nugggy/jaks-championship-league';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

// Asks the GitHub releases API for the newest release and compares it with this build.
export async function checkForUpdate(timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (res.status === 404) return { status: 'none' };
    if (!res.ok) return { status: 'error', message: `GitHub returned ${res.status}` };
    const rel = await res.json();
    const latest = String(rel.tag_name || '').replace(/^v/i, '');
    if (!latest) return { status: 'none' };
    if (compareVersions(latest, APP_VERSION) > 0) {
      const apk = (rel.assets || []).find((a) => a.name.toLowerCase().endsWith('.apk'));
      return {
        status: 'available',
        version: latest,
        notes: rel.body || '',
        url: apk ? apk.browser_download_url : rel.html_url,
        published: rel.published_at,
      };
    }
    return { status: 'current', version: latest };
  } catch (e) {
    return { status: 'error', message: e.name === 'AbortError' ? 'Timed out' : 'No connection' };
  } finally {
    clearTimeout(timer);
  }
}

export async function openExternal(url) {
  try {
    const cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    }
  } catch {
    // Fall through to a normal window.
  }
  window.open(url, '_blank', 'noopener');
}

// Stable link that always resolves to the newest release's APK (CI publishes it under this name).
export const APK_NAME = 'jaks-championship-league.apk';
export const LATEST_APK_URL = `https://github.com/${REPO}/releases/latest/download/${APK_NAME}`;

// Opens the native share sheet with the latest APK link. Returns 'shared', 'copied' or 'failed'.
export async function shareLatest() {
  const title = "Jak's Championship League";
  const text = "Play Jak's Championship League, the draw-your-play football game. Download the latest Android version:";
  try {
    const cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url: LATEST_APK_URL, dialogTitle: 'Share the game' });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text, url: LATEST_APK_URL });
      return 'shared';
    }
  } catch (e) {
    // Dismissing the share sheet is not an error worth reporting.
    if (e && (e.name === 'AbortError' || /cancel/i.test(String(e.message)))) return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(`${text} ${LATEST_APK_URL}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
