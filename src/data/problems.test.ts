import { describe, expect, it } from 'vitest';
import {
  ALL_TAGS,
  TAG_COUNTS,
  loadAllProblems,
  loadProblem,
  META_BY_ID,
  nextProblemId,
  PHASE_TOTALS,
  prevProblemId,
  PROBLEM_METAS,
  problemsOfPhase,
} from './problems';
import { PHASES } from './phases';
import type { PhaseId } from '../types';

// 本文は必要になったときに読む作りなので、検査の前に一度だけ読み込む
const ALL_PROBLEMS = await loadAllProblems();

describe('読み込みの結果', () => {
  it('問題が 1 つ以上ある', () => {
    expect(ALL_PROBLEMS.length).toBeGreaterThan(0);
  });

  it('ID は重複しない', () => {
    const ids = ALL_PROBLEMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ID の昇順で並ぶ（画面の並び順と前後移動の基準）', () => {
    const ids = ALL_PROBLEMS.map((p) => p.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it('META_BY_ID は全問を引ける', () => {
    expect(META_BY_ID.size).toBe(ALL_PROBLEMS.length);
    for (const p of ALL_PROBLEMS) expect(META_BY_ID.get(p.id)?.id).toBe(p.id);
  });

  it('メタと本文で id・題名・タグが一致する', () => {
    for (const p of ALL_PROBLEMS) {
      const meta = META_BY_ID.get(p.id);
      expect(meta?.title).toBe(p.title);
      expect(meta?.tags).toEqual(p.tags);
      expect(meta?.type).toBe(p.type);
      expect(meta?.level).toBe(p.level);
    }
  });

  it('PROBLEM_METAS は本体と同じ並び・同じ件数', () => {
    expect(PROBLEM_METAS.map((p) => p.id)).toEqual(ALL_PROBLEMS.map((p) => p.id));
  });

  it('タグは重複なし', () => {
    expect(ALL_TAGS).toEqual([...new Set(ALL_TAGS)]);
  });

  it('タグは問題数の多い順、同数なら五十音順に並ぶ', () => {
    for (let i = 1; i < ALL_TAGS.length; i += 1) {
      const [prev, cur] = [ALL_TAGS[i - 1], ALL_TAGS[i]];
      const a = TAG_COUNTS.get(prev) ?? 0;
      const b = TAG_COUNTS.get(cur) ?? 0;
      expect(a).toBeGreaterThanOrEqual(b);
      if (a === b) expect(prev.localeCompare(cur, 'ja')).toBeLessThan(0);
    }
  });

  it('タグごとの件数は実データと一致する', () => {
    for (const [tag, n] of TAG_COUNTS) {
      expect(n).toBe(ALL_PROBLEMS.filter((p) => p.tags.includes(tag)).length);
    }
  });

  it('タグ一覧は実際に使われているものだけ', () => {
    const used = new Set(ALL_PROBLEMS.flatMap((p) => p.tags));
    expect(ALL_TAGS.every((t) => used.has(t))).toBe(true);
    expect(ALL_TAGS).toHaveLength(used.size);
  });
});

describe('loadProblem', () => {
  it('ある問題を本文つきで引ける', async () => {
    const p = await loadProblem(ALL_PROBLEMS[0].id);
    expect(p?.id).toBe(ALL_PROBLEMS[0].id);
    expect(p?.prompt_md.length).toBeGreaterThan(0);
  });

  it('二度目は同じものを返す（読み直さない）', async () => {
    const id = ALL_PROBLEMS[0].id;
    expect(await loadProblem(id)).toBe(await loadProblem(id));
  });

  it.each(['', 'nope', 'phase9-lv9-999'])('知らない ID (%j) は undefined', async (id) => {
    expect(await loadProblem(id)).toBeUndefined();
  });
});

describe('前後の問題', () => {
  const ids = PROBLEM_METAS.map((p) => p.id);

  it('先頭に前の問題は無い', () => {
    expect(prevProblemId(ids[0])).toBeUndefined();
  });

  it('末尾に次の問題は無い', () => {
    expect(nextProblemId(ids[ids.length - 1])).toBeUndefined();
  });

  it('知らない ID では前後とも undefined', () => {
    expect(nextProblemId('nope')).toBeUndefined();
    expect(prevProblemId('nope')).toBeUndefined();
  });

  it('次へ進んで戻ると元の問題に返る', () => {
    for (const id of ids.slice(0, -1)) {
      expect(prevProblemId(nextProblemId(id)!)).toBe(id);
    }
  });

  it('先頭から次へたどると全問を 1 度ずつ通る', () => {
    const walked: string[] = [ids[0]];
    let cur: string | undefined = ids[0];
    while ((cur = nextProblemId(cur!))) walked.push(cur);
    expect(walked).toEqual(ids);
  });
});

describe('フェーズ別', () => {
  it('全フェーズの合計が全問数と一致する', () => {
    const sum = Object.values(PHASE_TOTALS).reduce((n, v) => n + v, 0);
    expect(sum).toBe(ALL_PROBLEMS.length);
  });

  it('problemsOfPhase の件数が PHASE_TOTALS と一致する', () => {
    for (const phase of PHASES) {
      expect(problemsOfPhase(phase.id)).toHaveLength(PHASE_TOTALS[phase.id] ?? 0);
    }
  });

  it('どのフェーズにも問題がある（空の章を作らない）', () => {
    for (const phase of PHASES) {
      expect(problemsOfPhase(phase.id).length).toBeGreaterThan(0);
    }
  });

  it('存在しないフェーズは空配列', () => {
    expect(problemsOfPhase(99 as PhaseId)).toEqual([]);
  });

  it('問題の phase はすべて既知のフェーズ', () => {
    const known = new Set(PHASES.map((p) => p.id));
    for (const p of ALL_PROBLEMS) expect(known.has(p.phase)).toBe(true);
  });

  it('ID の接頭辞と phase が一致する', () => {
    for (const p of ALL_PROBLEMS) {
      expect(p.id.startsWith(`phase${p.phase}-`)).toBe(true);
    }
  });
});
