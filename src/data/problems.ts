import type { PhaseId, Problem, ProblemMeta } from '../types';

/**
 * 問題データはフェーズ単位の JSON 配列で管理する（phase1.json ... phase7.json）。
 * 1問1ファイルにするとファイル数が膨らみ、編集・レビューもしづらいため配列方式を採用した。
 * 総量が数百問規模になったら、ここを import.meta.glob の遅延ロードに切り替える。
 */
const modules = import.meta.glob<{ default: Problem[] }>('./problems/*.json', { eager: true });

function collect(): Problem[] {
  const all: Problem[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(modules).sort()) {
    for (const problem of modules[key].default) {
      if (seen.has(problem.id)) {
        console.warn(`問題 ID が重複しています: ${problem.id} (${key})`);
        continue;
      }
      seen.add(problem.id);
      all.push(problem);
    }
  }
  return all.sort((a, b) => a.id.localeCompare(b.id));
}

export const ALL_PROBLEMS: Problem[] = collect();

export const PROBLEM_BY_ID = new Map<string, Problem>(ALL_PROBLEMS.map((p) => [p.id, p]));

export const PROBLEM_METAS: ProblemMeta[] = ALL_PROBLEMS.map((p) => ({
  id: p.id,
  type: p.type,
  phase: p.phase,
  level: p.level,
  title: p.title,
  tags: p.tags,
}));

export const ALL_TAGS: string[] = [...new Set(ALL_PROBLEMS.flatMap((p) => p.tags))].sort();

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

export function getProblem(id: string): Problem | undefined {
  return PROBLEM_BY_ID.get(id);
}

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
