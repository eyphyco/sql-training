import { motion } from 'motion/react';
import type { PlanNode, QueryPlan } from '../engine/plan';
import { RISE, STAGGER } from './motion';

/*
  実行計画を木で見せる。

  DuckDB の既定の出力は枠線の図で、1 ノードが 7 行の箱になる。
  読み手が知りたいのは「どの順で、どの演算子が、何行を相手にしたか」なので、
  1 ノード 1 行に畳み、演算子の種類で色を分ける。

  結合と全件走査はこの教材の主題なので、そこだけ色を当てる
  （彩度の高い色は正誤の表示に取ってあるので、地の色との差で示す）。
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

function Row({ node }: { node: PlanNode }) {
  const kind = kindOf(node.name);
  const estimate = node.rows;
  const actual = node.actualRows;
  // 見積りと実測が桁で違うときは、そこが読みどころ
  const off =
    estimate !== null &&
    actual !== null &&
    estimate > 0 &&
    (actual / estimate >= 10 || (actual >= 10 && actual / estimate <= 0.1));

  return (
    <motion.li variants={RISE}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-[3px]">
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-micro font-medium ${TONE[kind]}`}
        >
          {node.name}
        </span>
        {node.info.map(([label, value]) => (
          <span
            key={label}
            title={`${label}: ${value}`}
            className="min-w-0 text-tiny text-muted"
          >
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
      </div>
      {node.children.length > 0 && (
        // 入れ子は 1 段ごとに罫 1 本。結合のように子が 2 つある所で形が見える
        <ul className="ml-2 border-l border-line pl-3">
          {node.children.map((child, i) => (
            <Row key={`${child.name}-${i}`} node={child} />
          ))}
        </ul>
      )}
    </motion.li>
  );
}

export default function PlanView({ plan }: { plan: QueryPlan }) {
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
          <span className="text-subtle">上が最後の処理、下へ行くほど先に動く</span>
        </p>
      )}
      <motion.ul variants={STAGGER} initial="hidden" animate="shown" data-testid="plan-tree">
        <Row node={plan.root} />
      </motion.ul>
    </div>
  );
}
