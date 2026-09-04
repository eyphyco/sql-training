import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Card } from "./ui";
import { SLIDE } from "./motion";
import type { LessonSection } from "../types";

/** 見出しがこの高さより上に来たら「その節を読んでいる」とみなす */
const READING_LINE = 140;

/**
 * いま画面で読んでいる節を返す。
 * 判定は「READING_LINE より上に出た最後の節」。最下部まで来たときは
 * 最終節にする（短い節が一度も選ばれないまま終わるのを防ぐ）。
 */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= READING_LINE) current = id;
      }
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8
      ) {
        current = ids[ids.length - 1] ?? current;
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    // スクロールは 1 フレームに 1 回だけ読む
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);
  return active;
}

/** 章の目次。読んでいる節に帯が滑って追従する */
export default function ChapterNav({
  sections,
}: {
  sections: LessonSection[];
}) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(ids);

  return (
    <Card className="p-3" testId="chapter-nav">
      <p className="mb-1.5 px-1.5 text-[11.5px] font-medium text-muted">
        この章の内容
      </p>
      <ol>
        {sections.map((s, i) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={on ? "true" : undefined}
                data-testid={on ? "chapter-nav-current" : undefined}
                className="relative flex items-baseline gap-2 rounded-md px-1.5 py-1.5"
              >
                {/* 現在地は 1 つの帯を使い回して滑らせる */}
                {on && (
                  <motion.span
                    layoutId="chapter-nav-current"
                    transition={SLIDE}
                    className="absolute inset-0 rounded-md bg-accent-soft ring-1 ring-accent-line"
                  />
                )}
                <span className="tnum relative font-mono text-[10.5px] text-subtle">
                  {i + 1}.
                </span>
                <span
                  className={`relative text-[12.5px] leading-snug ${
                    on ? "font-medium text-accent" : "text-muted hover:text-fg"
                  }`}
                >
                  {s.title}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
