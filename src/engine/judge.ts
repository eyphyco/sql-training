import type { QueryResult } from './duckdb';
import type { JudgeSpec } from '../types';

export interface JudgeResult {
  correct: boolean;
  /** 見出しとして表示するメッセージ */
  message: string;
  /** 追加の説明（不一致の内訳など） */
  details: string[];
  /** 期待値にあってユーザー結果に無い行 */
  missingRows?: unknown[][];
  /** ユーザー結果にあって期待値に無い行 */
  extraRows?: unknown[][];
}

/** 比較キーを組み立てるための区切り。データ中に現れない文字列を使う */
const NULL_TOKEN = '<<NULL>>';
const CELL_SEP = '<|>';

/** 比較用に値を正規化した文字列へ落とす */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return NULL_TOKEN;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    // 浮動小数の誤差で不正解にならないよう小数第6位で丸める
    return Number.isInteger(value) ? String(value) : value.toFixed(6);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

const rowKey = (row: unknown[]): string => row.map(canonical).join(CELL_SEP);

/**
 * 画面表示用の文字列。比較用の canonical() と違い、桁を水増しせずに見せる。
 * 浮動小数の誤差（0.30000000000000004 など）だけは 6 桁で丸めて落とす。
 */
export const displayCell = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(6)));
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

function projectColumns(
  result: QueryResult,
  wanted: string[] | null,
): { rows: unknown[][]; missing: string[] } {
  if (!wanted || wanted.length === 0) return { rows: result.rows, missing: [] };
  const lower = result.columns.map((c) => c.toLowerCase());
  const indexes: number[] = [];
  const missing: string[] = [];
  for (const name of wanted) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx === -1) missing.push(name);
    else indexes.push(idx);
  }
  if (missing.length > 0) return { rows: [], missing };
  return { rows: result.rows.map((r) => indexes.map((i) => r[i])), missing: [] };
}

/** 結果セットを比較して採点する（設計書 6-1） */
export function judgeResultSet(
  actual: QueryResult,
  expected: QueryResult,
  judge: JudgeSpec,
): JudgeResult {
  const a = projectColumns(actual, judge.compare_columns);
  if (a.missing.length > 0) {
    return {
      correct: false,
      message: '必要な列が結果に含まれていません',
      details: [
        `見つからない列: ${a.missing.join(', ')}`,
        `実際の列: ${actual.columns.join(', ')}`,
        'この問題は列名を指定して採点します。問題文の指定どおりに別名（AS）を付けてください。',
      ],
    };
  }
  const e = projectColumns(expected, judge.compare_columns);
  // 模範解答側に指定の列が無いのは問題データの不備。
  // npm run validate で弾いているが、ここで不正解として黙らせない
  if (e.missing.length > 0) {
    return {
      correct: false,
      message: '問題データの不備です（採点に使う列が模範解答の結果にありません）',
      details: [
        `見つからない列: ${e.missing.join(', ')}`,
        `模範解答の列: ${expected.columns.join(', ')}`,
      ],
    };
  }

  if (!judge.compare_columns && actual.columns.length !== expected.columns.length) {
    return {
      correct: false,
      message: `列数が一致しません（期待 ${expected.columns.length} 列 / 実際 ${actual.columns.length} 列）`,
      details: [
        `期待する列: ${expected.columns.join(', ')}`,
        `実際の列  : ${actual.columns.join(', ')}`,
        '列名の違いは許容されますが、列の数と並び順は一致させてください。',
      ],
    };
  }

  const orderedActual = judge.order_sensitive
    ? a.rows
    : [...a.rows].sort((x, y) => rowKey(x).localeCompare(rowKey(y)));
  const orderedExpected = judge.order_sensitive
    ? e.rows
    : [...e.rows].sort((x, y) => rowKey(x).localeCompare(rowKey(y)));

  // 多重集合として差分を取る（重複行の個数も見る）
  const expectedCount = new Map<string, number>();
  for (const row of orderedExpected) {
    const k = rowKey(row);
    expectedCount.set(k, (expectedCount.get(k) ?? 0) + 1);
  }
  const extraRows: unknown[][] = [];
  for (const row of orderedActual) {
    const k = rowKey(row);
    const n = expectedCount.get(k) ?? 0;
    if (n > 0) expectedCount.set(k, n - 1);
    else extraRows.push(row);
  }
  const missingRows: unknown[][] = [];
  for (const row of orderedExpected) {
    const k = rowKey(row);
    const n = expectedCount.get(k) ?? 0;
    if (n > 0) {
      missingRows.push(row);
      expectedCount.set(k, n - 1);
    }
  }

  if (missingRows.length === 0 && extraRows.length === 0) {
    if (judge.order_sensitive) {
      for (let i = 0; i < orderedActual.length; i += 1) {
        if (rowKey(orderedActual[i]) !== rowKey(orderedExpected[i])) {
          return {
            correct: false,
            message: '行の内容は正しいですが、並び順が期待と異なります',
            details: [
              `${i + 1} 行目が不一致です。`,
              `期待: ${orderedExpected[i].map(displayCell).join(' | ')}`,
              `実際: ${orderedActual[i].map(displayCell).join(' | ')}`,
              'この問題は並び順も採点対象です。ORDER BY を見直してください。',
            ],
          };
        }
      }
    }
    return { correct: true, message: '正解！結果セットが完全に一致しました。', details: [] };
  }

  const details: string[] = [];
  if (orderedActual.length !== orderedExpected.length) {
    details.push(`行数: 期待 ${orderedExpected.length} 行 / 実際 ${orderedActual.length} 行`);
  }
  if (missingRows.length > 0) details.push(`不足している行: ${missingRows.length} 行`);
  if (extraRows.length > 0) details.push(`余分な行: ${extraRows.length} 行`);
  return {
    correct: false,
    message: '不正解：結果セットが期待と一致しません',
    details,
    missingRows: missingRows.slice(0, 10),
    extraRows: extraRows.slice(0, 10),
  };
}

