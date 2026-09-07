import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import type { Transition } from 'motion/react';

/*
  取り消せない操作を、その場で確かめてから実行するボタン。

  出典: Rare UI「Delete Button」（MIT / rareui.com）。
  借りた考え:
    - 蓋が開く。押した時点では「開いた」だけで、まだ何も起きていないと分かる
    - 本体の上端が下がる。蓋が持ち上がって離れた、という形になる
    - ボタン自身が横に伸びて確認が出る。別の場所に窓を出さない

  window.confirm() から替えた。あれはブラウザの窓なので画面の外に出るし、
  「進捗をすべて削除します」の一文だけで、何を消すのかが伝わりにくい。
*/

const EASE = [0.32, 0.72, 0, 1] as const;
const EASE_LID = [0.34, 1.1, 0.64, 1] as const;

const LID: Transition = { duration: 0.5, ease: EASE_LID };
const WALL: Transition = { duration: 0.46, ease: EASE };
const PANEL: Transition = { duration: 0.4, ease: EASE };
const SWAP: Transition = { duration: 0.22, ease: EASE };
const DRAW: Transition = { duration: 0.42, ease: EASE };
const PRESS: Transition = { type: 'spring', stiffness: 520, damping: 18, mass: 0.5 };
const INSTANT: Transition = { duration: 0 };

/** 本体の上端。開くと下がって、蓋が離れたように見える */
const WALL_TOP = 6.9;
const WALL_TOP_OPEN = 10.6;
const LID_OPEN = -32;

/** 済みの印を出しておく時間 */
const HOLD_MS = 1600;

const panelMotion = {
  hidden: { opacity: 0, x: -6, transition: { duration: 0.2, ease: EASE } },
  shown: { opacity: 1, x: 0, transition: { ...PANEL, delay: 0.1, staggerChildren: 0.06 } },
};

const circleMotion = {
  hidden: { opacity: 0, scale: 0.9 },
  shown: { opacity: 1, scale: 1 },
};

function Circle({
  label,
  tone,
  onClick,
  children,
}: {
  label: string;
  tone: 'danger' | 'neutral';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      variants={reduced ? undefined : circleMotion}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      whileTap={reduced ? undefined : { scale: 0.86 }}
      transition={PRESS}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors ${
        tone === 'danger'
          ? 'border-danger-line bg-danger-soft text-danger hover:bg-danger-soft'
          : 'border-line bg-surface text-muted hover:text-fg'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </motion.button>
  );
}

export default function ConfirmDelete({
  label,
  question,
  confirmLabel,
  doneLabel,
  onConfirm,
}: {
  /** 閉じているときの文言 */
  label: string;
  /** 開いたときに出す短い問い */
  question: string;
  /** ✓ の読み上げ名 */
  confirmLabel: string;
  /** 実行したあとに出す文言 */
  doneLabel: string;
  onConfirm: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const timing = (t: Transition) => (reduced ? INSTANT : t);

  // 本体の上端を動かし、path を組み立て直す（形が動くので、蓋との連動が見える）
  const top = useMotionValue(WALL_TOP);
  const bin = useMotionTemplate`M6.4 ${top}L7.5 20h9L17.6 ${top}`;

  useEffect(() => {
    const walls = animate(top, open ? WALL_TOP_OPEN : WALL_TOP, reduced ? INSTANT : WALL);
    return () => walls.stop();
  }, [open, reduced, top]);

  useEffect(() => {
    if (!done) return;
    const back = setTimeout(() => setDone(false), HOLD_MS);
    return () => clearTimeout(back);
  }, [done]);

  const resolve = (go: boolean) => {
    setOpen(false);
    trigger.current?.focus();
    if (go) {
      setDone(true);
      onConfirm();
    }
  };

  return (
    <div
      data-testid="confirm-delete"
      data-open={open}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) resolve(false);
      }}
      className="glass-edge flex h-8 items-center overflow-hidden rounded-full border border-danger-line"
    >
      <motion.button
        ref={trigger}
        type="button"
        aria-expanded={open}
        onClick={() => (open ? resolve(false) : setOpen(true))}
        whileTap={reduced ? undefined : { scale: 0.96 }}
        transition={timing(SWAP)}
        data-testid="confirm-delete-trigger"
        className="flex h-full shrink-0 items-center gap-1.5 px-3 text-body font-medium whitespace-nowrap text-danger"
      >
        <span className="relative flex h-4 w-4 items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.svg
                key="done"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={timing(SWAP)}
              >
                <motion.path
                  d="m4.5 12.5 5 5 10-11"
                  initial={reduced ? undefined : { pathLength: 0 }}
                  animate={reduced ? undefined : { pathLength: 1 }}
                  transition={DRAW}
                />
              </motion.svg>
            ) : (
              <motion.svg
                key="bin"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="overflow-visible"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={timing(SWAP)}
              >
                <motion.path d={bin} />
                {/* 蓋。左端を軸に持ち上がる */}
                <motion.g
                  style={{ transformBox: 'view-box', transformOrigin: '4.5px 6.5px' }}
                  animate={{ rotate: open ? LID_OPEN : 0 }}
                  transition={timing(LID)}
                >
                  <path d="M4 6.5h16" />
                  <path d="M9.5 6.5V4h5v2.5" />
                </motion.g>
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
        {done ? doneLabel : label}
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={timing(PANEL)}
            className="flex h-full items-center overflow-hidden bg-danger-soft"
          >
            <motion.div
              variants={reduced ? undefined : panelMotion}
              initial="hidden"
              animate="shown"
              exit="hidden"
              className="flex items-center gap-1.5 pr-1.5 pl-2.5"
              data-testid="confirm-delete-panel"
            >
              <span className="text-tiny whitespace-nowrap text-danger">{question}</span>
              <Circle label={confirmLabel} tone="danger" onClick={() => resolve(true)}>
                <path d="m4.5 12.5 5 5 10-11" />
              </Circle>
              <Circle label="やめる" tone="neutral" onClick={() => resolve(false)}>
                <path d="M6 6l12 12M18 6 6 18" />
              </Circle>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
