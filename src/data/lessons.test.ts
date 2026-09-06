import { describe, expect, it } from 'vitest';
import { LESSON_BY_PHASE, LESSONS, PHASE_BY_SECTION, sectionsForProblem } from './lessons';
import { loadAllProblems, META_BY_ID } from './problems';
import { PHASES } from './phases';
import type { PhaseId } from '../types';

const ALL_PROBLEMS = await loadAllProblems();
const allSections = LESSONS.flatMap((l) => l.sections);

describe('章', () => {
  it('フェーズと同じ数だけある', () => {
    expect(LESSONS).toHaveLength(PHASES.length);
  });

  it('phase の昇順で並ぶ', () => {
    expect(LESSONS.map((l) => l.phase)).toEqual(PHASES.map((p) => p.id));
  });

  it('phase から引ける', () => {
    for (const phase of PHASES) {
      expect(LESSON_BY_PHASE.get(phase.id)?.phase).toBe(phase.id);
    }
  });

  it('知らない phase は undefined', () => {
    expect(LESSON_BY_PHASE.get(99 as PhaseId)).toBeUndefined();
  });

  it('どの章にも節がある', () => {
    for (const l of LESSONS) expect(l.sections.length).toBeGreaterThan(0);
  });
});

describe('節', () => {
  it('節 ID は全章を通して重複しない（ページ内リンクの飛び先になる）', () => {
    const ids = allSections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('節 ID から章を引ける', () => {
    for (const l of LESSONS) {
      for (const s of l.sections) expect(PHASE_BY_SECTION.get(s.id)).toBe(l.phase);
    }
  });

  it('PHASE_BY_SECTION は全節ぶんある', () => {
    expect(PHASE_BY_SECTION.size).toBe(allSections.length);
  });
});

describe('問題 → 節の逆引き', () => {
  it('知らない問題では空配列（undefined を返さない）', () => {
    expect(sectionsForProblem('nope')).toEqual([]);
  });

  it('すべての問題がどこかの節から参照されている', () => {
    const orphans = ALL_PROBLEMS.filter((p) => sectionsForProblem(p.id).length === 0);
    expect(orphans.map((p) => p.id)).toEqual([]);
  });

  it('節が参照する問題はすべて実在する', () => {
    const dangling: string[] = [];
    for (const s of allSections) {
      for (const id of s.problems) if (!META_BY_ID.has(id)) dangling.push(`${s.id} → ${id}`);
    }
    expect(dangling).toEqual([]);
  });

  it('逆引きの結果は教材に書いた順で並ぶ', () => {
    const s = allSections[0];
    expect(sectionsForProblem(s.problems[0])[0].id).toBe(s.id);
  });

  it('問題が属する節は、その問題と同じ章にある', () => {
    for (const p of ALL_PROBLEMS) {
      for (const s of sectionsForProblem(p.id)) {
        expect(PHASE_BY_SECTION.get(s.id)).toBe(p.phase);
      }
    }
  });
});
