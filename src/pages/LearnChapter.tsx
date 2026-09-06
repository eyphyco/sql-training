import { Link, useParams } from 'react-router-dom';
import { LESSON_BY_PHASE } from '../data/lessons';
import { META_BY_ID } from '../data/problems';
import { LEVEL_LABEL, LEVEL_TONE } from '../data/phases';
import { useProgress } from '../storage/progressContext';
import Markdown from '../components/Markdown';
import { Card, Tag } from '../components/ui';
import CurriculumProgress from '../components/CurriculumProgress';
import ReadingProgress from '../components/ReadingProgress';
import ChapterNav from '../components/ChapterNav';
import { IconCheck, IconChevronLeft, IconChevronRight } from '../components/icons';
import type { PhaseId } from '../types';

/** 1 章ぶんの教材。節ごとに、その節を読んだうえで解く問題への導線を置く */
export default function LearnChapter() {
  const { phaseId = '' } = useParams();
  const lesson = LESSON_BY_PHASE.get(Number(phaseId) as PhaseId);
  const { isSolved } = useProgress();

  if (!lesson) {
    return (
      <Card className="max-w-prose-wide p-6">
        <p className="text-[13.5px] text-fg">教材 {phaseId} が見つかりません。</p>
        <Link to="/learn" className="mt-3 inline-block text-[13px] text-accent underline">
          教材の目次へ戻る
        </Link>
      </Card>
    );
  }

  const prev = LESSON_BY_PHASE.get((lesson.phase - 1) as PhaseId);
  const next = LESSON_BY_PHASE.get((lesson.phase + 1) as PhaseId);

  return (
    /*
      問題ページと同じ形。左に目次、右に読む列（最大 62rem）。
      目次は貼り付けて追従させるので、読んでいる節が常に見える。
      狭い画面では 1 列になり、目次が先頭に来る（今までと同じ並び）。
    */
    <div className="grid gap-6 lg:grid-cols-[minmax(14rem,17rem)_minmax(0,62rem)]">
      <ReadingProgress />

      <aside className="lg:col-start-1 lg:row-start-1">
        <div className="lg:sticky lg:top-20">
          <ChapterNav sections={lesson.sections} phase={lesson.phase} />
        </div>
      </aside>

      <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-start-1">
        <div>
          <div className="flex items-center gap-2 text-[12px]">
            <Link to="/learn" className="text-muted hover:text-fg">
              教材
            </Link>
            <span className="text-subtle">/</span>
            <span className="tnum font-mono text-[10.5px] text-subtle">第 {lesson.phase} 章</span>
          </div>
          <h1 className="mt-2 text-[19px] leading-snug font-semibold tracking-tight text-fg">
            {lesson.title}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{lesson.lead}</p>
        </div>

        {/* この章が全体のどこにあたるかを、進捗と一緒に示す */}
        <CurriculumProgress activePhase={lesson.phase} />

        {lesson.sections.map((s) => (
          <Card key={s.id} id={s.id} as="section" className="scroll-mt-20 overflow-hidden">
            <div className="p-5">
              <h2 className="mb-3 text-[16px] font-semibold tracking-tight text-fg">{s.title}</h2>
              <Markdown>{s.body_md}</Markdown>
            </div>

            <div className="border-t border-line bg-raised px-5 py-3">
              <p className="mb-2 text-[11.5px] font-medium text-muted">この節で解く問題</p>
              <ul className="space-y-1">
                {s.problems.map((id) => {
                  const p = META_BY_ID.get(id);
                  if (!p) return null;
                  return (
                    <li key={id}>
                      <Link
                        to={`/problems/${id}`}
                        className="group flex items-center gap-2 text-[13px]"
                      >
                        <span className={isSolved(id) ? 'text-success' : 'text-subtle/50'}>
                          <IconCheck size={12} />
                        </span>
                        <span className="min-w-0 truncate text-fg group-hover:text-accent">
                          {p.title}
                        </span>
                        <Tag className="ml-auto shrink-0" tone={LEVEL_TONE[p.level]}>
                          {LEVEL_LABEL[p.level]}
                        </Tag>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        ))}

        <nav className="flex items-center justify-between border-t border-line pt-4">
          {prev ? (
            <Link
              to={`/learn/${prev.phase}`}
              className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"
            >
              <IconChevronLeft size={14} />
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to={`/learn/${next.phase}`}
              className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"
            >
              {next.title}
              <IconChevronRight size={14} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </div>
  );
}
