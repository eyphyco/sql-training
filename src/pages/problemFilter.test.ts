import { describe, expect, it } from 'vitest';
import {
  applyFilter,
  countByLevel,
  countByPhase,
  countByTag,
  EMPTY_FILTER,
  isEmptyFilter,
  parseFilter,
  parseList,
  toggleValue,
  writeFilter,
  type Filter,
} from './problemFilter';
import type { ProblemMeta } from '../types';

const metas: ProblemMeta[] = [
  { id: 'a', type: 'sql_query', phase: 1, level: 1, title: 'A', tags: ['group by'] },
  { id: 'b', type: 'sql_query', phase: 1, level: 3, title: 'B', tags: ['group by', 'NULL'] },
  { id: 'c', type: 'multiple_choice', phase: 2, level: 2, title: 'C', tags: ['NULL'] },
  { id: 'd', type: 'written', phase: 3, level: 3, title: 'D', tags: [] },
];

const solved = new Set(['a', 'c']);
const missed = new Set(['b']);
const review = new Set(['d']);
const stateOf = (id: string) => ({
  solved: solved.has(id),
  missed: missed.has(id),
  review: review.has(id),
});
const ids = (list: ProblemMeta[]) => list.map((p) => p.id);
const make = (f: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...f });

describe('parseList', () => {
  it('カンマ区切りを分け、空白と空文字と重複を落とす', () => {
    expect(parseList(' 1 , 3,,1 ')).toEqual(['1', '3']);
  });

  it('null と空文字は空配列', () => {
    expect(parseList(null)).toEqual([]);
    expect(parseList('')).toEqual([]);
  });
});

describe('parseFilter', () => {
  it('複数値を読む', () => {
    const f = parseFilter(new URLSearchParams('phase=1,3&level=1,3&tag=NULL,group by'));
    expect(f.phases).toEqual([1, 3]);
    expect(f.levels).toEqual([1, 3]);
    expect(f.tags).toEqual(['NULL', 'group by']);
  });

  it('単一値の古いリンクもそのまま読める', () => {
    expect(parseFilter(new URLSearchParams('phase=6')).phases).toEqual([6]);
    expect(parseFilter(new URLSearchParams('tag=NULL')).tags).toEqual(['NULL']);
  });

  it('範囲外の数値と知らない状態は捨てる', () => {
    const f = parseFilter(new URLSearchParams('phase=0,8,abc,2&level=9&status=solved,maybe'));
    expect(f.phases).toEqual([2]);
    expect(f.levels).toEqual([]);
    expect(f.status).toEqual(['solved']);
  });

  it('番号は昇順に整える（URL を手で書いても並びが揺れない）', () => {
    expect(parseFilter(new URLSearchParams('phase=5,2')).phases).toEqual([2, 5]);
  });
});

describe('writeFilter', () => {
  it('空の種類はキーごと落とす', () => {
    const params = writeFilter(make({ levels: [1, 3] }));
    expect(params.toString()).toBe(new URLSearchParams({ level: '1,3' }).toString());
    expect(params.has('phase')).toBe(false);
  });

  it('parseFilter と往復できる', () => {
    const f = make({ phases: [1, 2], levels: [3], tags: ['NULL'], status: ['unsolved'] });
    expect(parseFilter(writeFilter(f))).toEqual(f);
  });
});

