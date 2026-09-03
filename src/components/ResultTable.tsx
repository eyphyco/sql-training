import { displayCell } from '../engine/judge';

interface Props {
  columns: string[];
  rows: unknown[][];
  maxRows?: number;
  emptyMessage?: string;
}

export default function ResultTable({ columns, rows, maxRows = 200, emptyMessage = '0 行' }: Props) {
  if (columns.length === 0) {
    return <p className="p-4 text-[13px] text-muted">結果セットを返さない文が実行されました。</p>;
  }
  const shown = rows.slice(0, maxRows);
  return (
    <div className="overflow-auto">
      <table className="tnum w-full border-collapse text-left text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-raised">
          <tr>
            <th className="w-10 border-b border-line px-2 py-1.5 text-right font-mono text-[10.5px] font-normal text-subtle">
              #
            </th>
            {columns.map((c, i) => (
              <th
                key={`${c}-${i}`}
                className="border-b border-line px-3 py-1.5 font-mono text-[11.5px] font-medium whitespace-nowrap text-muted"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr key={r} className="border-b border-line/60 last:border-0 hover:bg-raised">
              <td className="px-2 py-1.5 text-right font-mono text-[10.5px] text-subtle">{r + 1}</td>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`px-3 py-1.5 font-mono text-[12px] whitespace-nowrap ${
                    cell === null ? 'text-subtle italic' : 'text-fg'
                  }`}
                >
                  {displayCell(cell)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-5 text-[13px] text-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <p className="border-t border-line px-3 py-2 text-[11.5px] text-subtle">
          先頭 {maxRows} 行のみ表示（全 {rows.length} 行）
        </p>
      )}
    </div>
  );
}
