import type { QueryResult } from '../engine/duckdb';

/** 右ペインのタブ */
export type RightTab = 'result' | 'schema' | 'plan';

export interface WorkbenchSession {
  sql: string;
  lastRun: { sql: string; result: QueryResult } | null;
  planText: string | null;
  tab: RightTab;
}

const KEY_PREFIX = 'sql-training:workbench:v1:';
/** F5 を捕まえた時刻。リロードが起きてしまったかどうかの判定に使う */
const F5_KEY = 'sql-training:f5-at';
/**
 * 保存する結果行の上限。巨大な結果でセッションストレージを埋めないため。
 * これを超える結果は「途中まで」を残すと ANSWER が誤判定するので、結果ごと捨てる。
 */
const MAX_ROWS = 2000;

const key = (problemId: string): string => KEY_PREFIX + problemId;

/**
 * 作業中の SQL と直近の実行結果を「そのタブの間だけ」覚えておく。
 * ブラウザのリロードやタブクラッシュで手元の SQL が消えるのを防ぐのが目的なので、
 * 進捗（localStorage）とは分けて sessionStorage に置く。
 */
export function saveSession(problemId: string, session: WorkbenchSession): void {
  try {
    // 行を間引いて保存すると復元後の ANSWER が不足行ありと誤判定するため、
    // 大きすぎる結果は保存しない（復元後はもう一度「実行」してもらう）
    const tooLarge = (session.lastRun?.result.rows.length ?? 0) > MAX_ROWS;
    const stored: WorkbenchSession = tooLarge ? { ...session, lastRun: null } : session;
    sessionStorage.setItem(key(problemId), JSON.stringify(stored));
  } catch {
    /* 保存できなくても学習は続けられるので握りつぶす */
  }
}

function isLastRun(value: unknown): value is WorkbenchSession['lastRun'] {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { sql?: unknown; result?: { columns?: unknown; rows?: unknown } };
  return (
    typeof v.sql === 'string' &&
    typeof v.result === 'object' &&
    v.result !== null &&
    Array.isArray(v.result.columns) &&
    Array.isArray(v.result.rows)
  );
}

export function loadSession(problemId: string): WorkbenchSession | null {
  try {
    const raw = sessionStorage.getItem(key(problemId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const v = parsed as Partial<WorkbenchSession>;
    if (typeof v.sql !== 'string') return null;
    return {
      sql: v.sql,
      // 形の壊れた結果を返すと、復元後の ANSWER で落ちる
      lastRun: isLastRun(v.lastRun) ? v.lastRun : null,
      planText: v.planText ?? null,
      tab: v.tab === 'result' || v.tab === 'plan' ? v.tab : 'schema',
    };
  } catch {
    return null;
  }
}

/** F5 を横取りしたことを記録する */
export function markF5Handled(): void {
  try {
    sessionStorage.setItem(F5_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
}

// StrictMode で 2 回呼ばれても同じ答えを返すようモジュール内で覚えておく
let unpreventedReload: boolean | null = null;

/**
 * 「F5 を横取りしたのに、それでもページがリロードされていた」を検出する。
 * true ならそのブラウザでは preventDefault でリロードを止められない、ということ。
 */
export function detectUnpreventedReload(): boolean {
  if (unpreventedReload !== null) return unpreventedReload;
  unpreventedReload = false;
  try {
    const at = Number(sessionStorage.getItem(F5_KEY) ?? '0');
    sessionStorage.removeItem(F5_KEY);
    const nav = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    // F5 直後（3 秒以内）の reload だけを対象にする。手動の Ctrl+R を誤検出しないため
    unpreventedReload = at > 0 && Date.now() - at < 3000 && nav?.type === 'reload';
  } catch {
    unpreventedReload = false;
  }
  return unpreventedReload;
}
