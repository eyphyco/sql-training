import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { EASE_OUT } from './motion';
import { HEADER_OFFSET, pickActiveSection, scrollDuration } from './reading';

/*
  章を読むときの「いまどこか」と「そこへ送る」。

  目次（ChapterNav）と右端の節目盛り（SectionRail）が同じものを使う。
  片方だけ直して追従がずれる、という壊れ方をしないよう 1 か所にまとめた。
*/

/** いま画面で読んでいる節を返す。判定そのものは reading.ts に置いてある */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      const tops = ids.map(
        (id) => document.getElementById(id)?.getBoundingClientRect().top ?? null,
      );
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

export interface ReadingScroll {
  /** 指定位置まで送る */
  scrollTo: (to: number, land?: () => void) => void;
  /** 節の先頭まで送り、そこにキーボードの focus を移す */
  goTo: (id: string) => void;
}

/**
 * 節への移動。
 *
 * HashRouter なので href="#節id" は使えない。URL のハッシュはルート
 * そのもの（#/learn/1）で、書き換えると別ページへ飛んでしまう。
 * そのため位置合わせは JS で行う。
 */
export function useSmoothScroll(): ReadingScroll {
  const reduced = useReducedMotion();
  const running = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => running.current?.stop(), []);

  const scrollTo = (to: number, land?: () => void) => {
    running.current?.stop();

    if (reduced) {
      window.scrollTo(0, to);
      land?.();
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
        if (!cancelled) land?.();
      },
    });
  };

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    scrollTo(Math.max(0, el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET), () => {
      // 着いたあと、キーボード操作の続きがその節から始まるようにする
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    });
  };

  return { scrollTo, goTo };
}
