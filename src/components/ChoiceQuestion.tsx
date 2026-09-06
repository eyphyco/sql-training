import { useState } from 'react';
import { motion } from 'motion/react';
import type { MultipleChoiceProblem } from '../types';
import Markdown from './Markdown';
import { Button, Card, LiveMessage } from './ui';
import { IconBook, IconBulb, IconCheck, IconX } from './icons';
import { useProgress } from '../storage/progressContext';
import { RISE, SLIDE } from './motion';

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
      <LiveMessage>
        {judged
          ? `${correct ? '正解' : '不正解'}。正解は ${problem.correct_option_id.toUpperCase()}`
          : ''}
      </LiveMessage>
      <div className="space-y-2">
        {problem.options.map((opt) => {
          const isPicked = selected === opt.id;
          const isAnswer = opt.id === problem.correct_option_id;
          let tone = 'glass-edge border-line bg-surface hover:border-line-strong hover:bg-raised';
          let markTone = 'border-line text-subtle';
          if (judged && isAnswer) {
            tone = 'border-success-line bg-success-soft';
            markTone = 'border-success text-success';
          } else if (judged && isPicked) {
            tone = 'border-danger-line bg-danger-soft';
            markTone = 'border-danger text-danger';
          } else if (isPicked) {
            tone = 'border-accent-line bg-accent-soft';
            markTone = 'border-accent text-accent';
          }
          // 採点したら、正解を一拍持ち上げ、外した選択肢は小さく首を振る。
          // 色が変わるだけだと、どれが正解だったのかを探し直すことになる
          const wrongPick = judged && isPicked && !isAnswer;
          return (
            <motion.button
              key={opt.id}
              onClick={() => !judged && setSelected(opt.id)}
              disabled={judged}
              data-testid="choice-option"
              animate={{
                y: judged && isAnswer ? -3 : 0,
                x: wrongPick ? [0, -3, 3, -2, 2, 0] : 0,
              }}
              transition={wrongPick ? { duration: 0.3, ease: 'easeInOut' } : SLIDE}
              className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors ${tone}`}
            >
              <motion.span
                animate={{ scale: judged && isAnswer ? [1, 1.25, 1] : 1 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-micro ${markTone}`}
              >
                {judged && isAnswer ? (
                  <IconCheck size={11} />
                ) : judged && isPicked ? (
                  <IconX size={11} />
                ) : (
                  opt.id.toUpperCase()
                )}
              </motion.span>
              <span className="text-body leading-relaxed text-fg">{opt.text}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          size="lg"
          variant="primary"
          onClick={() => {
            if (!selected || judged) return;
            setJudged(true);
            attempt(problem.id, selected === problem.correct_option_id);
          }}
          disabled={!selected || judged}
        >
          ANSWER
        </Button>
        {judged && (
          <Button
            size="lg"
            onClick={() => {
              setJudged(false);
              setSelected(null);
            }}
          >
            もう一度解く
          </Button>
        )}
        {hints.length > 0 && hintLevel < hints.length && !judged && (
          <Button size="lg" onClick={() => setHintLevel((n) => n + 1)}>
            <IconBulb size={14} className="text-warning" />
            ヒント
            <span className="tnum text-tiny text-subtle">
              {hintLevel} / {hints.length}
            </span>
          </Button>
        )}
        <span className="tnum ml-auto text-tiny text-subtle">挑戦 {attempts} 回</span>
      </div>

      {hintLevel > 0 && !judged && (
        <div className="space-y-2">
          {hints.slice(0, hintLevel).map((h, i) => (
            <Card key={i} className="border-warning-line bg-warning-soft p-4">
              <p className="mb-1 flex items-center gap-1.5 text-tiny font-semibold text-warning">
                <IconBulb size={13} />
                ヒント {i + 1}
              </p>
              <Markdown>{h}</Markdown>
            </Card>
          ))}
        </div>
      )}

      {judged && (
        <>
          <motion.div
            variants={RISE}
            initial="hidden"
            animate="shown"
            className={`flex items-center gap-2 rounded-lg border p-4 text-body font-semibold ${
              correct
                ? 'border-success-line bg-success-soft text-success'
                : 'border-danger-line bg-danger-soft text-danger'
            }`}
          >
            {correct ? <IconCheck size={15} /> : <IconX size={15} />}
            {correct ? '正解' : `不正解。正解は ${problem.correct_option_id.toUpperCase()} です。`}
          </motion.div>
          <Card className="overflow-hidden">
            <p className="flex items-center gap-1.5 border-b border-line bg-raised px-4 py-2 text-tiny font-medium text-muted">
              <IconBook size={13} />
              解説
            </p>
            <div className="p-5">
              <Markdown>{problem.explanation_md}</Markdown>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
