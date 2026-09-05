import { describe, expect, it } from 'vitest';
import { TimeUnit, Type } from 'apache-arrow';
import type { DataType } from 'apache-arrow';
import { normalizeValue, splitStatements } from './duckdb';

describe('splitStatements — 基本', () => {
  it('セミコロンで分ける', () => {
    expect(splitStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('末尾のセミコロンで空文を作らない', () => {
    expect(splitStatements('SELECT 1;')).toEqual(['SELECT 1']);
  });

  it('連続したセミコロンを無視する', () => {
    expect(splitStatements('SELECT 1;;;SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('前後の空白を落とす', () => {
    expect(splitStatements('  SELECT 1  ;  ')).toEqual(['SELECT 1']);
  });

  it('改行をまたぐ文をひとつに保つ', () => {
    expect(splitStatements('SELECT a,\n       b\n  FROM t')).toEqual([
      'SELECT a,\n       b\n  FROM t',
    ]);
  });
});

describe('splitStatements — 空入力', () => {
  it.each(['', '   ', '\n\n', ';', ';;', '  ;  '])('%j は空配列になる', (sql) => {
    expect(splitStatements(sql)).toEqual([]);
  });

  // 空配列を返すことが「実行 / EXPLAIN の入力チェック」の土台になっている
  it('空配列なら実行側で止められる', () => {
    expect(splitStatements('').length === 0).toBe(true);
  });
});

describe('splitStatements — 区切りに見えるが区切りでないもの', () => {
  it('文字列リテラルの中のセミコロン', () => {
    expect(splitStatements("SELECT 'a;b'")).toEqual(["SELECT 'a;b'"]);
  });

  it('引用符を重ねたエスケープをまたぐ', () => {
    expect(splitStatements("SELECT 'it''s; here'; SELECT 2")).toEqual([
      "SELECT 'it''s; here'",
      'SELECT 2',
    ]);
  });

  it('識別子（ダブルクォート）の中のセミコロン', () => {
    expect(splitStatements('SELECT "a;b" FROM t')).toEqual(['SELECT "a;b" FROM t']);
  });

  it('行コメントの中のセミコロン', () => {
    expect(splitStatements('SELECT 1 -- ; ここはコメント\n')).toEqual([
      'SELECT 1 -- ; ここはコメント',
    ]);
  });

  it('行コメントは改行で終わる', () => {
    expect(splitStatements('-- ; コメント\nSELECT 1; SELECT 2')).toEqual([
      '-- ; コメント\nSELECT 1',
      'SELECT 2',
    ]);
  });

  it('ブロックコメントの中のセミコロン', () => {
    expect(splitStatements('SELECT /* ; */ 1; SELECT 2')).toEqual(['SELECT /* ; */ 1', 'SELECT 2']);
  });

  it('複数行のブロックコメント', () => {
    expect(splitStatements('/*\n ; \n*/ SELECT 1')).toEqual(['/*\n ; \n*/ SELECT 1']);
  });
});

describe('splitStatements — 閉じ忘れ', () => {
  it('閉じていない文字列は最後まで 1 文として扱う', () => {
    expect(splitStatements("SELECT 'abc; SELECT 2")).toEqual(["SELECT 'abc; SELECT 2"]);
  });

  it('閉じていないブロックコメントは最後まで飲み込む', () => {
    expect(splitStatements('SELECT 1 /* ; SELECT 2')).toEqual(['SELECT 1 /* ; SELECT 2']);
  });

  // 閉じ忘れは DuckDB 側が構文エラーとして返す。分割器は勝手に補正しない
  it('補正はせず、そのまま DuckDB に渡す形にする', () => {
    expect(splitStatements("SELECT '")).toEqual(["SELECT '"]);
  });
});

describe('splitStatements — コメントだけの入力', () => {
  // 空とは違い「文がある」と見なされる。EXPLAIN に渡ると構文エラーになるが、
  // 誤って undefined を渡すことはない
  it('行コメントだけでも 1 文として返る', () => {
    expect(splitStatements('-- メモ')).toEqual(['-- メモ']);
  });

  it('ブロックコメントだけでも 1 文として返る', () => {
    expect(splitStatements('/* メモ */')).toEqual(['/* メモ */']);
  });
});

describe('splitStatements — ドル引用符', () => {
  it('$$ の中のセミコロンで分割しない', () => {
    expect(splitStatements('SELECT $$a;b$$')).toEqual(['SELECT $$a;b$$']);
  });

  it('タグ付き $tag$ の中でも分割しない', () => {
    expect(splitStatements('SELECT $tag$a;b$tag$; SELECT 2')).toEqual([
      'SELECT $tag$a;b$tag$',
      'SELECT 2',
    ]);
  });

  it('別のタグでは閉じない', () => {
    expect(splitStatements('SELECT $a$x;$b$y$a$')).toEqual(['SELECT $a$x;$b$y$a$']);
  });

  it('$1 のような番号は引用符として扱わない', () => {
    expect(splitStatements('SELECT $1; SELECT $2')).toEqual(['SELECT $1', 'SELECT $2']);
  });

  it('閉じ忘れたドル引用符は最後まで 1 文にする', () => {
    expect(splitStatements('SELECT $$a; SELECT 2')).toEqual(['SELECT $$a; SELECT 2']);
  });
});

/*
  DuckDB-WASM は DATE / TIMESTAMP を数値で返す。単位はビルドや型で変わるため、
  どちらで来ても読める形に直しているかを確かめる。
  （素通しすると実行結果に 1709596800000 と出る）
*/
const DATE_TYPE = { typeId: Type.Date } as unknown as DataType;
const ts = (unit?: number) => ({ typeId: Type.Timestamp, unit }) as unknown as DataType;

describe('normalizeValue — 日付', () => {
  it('1970-01-01 からの日数を日付にする', () => {
    expect(normalizeValue(19787, DATE_TYPE)).toBe('2024-03-05');
  });

  it('ミリ秒で来ても同じ日付になる', () => {
    expect(normalizeValue(1_709_596_800_000, DATE_TYPE)).toBe('2024-03-05');
  });

  it('BigInt で来ても読める', () => {
    expect(normalizeValue(19787n, DATE_TYPE)).toBe('2024-03-05');
  });

  it('1970-01-01 は 0', () => {
    expect(normalizeValue(0, DATE_TYPE)).toBe('1970-01-01');
  });

  it('1970 年より前も戻せる', () => {
    expect(normalizeValue(-3653, DATE_TYPE)).toBe('1960-01-01');
  });

  it('型が分からない数値は数値のまま（勝手に日付にしない）', () => {
    expect(normalizeValue(19787, undefined)).toBe(19787);
  });

  it('NULL はそのまま', () => {
    expect(normalizeValue(null, DATE_TYPE)).toBeNull();
  });
});

describe('normalizeValue — 時刻', () => {
  it('単位が無ければマイクロ秒として読む（DuckDB の既定）', () => {
    expect(normalizeValue(1_709_638_496_000_000, ts())).toBe('2024-03-05 11:34:56');
  });

  it('型が持つ単位に従う', () => {
    expect(normalizeValue(1_709_638_496_000, ts(TimeUnit.MILLISECOND))).toBe('2024-03-05 11:34:56');
    expect(normalizeValue(1_709_638_496, ts(TimeUnit.SECOND))).toBe('2024-03-05 11:34:56');
    expect(normalizeValue(1_709_638_496_000_000_000, ts(TimeUnit.NANOSECOND))).toBe(
      '2024-03-05 11:34:56',
    );
  });

  it('ちょうど 0 時なら日付だけにする', () => {
    expect(normalizeValue(1_709_596_800_000_000, ts())).toBe('2024-03-05');
  });

  it('現実的な年にならない値は数値のまま返す', () => {
    expect(normalizeValue(1e30, ts())).toBe('1e+30');
  });
});
