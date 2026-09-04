import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deserializeProgress,
  loadProgress,
  recordAttempt,
  recordSelfRating,
  resetProgress,
  saveProgress,
  serializeProgress,
} from './progress';
import type { ProgressData } from '../types';

const KEY = 'sql-training:progress:v1';
const empty = (): ProgressData => ({ version: 1, solvedProblems: {}, history: [] });

beforeEach(() => localStorage.clear());

describe('loadProgress', () => {
  it('何も無ければ空の進捗を返す', () => {
    expect(loadProgress()).toEqual(empty());
  });

  it('保存した内容を読み戻せる', () => {
    const data = recordAttempt(empty(), 'p1', true);
    saveProgress(data);
    expect(loadProgress().solvedProblems.p1.solved).toBe(true);
  });

  it.each([
    ['壊れた JSON', '{'],
    ['配列', '[]'],
    ['null', 'null'],
    ['形が違う', '{"foo":1}'],
    ['history が配列でない', '{"solvedProblems":{},"history":{}}'],
  ])('%s は空の進捗として扱い、例外を投げない', (_name, raw) => {
    localStorage.setItem(KEY, raw);
    expect(loadProgress()).toEqual(empty());
  });

  it('localStorage が読めなくても落ちない（プライベートモード想定）', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadProgress()).toEqual(empty());
  });

  it('保存できなくても落ちない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveProgress(empty())).not.toThrow();
  });
});

describe('recordAttempt', () => {
  it('不正解でも挑戦回数は増える', () => {
    const d = recordAttempt(empty(), 'p1', false);
    expect(d.solvedProblems.p1).toMatchObject({ attempts: 1, solved: false, lastSolvedAt: null });
  });

  it('正解すると solved が立ち、日付が入る', () => {
    const d = recordAttempt(empty(), 'p1', true);
    expect(d.solvedProblems.p1.solved).toBe(true);
    expect(d.solvedProblems.p1.lastSolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('一度正解したら、あとで間違えても solved は下がらない', () => {
    let d = recordAttempt(empty(), 'p1', true);
    d = recordAttempt(d, 'p1', false);
    expect(d.solvedProblems.p1.solved).toBe(true);
    expect(d.solvedProblems.p1.attempts).toBe(2);
  });

  /*
    toISOString() は UTC なので、JST の朝に解くと前日として記録されてしまう。
    正解日は端末のローカル日付で持つ（このテストは TZ=Asia/Tokyo で走る）。
  */
  it('日付は端末のローカル日付で記録する', () => {
    vi.useFakeTimers();
    // JST 9/5 00:30 = UTC 9/4 15:30
    vi.setSystemTime(new Date('2026-09-04T15:30:00Z'));
    expect(recordAttempt(empty(), 'p1', true).solvedProblems.p1.lastSolvedAt).toBe('2026-09-05');
    vi.useRealTimers();
  });

  it('月日は 2 桁に揃える', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T12:00:00+09:00'));
    expect(recordAttempt(empty(), 'p1', true).solvedProblems.p1.lastSolvedAt).toBe('2026-01-02');
    vi.useRealTimers();
  });

  it('履歴の時刻は UTC の ISO 文字列のまま（表示側で現地時刻に直す）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T15:30:00Z'));
    expect(recordAttempt(empty(), 'p1', true).history[0].at).toBe('2026-09-04T15:30:00.000Z');
    vi.useRealTimers();
  });

  it('正解日は最後に正解した日のまま残る', () => {
    let d = recordAttempt(empty(), 'p1', true);
    const at = d.solvedProblems.p1.lastSolvedAt;
    d = recordAttempt(d, 'p1', false);
    expect(d.solvedProblems.p1.lastSolvedAt).toBe(at);
  });

  it('元のデータを書き換えない', () => {
    const before = empty();
    recordAttempt(before, 'p1', true);
    expect(before.solvedProblems).toEqual({});
  });

  it('履歴は新しい順に積む', () => {
    let d = recordAttempt(empty(), 'p1', false);
    d = recordAttempt(d, 'p2', true);
    expect(d.history.map((h) => h.problemId)).toEqual(['p2', 'p1']);
  });

  it('履歴は 100 件で打ち切る', () => {
    let d = empty();
    for (let i = 0; i < 120; i += 1) d = recordAttempt(d, `p${i}`, false);
    expect(d.history).toHaveLength(100);
    expect(d.history[0].problemId).toBe('p119');
  });
});

describe('recordSelfRating', () => {
  it('「理解できた」で正解済みになる', () => {
    const d = recordSelfRating(empty(), 'w1', 'understood');
    expect(d.solvedProblems.w1).toMatchObject({ solved: true, selfRating: 'understood' });
  });

  /*
    recordAttempt と違い、こちらは solved が下がる。
    記述式は自己申告なので「やっぱり復習したい」を戻せるようにしてある。
  */
  it('「要復習」に付け直すと正解済みが外れる', () => {
    let d = recordSelfRating(empty(), 'w1', 'understood');
    d = recordSelfRating(d, 'w1', 'review');
    expect(d.solvedProblems.w1.solved).toBe(false);
  });

  it('挑戦回数は増やさない（採点ではないため）', () => {
    const d = recordSelfRating(empty(), 'w1', 'understood');
    expect(d.solvedProblems.w1.attempts).toBe(0);
  });
});

describe('serializeProgress / deserializeProgress', () => {
  const totals = { 1: 2, 2: 3 };
  const phaseOf = (id: string) => (id.startsWith('a') ? 1 : 2);

  it('フェーズ別の集計を同梱する', () => {
    let d = recordAttempt(empty(), 'a1', true);
    d = recordAttempt(d, 'b1', true);
    d = recordAttempt(d, 'b2', false);
    const out = JSON.parse(serializeProgress(d, totals, phaseOf));
    expect(out.phaseProgress).toEqual({ 1: { solved: 1, total: 2 }, 2: { solved: 1, total: 3 } });
    expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('未知のフェーズの問題は集計から外す', () => {
    const d = recordAttempt(empty(), 'z1', true);
    const out = JSON.parse(serializeProgress(d, totals, () => 99));
    expect(out.phaseProgress[99]).toBeUndefined();
  });

  it('書き出したものを読み戻せる', () => {
    const d = recordAttempt(empty(), 'a1', true);
    const back = deserializeProgress(serializeProgress(d, totals, phaseOf));
    expect(back.solvedProblems).toEqual(d.solvedProblems);
    expect(back.history).toEqual(d.history);
  });

  it('phaseProgress は取り込み時に捨てる（計算し直すため）', () => {
    const d = recordAttempt(empty(), 'a1', true);
    const back = deserializeProgress(serializeProgress(d, totals, phaseOf));
    expect('phaseProgress' in back).toBe(false);
  });

  it.each([
    ['壊れた JSON', '{'],
    ['形が違う', '{"foo":1}'],
    ['配列', '[]'],
  ])('%s の取り込みは失敗として伝える', (_name, json) => {
    expect(() => deserializeProgress(json)).toThrow();
  });
});

describe('resetProgress', () => {
  it('保存済みの内容も消す', () => {
    saveProgress(recordAttempt(empty(), 'p1', true));
    expect(resetProgress()).toEqual(empty());
    expect(loadProgress()).toEqual(empty());
  });
});
