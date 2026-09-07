import { memo, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import type { Transition } from 'motion/react';

/*
  数字が変わるとき、桁ごとに輪を回して見せる。

  出典: Rare UI「Animated Counter」（MIT / rareui.com）を、この教材の
  用途に合わせて書き直したもの。元は小数・桁区切り・符号まで扱うが、
  ここで数えるのは「解いた問数」だけなので 0 以上の整数に絞ってある。

  元から持ってきた考えは 3 つ:
    - 輪の末尾にもう 1 枚 0 を足す。9 → 0 の折り返しが同じ face に着地する
    - 上下をぼかす。ぼかしを直線で掛けると縁が硬いので、緩めた勾配を使う
    - 桁は「右から何番目か」で key を振る。9 → 10 で桁が増えても、
      既にある桁は作り直さずに横へずれる
*/

const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** 末尾の 0 は 9 からの折り返し用。同じ絵に着地するので継ぎ目が出ない */
const WHEEL = [...FACES, 0];

/** 1 枚ぶんの高さ。字の上下に余白を取り、止まっている桁がぼけないようにする */
const LINE = 1.5;

/** 上下の消え際。直線で消すと縁が線に見えるので、緩めてある */
const FADE = `linear-gradient(to bottom,
  rgba(0,0,0,0) 0%,
  rgba(0,0,0,0.06) 5.5%,
  rgba(0,0,0,0.5) 11%,
  rgba(0,0,0,0.94) 16.5%,
  #000 22%,
  #000 78%,
  rgba(0,0,0,0.94) 83.5%,
  rgba(0,0,0,0.5) 89%,
  rgba(0,0,0,0.06) 94.5%,
  rgba(0,0,0,0) 100%)`;

const LEAVE = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
const INSTANT = { duration: 0 } as const;

/** 跳ね返りは弱く。数えている途中だと分かる程度に留める */
const spring = (duration: number): Transition => ({
  type: 'spring',
  visualDuration: duration,
  bounce: 0.18,
});

const mod = (n: number, m: number) => ((n % m) + m) % m;

/* 桁ごとに 21 個の span を作り直さないよう、一度だけ組んでおく */
const SIZER = FACES.map((face) => (
  <span key={face} aria-hidden className="invisible [grid-area:1/1]">
    {face}
  </span>
));

const STACK = WHEEL.map((face, index) => (
  <span key={index} className="flex items-center justify-center" style={{ height: `${LINE}em` }}>
    {face}
  </span>
));

/**
 * 1 桁ぶんの輪の位置。
 *
 * 目標は「いまいる所」から数える。数が続けて変わっても回り残しが溜まらない。
 * 減るときは逆へ回す（52 → 51 で 9 枚ぶん進むと、増えたように見えてしまう）。
 */
function useWheel(from: number, digit: number, dir: number, duration: number, reduced: boolean) {
  const pos = useMotionValue(from);
  const goal = useRef(from);

  // 向きは読むだけ。依存に入れると、向きが変わっただけで全桁が回り直す
  const heading = useRef(dir);
  useEffect(() => {
    heading.current = dir;
  }, [dir]);

  useEffect(() => {
    if (reduced) {
      goal.current = digit;
      pos.set(digit);
      return;
    }
    if (mod(goal.current, 10) !== digit) {
      const at = pos.get();
      goal.current = heading.current < 0 ? at - mod(at - digit, 10) : at + mod(digit - at, 10);
    }
    const roll = animate(pos, goal.current, spring(duration));
    return () => roll.stop();
  }, [digit, duration, reduced, pos]);

  return useTransform(pos, (p) => `${(-mod(p, 10) * 100) / WHEEL.length}%`);
}

interface SlotProps {
  reduced: boolean;
  /** 桁数。変わったときだけ layout を測り直す */
  dep: number;
  shift: Transition;
}

const Digit = memo(function Digit({
  digit,
  from,
  dir,
  duration,
  reduced,
  dep,
  shift,
}: SlotProps & { digit: number; from: number; dir: number; duration: number }) {
  const y = useWheel(from, digit, dir, duration, reduced);

  return (
    <motion.span
      data-testid="odometer-digit"
      data-digit={digit}
      layout={!reduced}
      layoutDependency={dep}
      transition={shift}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: reduced ? INSTANT : LEAVE }}
      className="relative inline-grid overflow-hidden"
      style={{
        height: `${LINE}em`,
        lineHeight: LINE,
        maskImage: FADE,
        WebkitMaskImage: FADE,
      }}
    >
      {/* いちばん広い face の幅を確保する。等幅でない字面でも桁が揺れない */}
      {SIZER}
      <motion.span style={{ y }} className="absolute inset-x-0 top-0">
        {STACK}
      </motion.span>
    </motion.span>
  );
});

/**
 * 数えて動く数字。
 *
 * 読み上げには最終的な値だけを渡す（輪の 0〜9 が全部読まれてしまうため）。
 * 「視差効果を減らす」設定では回さずに差し替える。
 */
export default function Odometer({
  value,
  duration = 0.6,
  className = '',
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const amount = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const chars = String(amount);
  const width = chars.length;

  const [previous, setPrevious] = useState(amount);
  const [dir, setDir] = useState(1);
  if (previous !== amount) {
    setDir(amount >= previous ? 1 : -1);
    setPrevious(amount);
  }

  // 最初に出ている桁はその数字から始める。あとから増えた桁は 0 から回って入る
  const [seed] = useState<Record<number, number>>(() => {
    const faces: Record<number, number> = {};
    chars.split('').forEach((c, i) => {
      faces[width - i] = Number(c);
    });
    return faces;
  });

  const shift = reduced ? INSTANT : spring(duration);

  return (
    <span data-testid="odometer" className={`tnum inline-flex items-center ${className}`}>
      <span className="sr-only">{chars}</span>
      <span aria-hidden className="inline-flex items-center select-none">
        <AnimatePresence mode="popLayout" initial={false}>
          {chars.split('').map((c, i) => {
            const place = width - i;
            return (
              <Digit
                key={place}
                reduced={reduced}
                dep={width}
                shift={shift}
                digit={Number(c)}
                from={seed[place] ?? 0}
                dir={dir}
                duration={duration}
              />
            );
          })}
        </AnimatePresence>
      </span>
    </span>
  );
}
