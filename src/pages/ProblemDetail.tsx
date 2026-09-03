import { Link, useParams } from 'react-router-dom';
import { getProblem, nextProblemId, prevProblemId } from '../data/problems';
import { LEVEL_FULL_LABEL, LEVEL_TONE, PHASE_BY_ID } from '../data/phases';
import Markdown from '../components/Markdown';
import { Card, Tag } from '../components/ui';
import { IconCheck, IconChevronLeft, IconChevronRight } from '../components/icons';
import SqlWorkbench from '../components/SqlWorkbench';
import ChoiceQuestion from '../components/ChoiceQuestion';
import WrittenQuestion from '../components/WrittenQuestion';
import { useProgress } from '../storage/progressContext';

export default function ProblemDetail() {
  const { id = '' } = useParams();
  const problem = getProblem(id);
  const { isSolved } = useProgress();

  if (!problem) {
    return (
      <Card className="p-6">
        <p className="text-[13.5px] text-fg">問題 {id} が見つかりません。</p>
        <Link to="/problems" className="mt-3 inline-block text-[13px] text-accent underline">
          問題一覧へ戻る
        </Link>
      </Card>
    );
  }

  const phase = PHASE_BY_ID.get(problem.phase);
  const prev = prevProblemId(problem.id);
  const next = nextProblemId(problem.id);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Link to="/problems" className="text-muted hover:text-fg">
            問題
          </Link>
          <span className="text-subtle">/</span>
          <Link to={`/problems?phase=${problem.phase}`} className="text-muted hover:text-fg">
            {phase?.name}
          </Link>
          <span className="ml-auto font-mono text-[10.5px] text-subtle">{problem.id}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-[19px] leading-snug font-semibold tracking-tight text-fg">
            {problem.title}
          </h1>
          <Tag tone={LEVEL_TONE[problem.level]}>{LEVEL_FULL_LABEL[problem.level]}</Tag>
          {isSolved(problem.id) && (
            <Tag tone="success">
              <IconCheck size={11} />
              正解済み
            </Tag>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {problem.tags.map((t) => (
            <Link
              key={t}
              to={`/problems?tag=${encodeURIComponent(t)}`}
              className="text-[11.5px] text-subtle hover:text-accent"
            >
              #{t}
            </Link>
          ))}
        </div>
      </div>

      <Card className="p-5">
        <Markdown>{problem.prompt_md}</Markdown>
      </Card>

      {problem.type === 'sql_query' && <SqlWorkbench key={problem.id} problem={problem} />}
      {problem.type === 'multiple_choice' && <ChoiceQuestion key={problem.id} problem={problem} />}
      {problem.type === 'written' && <WrittenQuestion key={problem.id} problem={problem} />}

      <nav className="flex items-center justify-between border-t border-line pt-4">
        {prev ? (
          <Link
            to={`/problems/${prev}`}
            className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"
          >
            <IconChevronLeft size={14} />
            前の問題
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={`/problems/${next}`}
            className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"
          >
            次の問題
            <IconChevronRight size={14} />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
