import type { HistoryEntry, ProgressData, SolvedRecord } from '../types';

const STORAGE_KEY = 'sql-training:progress:v1';
const HISTORY_LIMIT = 100;

const emptyProgress = (): ProgressData => ({ version: 1, solvedProblems: {}, history: [] });

function isProgressData(value: unknown): value is ProgressData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ProgressData>;
  return typeof v.solvedProblems === 'object' && v.solvedProblems !== null && Array.isArray(v.history);
}

export function loadProgress(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed: unknown = JSON.parse(raw);
    if (!isProgressData(parsed)) return emptyProgress();
    return { version: 1, solvedProblems: parsed.solvedProblems, history: parsed.history };
  } catch {
    // プライベートモード等で localStorage が読めない場合もアプリは動かす
    return emptyProgress();
  }
}

export function saveProgress(data: ProgressData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 保存できなくても致命的ではないので握りつぶす */
  }
}

/**
 * 端末のローカル日付（YYYY-MM-DD）。
 * toISOString() は UTC なので、JST の朝に解いた分が前日として記録されてしまう。
 */
const today = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** 1回の解答を記録する。solved は一度 true になったら下がらない */
export function recordAttempt(
  data: ProgressData,
  problemId: string,
  correct: boolean,
): ProgressData {
  const prev: SolvedRecord = data.solvedProblems[problemId] ?? {
    solved: false,
    attempts: 0,
    lastSolvedAt: null,
  };
  const next: SolvedRecord = {
    ...prev,
    attempts: prev.attempts + 1,
    solved: prev.solved || correct,
    lastSolvedAt: correct ? today() : prev.lastSolvedAt,
  };
  const entry: HistoryEntry = { problemId, at: new Date().toISOString(), correct };
  return {
    ...data,
    solvedProblems: { ...data.solvedProblems, [problemId]: next },
    history: [entry, ...data.history].slice(0, HISTORY_LIMIT),
  };
}

/** 記述式問題の自己採点を記録する（設計書 6-3） */
export function recordSelfRating(
  data: ProgressData,
  problemId: string,
  rating: 'understood' | 'review',
): ProgressData {
  const prev: SolvedRecord = data.solvedProblems[problemId] ?? {
    solved: false,
    attempts: 0,
    lastSolvedAt: null,
  };
  return {
    ...data,
    solvedProblems: {
      ...data.solvedProblems,
      [problemId]: {
        ...prev,
        selfRating: rating,
        solved: rating === 'understood',
        lastSolvedAt: rating === 'understood' ? today() : prev.lastSolvedAt,
      },
    },
  };
}

export function resetProgress(): ProgressData {
  const fresh = emptyProgress();
  saveProgress(fresh);
  return fresh;
}

/** エクスポート（設計書 8）。phaseProgress は読みやすさのため書き出し時に計算して同梱する */
export function serializeProgress(
  data: ProgressData,
  phaseTotals: Record<number, number>,
  phaseOf: (problemId: string) => number | undefined,
): string {
  const phaseProgress: Record<number, { solved: number; total: number }> = {};
  for (const [phase, total] of Object.entries(phaseTotals)) {
    phaseProgress[Number(phase)] = { solved: 0, total };
  }
  for (const [id, rec] of Object.entries(data.solvedProblems)) {
    const phase = phaseOf(id);
    if (rec.solved && phase !== undefined && phaseProgress[phase]) phaseProgress[phase].solved += 1;
  }
  return JSON.stringify(
    { ...data, phaseProgress, exportedAt: new Date().toISOString() },
    null,
    2,
  );
}

export function deserializeProgress(json: string): ProgressData {
  const parsed: unknown = JSON.parse(json);
  if (!isProgressData(parsed)) throw new Error('進捗ファイルの形式が正しくありません。');
  return { version: 1, solvedProblems: parsed.solvedProblems, history: parsed.history ?? [] };
}
