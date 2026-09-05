import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PHASES } from '../data/phases';
import { PROBLEM_BY_ID, PROBLEM_METAS } from '../data/problems';
import { useProgress } from '../storage/progressContext';
import { Button, Card, Meter, SectionTitle, Tag } from '../components/ui';
import { IconCheck, IconChevronRight, IconX } from '../components/icons';
import type { ProblemType } from '../types';

const TYPE_LABEL: Record<ProblemType, string> = {
  sql_query: 'SQL実行',
  multiple_choice: '選択式',
  written: '記述式',
};

export default function Home() {
  const { phaseStats, progress, isSolved } = useProgress();

  const totalSolved = Object.values(progress.solvedProblems).filter((r) => r.solved).length;
  const total = PROBLEM_METAS.length;
  const recent = progress.history.slice(0, 8);

  const next = useMemo(() => PROBLEM_METAS.find((p) => !isSolved(p.id)), [isSolved]);

  const byType = useMemo(() => {
    const acc: Record<string, { solved: number; total: number }> = {};
    for (const p of PROBLEM_METAS) {
      acc[p.type] ??= { solved: 0, total: 0 };
      acc[p.type].total += 1;
      if (isSolved(p.id)) acc[p.type].solved += 1;
    }
    return acc;
  }, [isSolved]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] xl:gap-10 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-8">
        {/* 進捗の概観 */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-6 p-5">
            <div className="min-w-[14rem] flex-1">
              <p className="text-[11.5px] font-medium tracking-tight text-muted">学習の進捗</p>
              <div className="mt-2 mb-3 flex items-baseline gap-1.5">
                <span className="tnum text-[2.5rem] leading-none font-semibold tracking-tight text-fg">
                  {totalSolved}
                </span>
                <span className="tnum text-[15px] text-subtle">/ {total} 問</span>
              </div>
              <Meter value={totalSolved} total={total} />
            </div>
            {next ? (
              <Link to={`/problems/${next.id}`}>
                <Button size="lg" variant="primary">
                  {totalSolved === 0 ? '最初の問題を解く' : '続きから解く'}
                  <IconChevronRight size={14} />
                </Button>
              </Link>
            ) : (
              <Tag tone="success">
                <IconCheck size={12} />
                全問正解
              </Tag>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-line border-t border-line bg-raised">
            {(Object.keys(TYPE_LABEL) as ProblemType[]).map((type) => {
              const s = byType[type] ?? { solved: 0, total: 0 };
              return (
                <div key={type} className="px-5 py-3">
                  <p className="text-[11px] text-muted">{TYPE_LABEL[type]}</p>
                  <p className="tnum mt-0.5 text-[15px] font-medium text-fg">
                    {s.solved}
                    <span className="text-[12px] text-subtle"> / {s.total}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* フェーズ */}
        <section>
          <SectionTitle
            right={
              <Link to="/problems" className="text-[12px] text-muted hover:text-fg">
                すべての問題 →
              </Link>
            }
          >
            カリキュラム
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PHASES.map((phase, i) => {
              const stat = phaseStats[phase.id] ?? { solved: 0, total: 0 };
              const done = stat.total > 0 && stat.solved === stat.total;
              return (
                <Link
                  key={phase.id}
                  to={`/problems?phase=${phase.id}`}
                  // 7 フェーズは列数で割り切れないので、最終カードを全幅にして収める
                  className={`group ${
                    phase.id === PHASES[PHASES.length - 1].id ? 'sm:col-span-2 xl:col-span-3' : ''
                  }`}
                >
                  <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-line-strong group-hover:bg-raised">
                    <div className="flex items-center gap-2">
                      <span className="tnum font-mono text-[11px] text-subtle">
                        {String(phase.id).padStart(2, '0')}
                      </span>
                      <h3 className="text-[13.5px] font-semibold tracking-tight text-fg">
                        {phase.name}
                      </h3>
                      {done && <IconCheck size={13} className="text-success" />}
                      {phase.focus === '弱点対応' && (
                        <Tag className="ml-auto" tone="accent">
                          弱点
                        </Tag>
                      )}
                    </div>
                    <p className="mt-1.5 mb-4 line-clamp-2 text-[12px] leading-relaxed text-muted">
                      {phase.summary}
                    </p>
                    <div className="mt-auto flex items-center gap-3">
                      {/* 上から順に伸ばして、7 本を一度に見比べられるようにする */}
                      <Meter value={stat.solved} total={stat.total} delay={0.05 + 0.04 * i} />
                      <span className="tnum shrink-0 text-[11.5px] text-subtle">
                        {stat.solved}/{stat.total}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* 学習の記録 */}
      <aside>
        <SectionTitle>学習の記録</SectionTitle>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[12px] leading-relaxed text-subtle">
            まだ記録がありません。
            <br />
            上のボタンから始めましょう。
          </p>
        ) : (
          <ol className="space-y-px">
            {recent.map((h, i) => {
              const p = PROBLEM_BY_ID.get(h.problemId);
              return (
                <li key={`${h.problemId}-${h.at}-${i}`}>
                  <Link
                    to={`/problems/${h.problemId}`}
                    className="flex items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-raised"
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${h.correct ? 'text-success' : 'text-subtle'}`}
                    >
                      {h.correct ? <IconCheck size={12} /> : <IconX size={12} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-fg">
                        {p?.title ?? h.problemId}
                      </span>
                      <span className="tnum text-[10.5px] text-subtle">
                        {new Date(h.at).toLocaleString('ja-JP', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </div>
  );
}
