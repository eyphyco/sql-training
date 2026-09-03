import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import type { TableSchema } from '../engine/duckdb';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  schema: TableSchema[];
  height?: string;
}

export default function QueryEditor({ value, onChange, onRun, schema, height = '100%' }: Props) {
  // テーブル・列名を補完候補として渡す
  const extensions = useMemo(() => {
    const schemaMap: Record<string, string[]> = {};
    for (const t of schema) schemaMap[t.name] = t.columns.map((c) => c.name);
    return [sql({ dialect: PostgreSQL, schema: schemaMap, upperCaseKeywords: true })];
  }, [schema]);

  return (
    <div
      className="h-full overflow-hidden"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          onRun();
        }
      }}
    >
      <CodeMirror
        value={value}
        height={height}
        theme={oneDark}
        extensions={extensions}
        onChange={onChange}
        basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: true, highlightActiveLine: true }}
      />
    </div>
  );
}
