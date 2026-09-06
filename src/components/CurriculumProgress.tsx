import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { PHASES } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import { EASE_OUT } from './motion';
import type { PhaseId } from '../types';

/**
 * 0 から目的の数まで数え上げる。視差効果を減らす設定では最初から結果を出す。
 * MotionValue をそのまま描画するので、フレームごとの再描画は起きない。
 */
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const count = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(count, (v) => Math.round(v));

  useEffect(() => {
    if (reduced) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration: 0.7, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, reduced, count]);

  return <motion.span>{rounded}</motion.span>;
}

/**
 * カリキュラム全体の進捗。
 * 1 本のバーをフェーズごとに区切り、区切りの幅は問題数に比例させている。
 * 「全体のどこまで来たか」と「どのフェーズが手つかずか」を 1 目で見せるため。
 */
export default function CurriculumProgress({ activePhase }: { activePhase?: PhaseId }) {
  const { phaseStats } = useProgress();

  const totals = PHASES.map((p) => phaseStats[p.id] ?? { solved: 0, total: 0 });
  const total = totals.reduce((n, s) => n + s.total, 0);
  const solved = totals.reduce((n, s) => n + s.solved, 0);
  const pct = total === 0 ? 0 : Math.round((solved / total) * 100);

  return (
    <section
      data-testid="curriculum-progress"
      className="glass rounded-lg border border-line bg-surface p-4"
    >
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="text-tiny font-medium tracking-tight text-muted">カリキュラムの進捗</h2>
        <span className="tnum ml-auto text-body text-fg">
          <span className="font-semibold" data-testid="progress-solved">
            <CountUp value={solved} />
          </span>
          <span className="text-subtle"> / {total} 問</span>
        </span>
        <span className="tnum text-tiny text-subtle">({pct}%)</span>
      </div>

      {/* 幅は問題数に比例。バーの長さがそのままフェーズの重さになる */}
      <div className="flex gap-1" role="img" aria-label={`全 ${total} 問中 ${solved} 問正解`}>
        {PHASES.map((phase, i) => {
          const stat = totals[i];
          const ratio = stat.total === 0 ? 0 : stat.solved / stat.total;
          const done = stat.total > 0 && stat.solved === stat.total;
          const active = phase.id === activePhase;
          return (
            <Link
              key={phase.id}
              to={`/learn/${phase.id}`}
              title={`${phase.name} ${stat.solved}/${stat.total}`}
              className="group min-w-0 flex-1"
              style={{ flexGrow: stat.total || 1 }}
            >
              <div
                className={`h-2 overflow-hidden rounded-full transition-colors ${
                  active
                    ? 'bg-accent-soft ring-1 ring-accent-line'
                    : 'bg-sunken group-hover:bg-raised'
                }`}
              >
                {/* scaleX で伸ばす。transform なので視差効果を減らす設定では即座に確定する */}
                <motion.div
                  className={`h-full origin-left ${done ? 'bg-success' : 'bg-accent'}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: ratio }}
                  transition={{ duration: 0.55, delay: 0.04 * i, ease: EASE_OUT }}
                />
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span
                  className={`tnum font-mono text-micro ${active ? 'text-accent' : 'text-subtle'}`}
                >
                  {String(phase.id).padStart(2, '0')}
                </span>
                <span className="tnum truncate text-micro text-subtle">
                  {stat.solved}/{stat.total}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
