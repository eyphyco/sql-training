import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ALL_TAGS, PROBLEM_METAS } from '../data/problems';
import { LEVEL_LABEL, LEVEL_TONE, PHASES, PHASE_BY_ID } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import { Tag } from '../components/ui';
import { IconCheck, IconDash } from '../components/icons';
import type { LevelId, PhaseId, ProblemType } from '../types';

const TYPE_LABEL: Record<ProblemType, string> = {
  sql_query: 'SQL',
  multiple_choice: '選択',
  written: '記述',
};

export default function ProblemList() {
  const [params, setParams] = useSearchParams();
  const { isSolved } = useProgress();

  const phase = params.get('phase');
  const level = params.get('level');
  const tag = params.get('tag');
  const status = params.get('status');
  const hasFilter = Boolean(phase || level || tag || status);

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
    `rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
      active
        ? 'border-accent-line bg-accent-soft text-accent'
        : 'glass-edge border-line bg-surface text-muted hover:border-line-strong hover:text-fg'
    }`;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-fg">問題</h1>
        <span className="tnum text-[12px] text-subtle">
          {filtered.length} / {PROBLEM_METAS.length} 問
        </span>
      </div>

      <div className="glass space-y-2.5 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 text-[11px] text-subtle">フェーズ</span>
          {PHASES.map((p) => (
            <button
              key={p.id}
              onClick={() => setParam('phase', String(p.id))}
              className={chip(phase === String(p.id))}
            >
              <span className="tnum mr-1 font-mono text-subtle">{p.id}</span>
              {p.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 text-[11px] text-subtle">レベル</span>
          {([1, 2, 3] as LevelId[]).map((l) => (
            <button key={l} onClick={() => setParam('level', String(l))} className={chip(level === String(l))}>
              {LEVEL_LABEL[l]}
            </button>
          ))}
          <span className="ml-4 w-8 shrink-0 text-[11px] text-subtle">状態</span>
          <button onClick={() => setParam('status', 'unsolved')} className={chip(status === 'unsolved')}>
            未正解
          </button>
          <button onClick={() => setParam('status', 'solved')} className={chip(status === 'solved')}>
            正解済み
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 shrink-0 text-[11px] text-subtle">タグ</span>
          {/* タグは70種類以上あるのでチップではなくセレクトで選ぶ */}
          <select
            value={tag ?? ''}
            onChange={(e) => setParam('tag', e.target.value === '' ? null : e.target.value)}
            className="glass-edge rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] text-fg"
          >
            <option value="">すべて</option>
            {ALL_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {hasFilter && (
            <button
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="ml-auto text-[11.5px] text-muted underline underline-offset-2 hover:text-fg"
            >
              フィルタをクリア
            </button>
          )}
        </div>
      </div>

      <ul className="glass overflow-hidden rounded-lg border border-line bg-surface">
        {filtered.map((p) => {
          const solved = isSolved(p.id);
          return (
            <li key={p.id} className="border-b border-line last:border-0">
              <Link
                to={`/problems/${p.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
              >
                <span className={`shrink-0 ${solved ? 'text-success' : 'text-subtle/50'}`}>
                  {solved ? <IconCheck size={14} /> : <IconDash size={14} />}
                </span>
                <span className="hidden shrink-0 font-mono text-[10.5px] text-subtle sm:inline">
                  {p.id}
                </span>
                {/* 題名とタグをひとまとまりで伸ばす。広い画面で題名と右の情報が
                    離れて間延びするのを、タグで埋める */}
                <span className="flex min-w-0 flex-1 items-baseline gap-3">
                  <span className="min-w-0 truncate text-[13.5px] text-fg">{p.title}</span>
                  <span className="hidden min-w-0 truncate text-[11px] text-subtle xl:inline">
                    {p.tags.map((t) => `#${t}`).join('  ')}
                  </span>
                </span>
                <span className="hidden shrink-0 text-[11px] text-subtle md:inline">
                  {PHASE_BY_ID.get(p.phase as PhaseId)?.name}
                </span>
                <span className="hidden w-6 shrink-0 text-center text-[11px] text-subtle sm:inline">
                  {TYPE_LABEL[p.type]}
                </span>
                <Tag tone={LEVEL_TONE[p.level]}>{LEVEL_LABEL[p.level]}</Tag>
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-[13px] text-subtle">
            条件に一致する問題がありません。
          </li>
        )}
      </ul>
    </div>
  );
}
