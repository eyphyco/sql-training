import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { Card } from './ui';
import { EASE_OUT, SLIDE } from './motion';
import { HEADER_OFFSET, pickActiveSection, scrollDuration } from './reading';
import type { LessonSection } from '../types';

/** いま画面で読んでいる節を返す。判定そのものは reading.ts に置いてある */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      const tops = ids.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? null);
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      const current = pickActiveSection(ids, tops, atBottom);
      setActive((prev) => (prev === current ? prev : current));
    };
    // スクロールは 1 フレームに 1 回だけ読む
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);
  return active;
}

/** 章の目次。読んでいる節に帯が滑って追従し、押すとその節まで送る */
export default function ChapterNav({ sections }: { sections: LessonSection[] }) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(ids);
  const reduced = useReducedMotion();
  const running = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => running.current?.stop(), []);

  /*
    HashRouter なので href="#節id" は使えない。URL のハッシュはルート
    そのもの（#/learn/1）で、書き換えると別ページへ飛んでしまう。
    そのため位置合わせは JS で行う。
  */
  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    running.current?.stop();

    const to = Math.max(0, el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET);
    // 着いたあと、キーボード操作の続きがその節から始まるようにする
    const land = () => {
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    };

    if (reduced) {
      window.scrollTo(0, to);
      land();
      return;
    }

    const from = window.scrollY;
    const duration = scrollDuration(from, to);

    // 途中でユーザーが動かしたら、こちらは引き下がる。
    // stop() だけでは間に合わないことがあるので、書き込み側でも見る
    let cancelled = false;
    const detach = () => {
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('keydown', cancel);
    };
    function cancel() {
      cancelled = true;
      running.current?.stop();
      running.current = null;
      detach();
    }
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);

    running.current = animate(from, to, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        if (!cancelled) window.scrollTo(0, v);
      },
      onComplete: () => {
        running.current = null;
        detach();
        if (!cancelled) land();
      },
    });
  };

  return (
    <Card className="p-3" testId="chapter-nav">
      <p className="mb-1.5 px-1.5 text-[11.5px] font-medium text-muted">この章の内容</p>
      <ol>
        {sections.map((s, i) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => goTo(s.id)}
                aria-current={on ? 'true' : undefined}
                data-testid={on ? 'chapter-nav-current' : undefined}
                className="relative flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left"
              >
                {/* 現在地は 1 つの帯を使い回して滑らせる */}
                {on && (
                  <motion.span
                    layoutId="chapter-nav-current"
                    transition={SLIDE}
                    className="absolute inset-0 rounded-md bg-accent-soft ring-1 ring-accent-line"
                  />
                )}
                <span className="tnum relative font-mono text-[10.5px] text-subtle">{i + 1}.</span>
                <span
                  className={`relative text-[12.5px] leading-snug ${
                    on ? 'font-medium text-accent' : 'text-muted hover:text-fg'
                  }`}
                >
                  {s.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
