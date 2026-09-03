import { Link, useParams } from 'react-router-dom';
import { getProblem, nextProblemId, prevProblemId } from '../data/problems';
import { LEVEL_COLOR, LEVEL_LABEL, PHASE_BY_ID } from '../data/phases';
import Markdown from '../components/Markdown';
import Badge from '../components/Badge';
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
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <p className="text-slate-300">問題 {id} が見つかりません。</p>
        <Link to="/problems" className="mt-3 inline-block text-sky-400 underline">
          問題一覧へ戻る
        </Link>
      </div>
    );
  }

  const phase = PHASE_BY_ID.get(problem.phase);
  const prev = prevProblemId(problem.id);
  const next = nextProblemId(problem.id);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/problems?phase=${problem.phase}`} className="text-xs text-sky-400 hover:underline">
            Phase {problem.phase}. {phase?.name}
          </Link>
          <Badge className={LEVEL_COLOR[problem.level]}>{LEVEL_LABEL[problem.level]}</Badge>
          {isSolved(problem.id) && (
            <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">正解済み</Badge>
          )}
          <span className="ml-auto font-mono text-[11px] text-slate-600">{problem.id}</span>
        </div>
        <h1 className="text-xl font-bold text-white">{problem.title}</h1>
        <div className="flex flex-wrap gap-1.5">
          {problem.tags.map((t) => (
            <Badge key={t} className="border-slate-700 bg-slate-800 text-slate-400">
              #{t}
            </Badge>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <Markdown>{problem.prompt_md}</Markdown>
      </div>

      {problem.type === 'sql_query' && <SqlWorkbench key={problem.id} problem={problem} />}
      {problem.type === 'multiple_choice' && <ChoiceQuestion key={problem.id} problem={problem} />}
      {problem.type === 'written' && <WrittenQuestion key={problem.id} problem={problem} />}

      <nav className="flex items-center justify-between border-t border-slate-800 pt-4">
        {prev ? (
          <Link to={`/problems/${prev}`} className="text-sm text-slate-400 hover:text-sky-300">
            ← 前の問題
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/problems/${next}`} className="text-sm text-slate-400 hover:text-sky-300">
            次の問題 →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
