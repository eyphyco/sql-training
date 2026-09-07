import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  activityLevel,
  activityWeeks,
  currentStreak,
  dailyActivity,
  monthLabels,
  weightOf,
} from '../../storage/activity';
import type { ActivityLevel, DayActivity } from '../../storage/activity';
import { EASE_OUT } from '../motion';
import type { ProgressData } from '../../types';

/*
  学んだ日を枡で並べる。

  出典: Rare UI「GitHub Activity」（MIT / rareui.com）。
  借りたのは並べ方と出し方:
    - 列（週）ごとに少しずつ遅らせて出す。左から埋まっていくのが見える
    - 枡に触れると、その日の内訳を上に出す
    - 月の見出しは、その月が 3 列以上続くときだけ立てる（隣と重なるため）

  色は緑ではなくこの教材の accent を薄めて使う。濃さは絶対値ではなく
  「いちばん多い日」を上限にした相対評価（日ごとの量は人によって違う）。
*/

/** 半年ぶん。これ以上並べると、狭い画面で枡が潰れる */
const WEEKS = 26;
const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;

/** 列 1 本ぶんの遅れ。左から順に埋まって見える程度に留める */
const COLUMN_STAGGER = 0.012;

const TONE: Record<ActivityLevel, string> = {
  0: 'bg-sunken',
  1: 'bg-accent/25',
  2: 'bg-accent/45',
  3: 'bg-accent/70',
  4: 'bg-accent',
};

/** 左に出す曜日。7 段すべてに出すと字が潰れる */
const WEEKDAYS = ['', '月', '', '水', '', '金', ''];

function label(day: DayActivity): string {
  const [, m, d] = day.date.split('-');
  const head = `${Number(m)}月${Number(d)}日`;
  if (weightOf(day) === 0) return `${head} · 記録なし`;
  const parts = [];
  if (day.tries > 0) parts.push(`${day.tries} 回挑戦`);
  if (day.solved > 0) parts.push(`${day.solved} 問正解`);
  return `${head} · ${parts.join(' · ')}`;
}

export default function ActivityHeatmap({ progress }: { progress: ProgressData }) {
  const [hover, setHover] = useState<{ day: DayActivity; col: number; row: number } | null>(null);

  const { columns, months, busiest, streak, activeDays } = useMemo(() => {
    const days = dailyActivity(progress);
    const today = new Date();
    const columns = activityWeeks(days, today, WEEKS);
    let busiest = 0;
    let activeDays = 0;
    for (const day of days.values()) {
      const n = weightOf(day);
      if (n > busiest) busiest = n;
      if (n > 0) activeDays += 1;
    }
    return {
      columns,
      months: monthLabels(columns),
      busiest,
      streak: currentStreak(days, today),
      activeDays,
    };
  }, [progress]);

  const width = columns.length * STEP - GAP;

  return (
    <div data-testid="activity-heatmap">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-tiny text-subtle">
        <span>
          学んだ日 <span className="tnum font-medium text-fg">{activeDays}</span> 日
        </span>
        {streak > 0 && (
          <span>
            連続 <span className="tnum font-medium text-fg">{streak}</span> 日
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          少
          {([1, 2, 3, 4] as ActivityLevel[]).map((l) => (
            <span key={l} className={`h-2 w-2 rounded-[2px] ${TONE[l]}`} />
          ))}
          多
        </span>
      </div>

      {/* 狭い画面では枡を潰さず、この枠の中だけ横へ送る */}
      <div className="overflow-x-auto pb-1">
        <div className="relative flex gap-1.5" style={{ width: width + 20 }}>
          <div
            aria-hidden
            className="flex shrink-0 flex-col justify-between pt-4 text-micro text-subtle"
            style={{ height: 7 * STEP - GAP + 16 }}
          >
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="flex h-[11px] items-center leading-none">
                {d}
              </span>
            ))}
          </div>

          <div className="relative">
            <div aria-hidden className="relative h-4 text-micro text-subtle">
              {months.map((m, i) =>
                m === null ? null : (
                  <span key={i} className="absolute top-0" style={{ left: i * STEP }}>
                    {m}
                  </span>
                ),
              )}
            </div>

            <div className="flex" style={{ gap: GAP }}>
              {columns.map((week, col) => (
                <div key={col} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map((day, row) =>
                    day === null ? (
                      // 未来の枡は席だけ空けておく（列の高さを揃えるため）
                      <span key={row} style={{ width: CELL, height: CELL }} />
                    ) : (
                      <button
                        key={row}
                        type="button"
                        tabIndex={-1}
                        aria-hidden
                        data-testid="activity-cell"
                        data-level={activityLevel(day, busiest)}
                        onPointerEnter={() => setHover({ day, col, row })}
                        onPointerLeave={() => setHover(null)}
                        className={`activity-cell rounded-[2px] ${TONE[activityLevel(day, busiest)]}`}
                        style={{
                          width: CELL,
                          height: CELL,
                          // 左の列から順に埋まっていく
                          animationDelay: `${col * COLUMN_STAGGER}s`,
                        }}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>

            <AnimatePresence>
              {hover && (
                <motion.span
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 3 }}
                  transition={{ duration: 0.13, ease: EASE_OUT }}
                  data-testid="activity-tip"
                  className="glass-pop pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line px-2 py-1 text-micro whitespace-nowrap text-fg"
                  style={{
                    // 端の枡でも札がはみ出さないよう、中央寄せの位置を内側へ寄せる
                    left: Math.min(Math.max(hover.col * STEP + CELL / 2, 52), width - 52),
                    top: 16 + hover.row * STEP - 4,
                  }}
                >
                  {label(hover.day)}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 枡は読み上げに載せない（182 個が順に読まれる）。要点だけ文にする */}
      <p className="sr-only">
        直近 {WEEKS} 週のうち {activeDays} 日に学習しました。
        {streak > 0 && `現在 ${streak} 日連続です。`}
      </p>
    </div>
  );
}
