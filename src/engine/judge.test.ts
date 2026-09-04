import { describe, expect, it } from 'vitest';
import { checkPatterns, displayCell, explainSqlError, judgeResultSet } from './judge';
import type { QueryResult } from './duckdb';
import type { JudgeSpec } from '../types';

const result = (columns: string[], rows: unknown[][]): QueryResult => ({
  columns,
  rows,
  elapsedMs: 1,
  isEmptyResult: columns.length === 0,
});

const spec = (over: Partial<JudgeSpec> = {}): JudgeSpec => ({
  type: 'result_set',
  order_sensitive: false,
  compare_columns: null,
  ...over,
});

describe('judgeResultSet — 一致の判定', () => {
  const expected = result(['class', 'avg'], [['A組', 77.5], ['C組', 70.25]]);

  it('同じ内容なら正解になる', () => {
    const r = judgeResultSet(result(['c', 'a'], [['A組', 77.5], ['C組', 70.25]]), expected, spec());
    expect(r.correct).toBe(true);
  });

  it('列名が違っても、数と並びが同じなら正解になる', () => {
    const r = judgeResultSet(
      result(['クラス', '平均'], [['A組', 77.5], ['C組', 70.25]]),
      expected,
      spec(),
    );
    expect(r.correct).toBe(true);
  });

  it('順不同の問題では行の並びが違っても正解になる', () => {
    const r = judgeResultSet(result(['c', 'a'], [['C組', 70.25], ['A組', 77.5]]), expected, spec());
    expect(r.correct).toBe(true);
  });

  it('順序を見る問題では並びが違うと不正解になる', () => {
    const r = judgeResultSet(
      result(['c', 'a'], [['C組', 70.25], ['A組', 77.5]]),
      expected,
      spec({ order_sensitive: true }),
    );
    expect(r.correct).toBe(false);
    expect(r.message).toContain('並び順');
    // 何行目が違うのかを示す
    expect(r.details[0]).toContain('1 行目');
  });

  it('列数が違うと、行を見る前に列数で落とす', () => {
    const r = judgeResultSet(result(['c'], [['A組'], ['C組']]), expected, spec());
    expect(r.correct).toBe(false);
    expect(r.message).toContain('列数が一致しません');
  });
});

describe('judgeResultSet — 差分の内訳', () => {
  const expected = result(['c'], [['A組'], ['C組']]);

  it('余分な行を報告する', () => {
    const r = judgeResultSet(result(['c'], [['A組'], ['B組'], ['C組']]), expected, spec());
    expect(r.correct).toBe(false);
    expect(r.extraRows).toEqual([['B組']]);
    expect(r.missingRows).toEqual([]);
  });

  it('不足している行を報告する', () => {
    const r = judgeResultSet(result(['c'], [['A組']]), expected, spec());
    expect(r.missingRows).toEqual([['C組']]);
    expect(r.extraRows).toEqual([]);
  });

  it('重複行の個数まで見る（多重集合として比較する）', () => {
    const dup = result(['c'], [['A組'], ['A組']]);
    const one = result(['c'], [['A組']]);
    expect(judgeResultSet(dup, one, spec()).correct).toBe(false);
    expect(judgeResultSet(dup, one, spec()).extraRows).toEqual([['A組']]);
  });

  it('内訳の表示は 10 行までに切る', () => {
    const many = result(['n'], Array.from({ length: 30 }, (_, i) => [i]));
    const r = judgeResultSet(many, result(['n'], []), spec());
    expect(r.extraRows).toHaveLength(10);
    // 件数そのものは省略せずに伝える
    expect(r.details.join('\n')).toContain('30 行');
  });

  it('空の結果どうしは正解', () => {
    expect(judgeResultSet(result(['a'], []), result(['a'], []), spec()).correct).toBe(true);
  });
});

describe('judgeResultSet — 値の正規化', () => {
  it('浮動小数の誤差は不正解にしない', () => {
    const actual = result(['x'], [[0.1 + 0.2]]);
    const expected = result(['x'], [[0.3]]);
    expect(judgeResultSet(actual, expected, spec()).correct).toBe(true);
  });

  it('小数第 7 位の違いは丸めで吸収される', () => {
    const actual = result(['x'], [[1.00000001]]);
    const expected = result(['x'], [[1.00000002]]);
    expect(judgeResultSet(actual, expected, spec()).correct).toBe(true);
  });

  it('小数第 5 位の違いは不正解になる', () => {
    const actual = result(['x'], [[1.00001]]);
    const expected = result(['x'], [[1.00002]]);
    expect(judgeResultSet(actual, expected, spec()).correct).toBe(false);
  });

  it('NULL と空文字は区別する', () => {
    const r = judgeResultSet(result(['x'], [[null]]), result(['x'], [['']]), spec());
    expect(r.correct).toBe(false);
  });

  it('NULL と undefined は同じものとして扱う', () => {
    const r = judgeResultSet(result(['x'], [[undefined]]), result(['x'], [[null]]), spec());
    expect(r.correct).toBe(true);
  });
});

