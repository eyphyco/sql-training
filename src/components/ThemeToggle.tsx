import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useTheme } from '../theme/themeContext';
import { SLIDE } from './motion';
import type { ThemeChoice } from '../theme/theme';
import { IconMonitor, IconMoon, IconSun } from './icons';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'ライト', Icon: IconSun },
  { value: 'dark', label: 'ダーク', Icon: IconMoon },
  { value: 'system', label: 'システム設定に従う', Icon: IconMonitor },
];

/** つまみを離したとき、いちばん近い選択肢を返す */
export function nearestIndex(x: number, positions: number[]): number {
  let best = 0;
  for (let i = 1; i < positions.length; i += 1) {
    if (Math.abs(positions[i] - x) < Math.abs(positions[best] - x)) best = i;
  }
  return best;
}

/**
 * セグメンテッドコントロール。3状態（ライト / ダーク / システム）を1つの操作子にまとめる。
 * 押しても、つまみをつまんで動かしても切り替えられる。
 */
export default function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const index = OPTIONS.findIndex((o) => o.value === choice);

  // animate() は MotionConfig の外なので、視差効果の設定は自分で見る
  const reduced = useReducedMotion();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState({ positions: [0, 0, 0], width: 28 });
  const x = useMotionValue(0);
  const dragging = useRef(false);

  // つまみの停止位置はボタンの実寸から測る（余白やサイズを変えても追従する）
  const measure = useCallback(() => {
    const btns = btnRefs.current.filter((b): b is HTMLButtonElement => b !== null);
    if (btns.length !== OPTIONS.length) return;
    setBox({ positions: btns.map((b) => b.offsetLeft), width: btns[0].offsetWidth });
  }, []);

  useLayoutEffect(() => {
    measure();
    if (!trackRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [measure]);

  /*
    その位置まで滑らせる。視差効果を減らす設定では時間 0 で置く。
    x.set() ではなく animate() を使うのは、つまみを離した直後に
    ドラッグ側の最終位置で上書きされてしまうため。
  */
  const settle = useCallback(
    (to: number) => animate(x, to, reduced ? { duration: 0 } : SLIDE),
    [reduced, x],
  );

  // 選択が変わったら（クリックでも OS 追従でも）その位置へ
  useEffect(() => {
    if (dragging.current) return;
    const controls = settle(box.positions[index] ?? 0);
    return () => controls.stop();
  }, [index, box, settle]);

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label="配色テーマ"
      className="relative inline-flex items-center gap-0.5 rounded-full border border-line bg-sunken p-0.5"
    >
      {/*
        つまみは 1 つだけ置いて動かす。ボタンの中に入れて layoutId で
        繋ぐ形だと、つかんで動かすことができないため。
      */}
      <motion.span
        aria-hidden
        data-testid="theme-thumb"
        drag="x"
        dragConstraints={{
          left: box.positions[0] ?? 0,
          right: box.positions[box.positions.length - 1] ?? 0,
        }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragStart={() => {
          dragging.current = true;
        }}
        onDragEnd={() => {
          dragging.current = false;
          const i = nearestIndex(x.get(), box.positions);
          // 同じ位置に戻すときも滑らせる（選択が変わらないと effect が走らないため）
          settle(box.positions[i]);
          if (OPTIONS[i].value !== choice) setChoice(OPTIONS[i].value);
        }}
        // つかんでいる間は横に伸びる。縦に太らせると溝からはみ出す
        whileTap={{ scaleX: 1.12 }}
        style={{ x, width: box.width }}
        className="glass-edge absolute inset-y-0.5 left-0 z-10 cursor-grab rounded-full bg-solid shadow-card active:cursor-grabbing"
      />

      {OPTIONS.map(({ value, label, Icon }, i) => {
        const active = choice === value;
        return (
          <button
            key={value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={`relative flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
              active ? 'text-fg' : 'text-subtle hover:text-muted'
            }`}
          >
            {/* 選ばれた瞬間だけ、アイコンが起き上がる */}
            <motion.span
              animate={
                active ? { rotate: [-45, 0], scale: [0.7, 1.15, 1] } : { rotate: 0, scale: 1 }
              }
              transition={{ duration: 0.36, ease: 'easeOut' }}
              className="pointer-events-none relative z-20 flex"
            >
              <Icon size={14} />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
