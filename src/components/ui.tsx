import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { EASE_OUT } from './motion';

/* ボタン: バリアントとサイズを固定し、画面ごとに書き分けないようにする。
   形はすべて角丸いっぱい（ピル）で統一する */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent-solid text-on-accent hover:bg-accent-solid-hover border border-transparent raised-edge',
  secondary: 'bg-surface text-fg border border-line hover:border-line-strong glass-edge',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-raised hover:text-fg',
  danger: 'bg-transparent text-danger border border-danger-line hover:bg-danger-soft',
};

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-8 px-3.5 text-[13px] gap-1.5',
  lg: 'h-10 px-5 text-sm gap-2',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * 面を1段持ち上げる箱。背後をぼかして色を拾う「ガラス」。
 * 影と縁のハイライトは .glass が持つので、ここでは指定しない。
 */
export function Card({
  children,
  className = '',
  as: Tag = 'div',
  id,
  testId,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
  /** 章内リンクの飛び先にするとき用 */
  id?: string;
  /** テストから指し示すための目印 */
  testId?: string;
}) {
  return (
    <Tag
      id={id}
      data-testid={testId}
      className={`glass rounded-lg border border-line bg-surface ${className}`}
    >
      {children}
    </Tag>
  );
}

/** セクション見出し。小さく、字間を詰めて、本文と明確に階層差をつける */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-[13px] font-semibold tracking-tight text-muted">{children}</h2>
      {right}
    </div>
  );
}

/**
 * 進捗バー。高さ3px、単色。グラデーションは使わない。
 * 0 から伸びる。`delay` を渡すと、並べたときに順に伸びていく。
 */
export function Meter({
  value,
  total,
  delay = 0,
}: {
  value: number;
  total: number;
  delay?: number;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div
      className="h-[3px] w-full overflow-hidden rounded-full bg-sunken"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <motion.div
        className={`h-full origin-left rounded-full ${pct === 100 ? 'bg-success' : 'bg-accent'}`}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay }}
        style={{ width: '100%' }}
      />
    </div>
  );
}

/** ラベル。既定は無彩色。色は状態を表すときだけ使う */
export function Tag({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'border-line bg-raised text-muted',
    accent: 'border-accent-line bg-accent-soft text-accent',
    success: 'border-success-line bg-success-soft text-success',
    warning: 'border-warning-line bg-warning-soft text-warning',
    danger: 'border-danger-line bg-danger-soft text-danger',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * 数字が変わるとき、その場で書き換えず数えて動かす。
 * 絞り込みの件数のように「何件減ったか」を見せたい所で使う。
 *
 * MotionValue を motion 要素の子に渡すと、React の再描画を挟まずに
 * 文字だけが差し替わる（1 フレームごとに setState しなくて済む）。
 */
export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const reduced = useReducedMotion();
  const raw = useMotionValue(value);
  const text = useTransform(raw, (v) => String(Math.round(v)));

  useEffect(() => {
    if (reduced) {
      raw.set(value);
      return;
    }
    const controls = animate(raw, value, { duration: 0.32, ease: EASE_OUT });
    return () => controls.stop();
  }, [raw, reduced, value]);

  return <motion.span className={`tnum ${className}`}>{text}</motion.span>;
}
