import { describe, expect, it } from 'vitest';
import { HEADER_OFFSET, pickActiveSection, READING_LINE, scrollDuration } from './reading';

const ids = ['a', 'b', 'c'];

describe('pickActiveSection', () => {
  it('まだどの節も上に出ていなければ最初の節', () => {
    expect(pickActiveSection(ids, [300, 800, 1400], false)).toBe('a');
  });

  it('上に出た最後の節を選ぶ', () => {
    expect(pickActiveSection(ids, [-500, 100, 900], false)).toBe('b');
  });

  it('全部通り過ぎたら最後の節', () => {
    expect(pickActiveSection(ids, [-900, -500, -100], false)).toBe('c');
  });

  it('境界（ちょうど READING_LINE）は「読んでいる」と見なす', () => {
    expect(pickActiveSection(ids, [0, READING_LINE, 900], false)).toBe('b');
  });

  it('境界の 1px 下はまだ選ばない', () => {
    expect(pickActiveSection(ids, [0, READING_LINE + 1, 900], false)).toBe('a');
  });

  /*
    最後の節が画面に収まりきる短さだと、上端が READING_LINE より上に
    来ないままページ末尾に着いてしまう。そのときは最終節を選ぶ。
  */
  it('最下部まで来たら、短い最終節でも選ぶ', () => {
    expect(pickActiveSection(ids, [-900, -500, 400], true)).toBe('c');
  });

  it('見つからない節（null）は飛ばす', () => {
    expect(pickActiveSection(ids, [-500, null, 900], false)).toBe('a');
  });

  it('節が 1 つでも動く', () => {
    expect(pickActiveSection(['only'], [500], false)).toBe('only');
    expect(pickActiveSection(['only'], [500], true)).toBe('only');
  });

  it('節が無ければ空文字（呼び出し側で分岐しなくてよい）', () => {
    expect(pickActiveSection([], [], false)).toBe('');
    expect(pickActiveSection([], [], true)).toBe('');
  });
});

describe('scrollDuration', () => {
  it('近い移動でも 0.24 秒は使う（一瞬すぎて飛んだように見えないように）', () => {
    expect(scrollDuration(0, 10)).toBeCloseTo(0.24);
    expect(scrollDuration(500, 500)).toBeCloseTo(0.24);
  });

  it('遠い移動でも 0.44 秒で頭打ち', () => {
    expect(scrollDuration(0, 50000)).toBeCloseTo(0.44);
  });

  it('中間は距離なりに伸びる', () => {
    expect(scrollDuration(0, 1500)).toBeCloseTo(0.3);
  });

  it('上へ戻るときも同じ時間', () => {
    expect(scrollDuration(1500, 0)).toBe(scrollDuration(0, 1500));
  });
});

describe('止める位置', () => {
  it('固定ヘッダ（56px）より下に見出しが出る', () => {
    expect(HEADER_OFFSET).toBeGreaterThan(56);
  });

  it('読んでいる判定の線は、止める位置より下にある', () => {
    // そうでないと、送った直後に「まだ手前の節」と判定されてしまう
    expect(READING_LINE).toBeGreaterThan(HEADER_OFFSET);
  });
});
