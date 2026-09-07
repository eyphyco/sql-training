import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { LESSONS } from '../data/lessons';
import { useProgress } from '../storage/progressContext';
import { Card } from './ui';
import { IconBook } from './icons';
import { COLLAPSE, RISE, SLIDE, STAGGER } from './motion';
import { NAV_ROW_CLASS, NavChapterRow, NavHeader } from './NavPanel';
import { useActiveSection, useSmoothScroll } from './useReadingNav';
import type { LessonSection, PhaseId } from '../types';

/**
 * 教材ぜんぶの目次。7 章を並べ、いま読んでいる章だけ節まで開く。
 *
 * 開いているのが 1 つだけなので「いまどこにいるか」が形で分かる。
 * 他の章は押すとその章へ移る（章のあいだの移動が、前後送りだけでなく
 * ここからもできる）。今いる章の見出しを押すと先頭へ戻る。
 */
export default function ChapterNav({
  sections,
  phase,
}: {
  sections: LessonSection[];
  phase: PhaseId;
}) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(ids);
  // 節の罫を「読んだところまで」塗る。目次そのものが読み進みの目盛りになる
  const readRatio = (ids.indexOf(active) + 1) / Math.max(1, ids.length);
  const { phaseStats } = useProgress();
  const { scrollTo, goTo } = useSmoothScroll();

  const totals = LESSONS.map((l) => phaseStats[l.phase] ?? { solved: 0, total: 0 });
  const total = totals.reduce((n, s) => n + s.total, 0);
  const solved = totals.reduce((n, s) => n + s.solved, 0);

  return (
    <Card className="overflow-hidden" testId="chapter-nav">
      <NavHeader label="教材の目次" solved={solved} total={total} />

      <nav className="max-h-[calc(100vh-11rem)] overflow-y-auto p-1.5">
        {LESSONS.map((lesson, i) => {
          const current = lesson.phase === phase;
          const stat = totals[i];
          const row = (
            <NavChapterRow
              number={lesson.phase}
              title={lesson.title}
              solved={stat.solved}
              total={stat.total}
              open={current}
              current={current}
            >
              {/* 現在の章の下地は 1 つを使い回して滑らせる（章を移ると滑って移動する） */}
              {current && (
                <motion.span
                  layoutId="chapter-nav-chapter"
                  transition={SLIDE}
                  className="glass-edge absolute inset-0 rounded-md bg-accent-soft ring-1 ring-accent-line"
                />
              )}
            </NavChapterRow>
          );
          return (
            <div key={lesson.phase}>
              {current ? (
                // 今いる章。押すと章の先頭へ戻る
                <motion.button
                  type="button"
                  onClick={() => scrollTo(0)}
                  data-testid="chapter-row-current"
                  aria-current="page"
                  whileTap={{ scale: 0.985 }}
                  className={NAV_ROW_CLASS}
                >
                  {row}
                </motion.button>
              ) : (
                <motion.div whileHover={{ x: 2 }} transition={SLIDE}>
                  <Link
                    to={`/learn/${lesson.phase}`}
                    data-testid="chapter-row"
                    className={NAV_ROW_CLASS}
                  >
                    {row}
                  </Link>
                </motion.div>
              )}

              {/* 開くのは今いる章だけ。節は少し遅れて順に出る */}
              <AnimatePresence initial={false}>
                {current && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={COLLAPSE}
                    className="overflow-hidden"
                  >
                    <motion.ol
                      variants={STAGGER}
                      initial="hidden"
                      animate="shown"
                      className="relative mt-0.5 mb-1 ml-[15px] border-l border-line pl-1.5"
                    >
                      {/* 読んだところまで罫を塗る。バネで滑らかに伸び縮みする */}
                      <motion.span
                        aria-hidden
                        data-testid="chapter-nav-rail"
                        className="absolute top-0 -left-px w-px origin-top bg-accent"
                        style={{ height: '100%' }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: readRatio }}
                        transition={SLIDE}
                      />
                      {sections.map((s, n) => {
                        const on = s.id === active;
                        return (
                          <motion.li key={s.id} variants={RISE}>
                            <button
                              type="button"
                              onClick={() => goTo(s.id)}
                              data-testid={on ? 'chapter-nav-current' : 'section-link'}
                              aria-current={on ? 'true' : undefined}
                              className="relative flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left"
                            >
                              {/* 読んでいる節も 1 つの帯を使い回して滑らせる */}
                              {on && (
                                <motion.span
                                  layoutId="chapter-nav-section"
                                  transition={SLIDE}
                                  className="absolute inset-0 rounded-md bg-accent-soft"
                                />
                              )}
                              <span className="tnum relative font-mono text-micro text-subtle">
                                {n + 1}.
                              </span>
                              <span
                                className={`relative text-small leading-snug ${
                                  on ? 'font-medium text-accent' : 'text-muted hover:text-fg'
                                }`}
                              >
                                {s.title}
                              </span>
                            </button>
                          </motion.li>
                        );
                      })}
                      <motion.li variants={RISE}>
                        <Link
                          to={`/problems?phase=${lesson.phase}`}
                          className="flex items-center gap-1.5 px-1.5 py-1 text-tiny text-subtle hover:text-accent"
                        >
                          <IconBook size={11} />
                          この章の問題を解く
                        </Link>
                      </motion.li>
                    </motion.ol>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>
    </Card>
  );
}
