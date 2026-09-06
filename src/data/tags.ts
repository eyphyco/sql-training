/**
 * タグの語彙。
 *
 * 増やすときはここに足す（`validate` が、ここに無いタグを弾く）。
 * 何となく付けていくと `group by` と `結合` と `inner join` が同じ次元に並び、
 * 何が基準の分類なのか読み取れなくなる。2 種類だけに決めてある。
 *
 *   構文タグ … SQL に実際に書くキーワード。書くとおりの大文字で持つ
 *   概念タグ … 考え方・分野。日本語で持つ（定訳の無い術語だけそのまま）
 *
 * 画面では構文タグを等幅で出し、見ただけで種類が分かるようにする。
 */

/** SQL に書くキーワード。表記は SQL に書くとおり（大文字） */
export const SYNTAX_TAGS = [
  'GROUP BY',
  'HAVING',
  'WHERE',
  'ORDER BY',
  'PARTITION BY',
  'ROLLUP',
  'CASE',
  'COALESCE',
  'COUNT',
  'NULL',
  'RANK',
  'DENSE_RANK',
  'ROW_NUMBER',
  'LAG',
  'FIRST_VALUE',
  'LAST_VALUE',
  'INNER JOIN',
  'LEFT JOIN',
  'FULL OUTER JOIN',
  'ON',
  'EXISTS',
  'NOT EXISTS',
  'EXPLAIN',
] as const;

/** 考え方・分野。日本語で持つ */
export const CONCEPT_TAGS = [
  // 集計
  '集約',
  '集約関数',
  '条件付き集計',
  '事前集計',
  '重複',
  '3値論理',
  // ウィンドウ関数
  'ウィンドウ関数',
  'フレーム',
  '累積和',
  '移動平均',
  '構成比',
  '上位N件',
  // 結合
  '結合',
  '外部結合',
  '自己結合',
  '多段結合',
  '非等値結合',
  '直積',
  '関係除算',
  '多対多',
  // サブクエリ
  'サブクエリ',
  '相関サブクエリ',
  'スカラサブクエリ',
  // 実行計画・性能
  '実行計画',
  '結合アルゴリズム',
  'インデックス',
  '複合インデックス',
  'カーディナリティ',
  '統計情報',
  'sargable',
  '最適化',
  '性能',
  // 設計
  '設計',
  '正規化',
  '非正規化',
  '第1正規形',
  '第2正規形',
  '第3正規形',
  'BCNF',
  '関数従属',
  '部分関数従属',
  '推移的関数従属',
  '候補キー',
  'ER図',
  'トランザクション',
  // その他
  '日付関数',
  'リピート分析',
  '総合',
  '模擬試験',
] as const;

const SYNTAX = new Set<string>(SYNTAX_TAGS);

export const ALL_TAG_VOCABULARY: string[] = [...SYNTAX_TAGS, ...CONCEPT_TAGS];

/** SQL のキーワードとして出すタグかどうか（画面で等幅にする） */
export function isSyntaxTag(tag: string): boolean {
  return SYNTAX.has(tag);
}
