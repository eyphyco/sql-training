import type { ProgressData } from '../types';

/**
 * 溜めている記録から「次に何をやるか」を出す。
 *
 * 挑戦回数・自己採点・履歴（正誤つき 100 件）はずっと保存してきたが、
 * 画面に出していなかった。復習は独学でいちばん抜けやすいところなので、
 * ここで引き出せる形にする。判定はすべて純粋な関数にして、単体で試せるようにする。
 */

export interface ProblemState {
  solved: boolean;
  /** 一度でも間違えた（正解済みでも印は残す） */
  missed: boolean;
  /** 記述式で「要復習」を付けた */
  review: boolean;
}

/** 一度でも不正解だった問題 */
export function missedProblems(progress: ProgressData): Set<string> {
  const missed = new Set<string>();
  for (const entry of progress.history) {
    if (!entry.correct) missed.add(entry.problemId);
  }
  /*
    履歴は 100 件で打ち切るので、古い不正解は残っていない。
    「挑戦したのにまだ解けていない」ものも取りこぼさないよう足しておく。
  */
  for (const [id, rec] of Object.entries(progress.solvedProblems)) {
    if (!rec.solved && rec.attempts > 0) missed.add(id);
  }
  return missed;
}

/** 記述式で「要復習」を付けた問題 */
export function reviewProblems(progress: ProgressData): Set<string> {
  const ids = new Set<string>();
  for (const [id, rec] of Object.entries(progress.solvedProblems)) {
    if (rec.selfRating === 'review') ids.add(id);
  }
  return ids;
}

export function stateOf(progress: ProgressData, id: string): ProblemState {
  const rec = progress.solvedProblems[id];
  return {
    solved: rec?.solved ?? false,
    missed: missedProblems(progress).has(id),
    review: rec?.selfRating === 'review',
  };
}

export interface PhaseAccuracy {
  /** 挑戦の回数（履歴に残っている分） */
  tried: number;
  /** そのうち正解した回数 */
  correct: number;
  /** 正答率。判断できるだけの回数が無ければ null */
  rate: number | null;
}

/** 章ごとの正答率。回数が少ないうちは決めつけない */
export const MIN_TRIES = 3;

export function phaseAccuracy(
  progress: ProgressData,
  phaseOf: (id: string) => number | undefined,
): Map<number, PhaseAccuracy> {
  const acc = new Map<number, PhaseAccuracy>();
  for (const entry of progress.history) {
    const phase = phaseOf(entry.problemId);
    if (phase === undefined) continue;
    const cur = acc.get(phase) ?? { tried: 0, correct: 0, rate: null };
    cur.tried += 1;
    if (entry.correct) cur.correct += 1;
    acc.set(phase, cur);
  }
  for (const stat of acc.values()) {
    stat.rate = stat.tried >= MIN_TRIES ? stat.correct / stat.tried : null;
  }
  return acc;
}

/**
 * いま苦手な章を、正答率の低い順に返す。
 * カリキュラムに最初から付けてある「弱点」札は固定値なので、
 * 実際の成績から出したものと区別できるようにする。
 */
export function weakPhases(accuracy: Map<number, PhaseAccuracy>, threshold = 0.7): number[] {
  return [...accuracy.entries()]
    .filter(([, s]) => s.rate !== null && s.rate < threshold)
    .sort((a, b) => (a[1].rate ?? 1) - (b[1].rate ?? 1))
    .map(([phase]) => phase);
}
