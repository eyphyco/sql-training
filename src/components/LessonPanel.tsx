import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { PHASE_BY_SECTION, sectionsForProblem } from '../data/lessons';
import { readLessonOpen, writeLessonOpen } from '../storage/preferences';
import Markdown from './Markdown';
import { IconBook, IconChevronDown } from './icons';
import { COLLAPSE, SLIDE } from './motion';

/**
 * 問題を解く前に読む教材。開閉の状態は端末に覚えさせるので、
 * 一度たたむと以降の問題でもたたまれたままになる。
 */
export default function LessonPanel({ problemId }: { problemId: string }) {
  const sections = sectionsForProblem(problemId);
  const [open, setOpen] = useState(readLessonOpen);

  if (sections.length === 0) return null;

  const phase = PHASE_BY_SECTION.get(sections[0].id);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeLessonOpen(next);
  };

  return (
    <section
      data-testid="lesson"
      className="glass max-w-prose-wide overflow-hidden rounded-lg border border-line bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2">
        <IconBook size={14} className="shrink-0 text-accent" />
        <h2 className="text-small font-semibold tracking-tight text-fg">教材</h2>
        {/* たたんでいるときだけ、何が隠れているかを見出しに出す */}
        {!open && (
          <span className="truncate text-tiny text-subtle">
            {sections.map((s) => s.title).join(' / ')}
          </span>
        )}
        {phase && (
          <Link
            to={`/learn/${phase}`}
            className="ml-auto shrink-0 text-tiny text-muted hover:text-accent"
          >
            章を通して読む →
          </Link>
        )}
        <button
          onClick={toggle}
          aria-expanded={open}
          data-testid="lesson-toggle"
          className={`${phase ? '' : 'ml-auto'} flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-tiny text-muted hover:bg-surface hover:text-fg`}
        >
          {open ? 'たたむ' : '読む'}
          <motion.span animate={{ rotate: open ? 0 : -90 }} transition={SLIDE} className="flex">
            <IconChevronDown size={13} />
          </motion.span>
        </button>
      </header>

      {/* initial={false} で、最初の描画では開閉アニメーションを走らせない */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={COLLAPSE}
            className="overflow-hidden"
          >
            <div className="divide-y divide-line">
              {sections.map((s) => (
                <article key={s.id} className="p-5">
                  <h3 className="mb-2 text-lead font-semibold tracking-tight text-fg">{s.title}</h3>
                  <Markdown>{s.body_md}</Markdown>
                </article>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
