import { useEffect, useRef, useState } from 'react';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { connect, describeTables, resetEnvironment } from '../engine/duckdb';
import type { TableSchema } from '../engine/duckdb';
import { markF5Handled } from '../storage/workbenchSession';

/*
  作業環境の面倒を見る部分。SqlWorkbench が 600 行を超えて、
  「DuckDB の用意」「キーの横取り」「タブ内の保存」が本題（実行と採点）に
  混ざっていたので、外に出した。動きは変えていない。
*/

export interface Workbench {
  /** 実行に使う接続。差し替わるので ref で持つ */
  connRef: React.RefObject<AsyncDuckDBConnection | null>;
  status: 'booting' | 'ready' | 'error';
  error: string;
  schema: TableSchema[];
  setSchema: (schema: TableSchema[]) => void;
}

/** 問題ごとに DuckDB の環境を作り直す */
export function useDuckDb(schemaSql: string, seedSql: string, problemId: string): Workbench {
  const connRef = useRef<AsyncDuckDBConnection | null>(null);
  const [state, setState] = useState<{ id: string; status: 'booting' | 'ready' | 'error' }>({
    id: problemId,
    status: 'booting',
  });
  const [error, setError] = useState('');
  const [schema, setSchema] = useState<TableSchema[]>([]);

  // 問題が変わったら描画中に作り直しへ戻す（effect で戻すと 1 フレーム古い環境が見える）
  if (state.id !== problemId) setState({ id: problemId, status: 'booting' });

  useEffect(() => {
    let disposed = false;
    let conn: AsyncDuckDBConnection | null = null;
    (async () => {
      try {
        conn = await connect();
        if (disposed) {
          await conn.close();
          return;
        }
        connRef.current = conn;
        await resetEnvironment(conn, schemaSql, seedSql);
        const tables = await describeTables(conn);
        if (disposed) return;
        setSchema(tables);
        setState({ id: problemId, status: 'ready' });
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : String(e));
          setState({ id: problemId, status: 'error' });
        }
      }
    })();
    return () => {
      disposed = true;
      const c = connRef.current;
      connRef.current = null;
      if (c) void c.close();
    };
  }, [problemId, schemaSql, seedSql]);

  return { connRef, status: state.status, error, schema, setSchema };
}

/**
 * 実行のショートカット（F5 / Ctrl+Enter）。
 *
 * リロードしたいときのために Ctrl+R / ⌘R は横取りしない。
 * capture フェーズで拾って stopPropagation する理由:
 *   - Ctrl+Enter は CodeMirror の既定キーマップで insertBlankLine に割り当てられており、
 *     bubble で受けると「空行が入る + 実行される」の二重動作になる。
 *   - 途中の誰かが stopPropagation してもリロードの抑止だけは確実に効かせたい。
 * key ではなく code も見るのは、IME が有効なときに key が 'Process' になる環境があるため。
 */
export function useRunShortcuts(run: () => void): void {
  // run は入力のたびに作り直されるので、リスナーの再登録を避けて ref 経由で呼ぶ
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const noMods = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
      const isF5 = (e.code === 'F5' || e.key === 'F5') && noMods;
      const isModEnter = (e.code === 'Enter' || e.key === 'Enter') && (e.ctrlKey || e.metaKey);
      if (!isF5 && !isModEnter) return;
      e.preventDefault();
      e.stopPropagation();
      if (isF5) markF5Handled();
      // 押しっぱなしのオートリピートでは実行しない（抑止だけは毎回する）
      if (e.repeat) return;
      runRef.current();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}
