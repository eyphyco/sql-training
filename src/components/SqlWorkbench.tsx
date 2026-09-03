import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { SqlQueryProblem } from '../types';
import { connect, describeTables, explainQuery, resetEnvironment, runQuery } from '../engine/duckdb';
import type { QueryResult, TableSchema } from '../engine/duckdb';
import { checkPatterns, explainSqlError, judgeResultSet } from '../engine/judge';
import type { JudgeResult } from '../engine/judge';
import QueryEditor from './QueryEditor';
import ResultTable from './ResultTable';
import SchemaPanel from './SchemaPanel';
import Markdown from './Markdown';
import { Button, Card } from './ui';
import { IconBook, IconBulb, IconCheck, IconLayers, IconPlay, IconX } from './icons';
import { useProgress } from '../storage/progressContext';
import {
  detectUnpreventedReload,
  loadSession,
  markF5Handled,
  saveSession,
} from '../storage/workbenchSession';
import type { RightTab } from '../storage/workbenchSession';

interface LastRun {
  sql: string;
  result: QueryResult;
}

const TABS: [RightTab, string][] = [
  ['result', '実行結果'],
  ['schema', 'スキーマ'],
  ['plan', '実行計画'],
];

export default function SqlWorkbench({ problem }: { problem: SqlQueryProblem }) {
  const { attempt, progress } = useProgress();
  const connRef = useRef<AsyncDuckDBConnection | null>(null);
  // 実行中フラグ。busy（表示用の state）は反映が非同期なので、
  // F5 の連打で二重に走らせないためのガードはこちらで持つ。
  const runningRef = useRef(false);

  // リロードされても書きかけの SQL と直近の結果を失わないよう、タブ内に保存している
  const restored = useMemo(() => loadSession(problem.id), [problem.id]);

  const [status, setStatus] = useState<'booting' | 'ready' | 'error'>('booting');
  const [bootError, setBootError] = useState('');
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const [sqlText, setSqlText] = useState(restored?.sql ?? problem.starter_sql ?? '');
  const [lastRun, setLastRun] = useState<LastRun | null>(restored?.lastRun ?? null);
  const [runError, setRunError] = useState<string | null>(null);
  const [planText, setPlanText] = useState<string | null>(restored?.planText ?? null);
  const [tab, setTab] = useState<RightTab>(restored?.tab ?? 'schema');
  const [reloadNotice, setReloadNotice] = useState(detectUnpreventedReload);
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
    if (!conn || runningRef.current) return;
    runningRef.current = true;
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
      runningRef.current = false;
      setBusy(false);
    }
  }, [sqlText]);

  const handleExplain = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setRunError(null);
    try {
      setPlanText(await explainQuery(conn, sqlText));
      setTab('plan');
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setTab('result');
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [sqlText]);

  // ANSWER: 直近の「実行」結果を使って採点する（設計書 6-1）
  const handleAnswer = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || runningRef.current) return;
    if (!lastRun) {
      setJudgement({
        correct: false,
        message: 'まず「実行」してください',
        details: [
          '採点は「直近の実行結果」に対して行います。左のエディタで SQL を実行してから ANSWER を押してください。',
        ],
      });
      return;
    }
    if (lastRun.sql.trim() !== sqlText.trim()) {
      setJudgement({
        correct: false,
        message: 'エディタの内容が実行後に変更されています',
        details: [
          'いま表示されている結果は古い SQL のものです。もう一度「実行」してから ANSWER を押してください。',
        ],
      });
      return;
    }
    runningRef.current = true;
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
      runningRef.current = false;
      setBusy(false);
    }
  }, [lastRun, sqlText, problem, attempt]);

  // handleRun は入力のたびに作り直されるので、リスナーの再登録を避けて ref 経由で呼ぶ
  const handleRunRef = useRef(handleRun);
  useEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);

  // 実行のショートカット。SQL 問題を開いている間だけ有効にする。
  // F5 は SSMS / DBeaver などと同じ「実行」に割り当て、ブラウザのリロードは抑止する。
  // リロードしたいときのために Ctrl+R / ⌘R は横取りしない。
  //
  // capture フェーズで拾って stopPropagation する理由:
  //   - Ctrl+Enter は CodeMirror の既定キーマップで insertBlankLine に割り当てられており、
  //     bubble で受けると「空行が入る + 実行される」の二重動作になる。
  //   - 途中の誰かが stopPropagation してもリロードの抑止だけは確実に効かせたい。
  // key ではなく code も見るのは、IME が有効なときに key が 'Process' になる環境があるため。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const noMods = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
      const isF5 = (e.code === 'F5' || e.key === 'F5') && noMods;
      const isModEnter = (e.code === 'Enter' || e.key === 'Enter') && (e.ctrlKey || e.metaKey);
      if (!isF5 && !isModEnter) return;
      e.preventDefault();
      e.stopPropagation();
      if (isF5) markF5Handled();
      // 押しっぱなしのオートリピートでは実行しない（抑止だけは毎回する）
      if (e.repeat) return;
      void handleRunRef.current();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  // 書きかけの SQL と直近の結果をタブ内に保存する（リロード対策）
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setTimeout(() => {
      saveSession(problem.id, { sql: sqlText, lastRun, planText, tab });
    }, 300);
    return () => clearTimeout(timer);
  }, [problem.id, status, sqlText, lastRun, planText, tab]);

  const errorHint = runError ? explainSqlError(runError) : null;
  const hints = problem.hints_md ?? [];
  const canReveal = revealed || attempts >= 3;

  if (status === 'booting') {
    return (
      <Card className="flex h-72 items-center justify-center">
        <div className="flex items-center gap-3 text-[13px] text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
          DuckDB を初期化しています…
        </div>
      </Card>
    );
  }
  if (status === 'error') {
    return (
      <div className="rounded-lg border border-danger-line bg-danger-soft p-4 text-[13px] text-danger">
        <p className="font-semibold">DuckDB の初期化に失敗しました</p>
        <pre className="mt-2 font-mono text-[12px] whitespace-pre-wrap">{bootError}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* F5 を横取りしたのにリロードされてしまうブラウザ向けの説明 */}
      {reloadNotice && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning-line bg-warning-soft p-3">
          <IconBulb size={14} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-[12.5px] leading-relaxed text-fg">
            <p>
              このブラウザでは F5
              によるリロードを抑止できませんでした。DuckDB は作り直されましたが、SQL
              と直近の実行結果は復元しています。
            </p>
            <p className="mt-1 text-muted">
              確実に実行したいときは Ctrl+Enter（macOS は ⌘+Enter）をお使いください。
            </p>
          </div>
          <button
            onClick={() => setReloadNotice(false)}
            className="ml-auto shrink-0 text-[11.5px] text-subtle hover:text-fg"
          >
            閉じる
          </button>
        </div>
      )}

      {/* 左：エディタ / 右：DB の状態 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card as="section" className="flex min-h-[520px] flex-col overflow-hidden lg:h-[clamp(460px,calc(100vh-34rem),820px)]">
          <header className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-raised pr-1.5 pl-3">
            <span className="text-[11.5px] font-medium tracking-tight text-muted">SQL エディタ</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={handleExplain} disabled={busy} data-testid="explain">
                <IconLayers size={13} />
                EXPLAIN
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleRun}
                disabled={busy}
                data-testid="run"
                title="実行（F5 または Ctrl+Enter）"
              >
                <IconPlay size={12} />
                実行
                <kbd className="ml-0.5 hidden font-mono text-[10px] opacity-70 sm:inline">F5</kbd>
              </Button>
            </div>
          </header>
          <div className="min-h-[480px] flex-1 bg-sunken">
            <QueryEditor value={sqlText} onChange={setSqlText} schema={schema} />
          </div>
        </Card>

        <Card as="section" className="flex min-h-[520px] flex-col overflow-hidden lg:h-[clamp(460px,calc(100vh-34rem),820px)]">
          <header className="flex h-9 shrink-0 items-stretch gap-4 border-b border-line bg-raised px-3">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative text-[11.5px] font-medium transition-colors ${
                  tab === key
                    ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent'
                    : 'text-subtle hover:text-muted'
                }`}
              >
                {label}
              </button>
            ))}
            {lastRun && tab === 'result' && !runError && (
              <span className="tnum ml-auto self-center text-[11px] text-subtle">
                {lastRun.result.rows.length} 行 · {lastRun.result.elapsedMs.toFixed(1)} ms
              </span>
            )}
          </header>
          <div className="flex-1 overflow-auto">
            {tab === 'schema' && <SchemaPanel schema={schema} />}
            {tab === 'plan' &&
              (planText ? (
                <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre text-fg">
                  {planText}
                </pre>
              ) : (
                <p className="p-4 text-[13px] leading-relaxed text-muted">
                  「EXPLAIN」を押すと、いまエディタにある SQL の実行計画を表示します。
                </p>
              ))}
            {tab === 'result' && (
              <>
                {runError && (
                  <div className="m-3 overflow-hidden rounded-md border border-danger-line">
                    <pre className="bg-danger-soft p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-danger">
                      {runError}
                    </pre>
                    {errorHint && (
                      <div className="border-t border-danger-line bg-surface p-3">
                        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-warning">
                          <IconBulb size={13} />
                          よくあるミス: {errorHint.title}
                        </p>
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                          {errorHint.advice}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {!runError && !lastRun && (
                  <p className="p-4 text-[13px] leading-relaxed text-muted">
                    左のエディタで SQL を書いて「実行」を押すと、ここに結果が表示されます。
                  </p>
                )}
                {!runError && lastRun && (
                  <ResultTable columns={lastRun.result.columns} rows={lastRun.result.rows} />
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* 採点 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="lg" variant="primary" onClick={handleAnswer} disabled={busy} data-testid="answer">
          ANSWER
          <span className="text-[11px] font-normal opacity-75">この実行結果で提出</span>
        </Button>
        {hints.length > 0 && hintLevel < hints.length && (
          <Button size="lg" onClick={() => setHintLevel((n) => n + 1)}>
            <IconBulb size={14} className="text-warning" />
            ヒント
            <span className="tnum text-[11px] text-subtle">
              {hintLevel} / {hints.length}
            </span>
          </Button>
        )}
        {!canReveal && (
          <Button size="lg" variant="ghost" onClick={() => setRevealed(true)}>
            <IconBook size={14} />
            解答・解説を見る
          </Button>
        )}
        <span className="tnum ml-auto text-[11.5px] text-subtle">挑戦 {attempts} 回</span>
      </div>

      {judgement && (
        <div
          className={`rounded-lg border p-4 ${
            judgement.correct
              ? 'border-success-line bg-success-soft'
              : 'border-warning-line bg-warning-soft'
          }`}
        >
          <p
            className={`flex items-center gap-2 text-[13.5px] font-semibold ${
              judgement.correct ? 'text-success' : 'text-warning'
            }`}
          >
            {judgement.correct ? <IconCheck size={15} /> : <IconX size={15} />}
            {judgement.message}
          </p>
          {judgement.details.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-fg">
              {judgement.details.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-subtle">·</span>
                  {d}
                </li>
              ))}
            </ul>
          )}
          {Boolean(judgement.missingRows?.length || judgement.extraRows?.length) && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {judgement.missingRows && judgement.missingRows.length > 0 && (
                <div className="overflow-hidden rounded-md border border-line bg-surface">
                  <p className="border-b border-line bg-raised px-3 py-1.5 text-[11.5px] font-medium text-muted">
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
                <div className="overflow-hidden rounded-md border border-line bg-surface">
                  <p className="border-b border-line bg-raised px-3 py-1.5 text-[11.5px] font-medium text-muted">
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

      {canReveal && (
        <div className="max-w-prose-wide space-y-3">
          <Card className="overflow-hidden">
            <p className="border-b border-line bg-raised px-4 py-2 text-[11.5px] font-medium text-muted">
              模範解答
            </p>
            <pre className="overflow-x-auto bg-sunken p-4 font-mono text-[12.5px] leading-relaxed text-fg">
              {problem.expected_query.trim()}
            </pre>
            {problem.alternative_md && (
              <div className="border-t border-line p-4">
                <Markdown>{problem.alternative_md}</Markdown>
              </div>
            )}
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
        </div>
      )}
    </div>
  );
}
