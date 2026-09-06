import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { LESSONS } from '../data/lessons';
import { PHASE_BY_ID } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import { Card, Meter } from '../components/ui';
import CurriculumProgress from '../components/CurriculumProgress';
import { IconBook, IconChevronRight } from '../components/icons';
import { RISE, SLIDE, STAGGER } from '../components/motion';

/** 教材の目次。フェーズ = 章に対応する */
export default function Learn() {
  const { phaseStats } = useProgress();

  return (
    <div className="space-y-5">
      <div className="max-w-prose-wide">
        <h1 className="text-lg font-semibold tracking-tight text-fg">教材</h1>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          各章を読んでから、その章の問題を解く形で進められる。問題ページの先頭にも、その問題に対応する節が出る。
        </p>
      </div>

      <CurriculumProgress />

      {/* 章の札は上から順に浮かせて出し、指した札だけ 2px 持ち上げる */}
      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="shown"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {LESSONS.map((lesson) => {
          const phase = PHASE_BY_ID.get(lesson.phase);
          const stat = phaseStats[lesson.phase] ?? { solved: 0, total: 0 };
          return (
            <motion.div
              key={lesson.phase}
              variants={RISE}
              whileHover={{ y: -2 }}
              transition={SLIDE}
              className="h-full"
            >
              <Link
                to={`/learn/${lesson.phase}`}
                data-testid="chapter-card"
                className="group block h-full"
              >
                <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-line-strong group-hover:bg-raised">
                  <div className="flex items-center gap-2">
                    <span className="tnum font-mono text-tiny text-subtle">
                      {String(lesson.phase).padStart(2, '0')}
                    </span>
                    <h2 className="text-body font-semibold tracking-tight text-fg">
                      {lesson.title}
                    </h2>
                    <IconChevronRight
                      size={14}
                      className="ml-auto text-subtle transition-colors group-hover:text-accent"
                    />
                  </div>
                  <p className="mt-1.5 mb-3 text-small leading-relaxed text-muted">{lesson.lead}</p>
                  <ul className="mb-4 space-y-0.5">
                    {lesson.sections.map((s) => (
                      <li key={s.id} className="flex items-start gap-1.5 text-tiny text-subtle">
                        <IconBook size={11} className="mt-0.5 shrink-0" />
                        {s.title}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex items-center gap-3">
                    <Meter value={stat.solved} total={stat.total} />
                    <span className="tnum shrink-0 text-tiny text-subtle">
                      {stat.solved}/{stat.total}
                    </span>
                  </div>
                  <p className="sr-only">{phase?.summary}</p>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
