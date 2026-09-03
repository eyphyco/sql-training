import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProgressData } from '../types';
import {
  deserializeProgress,
  loadProgress,
  recordAttempt,
  recordSelfRating,
  resetProgress,
  saveProgress,
  serializeProgress,
} from './progress';
import { ProgressContext } from './progressContext';
import { PHASE_TOTALS, PROBLEM_BY_ID } from '../data/problems';

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ProgressData>(() => loadProgress());

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const attempt = useCallback((problemId: string, correct: boolean) => {
    setProgress((prev) => recordAttempt(prev, problemId, correct));
  }, []);

  const rate = useCallback((problemId: string, rating: 'understood' | 'review') => {
    setProgress((prev) => recordSelfRating(prev, problemId, rating));
  }, []);

  const reset = useCallback(() => setProgress(resetProgress()), []);

  const exportJson = useCallback(
    () => serializeProgress(progress, PHASE_TOTALS, (id) => PROBLEM_BY_ID.get(id)?.phase),
    [progress],
  );

  const importJson = useCallback((json: string) => {
    setProgress(deserializeProgress(json));
  }, []);

  const isSolved = useCallback(
    (problemId: string) => progress.solvedProblems[problemId]?.solved ?? false,
    [progress],
  );

  const phaseStats = useMemo(() => {
    const stats: Record<number, { solved: number; total: number }> = {};
    for (const [phase, total] of Object.entries(PHASE_TOTALS)) {
      stats[Number(phase)] = { solved: 0, total };
    }
    for (const [id, rec] of Object.entries(progress.solvedProblems)) {
      const phase = PROBLEM_BY_ID.get(id)?.phase;
      if (rec.solved && phase !== undefined && stats[phase]) stats[phase].solved += 1;
    }
    return stats;
  }, [progress]);

  const value = useMemo(
    () => ({ progress, attempt, rate, reset, exportJson, importJson, isSolved, phaseStats }),
    [progress, attempt, rate, reset, exportJson, importJson, isSolved, phaseStats],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}
