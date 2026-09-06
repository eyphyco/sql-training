import { describe, expect, it } from 'vitest';
import {
  MIN_TRIES,
  missedProblems,
  phaseAccuracy,
  reviewProblems,
  stateOf,
  weakPhases,
} from './review';
import type { ProgressData, SolvedRecord } from '../types';

const rec = (over: Partial<SolvedRecord> = {}): SolvedRecord => ({
  solved: false,
  attempts: 0,
  lastSolvedAt: null,
  ...over,
});

const data = (over: Partial<ProgressData> = {}): ProgressData => ({
  version: 1,
  solvedProblems: {},
  history: [],
  ...over,
});

const at = '2026-09-07T00:00:00.000Z';

describe('missedProblems', () => {
  it('履歴の不正解を拾う', () => {
    const d = data({
      history: [
        { problemId: 'p1', at, correct: false },
        { problemId: 'p2', at, correct: true },
      ],
    });
    expect([...missedProblems(d)]).toEqual(['p1']);
  });

  it('正解済みでも、間違えた記録は残す（復習の材料になる）', () => {
    const d = data({
      solvedProblems: { p1: rec({ solved: true, attempts: 2 }) },
      history: [
        { problemId: 'p1', at, correct: true },
        { problemId: 'p1', at, correct: false },
      ],
    });
    expect(missedProblems(d).has('p1')).toBe(true);
  });

  it('履歴から溢れても、挑戦して未正解なら拾う', () => {
    const d = data({ solvedProblems: { old: rec({ attempts: 3 }) } });
    expect(missedProblems(d).has('old')).toBe(true);
  });

  it('一度も挑戦していない問題は入らない', () => {
    expect(missedProblems(data()).size).toBe(0);
  });
});

describe('reviewProblems', () => {
  it('要復習を付けたものだけ', () => {
    const d = data({
      solvedProblems: {
        p1: rec({ selfRating: 'review' }),
        p2: rec({ selfRating: 'understood' }),
        p3: rec(),
      },
    });
    expect([...reviewProblems(d)]).toEqual(['p1']);
  });
});

describe('stateOf', () => {
  it('3 つの状態をまとめて返す', () => {
    const d = data({
      solvedProblems: { p1: rec({ solved: true, attempts: 2, selfRating: 'review' }) },
      history: [{ problemId: 'p1', at, correct: false }],
    });
    expect(stateOf(d, 'p1')).toEqual({ solved: true, missed: true, review: true });
  });

  it('知らない ID はすべて false', () => {
    expect(stateOf(data(), 'nope')).toEqual({ solved: false, missed: false, review: false });
  });
});

describe('phaseAccuracy', () => {
  const phaseOf = (id: string) => Number(id[1]);

  it('章ごとに挑戦と正解を数える', () => {
    const d = data({
      history: [
        { problemId: 'p1a', at, correct: false },
        { problemId: 'p1b', at, correct: true },
        { problemId: 'p1c', at, correct: false },
        { problemId: 'p2a', at, correct: true },
      ],
    });
    const acc = phaseAccuracy(d, phaseOf);
    expect(acc.get(1)).toEqual({ tried: 3, correct: 1, rate: 1 / 3 });
  });

  it(`挑戦が ${MIN_TRIES} 回未満の章は正答率を出さない`, () => {
    const d = data({ history: [{ problemId: 'p2a', at, correct: true }] });
    expect(phaseAccuracy(d, phaseOf).get(2)?.rate).toBeNull();
  });

  it('知らない問題は数えない', () => {
    const d = data({ history: [{ problemId: 'zz', at, correct: false }] });
    expect(phaseAccuracy(d, () => undefined).size).toBe(0);
  });
});

describe('weakPhases', () => {
  it('正答率の低い順に返す', () => {
    const acc = new Map([
      [1, { tried: 4, correct: 1, rate: 0.25 }],
      [2, { tried: 4, correct: 2, rate: 0.5 }],
      [3, { tried: 4, correct: 4, rate: 1 }],
    ]);
    expect(weakPhases(acc)).toEqual([1, 2]);
  });

  it('回数が足りない章は苦手と決めつけない', () => {
    const acc = new Map([[1, { tried: 2, correct: 0, rate: null }]]);
    expect(weakPhases(acc)).toEqual([]);
  });
});
