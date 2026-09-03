import type { TableSchema } from '../engine/duckdb';

export default function SchemaPanel({ schema }: { schema: TableSchema[] }) {
  if (schema.length === 0) {
    return <p className="p-4 text-sm text-slate-400">テーブルがありません。</p>;
  }
  return (
    <div className="space-y-4 p-3">
      {schema.map((t) => (
        <div key={t.name} className="rounded-lg border border-slate-700 bg-slate-900/60">
          <div className="flex items-baseline justify-between border-b border-slate-700 px-3 py-2">
            <span className="font-mono text-sm font-semibold text-sky-300">{t.name}</span>
            <span className="text-[11px] text-slate-500">{t.rowCount} 行</span>
          </div>
          <table className="w-full text-left text-[12px]">
            <tbody>
              {t.columns.map((c) => (
                <tr key={c.name} className="border-b border-slate-800 last:border-0">
                  <td className="px-3 py-1 font-mono text-slate-200">{c.name}</td>
                  <td className="px-3 py-1 text-right font-mono text-[11px] text-slate-500">{c.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
