#!/usr/bin/env node
/** 模範解答を実行して結果を表示する開発用ツール: node scripts/show-expected.mjs <問題ID...> */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/data/problems');
const all = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const ids = process.argv.slice(2);
const inst = await DuckDBInstance.create(':memory:');
const c = await inst.connect();
for (const p of all.filter((p) => ids.length === 0 || ids.includes(p.id))) {
  if (p.type !== 'sql_query') continue;
  const t = await c.runAndReadAll(
    "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='main'",
  );
  for (const [n, ty] of t.getRows()) await c.run(`DROP ${ty === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS "${n}" CASCADE`);
  await c.run(p.schema_sql);
  await c.run(p.seed_data_sql);
  const r = await c.runAndReadAll(p.expected_query);
  console.log(`\n=== ${p.id} ${p.title}`);
  console.log(r.columnNames().join(' | '));
  for (const row of r.getRows()) console.log(row.map((v) => (v === null ? 'NULL' : String(v))).join(' | '));
}
