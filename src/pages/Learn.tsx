import { Link } from 'react-router-dom';
import { LESSONS } from '../data/lessons';
import { PHASE_BY_ID } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import { Card, Meter } from '../components/ui';
import { IconBook, IconChevronRight } from '../components/icons';

/** 教材の目次。フェーズ = 章に対応する */
export default function Learn() {
  const { phaseStats } = useProgress();

  return (
    <div className="space-y-5">
      <div className="max-w-prose-wide">
        <h1 className="text-lg font-semibold tracking-tight text-fg">教材</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          各章を読んでから、その章の問題を解く形で進められる。問題ページの先頭にも、その問題に対応する節が出る。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {LESSONS.map((lesson) => {
          const phase = PHASE_BY_ID.get(lesson.phase);
          const stat = phaseStats[lesson.phase] ?? { solved: 0, total: 0 };
          return (
            <Link key={lesson.phase} to={`/learn/${lesson.phase}`} className="group">
              <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-line-strong group-hover:bg-raised">
                <div className="flex items-center gap-2">
                  <span className="tnum font-mono text-[11px] text-subtle">
                    {String(lesson.phase).padStart(2, '0')}
                  </span>
                  <h2 className="text-[13.5px] font-semibold tracking-tight text-fg">
                    {lesson.title}
                  </h2>
                  <IconChevronRight
                    size={14}
                    className="ml-auto text-subtle transition-colors group-hover:text-accent"
                  />
                </div>
                <p className="mt-1.5 mb-3 text-[12px] leading-relaxed text-muted">{lesson.lead}</p>
                <ul className="mb-4 space-y-0.5">
                  {lesson.sections.map((s) => (
                    <li key={s.id} className="flex items-start gap-1.5 text-[11.5px] text-subtle">
                      <IconBook size={11} className="mt-0.5 shrink-0" />
                      {s.title}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center gap-3">
                  <Meter value={stat.solved} total={stat.total} />
                  <span className="tnum shrink-0 text-[11.5px] text-subtle">
                    {stat.solved}/{stat.total}
                  </span>
                </div>
                <p className="sr-only">{phase?.summary}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
