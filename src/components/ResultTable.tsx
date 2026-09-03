import { displayCell } from '../engine/judge';

interface Props {
  columns: string[];
  rows: unknown[][];
  maxRows?: number;
  emptyMessage?: string;
}

export default function ResultTable({ columns, rows, maxRows = 200, emptyMessage = '0 行' }: Props) {
  if (columns.length === 0) {
    return <p className="p-4 text-sm text-slate-400">結果セットを返さない文が実行されました。</p>;
  }
  const shown = rows.slice(0, maxRows);
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 bg-slate-800">
          <tr>
            <th className="border-b border-slate-700 px-2 py-1.5 text-right font-mono text-[11px] text-slate-500">
              #
            </th>
            {columns.map((c, i) => (
              <th
                key={`${c}-${i}`}
                className="whitespace-nowrap border-b border-slate-700 px-3 py-1.5 font-mono text-xs font-semibold text-sky-300"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr key={r} className="odd:bg-slate-900/40 hover:bg-slate-800/60">
              <td className="px-2 py-1 text-right font-mono text-[11px] text-slate-600">{r + 1}</td>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`whitespace-nowrap px-3 py-1 font-mono text-xs ${
                    cell === null ? 'text-slate-600 italic' : 'text-slate-200'
                  }`}
                >
                  {displayCell(cell)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-4 text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <p className="px-3 py-2 text-xs text-slate-500">
          先頭 {maxRows} 行のみ表示（全 {rows.length} 行）
        </p>
      )}
    </div>
  );
}
