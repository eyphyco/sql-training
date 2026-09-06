import { createContext, useContext } from 'react';
import type { ProgressData } from '../types';
import type { PhaseAccuracy, ProblemState } from './review';

export interface ProgressContextValue {
  progress: ProgressData;
  attempt: (problemId: string, correct: boolean) => void;
  rate: (problemId: string, rating: 'understood' | 'review') => void;
  reset: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
  isSolved: (problemId: string) => boolean;
  /** 解けた・間違えた・要復習をまとめて返す（一覧の絞り込みで使う） */
  stateOf: (problemId: string) => ProblemState;
  /** 何回挑戦したか */
  attemptsOf: (problemId: string) => number;
  phaseStats: Record<number, { solved: number; total: number }>;
  /** 章ごとの正答率（履歴から出す） */
  accuracy: Map<number, PhaseAccuracy>;
  /** 正答率の低い章。実績から出したもので、カリキュラムの固定札とは別 */
  weak: number[];
}

export const ProgressContext = createContext<ProgressContextValue | null>(null);

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress は ProgressProvider の内側で使ってください');
  return ctx;
}
