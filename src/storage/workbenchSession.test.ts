import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSession, markF5Handled, saveSession } from './workbenchSession';
import type { WorkbenchSession } from './workbenchSession';
import type { QueryResult } from '../engine/duckdb';

const rows = (n: number): unknown[][] => Array.from({ length: n }, (_, i) => [i]);
const res = (n: number): QueryResult => ({
  columns: ['n'],
  rows: rows(n),
  elapsedMs: 1,
  isEmptyResult: false,
});
const session = (over: Partial<WorkbenchSession> = {}): WorkbenchSession => ({
  sql: 'SELECT 1',
  lastRun: null,
  plan: null,
  tab: 'result',
  ...over,
});

beforeEach(() => sessionStorage.clear());

describe('saveSession / loadSession', () => {
  it('保存していなければ null を返す', () => {
    expect(loadSession('p1')).toBeNull();
  });

  it('書いたものを読み戻せる', () => {
    const plan = {
      root: {
        name: 'SEQ_SCAN',
        info: [['Table', 'students']] as [string, string][],
        rows: 13,
        actualRows: null,
        ms: null,
        children: [],
      },
      analyzed: false,
      totalMs: null,
      scannedRows: null,
    };
    saveSession('p1', session({ plan }));
    expect(loadSession('p1')).toEqual(session({ plan }));
  });

  it('問題ごとに別々に持つ', () => {
    saveSession('p1', session({ sql: 'A' }));
    saveSession('p2', session({ sql: 'B' }));
    expect(loadSession('p1')?.sql).toBe('A');
    expect(loadSession('p2')?.sql).toBe('B');
  });

  it('進捗（localStorage）ではなく sessionStorage に置く', () => {
    saveSession('p1', session());
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem('sql-training:workbench:v1:p1')).not.toBeNull();
  });

  it('実行結果も一緒に戻る', () => {
    saveSession('p1', session({ lastRun: { sql: 'SELECT 1', result: res(3) } }));
    expect(loadSession('p1')?.lastRun?.result.rows).toHaveLength(3);
  });
});

describe('saveSession — 大きすぎる結果', () => {
  /*
    間引いて保存すると、復元後の ANSWER が「不足行あり」と誤判定する。
    途中まで残すくらいなら捨てて、もう一度実行してもらう。
  */
  it('2000 行までは保存する', () => {
    saveSession('p1', session({ lastRun: { sql: 'q', result: res(2000) } }));
    expect(loadSession('p1')?.lastRun?.result.rows).toHaveLength(2000);
  });

  it('2001 行からは結果を捨てる', () => {
    saveSession('p1', session({ lastRun: { sql: 'q', result: res(2001) } }));
    expect(loadSession('p1')?.lastRun).toBeNull();
  });

  it('結果を捨てても SQL は残す', () => {
    saveSession(
      'p1',
      session({ sql: 'SELECT * FROM range(3000)', lastRun: { sql: 'q', result: res(3000) } }),
    );
    expect(loadSession('p1')?.sql).toBe('SELECT * FROM range(3000)');
  });
});

describe('loadSession — 壊れた内容', () => {
  it.each([
    ['壊れた JSON', '{'],
    ['null', 'null'],
    ['配列', '[]'],
    ['sql が無い', '{"tab":"result"}'],
    ['sql が文字列でない', '{"sql":123}'],
  ])('%s は null を返す（例外にしない）', (_name, raw) => {
    sessionStorage.setItem('sql-training:workbench:v1:p1', raw);
    expect(loadSession('p1')).toBeNull();
  });

  it('欠けている項目は既定値で埋める', () => {
    sessionStorage.setItem('sql-training:workbench:v1:p1', '{"sql":"SELECT 1"}');
    expect(loadSession('p1')).toEqual({
      sql: 'SELECT 1',
      lastRun: null,
      plan: null,
      tab: 'schema',
    });
  });

  /*
    形の壊れた結果をそのまま返すと、復元後に ANSWER を押した時点で落ちる。
    SQL だけ戻して「もう一度実行」に倒す。
  */
  it.each([
    ['result が無い', '{"sql":"x","lastRun":{"sql":"q"}}'],
    ['rows が無い', '{"sql":"x","lastRun":{"sql":"q","result":{"columns":[]}}}'],
    ['rows が配列でない', '{"sql":"x","lastRun":{"sql":"q","result":{"columns":[],"rows":1}}}'],
    ['lastRun が文字列', '{"sql":"x","lastRun":"なにか"}'],
  ])('壊れた実行結果 (%s) は捨てて SQL だけ戻す', (_name, raw) => {
    sessionStorage.setItem('sql-training:workbench:v1:p1', raw);
    const s = loadSession('p1');
    expect(s?.sql).toBe('x');
    expect(s?.lastRun).toBeNull();
  });

  it('知らないタブ名はスキーマに落とす', () => {
    sessionStorage.setItem('sql-training:workbench:v1:p1', '{"sql":"x","tab":"nope"}');
    expect(loadSession('p1')?.tab).toBe('schema');
  });

  it('sessionStorage が使えなくても落ちない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadSession('p1')).toBeNull();
  });

  it('保存できなくても落ちない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveSession('p1', session())).not.toThrow();
  });
});

describe('markF5Handled', () => {
  it('押した時刻を残す', () => {
    markF5Handled();
    const at = Number(sessionStorage.getItem('sql-training:f5-at'));
    expect(Date.now() - at).toBeLessThan(2000);
  });

  it('書けなくても落ちない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => markF5Handled()).not.toThrow();
  });
});
