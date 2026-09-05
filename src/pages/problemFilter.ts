import type { LevelId, PhaseId, ProblemMeta } from '../types';

/**
 * 問題一覧の絞り込み。URL のクエリだけを持ち主にして、状態は持たない。
 *
 * 決め事:
 *   - 同じ種類の中は OR（Lv1 と Lv3 を選べば「Lv1 または Lv3」）
 *   - 種類どうしは AND（フェーズ 2 かつ Lv3）
 *   - 値はカンマ区切りで 1 つのキーに入れる（?level=1,3）。
 *     1 つだけの ?phase=2 や ?tag=NULL は今までどおり読めるので、
 *     問題ページから貼っているリンクはそのまま動く。
 */

export type Facet = 'phases' | 'levels' | 'tags' | 'status';
export type Status = 'solved' | 'unsolved';

export interface Filter {
  phases: number[];
  levels: number[];
  tags: string[];
  status: Status[];
}

/** URL のキー名。表に出る名前は単数形のまま残す */
export const PARAM: Record<Facet, string> = {
  phases: 'phase',
  levels: 'level',
  tags: 'tag',
  status: 'status',
};

export const EMPTY_FILTER: Filter = { phases: [], levels: [], tags: [], status: [] };

/** "1,3" → ["1", "3"]。空白と重複と空文字は落とす */
export function parseList(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (v !== '' && !out.includes(v)) out.push(v);
  }
  return out;
}

function parseNumbers(raw: string | null, allowed: number[]): number[] {
  return parseList(raw)
    .map(Number)
    .filter((n) => allowed.includes(n))
    .sort((a, b) => a - b);
}

export function parseFilter(params: URLSearchParams): Filter {
  return {
    phases: parseNumbers(params.get(PARAM.phases), [1, 2, 3, 4, 5, 6, 7]),
    levels: parseNumbers(params.get(PARAM.levels), [1, 2, 3]),
    tags: parseList(params.get(PARAM.tags)),
    status: parseList(params.get(PARAM.status)).filter(
      (s): s is Status => s === 'solved' || s === 'unsolved',
    ),
  };
}

/** 空の種類はキーごと落とす。URL に ?level= だけ残さない */
export function writeFilter(filter: Filter): URLSearchParams {
  const params = new URLSearchParams();
  for (const facet of Object.keys(PARAM) as Facet[]) {
    const values = filter[facet];
    if (values.length > 0) params.set(PARAM[facet], values.join(','));
  }
  return params;
}

/** 入っていれば外し、無ければ足す */
export function toggleValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function isEmptyFilter(filter: Filter): boolean {
  return (Object.keys(PARAM) as Facet[]).every((f) => filter[f].length === 0);
}

export function countSelected(filter: Filter): number {
  return (Object.keys(PARAM) as Facet[]).reduce((n, f) => n + filter[f].length, 0);
}

/**
 * `except` に渡した種類だけ無視して絞り込む。
 * チップに出す件数は「その種類を今の条件に足したら何件になるか」なので、
 * 自分自身の選択は数から外す（よくある絞り込み UI と同じ数え方）。
 */
export function applyFilter(
  metas: readonly ProblemMeta[],
  filter: Filter,
  isSolved: (id: string) => boolean,
  except?: Facet,
): ProblemMeta[] {
  const on = (facet: Facet) => facet !== except && filter[facet].length > 0;
  return metas.filter((p) => {
    if (on('phases') && !filter.phases.includes(p.phase)) return false;
    if (on('levels') && !filter.levels.includes(p.level)) return false;
    if (on('tags') && !filter.tags.some((t) => p.tags.includes(t))) return false;
    if (on('status')) {
      const solved = isSolved(p.id);
      if (!filter.status.some((s) => (s === 'solved') === solved)) return false;
    }
    return true;
  });
}

export function countByPhase(metas: readonly ProblemMeta[]): Map<PhaseId, number> {
  const m = new Map<PhaseId, number>();
  for (const p of metas) m.set(p.phase, (m.get(p.phase) ?? 0) + 1);
  return m;
}

export function countByLevel(metas: readonly ProblemMeta[]): Map<LevelId, number> {
  const m = new Map<LevelId, number>();
  for (const p of metas) m.set(p.level, (m.get(p.level) ?? 0) + 1);
  return m;
}

export function countByTag(metas: readonly ProblemMeta[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of metas) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
