import { describe, expect, it } from 'vitest';
import { splitStatements } from './duckdb';

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
