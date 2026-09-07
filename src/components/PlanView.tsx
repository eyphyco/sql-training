import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { flattenExecution } from '../engine/plan';
import type { PlanNode, QueryPlan } from '../engine/plan';
import { RISE, SLIDE, STAGGER } from './motion';
import StepPlayer from './rare/StepPlayer';

/*
  実行計画を木で見せる。

  DuckDB の既定の出力は枠線の図で、1 ノードが 7 行の箱になる。
  読み手が知りたいのは「どの順で、どの演算子が、何行を相手にしたか」なので、
  1 ノード 1 行に畳み、演算子の種類で色を分ける。

  結合と全件走査はこの教材の主題なので、そこだけ色を当てる
  （彩度の高い色は正誤の表示に取ってあるので、地の色との差で示す）。

  木は「上が最後、下ほど先」に読む。この向きは慣れないと逆に見えるので、
  実際に動く順へ 1 歩ずつ進める再生を付けてある。
*/

type Kind = 'join' | 'scan' | 'group' | 'sort' | 'plain';

function kindOf(name: string): Kind {
  if (name.includes('JOIN')) return 'join';
  if (name.includes('SCAN')) return 'scan';
  if (name.includes('GROUP_BY') || name.includes('AGGREGATE')) return 'group';
  if (name.includes('ORDER_BY') || name.includes('TOP_N')) return 'sort';
  return 'plain';
}

const TONE: Record<Kind, string> = {
  join: 'border-accent-line bg-accent-soft text-accent',
  scan: 'border-line bg-raised text-fg',
  group: 'border-line bg-raised text-fg',
  sort: 'border-line bg-raised text-fg',
  plain: 'border-line bg-surface text-muted',
};

const nf = new Intl.NumberFormat('ja-JP');

interface Walk {
  /** 何歩目まで進んだか。null なら再生していない（全部そのまま出す） */
  step: number | null;
  rank: Map<PlanNode, number>;
}

function Row({ node, walk }: { node: PlanNode; walk: Walk }) {
  const kind = kindOf(node.name);
  const estimate = node.rows;
  const actual = node.actualRows;
  // 見積りと実測が桁で違うときは、そこが読みどころ
  const off =
    estimate !== null &&
    actual !== null &&
    estimate > 0 &&
    (actual / estimate >= 10 || (actual >= 10 && actual / estimate <= 0.1));

  const rank = walk.rank.get(node) ?? 0;
  const current = walk.step !== null && rank === walk.step;
  const ahead = walk.step !== null && rank > walk.step;
  const ref = useRef<HTMLDivElement>(null);

  // いま動いている所がペインの外だと、再生しても何も見えない
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <motion.li variants={RISE}>
      <motion.div
        ref={ref}
        data-testid={current ? 'plan-node-current' : 'plan-node'}
        animate={{ opacity: ahead ? 0.35 : 1 }}
        transition={SLIDE}
        className={`relative flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-sm py-[3px] ${
          current ? 'pl-1.5' : ''
        }`}
      >
        {/* 再生中の 1 行。帯は 1 つを使い回して滑らせる */}
        {current && (
          <motion.span
            layoutId="plan-step"
            transition={SLIDE}
            className="absolute inset-y-0 -left-1 -z-10 w-[calc(100%+0.5rem)] rounded-sm bg-accent-soft ring-1 ring-accent-line"
          />
        )}
        <span
          data-testid="plan-node-name"
          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-micro font-medium ${TONE[kind]}`}
        >
          {node.name}
        </span>
        {node.info.map(([label, value]) => (
          <span key={label} title={`${label}: ${value}`} className="min-w-0 text-tiny text-muted">
            <span className="text-subtle">{label}: </span>
            <span className="font-mono">{value}</span>
          </span>
        ))}
        <span className="tnum ml-auto shrink-0 text-tiny whitespace-nowrap text-subtle">
          {estimate !== null && <span title="見積り行数">~{nf.format(estimate)}</span>}
          {actual !== null && (
            <span className={off ? 'ml-1.5 font-semibold text-warning' : 'ml-1.5 text-fg'}>
              実測 {nf.format(actual)}
            </span>
          )}
          {node.ms !== null && node.ms >= 0.05 && (
            <span className="ml-1.5 text-fg">{node.ms.toFixed(1)}ms</span>
          )}
        </span>
      </motion.div>
      {node.children.length > 0 && (
        // 入れ子は 1 段ごとに罫 1 本。結合のように子が 2 つある所で形が見える
        <ul className="ml-2 border-l border-line pl-3">
          {node.children.map((child, i) => (
            <Row key={`${child.name}-${i}`} node={child} walk={walk} />
          ))}
        </ul>
      )}
    </motion.li>
  );
}

export default function PlanView({ plan }: { plan: QueryPlan }) {
  const order = useMemo(() => flattenExecution(plan.root), [plan]);
  const rank = useMemo(() => new Map(order.map((n, i) => [n, i])), [order]);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // 計画が入れ替わったら、描画中に再生を畳む（古い木の位置が 1 フレーム残らない）
  const [seen, setSeen] = useState(plan);
  if (seen !== plan) {
    setSeen(plan);
    setStep(null);
    setPlaying(false);
  }

  const current = step === null ? null : order[step];

  return (
    <div className="p-3">
      {plan.analyzed && (
        <p className="mb-2 flex flex-wrap items-baseline gap-x-3 text-tiny text-subtle">
          <span>
            全体 <span className="tnum font-medium text-fg">{plan.totalMs?.toFixed(1)} ms</span>
          </span>
          {plan.scannedRows !== null && (
            <span>
              読んだ行{' '}
              <span className="tnum font-medium text-fg">{nf.format(plan.scannedRows)}</span>
            </span>
          )}
        </p>
      )}

      {/*
        木は上が最後の処理。読む向きが逆なので、実際に動く順へ
        1 歩ずつ送れるようにしてある（下から上へ光が移る）。
      */}
      {order.length > 1 && (
        <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line pb-2">
          <StepPlayer
            steps={order.length}
            value={step ?? 0}
            onValueChange={setStep}
            playing={playing}
            onPlayingChange={(p) => {
              if (p && step === null) setStep(0);
              setPlaying(p);
            }}
            label="番目"
          />
          <span className="text-tiny text-subtle">
            {current ? (
              <>
                <span className="tnum font-medium text-fg">
                  {(step ?? 0) + 1}/{order.length}
                </span>{' '}
                <span className="font-mono text-fg">{current.name}</span>
              </>
            ) : (
              '上が最後の処理、下へ行くほど先に動く'
            )}
          </span>
          {step !== null && (
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setStep(null);
              }}
              className="ml-auto shrink-0 text-tiny text-muted underline underline-offset-2 hover:text-fg"
            >
              全体に戻す
            </button>
          )}
        </div>
      )}

      <motion.ul variants={STAGGER} initial="hidden" animate="shown" data-testid="plan-tree">
        <Row node={plan.root} walk={{ step, rank }} />
      </motion.ul>
    </div>
  );
}
