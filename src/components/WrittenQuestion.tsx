import { useState } from 'react';
import type { WrittenProblem } from '../types';
import Markdown from './Markdown';
import { useProgress } from '../storage/progressContext';

const draftKey = (id: string) => `sql-training:draft:${id}`;

export default function WrittenQuestion({ problem }: { problem: WrittenProblem }) {
  const { rate, progress } = useProgress();
  const [text, setText] = useState<string>(() => {
    try {
      return localStorage.getItem(draftKey(problem.id)) ?? '';
    } catch {
      return '';
    }
  });
  const [submitted, setSubmitted] = useState(false);
  const rating = progress.solvedProblems[problem.id]?.selfRating;

  const save = (value: string) => {
    setText(value);
    try {
      localStorage.setItem(draftKey(problem.id), value);
    } catch {
      /* 保存できなくても続行 */
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <header className="border-b border-slate-700 px-3 py-2 text-xs font-semibold tracking-wide text-slate-400">
          あなたの解答（入力内容はブラウザに自動保存されます）
        </header>
        <textarea
          value={text}
          onChange={(e) => save(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder={'例：\n注文(注文ID, 注文日, 顧客ID)\n注文明細(注文ID, 行番号, 商品ID, 数量)\n...'}
          className="w-full resize-y bg-slate-950 p-3 font-mono text-[13px] leading-relaxed text-slate-100 outline-none"
        />
      </div>

      <button
        onClick={() => setSubmitted(true)}
        disabled={submitted}
        className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 disabled:opacity-40"
      >
        ANSWER（模範解答と採点観点を表示）
      </button>

      {submitted && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">模範解答</p>
            <Markdown>{problem.sample_answer_md}</Markdown>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-amber-300">自己採点の観点</p>
            <Markdown>{problem.grading_note_md}</Markdown>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-sky-300">解説</p>
            <Markdown>{problem.explanation_md}</Markdown>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <span className="text-sm text-slate-300">自己採点：</span>
            <button
              onClick={() => rate(problem.id, 'understood')}
              className={`rounded-lg border px-4 py-2 text-sm ${
                rating === 'understood'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-600 text-slate-300 hover:bg-slate-800'
              }`}
            >
              理解できた（正解扱い）
            </button>
            <button
              onClick={() => rate(problem.id, 'review')}
              className={`rounded-lg border px-4 py-2 text-sm ${
                rating === 'review'
                  ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                  : 'border-slate-600 text-slate-300 hover:bg-slate-800'
              }`}
            >
              要復習
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
