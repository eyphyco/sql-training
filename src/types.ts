/** 問題データのスキーマ定義（設計書 §5 に対応） */

export type PhaseId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type LevelId = 1 | 2 | 3;

export interface ProblemBase {
  id: string;
  phase: PhaseId;
  level: LevelId;
  title: string;
  /** 問題文（Markdown / 日本語） */
  prompt_md: string;
  /** 解答後に表示する解説（Markdown） */
  explanation_md: string;
  /** 段階的に開示するヒント。配列で複数段階に対応 */
  hints_md?: string[];
  tags: string[];
}

/** 採点方式。将来の拡張のため type で分岐させる（設計書 §5-1） */
export interface JudgeSpec {
  type: 'result_set' | 'explain_check';
  /** false ならソートしてから比較する */
  order_sensitive: boolean;
  /** 比較対象の列を名前で限定する場合に指定（null なら全列を位置で比較） */
  compare_columns: string[] | null;
  /**
   * explain_check 用。EXPLAIN の出力（大文字化した文字列）に対する正規表現。
   * required: すべて含まれること / forbidden: 1つも含まれないこと
   */
  explain_required?: string[];
  explain_forbidden?: string[];
  /** SQL 本文（大文字化）に対する正規表現。書き換え課題（相関サブクエリ禁止など）で使う */
  sql_required?: string[];
  sql_forbidden?: string[];
  /** 上記パターンに違反したときに表示するメッセージ */
  pattern_hint?: string;
}

export interface SqlQueryProblem extends ProblemBase {
  type: 'sql_query';
  schema_sql: string;
  seed_data_sql: string;
  /** 模範解答。正解判定の期待値生成と、解答後の参考表示に使う */
  expected_query: string;
  judge: JudgeSpec;
  /** エディタの初期値（省略時は空） */
  starter_sql?: string;
  /** 別解の紹介（Markdown） */
  alternative_md?: string;
}

export interface MultipleChoiceProblem extends ProblemBase {
  type: 'multiple_choice';
  options: { id: string; text: string }[];
  correct_option_id: string;
}

export interface WrittenProblem extends ProblemBase {
  type: 'written';
  sample_answer_md: string;
  /** 自己採点用の観点 */
  grading_note_md: string;
}

export type Problem = SqlQueryProblem | MultipleChoiceProblem | WrittenProblem;
export type ProblemType = Problem['type'];

/** 一覧表示用の軽量メタデータ（問題本体をロードせずに扱う） */
export interface ProblemMeta {
  id: string;
  type: ProblemType;
  phase: PhaseId;
  level: LevelId;
  title: string;
  tags: string[];
}

export interface PhaseInfo {
  id: PhaseId;
  name: string;
  summary: string;
  /** 設計書 §4 の「該当スキル」 */
  focus: '弱点対応' | '資格対策' | '資格対策・実務';
}

/* ------------------------------------------------------------------
   教材
   フェーズごとに 1 章。章は節に分かれ、節がどの問題を扱うかを持つ。
   問題側からは節を逆引きして「この問題の前に読む教材」を出す。
   ------------------------------------------------------------------ */

export interface LessonSection {
  id: string;
  title: string;
  /** 本文（Markdown / 日本語） */
  body_md: string;
  /** この節を読んだうえで解く問題。ここが問題との唯一の対応表 */
  problems: string[];
}

export interface Lesson {
  phase: PhaseId;
  title: string;
  /** 章の狙いを 1 行で */
  lead: string;
  sections: LessonSection[];
}

/** 進捗データ（設計書 §8） */
export interface SolvedRecord {
  solved: boolean;
  attempts: number;
  lastSolvedAt: string | null;
  /** written 問題の自己採点結果 */
  selfRating?: 'understood' | 'review';
}

export interface HistoryEntry {
  problemId: string;
  at: string;
  correct: boolean;
}

export interface ProgressData {
  version: number;
  solvedProblems: Record<string, SolvedRecord>;
  history: HistoryEntry[];
}
