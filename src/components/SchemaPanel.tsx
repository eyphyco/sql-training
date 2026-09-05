import type { TableSchema } from '../engine/duckdb';
import { IconTable } from './icons';

export default function SchemaPanel({ schema }: { schema: TableSchema[] }) {
  if (schema.length === 0) {
    return <p className="p-4 text-[13px] text-muted">テーブルがありません。</p>;
  }
  return (
    <div className="divide-y divide-line">
      {schema.map((t) => (
        <div key={t.name}>
          <div className="flex items-center gap-2 bg-raised px-3 py-1.5">
            <IconTable size={13} className="text-subtle" />
            <span className="font-mono text-[12.5px] font-medium text-fg">{t.name}</span>
            <span className="tnum ml-auto text-[11px] text-subtle">{t.rowCount} 行</span>
          </div>
          <table className="w-full text-left text-[12px]">
            <tbody>
              {t.columns.map((c) => (
                <tr key={c.name}>
                  <td className="py-1 pr-3 pl-3 font-mono text-fg">{c.name}</td>
                  <td className="py-1 pr-3 text-right font-mono text-[11px] text-subtle">
                    {c.type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
