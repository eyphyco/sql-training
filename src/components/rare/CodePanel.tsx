import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '../motion';

/*
  模範解答のような「読ませたい SQL」を出す枠。

  出典: Rare UI「Code Block」（MIT / rareui.com）。
  借りたのは 2 つ:
    - コピーの印は差し替えではなく、ぼかしながら入れ替えて ✓ を描く
    - 本文は行ごとに少し遅れて出す。上から 1 行ずつ読ませたい所なので、
      全部が一度に出るより目が追いやすい

  色付けは入れていない。この教材ではエディタ（CodeMirror）が同じ配色を
  持っているので、そちらと二重に持つと必ずどちらかがずれる。
*/

const TAP = { type: 'spring', stiffness: 500, damping: 30 } as const;
const CHECK = { type: 'spring', duration: 0.4, bounce: 0.35 } as const;
const RESET_MS = 1800;
/** 1 行ぶんの遅れ。これ以上置くと、長い解答で最後まで待たされる */
const LINE_STAGGER = 0.028;
const MAX_STAGGERED = 24;

export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion() ?? false;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // file:// や古い環境では Clipboard API が無い
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), RESET_MS);
  }, [text]);

  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.5, filter: 'blur(4px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.5, filter: 'blur(4px)' },
      };

  return (
    <motion.button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? 'コピーしました' : 'SQL をコピー'}
      data-testid="copy-sql"
      data-copied={copied}
      whileTap={reduced ? undefined : { scale: 0.9 }}
      transition={TAP}
      className={`grid h-6 w-6 place-items-center rounded-md border transition-colors ${
        copied
          ? 'border-success-line bg-success-soft text-success'
          : 'border-line bg-surface text-subtle hover:text-fg'
      } ${className}`}
    >
      <AnimatePresence initial={false}>
        {copied ? (
          <motion.span
            key="check"
            className="col-start-1 row-start-1 flex"
            {...swap}
            transition={reduced ? { duration: 0.15 } : CHECK}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <motion.path
                d="M4 12.5l5 5L20 6.5"
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, ease: EASE_OUT, delay: 0.05 }}
              />
            </svg>
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            className="col-start-1 row-start-1 flex"
            {...swap}
            transition={reduced ? { duration: 0.15 } : { duration: 0.2, ease: EASE_OUT }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
              <path d="M15.5 5.5A2 2 0 0 0 13.5 3.5h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function CodePanel({ code, title }: { code: string; title: string }) {
  const reduced = useReducedMotion() ?? false;
  const text = code.trim();
  const lines = text.split('\n');

  return (
    <div className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-raised px-4 py-1.5">
        <p className="text-tiny font-medium text-muted">{title}</p>
        <CopyButton text={text} className="ml-auto" />
      </div>
      {/* 読み上げには 1 つの塊として渡す。行ごとの span に割ると 1 行ずつ切れる */}
      <pre
        data-testid="answer-sql"
        className="overflow-x-auto bg-sunken p-4 font-mono text-small leading-relaxed text-fg"
      >
        <span className="sr-only">{text}</span>
        <span aria-hidden>
          {lines.map((line, i) => (
            <motion.span
              key={i}
              className="block min-h-[1.4em]"
              initial={reduced ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                ease: EASE_OUT,
                // 長い解答では遅らせない。最後の行まで待つほうが気になる
                delay: reduced ? 0 : Math.min(i, MAX_STAGGERED) * LINE_STAGGER,
              }}
            >
              {line || ' '}
            </motion.span>
          ))}
        </span>
      </pre>
    </div>
  );
}
