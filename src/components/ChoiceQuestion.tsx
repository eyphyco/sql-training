import { useState } from 'react';
import type { MultipleChoiceProblem } from '../types';
import Markdown from './Markdown';
import { useProgress } from '../storage/progressContext';

export default function ChoiceQuestion({ problem }: { problem: MultipleChoiceProblem }) {
  const { attempt, progress } = useProgress();
  const [selected, setSelected] = useState<string | null>(null);
  const [judged, setJudged] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const hints = problem.hints_md ?? [];
  const attempts = progress.solvedProblems[problem.id]?.attempts ?? 0;
  const correct = judged && selected === problem.correct_option_id;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {problem.options.map((opt) => {
          const isPicked = selected === opt.id;
          const isAnswer = opt.id === problem.correct_option_id;
          let tone = 'border-slate-700 bg-slate-900 hover:border-slate-500';
          if (judged && isAnswer) tone = 'border-emerald-500/60 bg-emerald-500/10';
          else if (judged && isPicked) tone = 'border-rose-500/60 bg-rose-500/10';
          else if (isPicked) tone = 'border-sky-500/60 bg-sky-500/10';
          return (
            <button
              key={opt.id}
              onClick={() => !judged && setSelected(opt.id)}
              disabled={judged}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${tone}`}
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-600 font-mono text-xs text-slate-300">
                {opt.id.toUpperCase()}
              </span>
              <span className="text-sm leading-relaxed text-slate-200">{opt.text}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            if (!selected || judged) return;
            setJudged(true);
            attempt(problem.id, selected === problem.correct_option_id);
          }}
          disabled={!selected || judged}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 disabled:opacity-40"
        >
          ANSWER
        </button>
        {judged && (
          <button
            onClick={() => {
              setJudged(false);
              setSelected(null);
            }}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            もう一度解く
          </button>
        )}
        {hints.length > 0 && hintLevel < hints.length && !judged && (
          <button
            onClick={() => setHintLevel((n) => n + 1)}
            className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/10"
          >
            ヒントを見る（{hintLevel} / {hints.length}）
          </button>
        )}
        <span className="text-xs text-slate-500">挑戦回数: {attempts}</span>
      </div>

      {hintLevel > 0 && !judged && (
        <div className="space-y-2">
          {hints.slice(0, hintLevel).map((h, i) => (
            <div key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="mb-1 text-xs font-semibold text-amber-300">ヒント {i + 1}</p>
              <Markdown>{h}</Markdown>
            </div>
          ))}
        </div>
      )}

      {judged && (
        <>
          <div
            className={`rounded-xl border p-4 font-semibold ${
              correct
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {correct
              ? '◯ 正解！'
              : `× 不正解。正解は ${problem.correct_option_id.toUpperCase()} です。`}
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-sky-300">解説</p>
            <Markdown>{problem.explanation_md}</Markdown>
          </div>
        </>
      )}
    </div>
  );
}
