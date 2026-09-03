import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import type { TableSchema } from '../engine/duckdb';
import { useTheme } from '../theme/themeContext';
import { editorTheme } from './editorTheme';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  schema: TableSchema[];
  height?: string;
}

export default function QueryEditor({ value, onChange, onRun, schema, height = '100%' }: Props) {
  const { resolved } = useTheme();

  // テーブル・列名を補完候補として渡す
  const extensions = useMemo(() => {
    const schemaMap: Record<string, string[]> = {};
    for (const t of schema) schemaMap[t.name] = t.columns.map((c) => c.name);
    return [
      sql({ dialect: PostgreSQL, schema: schemaMap, upperCaseKeywords: true }),
      // ペインが狭いので長い行は折り返す（横スクロールで式が見切れるのを防ぐ）
      EditorView.lineWrapping,
      editorTheme(resolved === 'dark'),
    ];
  }, [schema, resolved]);

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
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          autocompletion: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
        }}
      />
    </div>
  );
}
