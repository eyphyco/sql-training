import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { LESSONS } from '../data/lessons';
import { PHASE_BY_ID } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import { Card, Meter } from '../components/ui';
import CurriculumProgress from '../components/CurriculumProgress';
import { IconBook, IconChevronRight } from '../components/icons';
import { RISE, SLIDE, STAGGER } from '../components/motion';
import type { Lesson } from '../types';

/*
  節の並びを「重なった紙」に見立てて、指したときだけ少しずらす。

  ずらし方は Rare UI「Folder」（MIT / rareui.com）から。あの札は
  フォルダから紙が扇状に飛び出す大きな飾りだが、ここに丸ごと持ち込むと
  他の画面から浮く。動きの作り（跳ねるバネ + 1 枚ずつの遅れ）だけを借りて、
  中身は隠さずそのまま出しておく。
*/
const PAPER_SPRING = { type: 'spring', stiffness: 120, damping: 13 } as const;

const FAN = {
  rest: (i: number) => ({ x: 0, transition: { ...PAPER_SPRING, delay: i * 0.015 } }),
  fanned: (i: number) => ({ x: 3 + i * 2, transition: { ...PAPER_SPRING, delay: i * 0.03 } }),
};

function ChapterCard({ lesson }: { lesson: Lesson }) {
  const { phaseStats } = useProgress();
  const [hover, setHover] = useState(false);
  const phase = PHASE_BY_ID.get(lesson.phase);
  const stat = phaseStats[lesson.phase] ?? { solved: 0, total: 0 };

  return (
    <motion.div variants={RISE} whileHover={{ y: -2 }} transition={SLIDE} className="h-full">
      <Link
        to={`/learn/${lesson.phase}`}
        data-testid="chapter-card"
        className="group block h-full"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-line-strong group-hover:bg-raised">
          <div className="flex items-center gap-2">
            <span className="tnum font-mono text-tiny text-subtle">
              {String(lesson.phase).padStart(2, '0')}
            </span>
            <h2 className="text-body font-semibold tracking-tight text-fg">{lesson.title}</h2>
            <motion.span
              animate={{ x: hover ? 2 : 0 }}
              transition={SLIDE}
              className="ml-auto flex text-subtle group-hover:text-accent"
            >
              <IconChevronRight size={14} />
            </motion.span>
          </div>
          <p className="mt-1.5 mb-3 text-small leading-relaxed text-muted">{lesson.lead}</p>
          <ul className="mb-4 space-y-0.5">
            {lesson.sections.map((s, i) => (
              <motion.li
                key={s.id}
                custom={i}
                variants={FAN}
                animate={hover ? 'fanned' : 'rest'}
                className="flex items-start gap-1.5 text-tiny text-subtle"
              >
                <IconBook size={11} className="mt-0.5 shrink-0" />
                {s.title}
              </motion.li>
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
}

/** 教材の目次。フェーズ = 章に対応する */
export default function Learn() {
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
        {LESSONS.map((lesson) => (
          <ChapterCard key={lesson.phase} lesson={lesson} />
        ))}
      </motion.div>
    </div>
  );
}
