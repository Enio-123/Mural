import { persisted } from './store';
import type { Interest } from './interests';
import { SOURCES, type Source } from './sources';

export type Theme = 'escuro' | 'claro' | 'sistema';
export type BookTheme = 'auto' | 'claro' | 'sepia' | 'escuro';

export interface Prefs {
  onboarded: boolean;
  interests: string[];
  custom: Interest[];
  sources: string[];
  extraSources: Source[];
  theme: Theme;
  textScale: number;
  readScale: number;
  bookScale: number;
  bookTheme: BookTheme;
  splash: boolean;
  installHidden: boolean;
  aiLevel: number;
  aiColor: 'white' | 'black' | 'random';
  aiClock: 'none' | '10+0' | '15+10' | '30+0';
}

export const DEFAULT_PREFS: Prefs = {
  onboarded: false,
  interests: [],
  custom: [],
  sources: SOURCES.filter((s) => s.on).map((s) => s.id),
  extraSources: [],
  theme: 'escuro',
  textScale: 1,
  readScale: 1,
  bookScale: 1,
  bookTheme: 'auto',
  splash: true,
  installHidden: false,
  aiLevel: 3,
  aiColor: 'random',
  aiClock: 'none',
};

export const prefs = persisted<Prefs>('prefs', DEFAULT_PREFS);

// completa campos novos em versões futuras
prefs.set((p) => ({ ...DEFAULT_PREFS, ...p }));

export function usePrefs(): Prefs {
  return prefs.use();
}

export function setPrefs(patch: Partial<Prefs>): void {
  prefs.set((p) => ({ ...p, ...patch }));
}

export function applyTheme(p: Prefs): void {
  const root = document.documentElement;
  const dark = p.theme === 'sistema' ? !window.matchMedia('(prefers-color-scheme: light)').matches : p.theme === 'escuro';
  root.dataset.theme = dark ? 'escuro' : 'claro';
  root.style.setProperty('--text-scale', String(p.textScale));
  root.style.setProperty('--read-scale', String(p.readScale));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0f12' : '#f5f5f3');
}
