import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ALL_TAGS, PROBLEM_METAS, TAG_COUNTS } from '../data/problems';
import { LEVEL_FULL_LABEL, LEVEL_LABEL, LEVEL_TONE, PHASES, PHASE_BY_ID } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import { AnimatedNumber, Tag } from '../components/ui';
import { IconCheck, IconChevronDown, IconDash, IconSearch, IconX } from '../components/icons';
import { COLLAPSE, EASE_OUT, SLIDE } from '../components/motion';
import {
  applyFilter,
  countByLevel,
  countByPhase,
  countByTag,
  isEmptyFilter,
  parseFilter,
  toggleValue,
  writeFilter,
  type Filter,
  type Status,
} from './problemFilter';
import type { LevelId, PhaseId, ProblemType } from '../types';

const TYPE_LABEL: Record<ProblemType, string> = {
  sql_query: 'SQL',
  multiple_choice: '選択',
  written: '記述',
};

const LEVELS: LevelId[] = [1, 2, 3];
const STATUSES: { id: Status; label: string }[] = [
  { id: 'unsolved', label: '未正解' },
  { id: 'solved', label: '正解済み' },
];

/** 畳んでいるときに出すタグの数。多い順の上位だけ見せる */
const TAGS_COLLAPSED = 12;

/**
 * 絞り込みのチップ。押している間だけ少し縮み、選択の下地は
 * 敷かれるときに膨らんで出る（色が唐突に変わるより、押した手応えが出る）。
 */
function Chip({
  active,
  count,
  disabled = false,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  count?: number;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-testid={testId}
      data-count={count}
      layout
      transition={SLIDE}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      className={`glass-edge relative isolate flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        active
          ? 'border-accent-line text-accent'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg'
      }`}
    >
      <AnimatePresence initial={false}>
        {active && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="absolute inset-0 -z-10 rounded-full bg-accent-soft"
          />
        )}
      </AnimatePresence>
      {children}
      {count !== undefined && <span className="tnum ml-1.5 text-[10px] opacity-55">{count}</span>}
    </motion.button>
  );
}