describe('judgeResultSet — compare_columns', () => {
  const expected = result(['name', 'total'], [['A', 10], ['B', 20]]);

  it('指定した列だけを見る（余分な列は無視する）', () => {
    const actual = result(['name', 'total', 'memo'], [['A', 10, 'x'], ['B', 20, 'y']]);
    const r = judgeResultSet(actual, expected, spec({ compare_columns: ['name', 'total'] }));
    expect(r.correct).toBe(true);
  });

  it('列名の大文字小文字は区別しない', () => {
    const actual = result(['NAME', 'Total'], [['A', 10], ['B', 20]]);
    const r = judgeResultSet(actual, expected, spec({ compare_columns: ['name', 'total'] }));
    expect(r.correct).toBe(true);
  });

  it('指定した列が無いときは、何が足りないかを名指しする', () => {
    const actual = result(['name'], [['A'], ['B']]);
    const r = judgeResultSet(actual, expected, spec({ compare_columns: ['name', 'total'] }));
    expect(r.correct).toBe(false);
    expect(r.message).toContain('必要な列');
    expect(r.details[0]).toContain('total');
  });

  /*
    模範解答側に指定の列が無いのは問題データの不備。
    そのまま比べると全行が「余分な行」になり、利用者には不正解に見えてしまう。
  */
  it('模範解答側に指定の列が無ければ、データの不備として伝える', () => {
    const actual = result(['name', 'total'], [['A', 10]]);
    const broken = result(['name'], [['A']]);
    const r = judgeResultSet(actual, broken, spec({ compare_columns: ['name', 'total'] }));
    expect(r.correct).toBe(false);
    expect(r.message).toContain('問題データの不備');
    expect(r.details[0]).toContain('total');
  });

  it('列の並びは compare_columns の順に揃えられる', () => {
    const actual = result(['total', 'name'], [[10, 'A'], [20, 'B']]);
    const r = judgeResultSet(actual, expected, spec({ compare_columns: ['name', 'total'] }));
    expect(r.correct).toBe(true);
  });
});

describe('checkPatterns', () => {
  it('必須パターンが無ければ違反として返す', () => {
    const r = checkPatterns('SELECT * FROM t', '', spec({ sql_required: ['WINDOW|OVER'] }));
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
  });

  it('必須パターンがあれば通る', () => {
    const r = checkPatterns('SELECT sum(x) OVER () FROM t', '', spec({ sql_required: ['OVER'] }));
    expect(r.ok).toBe(true);
  });

  it('禁止パターンを検出する', () => {
    const r = checkPatterns('SELECT * FROM a, b', '', spec({ sql_forbidden: ['FROM\\s+\\w+\\s*,'] }));
    expect(r.ok).toBe(false);
  });

  it('実行計画に対する要求も見る', () => {
    const r = checkPatterns('', 'HASH_JOIN\nSEQ_SCAN', spec({ explain_required: ['HASH_JOIN'] }));
    expect(r.ok).toBe(true);
    const ng = checkPatterns('', 'NESTED_LOOP_JOIN', spec({ explain_required: ['HASH_JOIN'] }));
    expect(ng.ok).toBe(false);
  });

  it('実行計画に現れてはいけない演算子を検出する', () => {
    const r = checkPatterns('', 'CROSS_PRODUCT', spec({ explain_forbidden: ['CROSS_PRODUCT'] }));
    expect(r.ok).toBe(false);
  });

  it('小文字で書かれた SQL でも判定できる', () => {
    const r = checkPatterns('select sum(x) over () from t', '', spec({ sql_required: ['OVER'] }));
    expect(r.ok).toBe(true);
  });

  it('指定が無ければ何も違反しない', () => {
    expect(checkPatterns('SELECT 1', '', spec()).ok).toBe(true);
  });
});

describe('explainSqlError', () => {
  it.each([
    ['Binder Error: column "x" must appear in the GROUP BY clause', 'GROUP BY 漏れ'],
    ['Binder Error: aggregate function is not allowed in WHERE clause', 'WHERE に集約関数は書けない'],
    ['Catalog Error: Table with name studens does not exist!', 'テーブル名が違う'],
    ['Binder Error: Referenced column "socre" not found', '列名が違う'],
    ['Binder Error: Ambiguous reference to column name "id"', '列名が曖昧'],
    ['Conversion Error: Could not convert string to INT32', '型変換エラー'],
    ['Parser Error: syntax error at or near "FRM"', '構文エラー'],
  ])('%s → %s', (message, title) => {
    expect(explainSqlError(message)?.title).toBe(title);
  });

  it('当てはまらないエラーには助言を付けない', () => {
    expect(explainSqlError('Out of Memory Error')).toBeNull();
  });

  it('空入力の案内に的外れな助言を付けない', () => {
    expect(explainSqlError('SQL が入力されていません。')).toBeNull();
  });
});

describe('displayCell', () => {
  it.each([
    [null, 'NULL'],
    [undefined, 'NULL'],
    [0, '0'],
    [70, '70'],
    [70.25, '70.25'],
    [0.1 + 0.2, '0.3'],
    [true, 'true'],
    [false, 'false'],
    ['A組', 'A組'],
    ['', ''],
  ])('%s → %s', (value, shown) => {
    expect(displayCell(value)).toBe(shown);
  });

  it('整数は小数点を足さずに見せる', () => {
    expect(displayCell(1.0)).toBe('1');
  });

  it('無限大や NaN もそのまま見せる', () => {
    expect(displayCell(Infinity)).toBe('Infinity');
    expect(displayCell(NaN)).toBe('NaN');
  });
});
