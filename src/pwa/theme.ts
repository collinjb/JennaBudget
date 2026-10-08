import { useLayoutEffect } from 'react';
import type { ThemeSetting } from '../types';

/** Fallback status-bar colors (match --bg in src/styles/tokens.css and the theme-color tags in index.html). */
const FALLBACK_BG = { light: '#f2f2f7', dark: '#000000' } as const;

function themeColorMetas(): HTMLMetaElement[] {
  return Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
}

/** Which scheme a theme-color tag is for, from its media attribute (no media = light). */
function schemeOf(meta: HTMLMetaElement): 'light' | 'dark' {
  return /dark/i.test(meta.media) ? 'dark' : 'light';
}

/**
 * Apply the theme setting to the page right now:
 * - 'light' / 'dark' set <html data-theme> (tokens.css switches colors), 'system' removes it.
 * - The theme-color tags (status bar / browser chrome color) follow, so a manual theme never leaves a
 *   light status bar over a dark app or vice versa. For 'system' the tags go back to their
 *   prefers-color-scheme values from index.html.
 * Safe to call before React renders (e.g. in main.tsx) to avoid a flash of the wrong theme.
 */
export function applyTheme(theme: ThemeSetting): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;

  const metas = themeColorMetas();
  for (const meta of metas) {
    // Remember the original color from index.html the first time we touch the tag.
    if (meta.dataset.original === undefined) meta.dataset.original = meta.content;
  }

  if (theme === 'system') {
    for (const meta of metas) meta.content = meta.dataset.original ?? FALLBACK_BG[schemeOf(meta)];
    return;
  }

  // Forced theme: read the actual background from the stylesheet (falls back to the known value).
  const color = cssBackground(root) || FALLBACK_BG[theme];
  for (const meta of metas) meta.content = color;
}

function cssBackground(root: HTMLElement): string {
  try {
    return getComputedStyle(root).getPropertyValue('--bg').trim();
  } catch {
    return '';
  }
}

/** Keep <html data-theme> and the status-bar color in sync with Settings → Theme. */
export function useApplyTheme(theme: ThemeSetting): void {
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);
}
