import type { Settings } from './types';

export function applyTheme(settings: Partial<Settings>) {
  const root = document.documentElement;
  const opacity = Math.min(1, Math.max(0.3, Number(settings.opacity ?? 0.88)));
  const cardAlpha = 0.6 + 0.4 * opacity;

  root.dataset.theme = settings.theme || 'light';
  // iOS PWA 状态栏跟随应用主题；深色用深色底，浅色恢复默认底色。
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', root.dataset.theme === 'dark' ? '#1c1c1e' : '#f2f2f7');
  }
  root.style.setProperty('--accent', settings.accent || '#0071e3');
  root.style.setProperty('--panel-alpha', String(opacity));
  root.style.setProperty('--card-alpha', String(cardAlpha));
  root.style.setProperty('--done-card-alpha', String(cardAlpha * 0.6));
  const fontScale = Math.min(2.5, Math.max(0.9, Number(settings.fontScale ?? 1) || 1));
  root.style.setProperty('--font-scale', String(fontScale));
}
