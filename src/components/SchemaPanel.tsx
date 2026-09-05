import { motion } from 'motion/react';
import type { TableSchema } from '../engine/duckdb';
import { IconTable } from './icons';
import { RISE, STAGGER } from './motion';

/**
 * 右ペインのスキーマ一覧。
 *
 * テーブル名と列名が同じ書体・同じ大きさ・同じ左端で並んでいると、
 * どこまでが 1 つのテーブルか見分けが付かない。差を 3 つ付けている:
 *   - 位置: 列は字下げして縦の罫の内側に入れる（入れ子であることを形で示す）
 *   - 強さ: テーブル名は太字で本文色、列名は 1 段落とした色
 *   - 位置の固定: テーブル名は帯にして貼り付ける。長い定義を送っても
 *     いま見ているのがどのテーブルの列か分かる
 */
export default function SchemaPanel({ schema }: { schema: TableSchema[] }) {
  if (schema.length === 0) {
    return <p className="p-4 text-[13px] text-muted">テーブルがありません。</p>;
  }
  /* DuckDB の初期化が終わってから届くので、出るときは順に浮かせる */
  return (
    <motion.div variants={STAGGER} initial="hidden" animate="shown" className="pb-2">
      {schema.map((t) => (
        <motion.section key={t.name} variants={RISE}>
          <header className="glass-sticky sticky top-0 z-10 flex items-center gap-2 border-y border-line px-3 py-2">
            <IconTable size={13} className="shrink-0 text-accent" />
            <span
              data-testid="schema-table"
              className="font-mono text-[12.5px] font-semibold tracking-tight text-fg"
            >
              {t.name}
            </span>
            <span className="tnum ml-auto shrink-0 text-[10.5px] text-subtle">
              {t.columns.length} 列 · {t.rowCount} 行
            </span>
          </header>
          {/* 罫はテーブル名のアイコンの真下。列名はそこからさらに字下げする */}
          <ul className="my-1 ml-[19px] border-l border-line">
            {t.columns.map((c) => (
              <li
                key={c.name}
                className="flex items-baseline gap-3 py-[3px] pr-3 pl-6 transition-colors hover:bg-raised"
              >
                <span
                  data-testid="schema-column"
                  className="min-w-0 truncate font-mono text-[12px] text-muted"
                >
                  {c.name}
                </span>
                <span
                  data-testid="schema-type"
                  className="ml-auto shrink-0 rounded bg-sunken px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-subtle"
                >
                  {c.type}
                </span>
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
    </motion.div>
  );
}
