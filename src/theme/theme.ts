export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'sql-training:theme';

const isChoice = (v: unknown): v is ThemeChoice =>
  v === 'light' || v === 'dark' || v === 'system';

export function readStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isChoice(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return prefersDark() ? 'dark' : 'light';
  return choice;
}

/** <html data-theme="..."> を書き換える。index.html の先読みスクリプトと同じ規則 */
export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice);
  document.documentElement.setAttribute('data-theme', resolved);
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* 保存できなくても表示は切り替わる */
  }
  return resolved;
}
