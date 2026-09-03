import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { acceptCompletion } from '@codemirror/autocomplete';
import type { TableSchema } from '../engine/duckdb';
import { useTheme } from '../theme/themeContext';
import { editorTheme } from './editorTheme';

interface Props {
  value: string;
  onChange: (value: string) => void;
  schema: TableSchema[];
  height?: string;
}

export default function QueryEditor({ value, onChange, schema, height = '100%' }: Props) {
  const { resolved } = useTheme();

  // テーブル・列名を補完候補として渡す
  const extensions = useMemo(() => {
    const schemaMap: Record<string, string[]> = {};
    for (const t of schema) schemaMap[t.name] = t.columns.map((c) => c.name);
    return [
      sql({ dialect: PostgreSQL, schema: schemaMap, upperCaseKeywords: true }),
      // 補完候補が出ているときだけ Tab で確定する。
      // acceptCompletion は候補が無ければ false を返すので、その場合は
      // 既定の indentWithTab に処理が落ち、インデントは従来どおり効く。
      // indentWithTab より先に評価させるため最高優先度で登録する。
      Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
      // ペインが狭いので長い行は折り返す（横スクロールで式が見切れるのを防ぐ）
      EditorView.lineWrapping,
      editorTheme(resolved === 'dark'),
    ];
  }, [schema, resolved]);

  // 実行のショートカット（F5 / Ctrl+Enter）は SqlWorkbench 側で
  // ウィンドウ全体に登録している。ここで重ねて拾うと二重実行になる。
  return (
    <div className="h-full overflow-hidden">
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