/** SQL 本文 / EXPLAIN 出力に対するパターン判定（設計書 6-1 の 4） */
export function checkPatterns(
  sql: string,
  explainText: string,
  judge: JudgeSpec,
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const upperSql = sql.toUpperCase();
  const upperPlan = explainText.toUpperCase();
  for (const p of judge.sql_required ?? []) {
    if (!new RegExp(p, 'i').test(upperSql))
      violations.push(`SQL に必要な要素が見つかりません: /${p}/`);
  }
  for (const p of judge.sql_forbidden ?? []) {
    if (new RegExp(p, 'i').test(upperSql))
      violations.push(`この問題で禁止されている書き方が含まれています: /${p}/`);
  }
  for (const p of judge.explain_required ?? []) {
    if (!new RegExp(p, 'i').test(upperPlan))
      violations.push(`実行計画に期待した演算子が現れていません: /${p}/`);
  }
  for (const p of judge.explain_forbidden ?? []) {
    if (new RegExp(p, 'i').test(upperPlan))
      violations.push(`実行計画に避けるべき演算子が現れています: /${p}/`);
  }
  return { ok: violations.length === 0, violations };
}

interface ErrorHint {
  pattern: RegExp;
  title: string;
  advice: string;
}

/** よくあるエラーに日本語の簡易解説を添える（設計書 6-1 の 3） */
const ERROR_HINTS: ErrorHint[] = [
  {
    pattern: /must appear in the GROUP BY clause|column .* must appear/i,
    title: 'GROUP BY 漏れ',
    advice:
      'SELECT 句に書いた列のうち、集約関数で包まれていない列はすべて GROUP BY に並べる必要があります。逆に「グループごとに 1 つに定まらない列」を出したいときは MAX() や any_value() で包むか、ウィンドウ関数の利用を検討してください。',
  },
  {
    pattern:
      /aggregate function.*not allowed in WHERE|WHERE clause cannot contain aggregates|aggregates are not allowed in the WHERE/i,
    title: 'WHERE に集約関数は書けない',
    advice:
      'WHERE はグループ化する「前」の各行に対する絞り込みです。SUM や AVG などの集約結果で絞り込むには HAVING を使ってください。',
  },
  {
    pattern: /window function.*not allowed|WINDOW.*not allowed in WHERE/i,
    title: 'WHERE にウィンドウ関数は書けない',
    advice:
      'ウィンドウ関数は WHERE / HAVING より後に評価されます。RANK() などの結果で絞り込むには、サブクエリや CTE でいったん計算してから外側で WHERE をかけてください。',
  },
  {
    pattern: /Table with name .* does not exist|Catalog Error/i,
    title: 'テーブル名が違う',
    advice:
      '右ペインの「スキーマ」タブでテーブル名を確認してください。DuckDB では識別子の綴りミスがそのままエラーになります。',
  },
  {
    pattern: /Referenced column .* not found|Binder Error: Referenced column/i,
    title: '列名が違う',
    advice:
      '右ペインのスキーマで列名を確認してください。別名（AS）の綴りミスもこのエラーになります。',
  },
  {
    pattern: /Ambiguous reference to column/i,
    title: '列名が曖昧',
    advice: '複数のテーブルに同名の列があります。「テーブル名.列名」の形で修飾してください。',
  },
  {
    pattern: /Conversion Error|Could not convert/i,
    title: '型変換エラー',
    advice:
      '文字列と数値を直接比較していないか確認してください。必要なら CAST(x AS INTEGER) などで明示的に変換します。',
  },
  {
    pattern: /Parser Error|syntax error at or near/i,
    title: '構文エラー',
    advice:
      'カッコの対応、カンマの過不足、キーワードの綴りを確認してください。エラーメッセージ中の「LINE n:」が問題箇所の目安です。',
  },
];

export function explainSqlError(message: string): { title: string; advice: string } | null {
  for (const hint of ERROR_HINTS) {
    if (hint.pattern.test(message)) return { title: hint.title, advice: hint.advice };
  }
  return null;
}
