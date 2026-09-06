/** vite.config.ts の problemMeta プラグインが作る仮想モジュール */
declare module 'virtual:problem-meta' {
  import type { ProblemMeta } from '../types';
  export const PROBLEM_METAS: ProblemMeta[];
}
