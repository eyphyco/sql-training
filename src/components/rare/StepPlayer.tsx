import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Transition } from 'motion/react';

/*
  順番に 1 歩ずつ進めて見せる操作盤。

  出典: Rare UI「Step Player」（MIT / rareui.com）。
  借りたのは形と動き:
    - 再生と一時停止は入れ替えではなく、同じ図形を変形させて繋ぐ
    - 歩数は点で並べ、いまの 1 つだけが棒に伸びる
    - 最後まで行ったら「最初から」に変わる

  ただし元は変形に flubber を使っている。ここでは、2 つの四角形が
  三角形の左半分・右半分になるよう頂点を手で合わせてあるので、
  d の数値を補間するだけで繋がる（依存を増やさずに済む）。
*/

const WIDTH_SPRING: Transition = { type: 'spring', duration: 0.42, bounce: 0.14 };
const ICON_SPRING: Transition = { type: 'spring', duration: 0.32, bounce: 0.22 };
const FADE: Transition = { duration: 0.24, ease: [0.32, 0.72, 0, 1] };
const INSTANT: Transition = { duration: 0 };

/* 頂点の数と順序を揃えた 2 対。左右それぞれが、棒 ⇄ 三角形の半分になる */
const PAUSE_L = 'M8.4 5.9L10.4 5.9L10.4 18.1L8.4 18.1Z';
const PLAY_L = 'M8.4 5.9L13 8.55L13 15.45L8.4 18.1Z';
const PAUSE_R = 'M13.6 5.9L15.6 5.9L15.6 18.1L13.6 18.1Z';
const PLAY_R = 'M13 8.55L17.6 11.9L17.6 12.1L13 15.45Z';

const REPLAY =
  'M17.44 6.56A7.7 7.7 0 1 1 10.66 4.42L10.32 2.45L14.86 4.59L11.32 8.16L10.91 5.8A6.3 6.3 0 1 0 16.45 7.55Z';

const DOT = 3;
const BAR = 26;
const GAP = 4;

function Transport({ state, reduced }: { state: 'play' | 'pause' | 'replay'; reduced: boolean }) {
  const timing = reduced ? INSTANT : ICON_SPRING;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <AnimatePresence mode="wait" initial={false}>
        {state === 'replay' ? (
          // 頂点が対応しないので、ここだけは重ねて入れ替える
          <motion.path
            key="replay"
            d={REPLAY}
            fill="currentColor"
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={reduced ? INSTANT : FADE}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        ) : (
          <motion.g
            key="transport"
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={reduced ? INSTANT : FADE}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            <motion.path
              fill="currentColor"
              initial={false}
              animate={{ d: state === 'pause' ? PAUSE_L : PLAY_L }}
              transition={timing}
            />
            <motion.path
              fill="currentColor"
              initial={false}
              animate={{ d: state === 'pause' ? PAUSE_R : PLAY_R }}
              transition={timing}
            />
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}

export default function StepPlayer({
  steps,
  value,
  onValueChange,
  playing,
  onPlayingChange,
  stepMs = 1100,
  label = '歩',
  className = '',
}: {
  steps: number;
  value: number;
  onValueChange: (value: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  /** 1 歩にかける時間 */
  stepMs?: number;
  /** 読み上げに出す単位（「3 歩目」） */
  label?: string;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const last = steps - 1;
  const atEnd = value >= last;
  const state = playing ? 'pause' : atEnd ? 'replay' : 'play';

  // 再生中の歩送り。value は親が持つので、進める側だけ ref で最新を見る
  // （毎歩ごとにタイマーを張り直すと、その分だけ間隔がずれていく）
  const advance = () => {
    if (value >= last) {
      onPlayingChange(false);
      return;
    }
    onValueChange(value + 1);
  };
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => advanceRef.current(), stepMs);
    return () => clearInterval(timer);
  }, [playing, stepMs]);

  const toggle = () => {
    if (playing) {
      onPlayingChange(false);
      return;
    }
    // 最後まで行っていたら、頭から見直す
    if (atEnd) onValueChange(0);
    onPlayingChange(true);
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="step-player">
      <button
        type="button"
        onClick={toggle}
        aria-label={state === 'pause' ? '止める' : state === 'replay' ? '最初から' : '順に見る'}
        data-testid="step-play"
        data-state={state}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent-soft"
      >
        <Transport state={state} reduced={reduced} />
      </button>

      <div className="flex items-center" style={{ gap: GAP }} data-testid="step-track">
        {Array.from({ length: steps }, (_, i) => {
          const on = i === value;
          return (
            <motion.button
              key={i}
              type="button"
              onClick={() => {
                onPlayingChange(false);
                onValueChange(i);
              }}
              aria-label={`${i + 1} ${label}目`}
              aria-current={on ? 'step' : undefined}
              data-testid={on ? 'step-dot-current' : 'step-dot'}
              initial={false}
              animate={{ width: on ? BAR : DOT }}
              transition={reduced ? INSTANT : WIDTH_SPRING}
              className={`relative h-[3px] shrink-0 overflow-hidden rounded-full ${
                on ? 'bg-accent-line' : i < value ? 'bg-accent/50' : 'bg-line-strong'
              }`}
            >
              {/* いまの歩の残り時間。棒の中が左から埋まる */}
              {on && playing && !reduced && (
                <motion.span
                  key={value}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: stepMs / 1000, ease: 'linear' }}
                  className="absolute inset-0 origin-left rounded-full bg-accent"
                />
              )}
              {on && (!playing || reduced) && (
                <span className="absolute inset-0 rounded-full bg-accent" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
