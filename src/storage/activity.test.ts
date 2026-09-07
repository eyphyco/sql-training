import { describe, expect, it } from 'vitest';
import {
  activityLevel,
  activityWeeks,
  currentStreak,
  dailyActivity,
  monthLabels,
} from './activity';
import type { ProgressData } from '../types';

/** ローカル時間の指定日 12:00。時差でどちらの日に入るか揺れないようにする */
const at = (date: string, hour = 12) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour).toISOString();
};

const progress = (over: Partial<ProgressData> = {}): ProgressData => ({
  version: 1,
  solvedProblems: {},
  history: [],
  ...over,
});

describe('dailyActivity', () => {
  it('挑戦は history から、正解は lastSolvedAt から数える', () => {
    const days = dailyActivity(
      progress({
        history: [
          { problemId: 'p1', at: at('2026-09-05'), correct: true },
          { problemId: 'p1', at: at('2026-09-05'), correct: false },
          { problemId: 'p2', at: at('2026-09-04'), correct: true },
        ],
        solvedProblems: {
          p1: { solved: true, attempts: 2, lastSolvedAt: '2026-09-05' },
          p2: { solved: true, attempts: 1, lastSolvedAt: '2026-09-04' },
        },
      }),
    );

    expect(days.get('2026-09-05')).toEqual({ date: '2026-09-05', tries: 2, solved: 1 });
    expect(days.get('2026-09-04')).toEqual({ date: '2026-09-04', tries: 1, solved: 1 });
  });

  it('history から溢れた古い日も、正解日として残る', () => {
    const days = dailyActivity(
      progress({
        solvedProblems: { p1: { solved: true, attempts: 1, lastSolvedAt: '2026-01-02' } },
      }),
    );
    expect(days.get('2026-01-02')).toEqual({ date: '2026-01-02', tries: 0, solved: 1 });
  });

  it('未正解の記録は正解として数えない', () => {
    const days = dailyActivity(
      progress({
        solvedProblems: { p1: { solved: false, attempts: 3, lastSolvedAt: null } },
      }),
    );
    expect(days.size).toBe(0);
  });

  it('日付が壊れた履歴があっても、残りは数える', () => {
    const days = dailyActivity(
      progress({
        history: [
          { problemId: 'p1', at: 'まったく日付でない', correct: true },
          { problemId: 'p2', at: at('2026-09-05'), correct: true },
        ],
      }),
    );
    expect(days.size).toBe(1);
    expect(days.get('2026-09-05')?.tries).toBe(1);
  });

  it('UTC ではなくローカルの日付でまとめる', () => {
    // ローカルの 23:30 は UTC では翌日になる時間帯がある
    const days = dailyActivity(
      progress({ history: [{ problemId: 'p1', at: at('2026-09-05', 23), correct: true }] }),
    );
    expect([...days.keys()]).toEqual(['2026-09-05']);
  });
});

describe('activityLevel', () => {
  const day = (tries: number) => ({ date: '2026-09-05', tries, solved: 0 });

  it('何もしていない日は 0', () => {
    expect(activityLevel(day(0), 8)).toBe(0);
  });

  it('いちばん多い日を上限にした相対評価になる', () => {
    expect(activityLevel(day(1), 8)).toBe(1);
    expect(activityLevel(day(4), 8)).toBe(2);
    expect(activityLevel(day(6), 8)).toBe(3);
    expect(activityLevel(day(8), 8)).toBe(4);
  });

  it('1 日しか記録が無くても最大の濃さになる', () => {
    expect(activityLevel(day(1), 1)).toBe(4);
  });

  it('挑戦が残っていなくても、正解の数で濃さが付く', () => {
    expect(activityLevel({ date: '2026-01-02', tries: 0, solved: 2 }, 4)).toBe(2);
  });
});

describe('activityWeeks', () => {
  const today = new Date(2026, 8, 5, 12); // 2026-09-05 は土曜

  it('列は日曜から土曜、最後の列に今日が入る', () => {
    const columns = activityWeeks(new Map(), today, 4);
    expect(columns).toHaveLength(4);
    expect(columns[3][6]?.date).toBe('2026-09-05');
    expect(columns[3][0]?.date).toBe('2026-08-30');
  });

  it('今日より後ろの枡は置かない', () => {
    const columns = activityWeeks(new Map(), new Date(2026, 8, 2, 12), 2); // 水曜
    const last = columns[1];
    expect(last[3]?.date).toBe('2026-09-02');
    expect(last[4]).toBeNull();
    expect(last[6]).toBeNull();
  });

  it('記録のある日はその値、無い日は 0 で埋まる', () => {
    const days = new Map([['2026-09-01', { date: '2026-09-01', tries: 3, solved: 2 }]]);
    const columns = activityWeeks(days, today, 1);
    expect(columns[0][2]).toEqual({ date: '2026-09-01', tries: 3, solved: 2 });
    expect(columns[0][1]).toEqual({ date: '2026-08-31', tries: 0, solved: 0 });
  });

  it('週数が 0 以下でも 1 列は返す', () => {
    expect(activityWeeks(new Map(), today, 0)).toHaveLength(1);
  });
});

describe('monthLabels', () => {
  it('短い並びには見出しを出さない（隣と重なるため）', () => {
    const columns = activityWeeks(new Map(), new Date(2026, 8, 5, 12), 10);
    const labels = monthLabels(columns);
    // 10 週ぶんなので 7 月・8 月・9 月にまたがる
    expect(labels.filter(Boolean)).toContain('8月');
    // 見出しは月が変わる列にだけ立つ
    expect(labels.filter(Boolean).length).toBeLessThan(columns.length);
  });

  it('1 列しかない月には出さない', () => {
    const columns = activityWeeks(new Map(), new Date(2026, 8, 5, 12), 2);
    expect(monthLabels(columns, 3).filter(Boolean)).toHaveLength(0);
  });
});

describe('currentStreak', () => {
  const today = new Date(2026, 8, 5, 12);
  const days = (dates: string[]) =>
    new Map(dates.map((d) => [d, { date: d, tries: 1, solved: 1 }]));

  it('今日から遡って続いた日数を数える', () => {
    expect(currentStreak(days(['2026-09-05', '2026-09-04', '2026-09-03']), today)).toBe(3);
  });

  it('今日まだでも、昨日まで続いていれば途切れない', () => {
    expect(currentStreak(days(['2026-09-04', '2026-09-03']), today)).toBe(2);
  });

  it('2 日以上空いたら 0', () => {
    expect(currentStreak(days(['2026-09-03', '2026-09-02']), today)).toBe(0);
  });

  it('記録が無ければ 0', () => {
    expect(currentStreak(new Map(), today)).toBe(0);
  });
});
