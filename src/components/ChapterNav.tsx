import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { LESSONS } from '../data/lessons';
import { useProgress } from '../storage/progressContext';
import { Card } from './ui';
import { IconBook } from './icons';
import { COLLAPSE, EASE_OUT, RISE, SLIDE, STAGGER } from './motion';
import { NAV_ROW_CLASS, NavChapterRow, NavHeader } from './NavPanel';
import { HEADER_OFFSET, pickActiveSection, scrollDuration } from './reading';
import type { LessonSection, PhaseId } from '../types';

/** いま画面で読んでいる節を返す。判定そのものは reading.ts に置いてある */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      const tops = ids.map(
        (id) => document.getElementById(id)?.getBoundingClientRect().top ?? null,
      );
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      const current = pickActiveSection(ids, tops, atBottom);
      setActive((prev) => (prev === current ? prev : current));
    };
    // スクロールは 1 フレームに 1 回だけ読む
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);
  return active;
}

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
  const reduced = useReducedMotion();
  const running = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => running.current?.stop(), []);

  const totals = LESSONS.map((l) => phaseStats[l.phase] ?? { solved: 0, total: 0 });
  const total = totals.reduce((n, s) => n + s.total, 0);
  const solved = totals.reduce((n, s) => n + s.solved, 0);

  /*
    HashRouter なので href="#節id" は使えない。URL のハッシュはルート
    そのもの（#/learn/1）で、書き換えると別ページへ飛んでしまう。
    そのため位置合わせは JS で行う。
  */
  const scrollTo = (to: number, land?: () => void) => {
    running.current?.stop();

    if (reduced) {
      window.scrollTo(0, to);
      land?.();
      return;
    }

    const from = window.scrollY;
    const duration = scrollDuration(from, to);

    // 途中でユーザーが動かしたら、こちらは引き下がる。
    // stop() だけでは間に合わないことがあるので、書き込み側でも見る
    let cancelled = false;
    const detach = () => {
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('keydown', cancel);
    };
    function cancel() {
      cancelled = true;
      running.current?.stop();
      running.current = null;
      detach();
    }
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);

    running.current = animate(from, to, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        if (!cancelled) window.scrollTo(0, v);
      },
      onComplete: () => {
        running.current = null;
        detach();
        if (!cancelled) land?.();
      },
    });
  };

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    scrollTo(Math.max(0, el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET), () => {
      // 着いたあと、キーボード操作の続きがその節から始まるようにする
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    });
  };

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
