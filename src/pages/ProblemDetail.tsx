import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { loadProblem, META_BY_ID, nextProblemId, prevProblemId } from '../data/problems';
import { LEVEL_FULL_LABEL, LEVEL_TONE, PHASE_BY_ID } from '../data/phases';
import { isSyntaxTag } from '../data/tags';
import Markdown from '../components/Markdown';
import { Card, Tag } from '../components/ui';
import { IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight } from '../components/icons';
import SqlWorkbench from '../components/SqlWorkbench';
import LessonPanel from '../components/LessonPanel';
import ProblemNav from '../components/ProblemNav';
import ChoiceQuestion from '../components/ChoiceQuestion';
import WrittenQuestion from '../components/WrittenQuestion';
import { useProgress } from '../storage/progressContext';
import { SLIDE } from '../components/motion';
import type { Problem } from '../types';

/**
 * 問題の本文はこのページを開いたときに取りに行く（一覧に要るのはメタだけ）。
 * 読み込み中は高さだけ確保して、着いたときに画面が跳ねないようにする。
 */
function useProblem(id: string): { problem: Problem | undefined; loading: boolean } {
  const [state, setState] = useState<{ id: string; problem?: Problem; loading: boolean }>({
    id,
    loading: true,
  });

  // 別の問題へ移ったら描画中に読み込み中へ戻す。
  // effect で戻すと 1 フレームだけ前の問題が残る（React が勧める形）
  if (state.id !== id) setState({ id, loading: true });

  useEffect(() => {
    let alive = true;
    void loadProblem(id).then((problem) => {
      if (alive) setState({ id, problem, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return { problem: state.problem, loading: state.loading };
}

export default function ProblemDetail() {
  const { id = '' } = useParams();
  const { problem, loading } = useProblem(id);
  const { isSolved, attemptsOf, stateOf } = useProgress();
  // 狭い画面では目次を畳んでおく（広い画面では常に出ている）
  const [navOpen, setNavOpen] = useState(false);

  /*
    見出し・タグ・サイドバーはメタだけで描ける。本文を待って画面ごと
    差し替えると、問題を移るたびにサイドバーが作り直され、現在地の帯が
    滑らずに飛ぶ（layoutId は同じ要素が残っている前提の仕組み）。
  */
  const meta = META_BY_ID.get(id);

  if (!meta) {
    return (
      <Card className="p-6">
        <p className="text-body text-fg">問題 {id} が見つかりません。</p>
        <Link to="/problems" className="mt-3 inline-block text-body text-accent underline">
          問題一覧へ戻る
        </Link>
      </Card>
    );
  }

  const phase = PHASE_BY_ID.get(meta.phase);
  const prev = prevProblemId(meta.id);
  const next = nextProblemId(meta.id);

  return (
    <div className="space-y-5">
      {/*
        左にサイドバー、右に読む列（最大 62rem）。
        SQL エディタと実行結果はこの下に全幅で置くので、
        サイドバーを出しても作業領域の幅は減らない。
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(15rem,19rem)_minmax(0,62rem)]">
        {/*
          狭い画面では畳んだボタン 1 つだけを先に置く。
          読み上げやタブ移動が目次 52 件から始まらず、それでいて
          問題のあいだを移れる（前は狭い画面で目次ごと消していた）。
        */}
        <aside className="lg:col-start-1 lg:row-start-1">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            data-testid="nav-toggle"
            className="glass-edge flex w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-tiny font-medium text-muted lg:hidden"
          >
            <motion.span
              animate={{ rotate: navOpen ? 0 : -90 }}
              transition={SLIDE}
              className="flex"
            >
              <IconChevronDown size={12} />
            </motion.span>
            ほかの問題へ
          </button>
          <div
            className={`${navOpen ? 'mt-2 block' : 'hidden'} lg:mt-0 lg:block lg:sticky lg:top-20`}
          >
            <ProblemNav currentId={meta.id} />
          </div>
        </aside>

        <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-start-1">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-small">
              <Link to="/problems" className="text-muted hover:text-fg">
                問題
              </Link>
              <span className="text-subtle">/</span>
              <Link to={`/problems?phase=${meta.phase}`} className="text-muted hover:text-fg">
                {phase?.name}
              </Link>
              <span data-testid="problem-id" className="ml-auto font-mono text-micro text-subtle">
                {meta.id}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-display leading-snug font-semibold tracking-tight text-fg">
                {meta.title}
              </h1>
              <Tag tone={LEVEL_TONE[meta.level]}>{LEVEL_FULL_LABEL[meta.level]}</Tag>
              {isSolved(meta.id) && (
                <Tag tone="success">
                  <IconCheck size={11} />
                  正解済み
                </Tag>
              )}
              {/* 挑戦回数はずっと記録していたのに、どこにも出していなかった */}
              {attemptsOf(meta.id) > 0 && (
                <Tag tone={stateOf(meta.id).solved ? 'neutral' : 'warning'}>
                  {attemptsOf(meta.id)} 回挑戦
                </Tag>
              )}
              {stateOf(meta.id).review && <Tag tone="warning">要復習</Tag>}
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {meta.tags.map((t) => (
                <Link
                  key={t}
                  to={`/problems?tag=${encodeURIComponent(t)}`}
                  className={`text-tiny text-subtle hover:text-accent ${
                    isSyntaxTag(t) ? 'font-mono' : ''
                  }`}
                >
                  #{t}
                </Link>
              ))}
            </div>
          </div>

          {/* 教材 → 問題文 → 作業領域の順に読ませる */}
          <LessonPanel problemId={meta.id} />

          {/* 本文はこのページを開いてから取りに行く。待つのはここだけ */}
          {problem ? (
            <Card className="p-5">
              <Markdown>{problem.prompt_md}</Markdown>
            </Card>
          ) : (
            <Card className="min-h-[8rem] p-5" testId="problem-loading">
              <span className="sr-only">問題を読み込んでいます</span>
            </Card>
          )}

          {/* 選択式と記述式は読み物なので、この列に収める */}
          {problem?.type === 'multiple_choice' && (
            <ChoiceQuestion key={problem.id} problem={problem} />
          )}
          {problem?.type === 'written' && <WrittenQuestion key={problem.id} problem={problem} />}
        </div>
      </div>

      {problem?.type === 'sql_query' && <SqlWorkbench key={problem.id} problem={problem} />}
      {/* 読み込み中も高さを取っておき、着いたときに画面が跳ねないようにする */}
      {loading && meta.type === 'sql_query' && <div className="min-h-[520px]" />}

      {/* 前後送り。指すと矢印だけが進む向きへ 2px 動く */}
      <nav className="flex items-center justify-between border-t border-line pt-4">
        {prev ? (
          <motion.div initial={false} whileHover="hover" transition={SLIDE}>
            <Link
              to={`/problems/${prev}`}
              className="flex items-center gap-1 text-small text-muted hover:text-fg"
            >
              <motion.span variants={{ hover: { x: -2 } }} transition={SLIDE} className="flex">
                <IconChevronLeft size={14} />
              </motion.span>
              前の問題
            </Link>
          </motion.div>
        ) : (
          <span />
        )}
        {next ? (
          <motion.div initial={false} whileHover="hover" transition={SLIDE}>
            <Link
              to={`/problems/${next}`}
              className="flex items-center gap-1 text-small text-muted hover:text-fg"
            >
              次の問題
              <motion.span variants={{ hover: { x: 2 } }} transition={SLIDE} className="flex">
                <IconChevronRight size={14} />
              </motion.span>
            </Link>
          </motion.div>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
