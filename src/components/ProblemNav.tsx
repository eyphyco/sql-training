import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { PHASES } from '../data/phases';
import { META_BY_ID, problemsOfPhase } from '../data/problems';
import { useProgress } from '../storage/progressContext';
import { Card } from './ui';
import { IconBook, IconCheck, IconDash } from './icons';
import { COLLAPSE, SLIDE } from './motion';
import { NAV_ROW_CLASS, NavChapterRow, NavHeader } from './NavPanel';
import type { PhaseId } from '../types';

/**
 * 問題ページの脇に出す進捗つき目次。
 * フェーズ（章）を開くとその中の問題が並び、クリックで移動できる。
 *
 * 開いているフェーズは「いま解いている問題のフェーズ」に追従させる。
 * 追従は effect ではなく描画中の状態調整で行う（React が推奨する形。
 * effect で setState すると 1 フレーム余計に描画される）。
 */
export default function ProblemNav({ currentId }: { currentId: string }) {
  const { isSolved, phaseStats } = useProgress();
  const current = META_BY_ID.get(currentId);
  const currentPhase = current?.phase ?? null;

  const [openPhase, setOpenPhase] = useState<PhaseId | null>(currentPhase);
  const [seenPhase, setSeenPhase] = useState<PhaseId | null>(currentPhase);
  if (currentPhase !== seenPhase) {
    setSeenPhase(currentPhase);
    setOpenPhase(currentPhase);
  }

  // 深い位置の問題を開いたとき、目次の中でも見えるところまで送る
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentId, openPhase]);

  const totals = PHASES.map((p) => phaseStats[p.id] ?? { solved: 0, total: 0 });
  const total = totals.reduce((n, s) => n + s.total, 0);
  const solved = totals.reduce((n, s) => n + s.solved, 0);

  return (
    <Card className="overflow-hidden" testId="problem-nav">
      <NavHeader label="進捗" solved={solved} total={total} />

      <nav className="max-h-[calc(100vh-13rem)] overflow-y-auto p-1.5">
        {PHASES.map((phase, i) => {
          const open = openPhase === phase.id;
          const stat = totals[i];
          return (
            <div key={phase.id}>
              <button
                onClick={() => setOpenPhase(open ? null : phase.id)}
                aria-expanded={open}
                className={`${NAV_ROW_CLASS} transition-colors hover:bg-raised`}
              >
                <NavChapterRow
                  number={phase.id}
                  title={phase.name}
                  solved={stat.solved}
                  total={stat.total}
                  open={open}
                  current={phase.id === currentPhase}
                />
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={COLLAPSE}
                    className="overflow-hidden"
                  >
                    <ul className="mb-1 ml-[13px] border-l border-line pl-1.5">
                      {problemsOfPhase(phase.id).map((p) => {
                        const active = p.id === currentId;
                        return (
                          <li key={p.id}>
                            <Link
                              to={`/problems/${p.id}`}
                              title={p.title}
                              ref={active ? activeRef : undefined}
                              data-testid={active ? 'nav-current' : undefined}
                              aria-current={active ? 'page' : undefined}
                              className="relative flex items-center gap-1.5 rounded-md px-1.5 py-1"
                            >
                              {/* 現在地は 1 つの帯を使い回して滑らせる */}
                              {active && (
                                <motion.span
                                  layoutId="problem-nav-current"
                                  transition={SLIDE}
                                  className="absolute inset-0 rounded-md bg-accent-soft ring-1 ring-accent-line"
                                />
                              )}
                              <span
                                className={`relative shrink-0 ${
                                  isSolved(p.id) ? 'text-success' : 'text-subtle/50'
                                }`}
                              >
                                {isSolved(p.id) ? <IconCheck size={11} /> : <IconDash size={11} />}
                              </span>
                              <span
                                className={`relative min-w-0 truncate text-tiny ${
                                  active ? 'font-medium text-accent' : 'text-muted hover:text-fg'
                                }`}
                              >
                                {p.title}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    <Link
                      to={`/learn/${phase.id}`}
                      className="mb-1.5 ml-[13px] flex items-center gap-1.5 pl-1.5 text-tiny text-subtle hover:text-accent"
                    >
                      <IconBook size={11} />
                      この章の教材を読む
                    </Link>
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
