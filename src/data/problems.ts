import { PROBLEM_METAS as METAS } from 'virtual:problem-meta';
import type { PhaseId, Problem, ProblemMeta } from '../types';

/**
 * 問題データはフェーズ単位の JSON 配列（problems/phase1.json … phase7.json）。
 * 1問1ファイルにするとファイル数が膨らみ、編集もしづらいため配列方式にしてある。
 *
 * 一覧に要る分（id・種別・フェーズ・レベル・題名・タグ）は仮想モジュールから
 * すぐ読める形で持ち、本文・スキーマ・シード・解説は問題を開いたときに取りに行く。
 * 全部を最初に読むと、ホームを開いただけで 52 問ぶん（gzip 66KB）掛かる。
 */
export const PROBLEM_METAS: ProblemMeta[] = METAS;

export const META_BY_ID = new Map<string, ProblemMeta>(PROBLEM_METAS.map((p) => [p.id, p]));

/** タグごとの問題数 */
export const TAG_COUNTS: Map<string, number> = PROBLEM_METAS.reduce((m, p) => {
  for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}, new Map<string, number>());

/*
  タグは 70 種類以上ある。既定の sort() だと符号位置順（数字 → 英大 → 英小 →
  カタカナ → 漢字）に並び、利用者からは何順か読み取れない。
  「問題数の多い順、同数なら五十音順」にして、画面にも件数を出す。
*/
export const ALL_TAGS: string[] = [...TAG_COUNTS.keys()].sort(
  (a, b) => (TAG_COUNTS.get(b) ?? 0) - (TAG_COUNTS.get(a) ?? 0) || a.localeCompare(b, 'ja'),
);

export function problemsOfPhase(phase: PhaseId): ProblemMeta[] {
  return PROBLEM_METAS.filter((p) => p.phase === phase);
}

export const PHASE_TOTALS: Record<number, number> = PROBLEM_METAS.reduce<Record<number, number>>(
  (acc, p) => {
    acc[p.phase] = (acc[p.phase] ?? 0) + 1;
    return acc;
  },
  {},
);

/* ここから下は本文つきの問題。必要になったときだけ読む */

const files = import.meta.glob<{ default: Problem[] }>('./problems/*.json');
const loaded = new Map<string, Problem>();
const inFlight = new Map<string, Promise<void>>();

function fileOf(phase: number): string | undefined {
  return Object.keys(files).find((k) => k.endsWith(`/phase${phase}.json`));
}

/** そのフェーズの JSON を一度だけ読み、id で引ける形にする */
async function ensurePhase(phase: number): Promise<void> {
  const key = fileOf(phase);
  if (!key) return;
  const running = inFlight.get(key);
  if (running) return running;
  const task = files[key]().then((mod) => {
    for (const problem of mod.default) loaded.set(problem.id, problem);
  });
  inFlight.set(key, task);
  return task;
}

/** 本文つきの問題を 1 問返す。読み込み済みなら再取得しない */
export async function loadProblem(id: string): Promise<Problem | undefined> {
  const cached = loaded.get(id);
  if (cached) return cached;
  const meta = META_BY_ID.get(id);
  if (!meta) return undefined;
  await ensurePhase(meta.phase);
  return loaded.get(id);
}

/** 全問の本文（テストとデータ検証で使う。画面からは呼ばない） */
export async function loadAllProblems(): Promise<Problem[]> {
  await Promise.all(PHASES_WITH_FILES.map(ensurePhase));
  return PROBLEM_METAS.map((m) => loaded.get(m.id)).filter((p): p is Problem => p !== undefined);
}

const PHASES_WITH_FILES = [...new Set(PROBLEM_METAS.map((p) => p.phase))];

/** 一覧上の並び順で「次の問題」を返す */
export function nextProblemId(id: string): string | undefined {
  const idx = PROBLEM_METAS.findIndex((p) => p.id === id);
  if (idx === -1 || idx + 1 >= PROBLEM_METAS.length) return undefined;
  return PROBLEM_METAS[idx + 1].id;
}

export function prevProblemId(id: string): string | undefined {
  const idx = PROBLEM_METAS.findIndex((p) => p.id === id);
  if (idx <= 0) return undefined;
  return PROBLEM_METAS[idx - 1].id;
}
