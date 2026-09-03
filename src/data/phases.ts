import type { PhaseInfo, PhaseId, LevelId } from '../types';

/** 設計書 4「カリキュラム構成」 */
export const PHASES: PhaseInfo[] = [
  {
    id: 1,
    name: '集計の基礎',
    summary: 'GROUP BY / HAVING / 基本集約関数。「WHERE と HAVING の使い分け」を体に入れる',
    focus: '弱点対応',
  },
  {
    id: 2,
    name: 'ウィンドウ関数',
    summary: 'RANK / DENSE_RANK / ROW_NUMBER / 累積計算。GROUP BY で潰さずに集計する',
    focus: '弱点対応',
  },
  {
    id: 3,
    name: '結合の基礎〜応用',
    summary: 'INNER / OUTER / 自己結合。非効率な書き方との比較で「正しい結合」を覚える',
    focus: '弱点対応',
  },
  {
    id: 4,
    name: '実行計画とインデックス',
    summary: 'EXPLAIN の読み方、Seq Scan と Index Scan、結合順序とカーディナリティ',
    focus: '弱点対応',
  },
  {
    id: 5,
    name: 'サブクエリの最適化',
    summary: '相関サブクエリを JOIN / ウィンドウ関数へ書き換える',
    focus: '弱点対応',
  },
  {
    id: 6,
    name: 'DB設計・正規化',
    summary: '正規化、関数従属、ER図読解、キー設計。選択式と記述式で理論を固める',
    focus: '資格対策',
  },
  {
    id: 7,
    name: '応用・総合問題',
    summary: '複数テーマ混在の実務寄り問題。データベーススペシャリスト午後問題を意識した総合演習',
    focus: '資格対策・実務',
  },
];

export const PHASE_BY_ID = new Map<PhaseId, PhaseInfo>(PHASES.map((p) => [p.id, p]));

export const LEVEL_LABEL: Record<LevelId, string> = {
  1: 'Lv1',
  2: 'Lv2',
  3: 'Lv3',
};

export const LEVEL_FULL_LABEL: Record<LevelId, string> = {
  1: 'Lv1 易',
  2: 'Lv2 標準',
  3: 'Lv3 難',
};

/** 難易度は明度差だけで示す。彩度の高い色は正誤の表示に取っておく */
export const LEVEL_TONE: Record<LevelId, 'neutral' | 'warning' | 'danger'> = {
  1: 'neutral',
  2: 'warning',
  3: 'danger',
};