describe('toggleValue', () => {
  it('無ければ足し、あれば外す', () => {
    expect(toggleValue([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleValue([1, 2], 2)).toEqual([1]);
  });

  it('元の配列を書き換えない', () => {
    const list = [1];
    toggleValue(list, 2);
    expect(list).toEqual([1]);
  });
});

describe('isEmptyFilter', () => {
  it('全部空のときだけ true', () => {
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
    expect(isEmptyFilter(make({ status: ['solved'] }))).toBe(false);
  });
});

describe('applyFilter', () => {
  it('条件なしは全件', () => {
    expect(ids(applyFilter(metas, EMPTY_FILTER, stateOf))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('同じ種類の中は OR（Lv1 と Lv3 を同時に見られる）', () => {
    expect(ids(applyFilter(metas, make({ levels: [1, 3] }), stateOf))).toEqual(['a', 'b', 'd']);
  });

  it('種類どうしは AND', () => {
    expect(ids(applyFilter(metas, make({ levels: [1, 3], phases: [1] }), stateOf))).toEqual([
      'a',
      'b',
    ]);
  });

  it('タグは1つでも一致すれば残る', () => {
    expect(ids(applyFilter(metas, make({ tags: ['NULL', 'group by'] }), stateOf))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('間違えた・要復習でも絞れる（記録していたのに辿れなかった）', () => {
    expect(ids(applyFilter(metas, make({ status: ['missed'] }), stateOf))).toEqual(['b']);
    expect(ids(applyFilter(metas, make({ status: ['review'] }), stateOf))).toEqual(['d']);
    expect(ids(applyFilter(metas, make({ status: ['missed', 'review'] }), stateOf))).toEqual([
      'b',
      'd',
    ]);
  });

  it('状態も OR。両方選べば条件なしと同じ', () => {
    expect(ids(applyFilter(metas, make({ status: ['solved'] }), stateOf))).toEqual(['a', 'c']);
    expect(ids(applyFilter(metas, make({ status: ['unsolved'] }), stateOf))).toEqual(['b', 'd']);
    expect(ids(applyFilter(metas, make({ status: ['solved', 'unsolved'] }), stateOf))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('except に渡した種類は無視する（チップの件数用）', () => {
    const f = make({ levels: [1], phases: [1] });
    expect(ids(applyFilter(metas, f, stateOf, 'levels'))).toEqual(['a', 'b']);
    expect(ids(applyFilter(metas, f, stateOf, 'phases'))).toEqual(['a']);
  });
});

describe('言葉での検索', () => {
  it('題名の一部で引ける', () => {
    expect(ids(applyFilter(metas, make({ query: 'C' }), stateOf))).toEqual(['c']);
  });

  it('大文字小文字を区別しない', () => {
    expect(ids(applyFilter(metas, make({ query: 'c' }), stateOf))).toEqual(['c']);
  });

  it('題名・ID・タグのどれかに含まれれば残す', () => {
    // 'b' は b の題名だけでなく a のタグ（group by）にも含まれる
    expect(ids(applyFilter(metas, make({ query: 'b' }), stateOf))).toEqual(['a', 'b']);
  });

  it('ID とタグでも引ける', () => {
    expect(ids(applyFilter(metas, make({ query: 'group by' }), stateOf))).toEqual(['a', 'b']);
    expect(ids(applyFilter(metas, make({ query: 'NULL' }), stateOf))).toEqual(['b', 'c']);
  });

  it('分類と組み合わさる（AND）', () => {
    expect(ids(applyFilter(metas, make({ query: 'group by', levels: [3] }), stateOf))).toEqual([
      'b',
    ]);
  });

  it('件数を数えるときも効く（外せない条件なので）', () => {
    const f = make({ query: 'group by', levels: [1] });
    expect(ids(applyFilter(metas, f, stateOf, 'levels'))).toEqual(['a', 'b']);
  });

  it('URL と往復できる', () => {
    const f = make({ query: 'NULL', levels: [2] });
    expect(parseFilter(writeFilter(f))).toEqual(f);
  });

  it('空の検索語はキーごと落とす', () => {
    expect(writeFilter(make({ query: '' })).has('q')).toBe(false);
  });

  it('検索語だけでも「絞り込み中」とみなす', () => {
    expect(isEmptyFilter(make({ query: 'x' }))).toBe(false);
  });
});

describe('件数の集計', () => {
  it('フェーズ・レベル・タグごとに数える', () => {
    expect(countByPhase(metas).get(1)).toBe(2);
    expect(countByLevel(metas).get(3)).toBe(2);
    expect(countByTag(metas).get('NULL')).toBe(2);
  });

  it('該当なしのキーは持たない', () => {
    expect(countByPhase([]).size).toBe(0);
    expect(countByTag(metas).get('rank')).toBeUndefined();
  });

  it('自分の種類を外して数えると、足したときの件数になる', () => {
    const f = make({ levels: [1] });
    const counts = countByLevel(applyFilter(metas, f, stateOf, 'levels'));
    expect(counts.get(3)).toBe(2);
  });
});
