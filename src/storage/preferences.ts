/**
 * 画面の好み。進捗（sql-training:progress:v1）とは別に、
 * 端末ごとの表示設定として localStorage に置く。
 */

const LESSON_OPEN_KEY = 'sql-training:lesson-open';

/** 教材を開いた状態で表示するか。既定は開く（読んでから解く想定） */
export function readLessonOpen(): boolean {
  try {
    return localStorage.getItem(LESSON_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeLessonOpen(open: boolean): void {
  try {
    localStorage.setItem(LESSON_OPEN_KEY, open ? 'true' : 'false');
  } catch {
    /* 保存できなくても表示自体は動くので握りつぶす */
  }
}
