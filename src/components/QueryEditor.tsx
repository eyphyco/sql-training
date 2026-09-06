import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { Decoration, EditorView, keymap } from '@codemirror/view';
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
  /** エラーの行（1 始まり）。エディタ上でその行を塗る */
  errorLine?: number | null;
}

/*
  エラーの行に印を付ける。エラーメッセージは "LINE 3:" と教えてくれるのに、
  エディタ側が無反応だと自分で数えることになる。

  行は編集に追従させる（decorations.compute が doc の変化で走り直す）。
  行数を超えたら何も塗らない。
*/
const errorMark = Decoration.line({ class: 'cm-error-line' });

function errorLineExtension(line: number | null | undefined) {
  if (!line) return [];
  return [
    EditorView.decorations.compute(['doc'], (state) =>
      line <= state.doc.lines
        ? Decoration.set([errorMark.range(state.doc.line(line).from)])
        : Decoration.none,
    ),
  ];
}

export default function QueryEditor({
  value,
  onChange,
  schema,
  height = '100%',
  errorLine = null,
}: Props) {
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
      // CodeMirror の編集領域は contenteditable なので、読み上げ名を自分で付ける
      EditorView.contentAttributes.of({ 'aria-label': 'SQL エディタ' }),
      editorTheme(resolved === 'dark'),
      errorLineExtension(errorLine),
    ];
  }, [schema, resolved, errorLine]);

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
