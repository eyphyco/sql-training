import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { useActiveSection, useSmoothScroll } from '../useReadingNav';
import { EASE_OUT } from '../motion';
import type { LessonSection } from '../../types';

/*
  章の右端に置く節の目盛り。

  出典: Rare UI「Proximity Sidebar」（MIT / rareui.com）。
  節ぶんの短い罫を縦に並べ、カーソルが近づいた罫だけが伸びる。
  近さは「カーソルの y と罫の中心の差」で測り、伸び縮みはバネに通す。

  左の目次と役割を分けてある:
    - 左の目次  … どの章にいるか。章をまたいで移る
    - この目盛り … この章のどこを読んでいるか。節へ跳ぶ
  読み進みに応じて上から色が付くので、目盛り自体が現在地の表示になる。

  置けるのは横に余白がある画面だけ（2xl 以上）。狭いときは出さない。
  情報は左の目次にもあるので、消えても読めなくならない。
*/

/** この距離まで近づくと伸び始める（px） */
const RADIUS = 44;

/** 罫の幅。伸ばすときは scaleX を掛けるので、実体はいちばん長い状態で置く */
const MAX_DASH = 56;
const BASE = 20;
const BUMP = 30;
/** 読んでいる節は、カーソルが遠くても伸ばしておく */
const ACTIVE_BASE = 38;

const DASH_SPRING = { stiffness: 320, damping: 34, mass: 0.7 } as const;

function Dash({
  section,
  index,
  state,
  mouseY,
  onSelect,
}: {
  section: LessonSection;
  index: number;
  state: 'read' | 'current' | 'unread';
  mouseY: MotionValue<number>;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const base = state === 'current' ? ACTIVE_BASE : BASE;

  const distance = useTransform(mouseY, (y) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return RADIUS;
    return y - (rect.top + rect.height / 2);
  });

  const target = useTransform(
    distance,
    [-RADIUS, 0, RADIUS],
    [base / MAX_DASH, (base + BUMP) / MAX_DASH, base / MAX_DASH],
    { clamp: true },
  );
  const scaleX = useSpring(target, DASH_SPRING);

  const tone =
    state === 'current' ? 'bg-accent' : state === 'read' ? 'bg-accent/45' : 'bg-line-strong';

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      onPointerEnter={() => setNear(true)}
      onPointerLeave={() => setNear(false)}
      onFocus={() => setNear(true)}
      onBlur={() => setNear(false)}
      aria-current={state === 'current' ? 'true' : undefined}
      data-testid={state === 'current' ? 'rail-dash-current' : 'rail-dash'}
      className="group flex h-4 w-full items-center justify-end outline-none"
    >
      {/* 名前は近づいたときだけ。常に出すと本文の右に列が 1 本増えてしまう */}
      <AnimatePresence>
        {near && (
          <motion.span
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            data-testid="rail-label"
            className="glass-pop pointer-events-none absolute right-full mr-2 rounded-md border border-line px-2 py-1 text-tiny whitespace-nowrap text-fg"
          >
            <span className="tnum mr-1.5 font-mono text-micro text-subtle">{index + 1}.</span>
            {section.title}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.span
        aria-hidden
        className={`block h-px origin-right transition-colors duration-200 ${tone}`}
        style={{ width: MAX_DASH, scaleX }}
      />
      <span className="sr-only">{section.title}へ移動</span>
    </button>
  );
}

export default function SectionRail({ sections }: { sections: LessonSection[] }) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(ids);
  const { goTo } = useSmoothScroll();
  // Infinity にしておくと、カーソルが来るまではどの罫も伸びない
  const mouseY = useMotionValue(Infinity);
  const activeIndex = ids.indexOf(active);

  if (sections.length === 0) return null;

  return (
    <div
      data-testid="section-rail"
      aria-label="この章の節"
      onPointerMove={(e) => mouseY.set(e.clientY)}
      onPointerLeave={() => mouseY.set(Infinity)}
      className="fixed top-1/2 right-5 z-10 hidden w-14 -translate-y-1/2 flex-col items-end gap-1 2xl:flex"
    >
      {sections.map((s, i) => (
        <div key={s.id} className="relative flex w-full justify-end">
          <Dash
            section={s}
            index={i}
            state={i === activeIndex ? 'current' : i < activeIndex ? 'read' : 'unread'}
            mouseY={mouseY}
            onSelect={() => goTo(s.id)}
          />
        </div>
      ))}
    </div>
  );
}
