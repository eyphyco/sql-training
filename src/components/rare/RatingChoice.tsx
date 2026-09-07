import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { SLIDE } from '../motion';

/*
  いくつかの中から 1 つ選ぶ。選んだ瞬間に手応えを返す。

  出典: Rare UI「Emoji Reaction」（MIT / rareui.com）。
  借りたのは選ぶときの手触り:
    - 指した札はバネで少し持ち上がる
    - 押した札は一度沈んでから戻る
    - 決まった瞬間に輪が広がって消える（記録された、という合図）

  元は絵文字の盆を開く形だが、ここは択が 2 つしかないので盆は開かず、
  札をそのまま並べている。
*/

const POP = { type: 'spring', stiffness: 420, damping: 17, mass: 0.6 } as const;

type Tone = 'success' | 'warning';

const TONE: Record<Tone, { on: string; ring: string }> = {
  success: { on: 'border-success-line bg-success-soft text-success', ring: 'bg-success' },
  warning: { on: 'border-warning-line bg-warning-soft text-warning', ring: 'bg-warning' },
};

export interface RatingOption<T extends string> {
  key: T;
  label: string;
  tone: Tone;
  icon?: ReactNode;
  /** 選んだあとに出す文。省くと label を使う */
  note?: string;
}

export default function RatingChoice<T extends string>({
  options,
  value,
  onChange,
  testId,
}: {
  options: RatingOption<T>[];
  value: T | undefined;
  onChange: (key: T) => void;
  testId?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  // 押すたびに増やす。同じ札をもう一度押しても輪が出る
  const [pulse, setPulse] = useState(0);

  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((option) => {
        const on = value === option.key;
        return (
          <motion.button
            key={option.key}
            type="button"
            onClick={() => {
              onChange(option.key);
              setPulse((n) => n + 1);
            }}
            aria-pressed={on}
            data-testid={on ? 'rating-current' : 'rating'}
            whileHover={reduced ? undefined : { y: -2, scale: 1.03 }}
            whileTap={reduced ? undefined : { scale: 0.9 }}
            transition={POP}
            className={`glass-edge relative isolate inline-flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-3.5 text-body font-medium transition-colors ${
              on ? TONE[option.tone].on : 'border-line bg-surface text-muted hover:text-fg'
            }`}
          >
            {/* 決まった合図。札の中で輪が広がって消える */}
            <AnimatePresence>
              {on && !reduced && (
                <motion.span
                  key={pulse}
                  aria-hidden
                  initial={{ opacity: 0.32, scale: 0 }}
                  animate={{ opacity: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                  className={`absolute top-1/2 left-1/2 -z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full ${TONE[option.tone].ring}`}
                />
              )}
            </AnimatePresence>
            {option.icon}
            {option.label}
          </motion.button>
        );
      })}

      {/* 記録したことを文でも出す。位置と色だけでは読み上げに乗らない */}
      <AnimatePresence mode="popLayout">
        {value && (
          <motion.span
            key={value}
            layout
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={SLIDE}
            className="self-center text-tiny text-subtle"
          >
            {(() => {
              const chosen = options.find((o) => o.key === value);
              return chosen?.note ?? `${chosen?.label}として記録しました`;
            })()}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
