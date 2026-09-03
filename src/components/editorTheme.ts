import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/**
 * エディタの配色。値はすべて CSS 変数を参照しているので、
 * ライト/ダークの切り替えはスタイルの再生成なしに追従する。
 * CodeMirror 内部の既定値（選択範囲の合成など）だけ dark フラグで切り替える。
 */
const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--c-syn-keyword)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--c-syn-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--c-syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--c-syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--c-syn-fn)' },
  { tag: [t.typeName, t.standard(t.name)], color: 'var(--c-syn-type)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--c-syn-punct)' },
  { tag: [t.variableName, t.propertyName, t.name], color: 'var(--c-fg)' },
  { tag: t.invalid, color: 'var(--c-danger)' },
]);

const baseTheme = EditorView.theme({
  '&': {
    color: 'var(--c-fg)',
    backgroundColor: 'transparent',
    fontSize: '13px',
  },
  '.cm-content': {
    caretColor: 'var(--c-accent)',
    padding: '12px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--c-fg-subtle)',
    border: 'none',
    paddingRight: '4px',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '12px', minWidth: '28px' },
  '.cm-line': { paddingLeft: '4px', paddingRight: '12px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--c-fg) 4%, transparent)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--c-fg-muted)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--c-accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--c-accent) 22%, transparent)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--c-accent) 14%, transparent)',
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--c-accent) 20%, transparent)',
    outline: 'none',
  },
  '.cm-tooltip': {
    // 画面に浮くものはヘッダ等と同じ「ガラス」に揃える
    backgroundColor: 'var(--c-chrome)',
    backdropFilter: 'blur(var(--blur-chrome)) saturate(1.8)',
    WebkitBackdropFilter: 'blur(var(--blur-chrome)) saturate(1.8)',
    border: '1px solid var(--c-line)',
    borderRadius: 'var(--r-md)',
    boxShadow: 'var(--shadow-pop), inset 0 1px 0 0 var(--c-glass-edge)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul > li': {
    fontFamily: 'var(--font-mono)',
    padding: '4px 10px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-fg)',
  },
  '.cm-completionIcon': { display: 'none' },
});

export function editorTheme(dark: boolean): Extension {
  return [
    baseTheme,
    EditorView.theme({}, { dark }),
    syntaxHighlighting(highlightStyle),
  ];
}
