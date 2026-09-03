import { createContext, useContext } from 'react';
import type { ProgressData } from '../types';

export interface ProgressContextValue {
  progress: ProgressData;
  attempt: (problemId: string, correct: boolean) => void;
  rate: (problemId: string, rating: 'understood' | 'review') => void;
  reset: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
  isSolved: (problemId: string) => boolean;
  phaseStats: Record<number, { solved: number; total: number }>;
}

export const ProgressContext = createContext<ProgressContextValue | null>(null);

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress は ProgressProvider の内側で使ってください');
  return ctx;
}
