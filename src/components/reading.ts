/**
 * 教材を読んでいる位置の判定。
 * 画面に触る部分（スクロール量の取得・移動）から切り離してあるので、
 * ここだけを単体で確かめられる。
 */

/** 見出しがこの高さより上に来たら「その節を読んでいる」とみなす */
export const READING_LINE = 140;

/** 固定ヘッダのぶん上を空けて止める（節に付けた scroll-mt-20 と同じ） */
export const HEADER_OFFSET = 80;

/**
 * いま読んでいる節を選ぶ。
 *
 * @param ids     節 ID を本文の並び順で
 * @param tops    各節の画面上での上端。要素が無いものは null
 * @param atBottom 最下部まで来ているか
 *
 * 判定は「READING_LINE より上に出た最後の節」。最下部まで来たときは
 * 最終節にする（画面に収まりきる短い節が一度も選ばれないまま終わるため）。
 */
export function pickActiveSection(
  ids: string[],
  tops: (number | null)[],
  atBottom: boolean,
): string {
  let current = ids[0] ?? '';
  ids.forEach((id, i) => {
    const top = tops[i];
    if (top !== null && top !== undefined && top <= READING_LINE) current = id;
  });
  if (atBottom) return ids[ids.length - 1] ?? current;
  return current;
}

/**
 * 節まで送るのにかける秒数。
 * 短い移動でももたつかず、長い章でも待たされないよう幅を絞る。
 */
export function scrollDuration(from: number, to: number): number {
  return Math.min(0.44, Math.max(0.24, Math.abs(to - from) / 5000));
}