/** 「フェーズ」「レベル」などの見出しつきの行 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] text-subtle">{label}</span>
      {children}
    </div>
  );
}

export default function ProblemList() {
  const [params, setParams] = useSearchParams();
  const { isSolved } = useProgress();
  const filter = useMemo(() => parseFilter(params), [params]);

  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState('');

  const commit = (next: Filter) => setParams(writeFilter(next), { replace: true });
  const togglePhase = (v: number) => commit({ ...filter, phases: toggleValue(filter.phases, v) });
  const toggleLevel = (v: number) => commit({ ...filter, levels: toggleValue(filter.levels, v) });
  const toggleTag = (v: string) => commit({ ...filter, tags: toggleValue(filter.tags, v) });
  const toggleStatus = (v: Status) => commit({ ...filter, status: toggleValue(filter.status, v) });

  const shown = useMemo(() => applyFilter(PROBLEM_METAS, filter, isSolved), [filter, isSolved]);

  /*
    チップに出す件数は、その種類だけ外して数える。
    「Lv1 を選んでいる状態で Lv3 に出ている数」は、Lv3 も足したら
    何件増えるかを表す。自分の選択で 0 が並ぶと選び直せない。
  */
  const phaseCounts = useMemo(
    () => countByPhase(applyFilter(PROBLEM_METAS, filter, isSolved, 'phases')),
    [filter, isSolved],
  );
  const levelCounts = useMemo(
    () => countByLevel(applyFilter(PROBLEM_METAS, filter, isSolved, 'levels')),
    [filter, isSolved],
  );
  const tagCounts = useMemo(
    () => countByTag(applyFilter(PROBLEM_METAS, filter, isSolved, 'tags')),
    [filter, isSolved],
  );
  const statusCounts = useMemo(() => {
    const pool = applyFilter(PROBLEM_METAS, filter, isSolved, 'status');
    const solved = pool.filter((p) => isSolved(p.id)).length;
    return { solved, unsolved: pool.length - solved };
  }, [filter, isSolved]);

  /*
    畳んでいるときは上位だけ。ただし選んだタグは常に見えるようにする
    （見えない所で絞り込みが効いていると、件数の理由が分からなくなる）。
  */
  const tagList = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (tagsOpen) {
      return q === '' ? ALL_TAGS : ALL_TAGS.filter((t) => t.toLowerCase().includes(q));
    }
    const head = ALL_TAGS.filter((t) => !filter.tags.includes(t)).slice(0, TAGS_COLLAPSED);
    return [...filter.tags, ...head].slice(0, Math.max(TAGS_COLLAPSED, filter.tags.length));
  }, [filter.tags, tagQuery, tagsOpen]);

  /** 「いま何で絞っているか」を 1 行にまとめる。× で 1 つずつ外せる */
  const active = [
    ...filter.phases.map((id) => ({
      key: `phase-${id}`,
      label: PHASE_BY_ID.get(id as PhaseId)?.name ?? `フェーズ ${id}`,
      remove: () => togglePhase(id),
    })),
    ...filter.levels.map((l) => ({
      key: `level-${l}`,
      label: LEVEL_FULL_LABEL[l as LevelId],
      remove: () => toggleLevel(l),
    })),
    ...filter.status.map((s) => ({
      key: `status-${s}`,
      label: s === 'solved' ? '正解済み' : '未正解',
      remove: () => toggleStatus(s),
    })),
    ...filter.tags.map((t) => ({
      key: `tag-${t}`,
      label: `#${t}`,
      remove: () => toggleTag(t),
    })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-fg">問題</h1>
        <span className="tnum text-[12px] text-subtle">
          <AnimatedNumber value={shown.length} className="text-fg" /> / {PROBLEM_METAS.length} 問
        </span>
      </div>

      {/*
        同じ種類の中は OR、種類どうしは AND。Lv1 と Lv3 のように
        飛び飛びの難易度をまとめて見たい場面があるので、単一選択にしない。
      */}
      <div
        data-testid="filter-panel"
        className="glass space-y-2.5 rounded-lg border border-line bg-surface p-4"
      >
        <Row label="フェーズ">
          {PHASES.map((p) => (
            <Chip
              key={p.id}
              testId="phase-chip"
              active={filter.phases.includes(p.id)}
              count={phaseCounts.get(p.id) ?? 0}
              disabled={!filter.phases.includes(p.id) && !phaseCounts.get(p.id)}
              onClick={() => togglePhase(p.id)}
            >
              <span className="tnum mr-1 font-mono text-subtle">{p.id}</span>
              {p.name}
            </Chip>
          ))}
        </Row>

        <Row label="レベル">
          {LEVELS.map((l) => (
            <Chip
              key={l}
              testId="level-chip"
              active={filter.levels.includes(l)}
              count={levelCounts.get(l) ?? 0}
              disabled={!filter.levels.includes(l) && !levelCounts.get(l)}
              onClick={() => toggleLevel(l)}
            >
              {LEVEL_LABEL[l]}
            </Chip>
          ))}
          <span className="mx-2 h-4 w-px shrink-0 bg-line" />
          <span className="shrink-0 text-[11px] text-subtle">状態</span>
          {STATUSES.map((s) => (
            <Chip
              key={s.id}
              testId="status-chip"
              active={filter.status.includes(s.id)}
              count={statusCounts[s.id]}
              onClick={() => toggleStatus(s.id)}
            >
              {s.label}
            </Chip>
          ))}
        </Row>

        <Row label="タグ">
          {/*
            何順か分かるように、並びの規則と件数を必ず出す。
            開いているときは 70 件以上並ぶので、代わりに検索を置く。
          */}
          <motion.span layout className="mr-1 shrink-0 text-[10.5px] text-subtle">
            問題数の多い順
          </motion.span>
          <AnimatePresence initial={false} mode="popLayout">
            {tagsOpen && (
              <motion.label
                key="tag-search"
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={SLIDE}
                className="flex w-40 shrink-0 items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1"
              >
                <IconSearch size={12} className="shrink-0 text-subtle" />
                <input
                  type="search"
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  placeholder="タグを探す"
                  aria-label="タグを探す"
                  className="w-full bg-transparent text-[11.5px] text-fg placeholder:text-subtle focus:outline-none"
                />
              </motion.label>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false} mode="popLayout">
            {tagList.map((t) => (
              <Chip
                key={t}
                testId="tag-chip"
                active={filter.tags.includes(t)}
                count={tagCounts.get(t) ?? 0}
                disabled={!filter.tags.includes(t) && !tagCounts.get(t)}
                onClick={() => toggleTag(t)}
              >
                #{t}
                <span className="sr-only">（全 {TAG_COUNTS.get(t) ?? 0} 問）</span>
              </Chip>
            ))}
          </AnimatePresence>
          <motion.button
            type="button"
            layout
            transition={SLIDE}
            onClick={() => {
              setTagsOpen((v) => !v);
              setTagQuery('');
            }}
            aria-expanded={tagsOpen}
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-muted hover:text-fg"
          >
            {tagsOpen ? '畳む' : `ほか ${Math.max(0, ALL_TAGS.length - tagList.length)} 件`}
            <motion.span
              animate={{ rotate: tagsOpen ? 180 : 0 }}
              transition={SLIDE}
              className="flex"
            >
              <IconChevronDown size={12} />
            </motion.span>
          </motion.button>
        </Row>

        <AnimatePresence initial={false}>
          {!isEmptyFilter(filter) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={COLLAPSE}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                <span className="w-14 shrink-0 text-[11px] text-subtle">絞り込み中</span>
                <AnimatePresence initial={false} mode="popLayout">
                  {active.map((a) => (
                    <motion.button
                      key={a.key}
                      type="button"
                      data-testid="active-chip"
                      layout
                      onClick={a.remove}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={SLIDE}
                      className="flex shrink-0 items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
                    >
                      {a.label}
                      <IconX size={10} />
                      <span className="sr-only">を外す</span>
                    </motion.button>
                  ))}
                </AnimatePresence>
                <button
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                  className="ml-auto shrink-0 text-[11.5px] text-muted underline underline-offset-2 hover:text-fg"
                >
                  すべて解除
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/*
        絞り込みで行が消えるとき、残った行が滑って詰まる。
        消える行は席を先に空け（popLayout）、残る行の移動だけを見せる。
      */}
      <ul className="glass overflow-hidden rounded-lg border border-line bg-surface">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((p) => {
            const solved = isSolved(p.id);
            return (
              <motion.li
                key={p.id}
                layout
                transition={SLIDE}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="border-b border-line last:border-0"
              >
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
              </motion.li>
            );
          })}
        </AnimatePresence>
        {shown.length === 0 && (
          <motion.li
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="px-4 py-8 text-center text-[13px] text-subtle"
          >
            条件に一致する問題がありません。
          </motion.li>
        )}
      </ul>
    </div>
  );
}
