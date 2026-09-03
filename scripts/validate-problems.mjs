#!/usr/bin/env node
/**
 * 問題データの静的検証。
 * - 必須フィールド / ID 重複 / phase・level の範囲
 * - sql_query 問題は schema_sql・seed_data_sql・expected_query を実際に DuckDB で実行する
 * - judge のパターン規則を模範解答自身が満たしているかも確認する
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance } from '@duckdb/node-api';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/data/problems');

const errors = [];
const warnings = [];
const fail = (id, msg) => errors.push(`[${id}] ${msg}`);
const warn = (id, msg) => warnings.push(`[${id}] ${msg}`);

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const problems = [];
for (const f of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  } catch (e) {
    fail(f, `JSON として読めません: ${e.message}`);
    continue;
  }
  if (!Array.isArray(parsed)) {
    fail(f, 'トップレベルは配列である必要があります');
    continue;
  }
  for (const p of parsed) problems.push({ ...p, __file: f });
}

const seen = new Set();
for (const p of problems) {
  const id = p.id ?? '(id なし)';
  if (!p.id) fail(p.__file, 'id がありません');
  if (seen.has(p.id)) fail(id, 'id が重複しています');
  seen.add(p.id);
  for (const key of ['type', 'phase', 'level', 'title', 'prompt_md', 'explanation_md', 'tags']) {
    if (p[key] === undefined) fail(id, `必須フィールド ${key} がありません`);
  }
  if (![1, 2, 3, 4, 5, 6, 7].includes(p.phase)) fail(id, `phase が不正: ${p.phase}`);
  if (![1, 2, 3].includes(p.level)) fail(id, `level が不正: ${p.level}`);
  if (!Array.isArray(p.tags) || p.tags.length === 0) fail(id, 'tags は 1 つ以上必要です');
  const expectedPhase = Number(String(p.id).match(/^phase(\d)/)?.[1]);
  if (expectedPhase && expectedPhase !== p.phase) fail(id, `id の接頭辞と phase が食い違っています`);

  if (p.type === 'multiple_choice') {
    if (!Array.isArray(p.options) || p.options.length < 2) fail(id, 'options が 2 つ未満です');
    else if (!p.options.some((o) => o.id === p.correct_option_id)) {
      fail(id, `correct_option_id (${p.correct_option_id}) が options にありません`);
    }
  } else if (p.type === 'written') {
    for (const key of ['sample_answer_md', 'grading_note_md']) {
      if (!p[key]) fail(id, `必須フィールド ${key} がありません`);
    }
  } else if (p.type === 'sql_query') {
    for (const key of ['schema_sql', 'seed_data_sql', 'expected_query', 'judge']) {
      if (!p[key]) fail(id, `必須フィールド ${key} がありません`);
    }
    if (p.judge && typeof p.judge.order_sensitive !== 'boolean') {
      fail(id, 'judge.order_sensitive は boolean が必要です');
    }
  } else {
    fail(id, `未知の type: ${p.type}`);
  }
}

// SQL を実際に実行して確認する
const instance = await DuckDBInstance.create(':memory:');
const conn = await instance.connect();

async function resetAll() {
  const t = await conn.runAndReadAll(
    "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='main'",
  );
  for (const [name, type] of t.getRows()) {
    await conn.run(`DROP ${type === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS "${name}" CASCADE`);
  }
  const s = await conn.runAndReadAll('SELECT sequence_name FROM duckdb_sequences()');
  for (const [name] of s.getRows()) await conn.run(`DROP SEQUENCE IF EXISTS "${name}"`);
}

let checked = 0;
for (const p of problems) {
  if (p.type !== 'sql_query' || !p.schema_sql || !p.expected_query) continue;
  try {
    await resetAll();
    await conn.run(p.schema_sql);
    await conn.run(p.seed_data_sql);
  } catch (e) {
    fail(p.id, `schema/seed の実行に失敗: ${e.message}`);
    continue;
  }
  let reader;
  try {
    reader = await conn.runAndReadAll(p.expected_query);
  } catch (e) {
    fail(p.id, `expected_query の実行に失敗: ${e.message}`);
    continue;
  }
  const rows = reader.getRows();
  if (rows.length === 0) warn(p.id, 'expected_query の結果が 0 行です（意図的でなければ要確認）');
  if (rows.length > 100) warn(p.id, `expected_query が ${rows.length} 行を返します（多すぎないか確認）`);
  if (p.judge?.compare_columns) {
    const cols = reader.columnNames().map((c) => c.toLowerCase());
    for (const c of p.judge.compare_columns) {
      if (!cols.includes(c.toLowerCase())) {
        fail(p.id, `judge.compare_columns の ${c} が expected_query の結果にありません（実際: ${cols.join(', ')}）`);
      }
    }
  }
  // 模範解答自身がパターン規則を満たすか
  const j = p.judge ?? {};
  const upperSql = p.expected_query.toUpperCase();
  for (const pat of j.sql_required ?? []) {
    if (!new RegExp(pat, 'i').test(upperSql)) fail(p.id, `模範解答が sql_required /${pat}/ を満たしません`);
  }
  for (const pat of j.sql_forbidden ?? []) {
    if (new RegExp(pat, 'i').test(upperSql)) fail(p.id, `模範解答が sql_forbidden /${pat}/ に抵触します`);
  }
  if ((j.explain_required?.length ?? 0) + (j.explain_forbidden?.length ?? 0) > 0) {
    try {
      const ex = await conn.runAndReadAll(`EXPLAIN ${p.expected_query}`);
      const plan = ex.getRows().flat().filter(Boolean).join('\n').toUpperCase();
      for (const pat of j.explain_required ?? []) {
        if (!new RegExp(pat, 'i').test(plan)) fail(p.id, `模範解答の実行計画が explain_required /${pat}/ を満たしません`);
      }
      for (const pat of j.explain_forbidden ?? []) {
        if (new RegExp(pat, 'i').test(plan)) fail(p.id, `模範解答の実行計画が explain_forbidden /${pat}/ に抵触します`);
      }
    } catch (e) {
      fail(p.id, `EXPLAIN の実行に失敗: ${e.message}`);
    }
  }
  checked += 1;
}

const byPhase = {};
for (const p of problems) byPhase[p.phase] = (byPhase[p.phase] ?? 0) + 1;

console.log(`問題数: ${problems.length}（SQL 実行検証: ${checked} 問）`);
console.log(
  'フェーズ別:',
  Object.entries(byPhase)
    .sort()
    .map(([k, v]) => `P${k}=${v}`)
    .join(' '),
);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} 件のエラーがあります。`);
  process.exit(1);
}
console.log('検証 OK');
