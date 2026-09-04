import type { Lesson, LessonSection, PhaseId } from '../types';
import phase1 from './lessons/phase1.json';
import phase2 from './lessons/phase2.json';
import phase3 from './lessons/phase3.json';
import phase4 from './lessons/phase4.json';
import phase5 from './lessons/phase5.json';
import phase6 from './lessons/phase6.json';
import phase7 from './lessons/phase7.json';

export const LESSONS: Lesson[] = [phase1, phase2, phase3, phase4, phase5, phase6, phase7] as Lesson[];

export const LESSON_BY_PHASE = new Map<PhaseId, Lesson>(LESSONS.map((l) => [l.phase, l]));

/** 問題 → その問題を扱う節。教材側の problems だけが対応表なので、ここで反転させる */
export const SECTIONS_BY_PROBLEM: Map<string, LessonSection[]> = (() => {
  const map = new Map<string, LessonSection[]>();
  for (const lesson of LESSONS) {
    for (const section of lesson.sections) {
      for (const id of section.problems) {
        const list = map.get(id);
        if (list) list.push(section);
        else map.set(id, [section]);
      }
    }
  }
  return map;
})();

export function sectionsForProblem(problemId: string): LessonSection[] {
  return SECTIONS_BY_PROBLEM.get(problemId) ?? [];
}

/** 節 ID から、その節が属する章を引く（教材ページへのリンク用） */
export const PHASE_BY_SECTION = new Map<string, PhaseId>(
  LESSONS.flatMap((l) => l.sections.map((s) => [s.id, l.phase] as [string, PhaseId])),
);
