import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SqlQueryProblem } from '../types';
import {
  describeTables,
  explainPlan,
  explainQuery,
  resetEnvironment,
  runQuery,
} from '../engine/duckdb';
import type { QueryResult } from '../engine/duckdb';
import type { QueryPlan } from '../engine/plan';
import { checkPatterns, errorLineOf, explainSqlError, judgeResultSet } from '../engine/judge';
import type { JudgeResult } from '../engine/judge';
import { LiveMessage } from './ui';
import QueryEditor from './QueryEditor';
import { useDuckDb, useRunShortcuts } from './useWorkbench';
import ResultTable from './ResultTable';
import SchemaPanel from './SchemaPanel';
import PlanView from './PlanView';
import Markdown from './Markdown';
import { Button, Card } from './ui';
import { RISE, SLIDE } from './motion';
import { IconBook, IconBulb, IconCheck, IconLayers, IconPlay, IconX } from './icons';
import { useProgress } from '../storage/progressContext';
import { detectUnpreventedReload, loadSession, saveSession } from '../storage/workbenchSession';
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
  // DuckDB の用意・キーの横取りは useWorkbench に出してある
  const {
    connRef,
    status,
    error: bootError,
    schema,
    setSchema,
  } = useDuckDb(problem.schema_sql, problem.seed_data_sql, problem.id);
  // 実行中フラグ。busy（表示用の state）は反映が非同期なので、
  // F5 の連打で二重に走らせないためのガードはこちらで持つ。
  const runningRef = useRef(false);

  // リロードされても書きかけの SQL と直近の結果を失わないよう、タブ内に保存している
  const restored = useMemo(() => loadSession(problem.id), [problem.id]);

  const [sqlText, setSqlText] = useState(restored?.sql ?? problem.starter_sql ?? '');
  const [lastRun, setLastRun] = useState<LastRun | null>(restored?.lastRun ?? null);
  const [runError, setRunError] = useState<string | null>(null);
  // どの SQL で失敗したか。書き換えたらエディタの印を消すために持つ
  const [errorSql, setErrorSql] = useState<string | null>(null);
  const [plan, setPlan] = useState<QueryPlan | null>(restored?.plan ?? null);
  // 見積りだけか、実際に走らせて実測も出すか
  const [analyze, setAnalyze] = useState(false);
  const [tab, setTab] = useState<RightTab>(restored?.tab ?? 'schema');
  const [reloadNotice, setReloadNotice] = useState(detectUnpreventedReload);
  const [judgement, setJudgement] = useState<JudgeResult | null>(null);
  // 採点のたびに増やす。結果パネルの key にして、同じ文言でも動きを出す
  const [judgeSeq, setJudgeSeq] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const attempts = progress.solvedProblems[problem.id]?.attempts ?? 0;

  const handleRun = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setRunError(null);
    try {
      const result = await runQuery(conn, sqlText);
      setErrorSql(null);
      setLastRun({ sql: sqlText, result });
      setTab('result');
      setSchema(await describeTables(conn));
    } catch (e) {
      setLastRun(null);
      setRunError(e instanceof Error ? e.message : String(e));
      setErrorSql(sqlText);
      setTab('result');
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [connRef, setSchema, sqlText]);

  const handleExplain = useCallback(
    async (withAnalyze = analyze) => {
      const conn = connRef.current;
      if (!conn || runningRef.current) return;
      runningRef.current = true;
      setBusy(true);
      setRunError(null);
      try {
        setPlan(await explainPlan(conn, sqlText, withAnalyze));
        setAnalyze(withAnalyze);
        setErrorSql(null);
        setTab('plan');
      } catch (e) {
        setRunError(e instanceof Error ? e.message : String(e));
        setErrorSql(sqlText);
        setTab('result');
      } finally {
        runningRef.current = false;
        setBusy(false);
      }
    },
    [analyze, connRef, sqlText],
  );

  // ANSWER: 直近の「実行」結果を使って採点する（設計書 6-1）
  const handleAnswer = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || runningRef.current) return;
    if (!lastRun) {
      setJudgeSeq((n) => n + 1);
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
      setJudgeSeq((n) => n + 1);
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
        // 書き方の条件は文字列の計画に対する正規表現。木は画面に出すため
        let planText = '';
        try {
          planText = await explainQuery(conn, lastRun.sql);
          setPlan(await explainPlan(conn, lastRun.sql));
        } catch {
          planText = planText || '';
        }
        const { ok, violations } = checkPatterns(lastRun.sql, planText, problem.judge);
        if (!ok) {
          result = {
            correct: false,
            message: '結果は正しいですが、この問題が求める書き方の条件を満たしていません',
            details: [
              ...violations,
              ...(problem.judge.pattern_hint ? [problem.judge.pattern_hint] : []),
            ],
          };
        }
      }

      setJudgeSeq((n) => n + 1);
      setJudgement(result);
      attempt(problem.id, result.correct);
      if (result.correct) setRevealed(true);
      setSchema(await describeTables(conn));
    } catch (e) {
      setJudgeSeq((n) => n + 1);
      setJudgement({
        correct: false,
        message: '採点中にエラーが発生しました',
        details: [e instanceof Error ? e.message : String(e)],
      });
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [attempt, connRef, lastRun, problem, setSchema, sqlText]);

  useRunShortcuts(() => void handleRun());

  // 書きかけの SQL と直近の結果をタブ内に保存する（リロード対策）
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setTimeout(() => {
      saveSession(problem.id, { sql: sqlText, lastRun, plan, tab });
    }, 300);
    return () => clearTimeout(timer);
  }, [problem.id, status, sqlText, lastRun, plan, tab]);

  const errorHint = runError ? explainSqlError(runError) : null;
  // 印は「失敗したときのまま」のときだけ出す（書き換えたら行がずれる）
  const errorLine = runError && errorSql === sqlText ? errorLineOf(runError, sqlText) : null;
  const hints = problem.hints_md ?? [];
  const canReveal = revealed || attempts >= 3;

  if (status === 'booting') {
    return (
      <Card className="flex h-72 items-center justify-center">
        <div className="flex items-center gap-3 text-body text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
          DuckDB を初期化しています…
        </div>
      </Card>
    );
  }
  if (status === 'error') {
    return (
      <div className="rounded-lg border border-danger-line bg-danger-soft p-4 text-body text-danger">
        <p className="font-semibold">DuckDB の初期化に失敗しました</p>
        <pre className="mt-2 font-mono text-small whitespace-pre-wrap">{bootError}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 採点と実行の結果を読み上げに載せる（色と位置だけでは伝わらない） */}
      <LiveMessage>
        {judgement
          ? `${judgement.correct ? '正解' : '不正解'}。${judgement.message}`
          : runError
            ? `実行に失敗しました。${runError.split('\n')[0]}`
            : lastRun
              ? `実行しました。${lastRun.result.rows.length} 行`
              : ''}
      </LiveMessage>

      {/* F5 を横取りしたのにリロードされてしまうブラウザ向けの説明 */}
      {reloadNotice && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning-line bg-warning-soft p-3">
          <IconBulb size={14} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-small leading-relaxed text-fg">
            <p>
              このブラウザでは F5 によるリロードを抑止できませんでした。DuckDB
              は作り直されましたが、SQL と直近の実行結果は復元しています。
            </p>
            <p className="mt-1 text-muted">
              確実に実行したいときは Ctrl+Enter（macOS は ⌘+Enter）をお使いください。
            </p>
          </div>
          <button
            onClick={() => setReloadNotice(false)}
            className="ml-auto shrink-0 text-tiny text-subtle hover:text-fg"
          >
            閉じる
          </button>
        </div>
      )}

      {/* 左：エディタ / 右：DB の状態 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          as="section"
          testId="editor-pane"
          className="flex min-h-[520px] flex-col overflow-hidden lg:h-[clamp(460px,calc(100vh-34rem),820px)]"
        >
          <header className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-raised pr-1.5 pl-3">
            <span className="text-tiny font-medium tracking-tight text-muted">SQL エディタ</span>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleExplain()}
                disabled={busy}
                data-testid="explain"
              >
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
                <kbd className="ml-0.5 hidden font-mono text-micro opacity-70 sm:inline">F5</kbd>
              </Button>
            </div>
          </header>
          <div className="min-h-[480px] flex-1 bg-sunken">
            <QueryEditor
              value={sqlText}
              onChange={setSqlText}
              schema={schema}
              errorLine={errorLine}
            />
          </div>
        </Card>

        <Card
          as="section"
          testId="result-pane"
          className="flex min-h-[520px] flex-col overflow-hidden lg:h-[clamp(460px,calc(100vh-34rem),820px)]"
        >
          <header className="flex h-9 shrink-0 items-stretch gap-4 border-b border-line bg-raised px-3">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative text-tiny font-medium transition-colors ${
                  tab === key ? 'text-fg' : 'text-subtle hover:text-muted'
                }`}
              >
                {label}
                {tab === key && (
                  <motion.span
                    layoutId="tab-underline"
                    transition={SLIDE}
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                  />
                )}
              </button>
            ))}
            {lastRun && tab === 'result' && !runError && (
              <span className="tnum ml-auto self-center text-tiny text-subtle">
                {lastRun.result.rows.length} 行 · {lastRun.result.elapsedMs.toFixed(1)} ms
              </span>
            )}
          </header>
          <div className="flex-1 overflow-auto">
            {tab === 'schema' && <SchemaPanel schema={schema} />}
            {tab === 'plan' &&
              (plan ? (
                <>
                  {/* 見積りだけ見るか、実際に走らせて実測と比べるか */}
                  <div className="flex items-center gap-1.5 border-b border-line px-3 py-1.5">
                    {[
                      { on: false, label: '見積り' },
                      { on: true, label: '実測（ANALYZE）' },
                    ].map((mode) => (
                      <button
                        key={mode.label}
                        type="button"
                        onClick={() => void handleExplain(mode.on)}
                        disabled={busy}
                        aria-pressed={analyze === mode.on}
                        data-testid={mode.on ? 'plan-analyze' : 'plan-estimate'}
                        className={`rounded-full border px-2.5 py-0.5 text-tiny font-medium transition-colors disabled:opacity-45 ${
                          analyze === mode.on
                            ? 'border-accent-line bg-accent-soft text-accent'
                            : 'border-line bg-surface text-muted hover:text-fg'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <PlanView plan={plan} />
                </>
              ) : (
                <p className="p-4 text-body leading-relaxed text-muted">
                  「EXPLAIN」を押すと、いまエディタにある SQL の実行計画を表示します。
                </p>
              ))}
            {tab === 'result' && (
              <>
                {runError && (
                  <div className="m-3 overflow-hidden rounded-md border border-danger-line">
                    <pre className="bg-danger-soft p-3 font-mono text-tiny leading-relaxed whitespace-pre-wrap text-danger">
                      {runError}
                    </pre>
                    {errorHint && (
                      <div className="border-t border-danger-line bg-surface p-3">
                        <p className="flex items-center gap-1.5 text-small font-semibold text-warning">
                          <IconBulb size={13} />
                          よくあるミス: {errorHint.title}
                        </p>
                        <p className="mt-1.5 text-small leading-relaxed text-muted">
                          {errorHint.advice}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {!runError && !lastRun && (
                  <p className="p-4 text-body leading-relaxed text-muted">
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
        <Button
          size="lg"
          variant="primary"
          onClick={handleAnswer}
          disabled={busy}
          data-testid="answer"
        >
          ANSWER
          <span className="text-tiny font-normal opacity-75">この実行結果で提出</span>
        </Button>
        {hints.length > 0 && hintLevel < hints.length && (
          <Button size="lg" onClick={() => setHintLevel((n) => n + 1)}>
            <IconBulb size={14} className="text-warning" />
            ヒント
            <span className="tnum text-tiny text-subtle">
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
        <span className="tnum ml-auto text-tiny text-subtle">挑戦 {attempts} 回</span>
      </div>

      {judgement && (
        <motion.div
          key={judgeSeq}
          data-testid="judge-result"
          variants={RISE}
          initial="hidden"
          animate="shown"
          className={`rounded-lg border p-4 ${
            judgement.correct
              ? 'border-success-line bg-success-soft'
              : 'border-danger-line bg-danger-soft'
          }`}
        >
          <p
            className={`flex items-center gap-2 text-body font-semibold ${
              judgement.correct ? 'text-success' : 'text-danger'
            }`}
          >
            {judgement.correct ? <IconCheck size={15} /> : <IconX size={15} />}
            {judgement.message}
          </p>
          {judgement.details.length > 0 && (
            <ul className="mt-2 space-y-1 text-body leading-relaxed text-fg">
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
                  <p className="border-b border-line bg-raised px-3 py-1.5 text-tiny font-medium text-muted">
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
                  <p className="border-b border-line bg-raised px-3 py-1.5 text-tiny font-medium text-muted">
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
        </motion.div>
      )}

      {hintLevel > 0 && (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {hints.slice(0, hintLevel).map((h, i) => (
              <motion.div key={i} variants={RISE} initial="hidden" animate="shown" exit="gone">
                <Card className="border-warning-line bg-warning-soft p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-tiny font-semibold text-warning">
                    <IconBulb size={13} />
                    ヒント {i + 1}
                  </p>
                  <Markdown>{h}</Markdown>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {canReveal && (
        <motion.div
          variants={RISE}
          initial="hidden"
          animate="shown"
          className="max-w-prose-wide space-y-3"
        >
          <Card className="overflow-hidden">
            <p className="border-b border-line bg-raised px-4 py-2 text-tiny font-medium text-muted">
              模範解答
            </p>
            <pre className="overflow-x-auto bg-sunken p-4 font-mono text-small leading-relaxed text-fg">
              {problem.expected_query.trim()}
            </pre>
            {problem.alternative_md && (
              <div className="border-t border-line p-4">
                <Markdown>{problem.alternative_md}</Markdown>
              </div>
            )}
          </Card>
          <Card className="overflow-hidden">
            <p className="flex items-center gap-1.5 border-b border-line bg-raised px-4 py-2 text-tiny font-medium text-muted">
              <IconBook size={13} />
              解説
            </p>
            <div className="p-5">
              <Markdown>{problem.explanation_md}</Markdown>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
