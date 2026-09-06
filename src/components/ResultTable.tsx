import { useMemo } from 'react';
import { displayCell } from '../engine/judge';

interface Props {
  columns: string[];
  rows: unknown[][];
  maxRows?: number;
  emptyMessage?: string;
}

const isNumber = (v: unknown) => typeof v === 'number' || typeof v === 'bigint';

/**
 * 実行結果の表。
 *
 * 見出しと 1 行目が同じ書体で並ぶと、どこからがデータか一瞬迷う。
 * 見出しは帯を敷いて太字にし、下の罫を 1 段濃くして境目をはっきりさせる。
 * 行は 1 行おきに薄く敷いて、列が多いときに横へ目を送れるようにする。
 */
export default function ResultTable({
  columns,
  rows,
  maxRows = 200,
  emptyMessage = '0 行',
}: Props) {
  const shown = useMemo(() => rows.slice(0, maxRows), [rows, maxRows]);

  /*
    数値だけの列は右に寄せる。桁が揃うので大小を目で比べられる。
    NULL は判定から外す（NULL しかない列は寄せない）。
  */
  const numeric = useMemo(
    () =>
      columns.map((_, c) => {
        let seen = false;
        for (const row of shown) {
          const v = row[c];
          if (v === null || v === undefined) continue;
          if (!isNumber(v)) return false;
          seen = true;
        }
        return seen;
      }),
    [columns, shown],
  );

  if (columns.length === 0) {
    return <p className="p-4 text-body text-muted">結果セットを返さない文が実行されました。</p>;
  }
  return (
    <div className="overflow-auto">
      <table className="tnum w-full border-collapse text-left text-small">
        <thead className="glass-sticky sticky top-0 z-10">
          <tr>
            <th className="w-10 border-b border-line-strong px-2 py-1.5 text-right font-mono text-micro font-normal text-subtle">
              #
            </th>
            {columns.map((c, i) => (
              <th
                key={`${c}-${i}`}
                className={`border-b border-line-strong px-3 py-1.5 font-mono text-tiny font-semibold whitespace-nowrap text-fg ${
                  numeric[i] ? 'text-right' : 'text-left'
                }`}
              >
                {c}
              </th>
            ))}
            {/* 余白を吸わせる列。これが無いと列が横いっぱいに引き伸ばされる */}
            <th className="w-full border-b border-line-strong" />
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr
              key={r}
              className="border-b border-line/60 transition-colors last:border-0 odd:bg-raised/40 hover:bg-accent-soft/60"
            >
              <td className="px-2 py-1.5 text-right font-mono text-micro text-subtle">{r + 1}</td>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`px-3 py-1.5 font-mono text-small whitespace-nowrap ${
                    numeric[c] ? 'text-right' : 'text-left'
                  } ${cell === null ? 'text-subtle italic' : 'text-fg'}`}
                >
                  {displayCell(cell)}
                </td>
              ))}
              <td />
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="px-3 py-5 text-body text-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <p className="border-t border-line px-3 py-2 text-tiny text-subtle">
          先頭 {maxRows} 行のみ表示（全 {rows.length} 行）
        </p>
      )}
    </div>
  );
}
