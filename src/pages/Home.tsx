import { Link } from 'react-router-dom';
import { PHASES } from '../data/phases';
import { PROBLEM_BY_ID, PROBLEM_METAS } from '../data/problems';
import { useProgress } from '../storage/progressContext';
import Badge from '../components/Badge';

function Bar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Home() {
  const { phaseStats, progress } = useProgress();
  const totalSolved = Object.values(progress.solvedProblems).filter((r) => r.solved).length;
  const total = PROBLEM_METAS.length;
  const recent = progress.history.slice(0, 12);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
        <h1 className="text-2xl font-bold text-white">SQL Training</h1>
        <p className="mt-1 text-sm text-slate-400">
          集計・ウィンドウ関数・結合・実行計画・設計を、書いて動かして身につける。
          ブラウザ内の DuckDB で完結します。
        </p>
        <div className="mt-5 flex items-end gap-4">
          <div>
            <span className="font-mono text-4xl font-bold text-emerald-400">{totalSolved}</span>
            <span className="ml-1 font-mono text-lg text-slate-500">/ {total}</span>
          </div>
          <div className="flex-1 pb-2">
            <Bar value={totalSolved} total={total} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-400">フェーズ別の習熟度</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {PHASES.map((phase) => {
            const stat = phaseStats[phase.id] ?? { solved: 0, total: 0 };
            return (
              <Link
                key={phase.id}
                to={`/problems?phase=${phase.id}`}
                className="group rounded-xl border border-slate-700 bg-slate-900 p-4 transition hover:border-sky-500/60 hover:bg-slate-800/60"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">Phase {phase.id}</span>
                  <h3 className="font-semibold text-slate-100 group-hover:text-sky-300">{phase.name}</h3>
                  <Badge
                    className={
                      phase.focus === '弱点対応'
                        ? 'ml-auto border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : 'ml-auto border-slate-600 bg-slate-800 text-slate-400'
                    }
                  >
                    {phase.focus}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{phase.summary}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Bar value={stat.solved} total={stat.total} />
                  <span className="shrink-0 font-mono text-xs text-slate-400">
                    {stat.solved} / {stat.total}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-400">直近の学習履歴</h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-500">
            まだ解答履歴がありません。
            <Link to="/problems" className="ml-1 text-sky-400 underline">
              問題一覧
            </Link>
            から始めましょう。
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            {recent.map((h, i) => {
              const p = PROBLEM_BY_ID.get(h.problemId);
              return (
                <li key={`${h.problemId}-${h.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={h.correct ? 'text-emerald-400' : 'text-rose-400'}>
                    {h.correct ? '◯' : '×'}
                  </span>
                  <Link to={`/problems/${h.problemId}`} className="flex-1 truncate text-slate-200 hover:text-sky-300">
                    {p?.title ?? h.problemId}
                  </Link>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500">
                    {new Date(h.at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
