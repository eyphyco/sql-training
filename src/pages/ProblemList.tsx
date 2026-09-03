import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ALL_TAGS, PROBLEM_METAS } from '../data/problems';
import { LEVEL_COLOR, LEVEL_LABEL, PHASES, PHASE_BY_ID } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import Badge from '../components/Badge';
import type { PhaseId, LevelId } from '../types';

const TYPE_LABEL: Record<string, string> = {
  sql_query: 'SQL実行',
  multiple_choice: '選択式',
  written: '記述式',
};

export default function ProblemList() {
  const [params, setParams] = useSearchParams();
  const { isSolved } = useProgress();

  const phase = params.get('phase');
  const level = params.get('level');
  const tag = params.get('tag');
  const status = params.get('status');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(
    () =>
      PROBLEM_METAS.filter((p) => {
        if (phase && p.phase !== Number(phase)) return false;
        if (level && p.level !== Number(level)) return false;
        if (tag && !p.tags.includes(tag)) return false;
        if (status === 'solved' && !isSolved(p.id)) return false;
        if (status === 'unsolved' && isSolved(p.id)) return false;
        return true;
      }),
    [phase, level, tag, status, isSolved],
  );

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition ${
      active
        ? 'border-sky-500 bg-sky-500/15 text-sky-200'
        : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'
    }`;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-white">問題一覧</h1>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-slate-500">フェーズ</span>
          {PHASES.map((p) => (
            <button key={p.id} onClick={() => setParam('phase', String(p.id))} className={chip(phase === String(p.id))}>
              {p.id}. {p.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-slate-500">レベル</span>
          {([1, 2, 3] as LevelId[]).map((l) => (
            <button key={l} onClick={() => setParam('level', String(l))} className={chip(level === String(l))}>
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-slate-500">状態</span>
          <button onClick={() => setParam('status', 'unsolved')} className={chip(status === 'unsolved')}>
            未正解
          </button>
          <button onClick={() => setParam('status', 'solved')} className={chip(status === 'solved')}>
            正解済み
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-slate-500">タグ</span>
          {/* タグは70種類以上あるのでチップではなくセレクトで選ぶ */}
          <select
            value={tag ?? ''}
            onChange={(e) => setParam('tag', e.target.value === '' ? null : e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">すべて</option>
            {ALL_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-500">{filtered.length} 問</span>
          <button
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="text-xs text-slate-400 underline hover:text-slate-200"
          >
            フィルタをクリア
          </button>
        </div>
      </div>

      <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {filtered.map((p) => {
          const solved = isSolved(p.id);
          return (
            <li key={p.id}>
              <Link to={`/problems/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/60">
                <span className={`w-5 shrink-0 text-center ${solved ? 'text-emerald-400' : 'text-slate-700'}`}>
                  {solved ? '◯' : '−'}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-slate-500">{p.id}</span>
                <span className="flex-1 truncate text-sm text-slate-100">{p.title}</span>
                <Badge className="hidden shrink-0 border-slate-700 bg-slate-800 text-slate-400 sm:inline-flex">
                  P{p.phase} {PHASE_BY_ID.get(p.phase as PhaseId)?.name}
                </Badge>
                <Badge className="hidden shrink-0 border-slate-700 bg-slate-800 text-slate-400 md:inline-flex">
                  {TYPE_LABEL[p.type]}
                </Badge>
                <Badge className={`shrink-0 ${LEVEL_COLOR[p.level]}`}>{LEVEL_LABEL[p.level]}</Badge>
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">条件に一致する問題がありません。</li>
        )}
      </ul>
    </div>
  );
}
