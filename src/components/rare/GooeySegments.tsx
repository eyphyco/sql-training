import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';

/*
  区画を切り替えるつまみ。選んだ区画が隣から「ちぎれて」離れる。

  出典: Rare UI「Gooey Nav」（MIT / rareui.com）。
  仕組みはそのまま借りている:
    - 区画どうしの継ぎ目は、隙間に描いた 2 本の凹んだ曲線（首）で繋ぐ
    - 隙間が開くほど首は細くなり、ある所で切れて 0 になる
    - 閉じている継ぎ目は 1px 食い込ませる。地の色が線になって見えるのを防ぐ

  下線を滑らせる方式（layoutId）から替えたのは、右のペインの見出しが
  「いま何を見ているか」を色でも示せるようにするため。下線は 1px の情報で、
  タブが 3 つ並ぶと隣とどちらが濃いか一瞬迷う。

  色は文字列で受け取らず、この教材の変数をそのまま使う。
*/

/** 首が完全に切れるまでの、隙間の割合 */
const NECK_BREAK = 0.22;

/** 首の viewBox の高さ。実際の高さには preserveAspectRatio="none" で伸ばす */
const NECK_H = 100;

/** 跳ね返らないバネ。つまみが行き過ぎると切り替えが安っぽく見える */
const SPRING = { type: 'spring', stiffness: 200, damping: 28, mass: 1 } as const;

const TILE = 'var(--c-solid)';
const TILE_ON = 'var(--c-accent-solid)';

export interface Segment {
  key: string;
  label: ReactNode;
  /** 読み上げとテストが使う名前。label が要素のときに渡す */
  name?: string;
  testId?: string;
}

/** 隙間に落とす 2 本の凹んだ曲線。中央へ向かってすぼまる */
function neckPath(gap: number, span: number): string {
  // 負や NaN を渡すと座標が全部 NaN の path になる
  if (!Number.isFinite(gap) || !Number.isFinite(span) || gap <= 0 || span <= 0) return '';
  const waist = NECK_H * (1 - gap / (span * NECK_BREAK));
  if (waist <= 0) return '';
  const start = span - gap;
  const mid = start + gap / 2;
  return `M${start} 0 Q${mid} ${NECK_H - waist} ${span} 0 L${span} ${NECK_H} Q${mid} ${waist} ${start} ${NECK_H} Z`;
}

function Tile({
  gap,
  span,
  hasSeam,
  leftFill,
  rightFill,
  reduced,
  radii,
  active,
  children,
}: {
  gap: number;
  span: number;
  hasSeam: boolean;
  leftFill: string;
  rightFill: string;
  reduced: boolean;
  radii: Record<string, number>;
  active: boolean;
  children: ReactNode;
}) {
  const marginLeft = useSpring(gap, SPRING);
  const gradientId = `gooey-neck-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (reduced) marginLeft.jump(gap);
    else marginLeft.set(gap);
  }, [gap, marginLeft, reduced]);

  const d = useTransform(marginLeft, (g) => neckPath(g, span));

  return (
    <motion.li
      className="relative"
      style={{ marginLeft, backgroundColor: active ? TILE_ON : TILE }}
      initial={false}
      animate={radii}
      transition={reduced ? { duration: 0 } : SPRING}
    >
      {hasSeam && (
        <svg
          aria-hidden
          width={span}
          viewBox={`0 0 ${span} ${NECK_H}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute top-0 right-full h-full"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1">
              <stop offset="0" stopColor={leftFill} />
              <stop offset="1" stopColor={rightFill} />
            </linearGradient>
          </defs>
          <motion.path d={d} fill={`url(#${gradientId})`} />
        </svg>
      )}
      {children}
    </motion.li>
  );
}

/**
 * @param separation 離れたときの隙間（px）
 * @param radius     離れたときの角の丸み（px）
 */
export default function GooeySegments({
  items,
  value,
  onChange,
  disabled = false,
  separation = 13,
  radius = 8,
  className = '',
  testId,
}: {
  items: Segment[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  separation?: number;
  radius?: number;
  className?: string;
  testId?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const active = items.findIndex((i) => i.key === value);

  /** その継ぎ目が開いているか。両端と、選択中の区画の両隣が開く */
  const open = (seam: number) =>
    seam === 0 || seam === items.length || seam - 1 === active || seam === active;

  const fill = (i: number) => (i === active ? TILE_ON : TILE);

  return (
    <ul data-testid={testId} className={`flex items-stretch ${className}`}>
      {items.map((item, i) => {
        const isActive = i === active;
        return (
          <Tile
            key={item.key}
            // 閉じた継ぎ目は 1px 食い込ませ、地の色が線になって見えないようにする
            gap={i === 0 ? 0 : open(i) ? separation : -1}
            span={separation}
            hasSeam={i > 0}
            leftFill={fill(i - 1)}
            rightFill={fill(i)}
            reduced={reduced}
            active={isActive}
            radii={{
              borderTopLeftRadius: open(i) ? radius : 0,
              borderBottomLeftRadius: open(i) ? radius : 0,
              borderTopRightRadius: open(i + 1) ? radius : 0,
              borderBottomRightRadius: open(i + 1) ? radius : 0,
            }}
          >
            <button
              type="button"
              onClick={() => onChange(item.key)}
              disabled={disabled}
              aria-pressed={isActive}
              aria-label={item.name}
              data-testid={item.testId}
              data-active={isActive}
              className={`flex h-full cursor-pointer items-center gap-1 px-2.5 text-tiny font-medium whitespace-nowrap disabled:cursor-default disabled:opacity-45 ${
                isActive
                  ? 'text-on-accent duration-300 transition-colors'
                  : 'text-muted transition-none hover:text-fg'
              }`}
            >
              {item.label}
            </button>
          </Tile>
        );
      })}
    </ul>
  );
}
