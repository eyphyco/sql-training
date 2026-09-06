import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProgressData } from '../types';
import {
  deserializeProgress,
  loadProgress,
  STORAGE_KEY,
  recordAttempt,
  recordSelfRating,
  resetProgress,
  saveProgress,
  serializeProgress,
} from './progress';
import { ProgressContext } from './progressContext';
import { missedProblems, phaseAccuracy, weakPhases } from './review';
import { PHASE_TOTALS, META_BY_ID } from '../data/problems';

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ProgressData>(() => loadProgress());

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  /*
    別のタブで解いた分を取り込む。storage イベントは「他のタブでの変化」
    だけに飛ぶので、書いた自分には返ってこない（保存と往復しない）。
    見ていない間に進めた進捗が、こちらの保存で消えるのを防ぐ。
  */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      setProgress(loadProgress());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const attempt = useCallback((problemId: string, correct: boolean) => {
    setProgress((prev) => recordAttempt(prev, problemId, correct));
  }, []);

  const rate = useCallback((problemId: string, rating: 'understood' | 'review') => {
    setProgress((prev) => recordSelfRating(prev, problemId, rating));
  }, []);

  const reset = useCallback(() => setProgress(resetProgress()), []);

  const exportJson = useCallback(
    () => serializeProgress(progress, PHASE_TOTALS, (id) => META_BY_ID.get(id)?.phase),
    [progress],
  );

  const importJson = useCallback((json: string) => {
    setProgress(deserializeProgress(json));
  }, []);

  const isSolved = useCallback(
    (problemId: string) => progress.solvedProblems[problemId]?.solved ?? false,
    [progress],
  );

  // 履歴と自己採点から出す。毎回数え直さないよう記憶しておく
  const missed = useMemo(() => missedProblems(progress), [progress]);

  const stateOf = useCallback(
    (problemId: string) => ({
      solved: progress.solvedProblems[problemId]?.solved ?? false,
      missed: missed.has(problemId),
      review: progress.solvedProblems[problemId]?.selfRating === 'review',
    }),
    [progress, missed],
  );

  const attemptsOf = useCallback(
    (problemId: string) => progress.solvedProblems[problemId]?.attempts ?? 0,
    [progress],
  );

  const accuracy = useMemo(
    () => phaseAccuracy(progress, (id) => META_BY_ID.get(id)?.phase),
    [progress],
  );

  const weak = useMemo(() => weakPhases(accuracy), [accuracy]);

  const phaseStats = useMemo(() => {
    const stats: Record<number, { solved: number; total: number }> = {};
    for (const [phase, total] of Object.entries(PHASE_TOTALS)) {
      stats[Number(phase)] = { solved: 0, total };
    }
    for (const [id, rec] of Object.entries(progress.solvedProblems)) {
      const phase = META_BY_ID.get(id)?.phase;
      if (rec.solved && phase !== undefined && stats[phase]) stats[phase].solved += 1;
    }
    return stats;
  }, [progress]);

  const value = useMemo(
    () => ({
      progress,
      attempt,
      rate,
      reset,
      exportJson,
      importJson,
      isSolved,
      stateOf,
      attemptsOf,
      phaseStats,
      accuracy,
      weak,
    }),
    [
      progress,
      attempt,
      rate,
      reset,
      exportJson,
      importJson,
      isSolved,
      stateOf,
      attemptsOf,
      phaseStats,
      accuracy,
      weak,
    ],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}
