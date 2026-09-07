import type { ProgressData } from '../types';

/*
  「いつ学んだか」を日ごとにまとめる。

  記録は 2 か所にある。片方だけでは日ごとの絵が抜ける:
    - history      … 挑戦の 1 件ずつ。ただし直近 100 件で打ち切られる
    - solvedProblems.lastSolvedAt … 問題ごとの正解日。件数の上限が無い
  そこで挑戦は history から、正解は lastSolvedAt から数える。
  古い日は history から溢れていても、正解した日だけは残る。
*/

export interface DayActivity {
  /** YYYY-MM-DD（ローカル時間） */
  date: string;
  /** その日の挑戦回数（直近 100 件まで） */
  tries: number;
  /** その日に正解した問題数 */
  solved: number;
}

/** 濃さの段。0 は「何もしていない日」 */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

const DAY_MS = 86_400_000;

/** ローカル時間で YYYY-MM-DD にする（toISOString は UTC なので日付がずれる） */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dailyActivity(progress: ProgressData): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>();
  const at = (date: string): DayActivity => {
    let entry = days.get(date);
    if (!entry) {
      entry = { date, tries: 0, solved: 0 };
      days.set(date, entry);
    }
    return entry;
  };

  for (const h of progress.history) {
    const time = new Date(h.at);
    // 壊れた記録が 1 件あっても、残りは数えられるようにする
    if (Number.isNaN(time.getTime())) continue;
    at(localDay(time)).tries += 1;
  }

  for (const record of Object.values(progress.solvedProblems)) {
    if (!record.solved || !record.lastSolvedAt) continue;
    at(record.lastSolvedAt).solved += 1;
  }

  return days;
}

/** その日の重み。挑戦と正解のうち多いほうを取る（片方しか残っていない日があるため） */
export function weightOf(day: DayActivity): number {
  return Math.max(day.tries, day.solved);
}

/**
 * 濃さを 4 段に割る。
 *
 * いちばん多い日を上限にした相対評価にする。1 日 30 問の人と 3 問の人で
 * 同じ絶対値を使うと、片方は真っ白、片方は真っ赤になってしまう。
 */
export function activityLevel(day: DayActivity, busiest: number): ActivityLevel {
  const n = weightOf(day);
  if (n <= 0) return 0;
  if (busiest <= 1) return 4;
  const ratio = n / busiest;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * 週ごとの列に並べ替える。
 *
 * 最後の列に今日が入り、各列は日曜から土曜まで。今日より後ろの日は
 * 列を埋めるために作るが、date を空にして「まだ来ていない」と示す。
 */
export function activityWeeks(
  days: Map<string, DayActivity>,
  today: Date,
  weeks: number,
): (DayActivity | null)[][] {
  const count = Math.max(1, Math.trunc(weeks));
  // 今週の日曜（列の先頭）から数え始める
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const start = sunday.getTime() - (count - 1) * 7 * DAY_MS;
  const todayKey = localDay(today);

  const columns: (DayActivity | null)[][] = [];
  for (let w = 0; w < count; w += 1) {
    const column: (DayActivity | null)[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = localDay(new Date(start + (w * 7 + d) * DAY_MS));
      // 未来の枡は置かない。空欄との区別がつかず、先の予定に見える
      column.push(date > todayKey ? null : (days.get(date) ?? { date, tries: 0, solved: 0 }));
    }
    columns.push(column);
  }
  return columns;
}

/** 列の先頭に月名を出す位置。短い月は隣の見出しと重なるので出さない */
export function monthLabels(columns: (DayActivity | null)[][], minRun = 3): (string | null)[] {
  const monthAt = (i: number) => columns[i]?.find((d) => d !== null)?.date.slice(0, 7);
  const labels: (string | null)[] = columns.map(() => null);

  let start = 0;
  for (let i = 1; i <= columns.length; i += 1) {
    if (i < columns.length && monthAt(i) === monthAt(start)) continue;
    if (i - start >= minRun) {
      const month = monthAt(start);
      labels[start] = month ? `${Number(month.slice(5, 7))}月` : null;
    }
    start = i;
  }
  return labels;
}

/** 続けて学んだ日数。今日か昨日から遡って数える（今日まだでも途切れさせない） */
export function currentStreak(days: Map<string, DayActivity>, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const active = (d: Date) =>
    weightOf(days.get(localDay(d)) ?? { date: '', tries: 0, solved: 0 }) > 0;

  const cursor = new Date(start);
  if (!active(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!active(cursor)) return 0;
  }

  let streak = 0;
  while (active(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
