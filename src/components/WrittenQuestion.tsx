import { useState } from 'react';
import type { WrittenProblem } from '../types';
import Markdown from './Markdown';
import { Button, Card } from './ui';
import { IconBook, IconBulb, IconCheck } from './icons';
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
  const [hintLevel, setHintLevel] = useState(0);
  const hints = problem.hints_md ?? [];
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
      <Card className="overflow-hidden">
        <header className="flex h-9 items-center justify-between border-b border-line bg-raised px-3">
          <span className="text-[11.5px] font-medium text-muted">あなたの解答</span>
          <span className="text-[11px] text-subtle">入力内容はこのブラウザに自動保存されます</span>
        </header>
        <textarea
          value={text}
          onChange={(e) => save(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder={'例：\n注文(注文番号, 注文日, 顧客番号)\n注文明細(注文番号, 明細番号, 商品番号, 数量, 販売単価)\n…'}
          className="w-full resize-y bg-sunken p-4 font-mono text-[13px] leading-relaxed text-fg placeholder:text-subtle focus:outline-none"
        />
      </Card>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="lg" variant="primary" onClick={() => setSubmitted(true)} disabled={submitted}>
          ANSWER
          <span className="text-[11px] font-normal opacity-75">模範解答と採点観点を表示</span>
        </Button>
        {hints.length > 0 && hintLevel < hints.length && !submitted && (
          <Button size="lg" onClick={() => setHintLevel((n) => n + 1)}>
            <IconBulb size={14} className="text-warning" />
            ヒント
            <span className="tnum text-[11px] text-subtle">
              {hintLevel} / {hints.length}
            </span>
          </Button>
        )}
      </div>

      {hintLevel > 0 && !submitted && (
        <div className="space-y-2">
          {hints.slice(0, hintLevel).map((h, i) => (
            <Card key={i} className="border-warning-line bg-warning-soft p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-warning">
                <IconBulb size={13} />
                ヒント {i + 1}
              </p>
              <Markdown>{h}</Markdown>
            </Card>
          ))}
        </div>
      )}

      {submitted && (
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <p className="border-b border-line bg-raised px-4 py-2 text-[11.5px] font-medium text-muted">
              模範解答
            </p>
            <div className="p-5">
              <Markdown>{problem.sample_answer_md}</Markdown>
            </div>
          </Card>
          <Card className="overflow-hidden border-warning-line">
            <p className="border-b border-warning-line bg-warning-soft px-4 py-2 text-[11.5px] font-medium text-warning">
              自己採点の観点
            </p>
            <div className="p-5">
              <Markdown>{problem.grading_note_md}</Markdown>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <p className="flex items-center gap-1.5 border-b border-line bg-raised px-4 py-2 text-[11.5px] font-medium text-muted">
              <IconBook size={13} />
              解説
            </p>
            <div className="p-5">
              <Markdown>{problem.explanation_md}</Markdown>
            </div>
          </Card>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-[13px] text-muted">自己採点</span>
            <Button
              onClick={() => rate(problem.id, 'understood')}
              className={rating === 'understood' ? 'border-success-line bg-success-soft text-success' : ''}
            >
              <IconCheck size={13} />
              理解できた
            </Button>
            <Button
              onClick={() => rate(problem.id, 'review')}
              className={rating === 'review' ? 'border-warning-line bg-warning-soft text-warning' : ''}
            >
              要復習
            </Button>
            {rating && (
              <span className="text-[11.5px] text-subtle">
                {rating === 'understood' ? '正解として記録しました' : '要復習として記録しました'}
              </span>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
