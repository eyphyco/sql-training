import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { SqlQueryProblem } from '../types';
import {
  connect,
  describeTables,
  explainQuery,
  resetEnvironment,
  runQuery,
} from '../engine/duckdb';
import type { QueryResult, TableSchema } from '../engine/duckdb';
import { checkPatterns, explainSqlError, judgeResultSet } from '../engine/judge';
import type { JudgeResult } from '../engine/judge';
import QueryEditor from './QueryEditor';
import ResultTable from './ResultTable';
import SchemaPanel from './SchemaPanel';
import Markdown from './Markdown';
import { useProgress } from '../storage/progressContext';

type RightTab = 'result' | 'schema' | 'plan';

interface LastRun {
  sql: string;
  result: QueryResult;
}

export default function SqlWorkbench({ problem }: { problem: SqlQueryProblem }) {
  const { attempt, progress } = useProgress();
  const connRef = useRef<AsyncDuckDBConnection | null>(null);

  const [status, setStatus] = useState<'booting' | 'ready' | 'error'>('booting');
  const [bootError, setBootError] = useState<string>('');
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const [sqlText, setSqlText] = useState(problem.starter_sql ?? '');
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [planText, setPlanText] = useState<string | null>(null);
  const [tab, setTab] = useState<RightTab>('schema');
  const [judgement, setJudgement] = useState<JudgeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const attempts = progress.solvedProblems[problem.id]?.attempts ?? 0;

  // 問題ごとに DuckDB の環境を作り直す
  useEffect(() => {
    let disposed = false;
    let conn: AsyncDuckDBConnection | null = null;
    (async () => {
      try {
        conn = await connect();
        if (disposed) {
          await conn.close();
          return;
        }
        connRef.current = conn;
        await resetEnvironment(conn, problem.schema_sql, problem.seed_data_sql);
        const tables = await describeTables(conn);
        if (disposed) return;
        setSchema(tables);
        setStatus('ready');
      } catch (e) {
        if (!disposed) {
          setBootError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      }
    })();
    return () => {
      disposed = true;
      const c = connRef.current;
      connRef.current = null;
      if (c) void c.close();
    };
  }, [problem.id, problem.schema_sql, problem.seed_data_sql]);

  const handleRun = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || busy) return;
    setBusy(true);
    setRunError(null);
    try {
      const result = await runQuery(conn, sqlText);
      setLastRun({ sql: sqlText, result });
      setTab('result');
      setSchema(await describeTables(conn));
    } catch (e) {
      setLastRun(null);
      setRunError(e instanceof Error ? e.message : String(e));
      setTab('result');
    } finally {
      setBusy(false);
    }
  }, [sqlText, busy]);

  const handleExplain = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || busy) return;
    setBusy(true);
    setRunError(null);
    try {
      setPlanText(await explainQuery(conn, sqlText));
      setTab('plan');
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sqlText, busy]);

  // ANSWER: 直近の「実行」結果を使って採点する（設計書 6-1）
  const handleAnswer = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || busy) return;
    if (!lastRun) {
      setJudgement({
        correct: false,
        message: 'まず「実行」してください',
        details: ['採点は「直近の実行結果」に対して行います。左のエディタで SQL を実行してから ANSWER を押してください。'],
      });
      return;
    }
    if (lastRun.sql.trim() !== sqlText.trim()) {
      setJudgement({
        correct: false,
        message: 'エディタの内容が実行後に変更されています',
        details: ['いま表示されている結果は古い SQL のものです。もう一度「実行」してから ANSWER を押してください。'],
      });
      return;
    }
    setBusy(true);
    try {
      // ユーザーのクエリがデータを変更していても正しく採点できるよう、期待値は作り直した環境で取る
      await resetEnvironment(conn, problem.schema_sql, problem.seed_data_sql);
      const expected = await runQuery(conn, problem.expected_query);
      let result = judgeResultSet(lastRun.result, expected, problem.judge);

      const hasPatternRules =
        (problem.judge.sql_required?.length ?? 0) +
          (problem.judge.sql_forbidden?.length ?? 0) +
          (problem.judge.explain_required?.length ?? 0) +
          (problem.judge.explain_forbidden?.length ?? 0) >
        0;
      if (result.correct && hasPatternRules) {
        let plan = '';
        try {
          plan = await explainQuery(conn, lastRun.sql);
          setPlanText(plan);
        } catch {
          plan = '';
        }
        const { ok, violations } = checkPatterns(lastRun.sql, plan, problem.judge);
        if (!ok) {
          result = {
            correct: false,
            message: '結果は正しいですが、この問題が求める書き方の条件を満たしていません',
            details: [...violations, ...(problem.judge.pattern_hint ? [problem.judge.pattern_hint] : [])],
          };
        }
      }

      setJudgement(result);
      attempt(problem.id, result.correct);
      if (result.correct) setRevealed(true);
      setSchema(await describeTables(conn));
    } catch (e) {
      setJudgement({
        correct: false,
        message: '採点中にエラーが発生しました',
        details: [e instanceof Error ? e.message : String(e)],
      });
    } finally {
      setBusy(false);
    }
  }, [busy, lastRun, sqlText, problem, attempt]);

  const errorHint = runError ? explainSqlError(runError) : null;
  const hints = problem.hints_md ?? [];
  const canReveal = revealed || attempts >= 3;

  if (status === 'booting') {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <div className="text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          DuckDB を初期化しています…
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
        <p className="font-semibold">DuckDB の初期化に失敗しました</p>
        <pre className="mt-2 whitespace-pre-wrap text-xs">{bootError}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 左：エディタ / 右：DB の状態 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="flex min-h-[380px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
          <header className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
            <span className="text-xs font-semibold tracking-wide text-slate-400">SQL エディタ</span>
            <div className="flex gap-2">
              <button
                onClick={handleExplain}
                disabled={busy}
                className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                EXPLAIN
              </button>
              <button
                onClick={handleRun}
                disabled={busy}
                className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                実行 (Ctrl+Enter)
              </button>
            </div>
          </header>
          <div className="min-h-[320px] flex-1">
            <QueryEditor value={sqlText} onChange={setSqlText} onRun={handleRun} schema={schema} />
          </div>
        </section>

        <section className="flex min-h-[380px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
          <header className="flex items-center gap-1 border-b border-slate-700 px-2 py-1.5">
            {(
              [
                ['result', '実行結果'],
                ['schema', 'スキーマ'],
                ['plan', '実行計画'],
              ] as [RightTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  tab === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
            {lastRun && tab === 'result' && (
              <span className="ml-auto pr-2 text-[11px] text-slate-500">
                {lastRun.result.rows.length} 行 / {lastRun.result.elapsedMs.toFixed(1)} ms
              </span>
            )}
          </header>
          <div className="flex-1 overflow-auto">
            {tab === 'schema' && <SchemaPanel schema={schema} />}
            {tab === 'plan' &&
              (planText ? (
                <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre text-slate-300">
                  {planText}
                </pre>
              ) : (
                <p className="p-4 text-sm text-slate-400">
                  「EXPLAIN」ボタンを押すと、いまエディタにある SQL の実行計画を表示します。
                </p>
              ))}
            {tab === 'result' && (
              <>
                {runError && (
                  <div className="m-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
                    <p className="font-mono text-xs whitespace-pre-wrap text-rose-200">{runError}</p>
                    {errorHint && (
                      <div className="mt-3 border-t border-rose-500/30 pt-2">
                        <p className="text-xs font-semibold text-amber-300">よくあるミス: {errorHint.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">{errorHint.advice}</p>
                      </div>
                    )}
                  </div>
                )}
                {!runError && !lastRun && (
                  <p className="p-4 text-sm text-slate-400">
                    左のエディタで SQL を書いて「実行」を押すと、ここに結果が表示されます。
                  </p>
                )}
                {!runError && lastRun && (
                  <ResultTable columns={lastRun.result.columns} rows={lastRun.result.rows} />
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {/* 採点 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleAnswer}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 disabled:opacity-40"
        >
          ANSWER（この実行結果で提出）
        </button>
        {hints.length > 0 && hintLevel < hints.length && (
          <button
            onClick={() => setHintLevel((n) => n + 1)}
            className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm text-amber-300 hover:bg-amber-500/10"
          >
            ヒントを見る（{hintLevel} / {hints.length}）
          </button>
        )}
        {!canReveal && (
          <button
            onClick={() => setRevealed(true)}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
          >
            解答・解説を見る
          </button>
        )}
        <span className="text-xs text-slate-500">挑戦回数: {attempts}</span>
      </div>

      {judgement && (
        <div
          className={`rounded-xl border p-4 ${
            judgement.correct
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-amber-500/40 bg-amber-500/10'
          }`}
        >
          <p className={`font-semibold ${judgement.correct ? 'text-emerald-300' : 'text-amber-300'}`}>
            {judgement.correct ? '◯ ' : '× '}
            {judgement.message}
          </p>
          {judgement.details.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {judgement.details.map((d, i) => (
                <li key={i}>・{d}</li>
              ))}
            </ul>
          )}
          {Boolean(judgement.missingRows?.length || judgement.extraRows?.length) && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {judgement.missingRows && judgement.missingRows.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-700">
                  <p className="bg-slate-800 px-3 py-1.5 text-xs font-semibold text-sky-300">
                    足りない行（期待にあるが結果に無い）
                  </p>
                  <ResultTable
                    columns={judgement.missingRows[0].map((_, i) => `col${i + 1}`)}
                    rows={judgement.missingRows}
                    maxRows={10}
                  />
                </div>
              )}
              {judgement.extraRows && judgement.extraRows.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-700">
                  <p className="bg-slate-800 px-3 py-1.5 text-xs font-semibold text-rose-300">
                    余分な行（結果にあるが期待に無い）
                  </p>
                  <ResultTable
                    columns={judgement.extraRows[0].map((_, i) => `col${i + 1}`)}
                    rows={judgement.extraRows}
                    maxRows={10}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hintLevel > 0 && (
        <div className="space-y-2">
          {hints.slice(0, hintLevel).map((h, i) => (
            <div key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="mb-1 text-xs font-semibold text-amber-300">ヒント {i + 1}</p>
              <Markdown>{h}</Markdown>
            </div>
          ))}
        </div>
      )}

      {canReveal && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">模範解答</p>
            <pre className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-emerald-200">
              {problem.expected_query.trim()}
            </pre>
            {problem.alternative_md && (
              <div className="mt-3 border-t border-slate-700 pt-3">
                <Markdown>{problem.alternative_md}</Markdown>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-sky-300">解説</p>
            <Markdown>{problem.explanation_md}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
