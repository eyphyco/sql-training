import * as duckdb from '@duckdb/duckdb-wasm';
import type { Table, DataType } from 'apache-arrow';
import { Type } from 'apache-arrow';

// wasm / worker はローカルにバンドルする（CDN 依存なし・GitHub Pages のサブパスでも動く）
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  /** 実行時間（ミリ秒） */
  elapsedMs: number;
  /** SELECT 以外で結果を返さない場合 true */
  isEmptyResult: boolean;
}

export interface TableSchema {
  name: string;
  columns: { name: string; type: string }[];
  rowCount: number;
}

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function createDb(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  await db.open({ query: { castBigIntToDouble: false } });
  return db;
}

/** DuckDB インスタンスはアプリ全体で 1 つだけ使い回す */
export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) dbPromise = createDb();
  return dbPromise;
}

export async function connect(): Promise<duckdb.AsyncDuckDBConnection> {
  const db = await getDb();
  return db.connect();
}

/**
 * SQL を「;」区切りの文に分割する。文字列リテラル・識別子・コメント・
 * ドル引用符の中の「;」は区切りとして扱わない。
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    // ドル引用符 $$...$$ / $tag$...$tag$。$1 のような番号は引用符ではない
    if (ch === '$') {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) j += 2;
          else break;
        } else j += 1;
      }
      buf += sql.slice(i, Math.min(j + 1, sql.length));
      i = j + 1;
      continue;
    }
    if (ch === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Arrow の値を JS の素の値に落とす（BigInt / DECIMAL / DATE などを吸収） */
function normalizeValue(value: unknown, type: DataType | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value instanceof Uint32Array) {
    // DECIMAL は 32bit ワードのリトルエンディアン配列で返る
    let acc = 0n;
    for (let w = value.length - 1; w >= 0; w -= 1) acc = (acc << 32n) | BigInt(value[w]);
    const bits = BigInt(value.length * 32);
    if (acc >= 1n << (bits - 1n)) acc -= 1n << bits;
    const scale = type && type.typeId === Type.Decimal ? ((type as unknown as { scale: number }).scale ?? 0) : 0;
    return Number(acc) / 10 ** scale;
  }
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    return Array.from(value as ArrayLike<unknown>).map((v) => normalizeValue(v, undefined));
  }
  if (typeof value === 'object') {
    const obj = value as { toJSON?: () => unknown; toString: () => string };
    if (typeof obj.toJSON === 'function') return obj.toJSON();
    return obj.toString();
  }
  return value;
}

function tableToResult(table: Table, elapsedMs: number): QueryResult {
  const fields = table.schema.fields;
  const columns = fields.map((f) => f.name);
  const rows: unknown[][] = [];
  for (let r = 0; r < table.numRows; r += 1) {
    const row: unknown[] = [];
    for (let c = 0; c < fields.length; c += 1) {
      row.push(normalizeValue(table.getChildAt(c)?.get(r), fields[c].type));
    }
    rows.push(row);
  }
  return { columns, rows, elapsedMs, isEmptyResult: columns.length === 0 };
}

export async function runQuery(
  conn: duckdb.AsyncDuckDBConnection,
  sql: string,
): Promise<QueryResult> {
  const started = performance.now();
  const statements = splitStatements(sql);
  if (statements.length === 0) throw new Error('SQL が入力されていません。');
  let table: Table | null = null;
  for (const stmt of statements) {
    table = (await conn.query(stmt)) as unknown as Table;
  }
  return tableToResult(table!, performance.now() - started);
}

/** 演習環境を初期化する。前の問題のテーブル等をすべて削除してから再構築する */
export async function resetEnvironment(
  conn: duckdb.AsyncDuckDBConnection,
  schemaSql: string,
  seedSql: string,
): Promise<void> {
  const views = (await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_type='VIEW'",
  )) as unknown as Table;
  for (let r = 0; r < views.numRows; r += 1) {
    const name = String(views.getChildAt(0)?.get(r));
    await conn.query(`DROP VIEW IF EXISTS "${name}" CASCADE`);
  }
  const tables = (await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_type='BASE TABLE'",
  )) as unknown as Table;
  for (let r = 0; r < tables.numRows; r += 1) {
    const name = String(tables.getChildAt(0)?.get(r));
    await conn.query(`DROP TABLE IF EXISTS "${name}" CASCADE`);
  }
  const seqs = (await conn.query('SELECT sequence_name FROM duckdb_sequences()')) as unknown as Table;
  for (let r = 0; r < seqs.numRows; r += 1) {
    const name = String(seqs.getChildAt(0)?.get(r));
    await conn.query(`DROP SEQUENCE IF EXISTS "${name}"`);
  }
  for (const stmt of splitStatements(schemaSql)) await conn.query(stmt);
  for (const stmt of splitStatements(seedSql)) await conn.query(stmt);
}

/** 右ペインに表示するテーブル一覧・カラム定義・件数を取得する */
export async function describeTables(
  conn: duckdb.AsyncDuckDBConnection,
): Promise<TableSchema[]> {
  const meta = (await conn.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'main'
      ORDER BY table_name, ordinal_position`,
  )) as unknown as Table;
  const byTable = new Map<string, { name: string; type: string }[]>();
  for (let r = 0; r < meta.numRows; r += 1) {
    const table = String(meta.getChildAt(0)?.get(r));
    const column = String(meta.getChildAt(1)?.get(r));
    const type = String(meta.getChildAt(2)?.get(r));
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table)!.push({ name: column, type });
  }
  const result: TableSchema[] = [];
  for (const [name, columns] of byTable) {
    const count = (await conn.query(`SELECT count(*) FROM "${name}"`)) as unknown as Table;
    result.push({ name, columns, rowCount: Number(count.getChildAt(0)?.get(0) ?? 0) });
  }
  return result;
}

/** EXPLAIN の出力をプレーンテキストとして取得する */
export async function explainQuery(
  conn: duckdb.AsyncDuckDBConnection,
  sql: string,
): Promise<string> {
  const statements = splitStatements(sql);
  // 空のまま押されると EXPLAIN undefined を投げてしまうので、実行と同じ文言で止める
  if (statements.length === 0) throw new Error('SQL が入力されていません。');
  const target = statements[statements.length - 1];
  const table = (await conn.query(`EXPLAIN ${target}`)) as unknown as Table;
  const parts: string[] = [];
  for (let r = 0; r < table.numRows; r += 1) {
    for (let c = 0; c < table.schema.fields.length; c += 1) {
      const v = table.getChildAt(c)?.get(r);
      if (v != null) parts.push(String(v));
    }
  }
  return parts.join('\n');
}
