/**
 * EXPLAIN の JSON を、画面に出せる木に変える。
 *
 * DuckDB の既定の EXPLAIN は枠線で描いた図をそのまま返してくるので、
 * 1 ノードが 7 行の箱になり、木の形が読み取れない。
 * `EXPLAIN (FORMAT JSON)` なら構造で受け取れるので、こちらを表示に使う。
 * （採点は今までどおり文字列版を使う。正規表現の条件がそこに書いてあるため）
 */

export interface PlanNode {
  /** 演算子の名前。SEQ_SCAN / HASH_JOIN / ORDER_BY など */
  name: string;
  /** 表・結合条件・集約など、その演算子の要点 */
  info: [string, string][];
  /** 見積りの行数 */
  rows: number | null;
  /** 実測の行数（ANALYZE のときだけ） */
  actualRows: number | null;
  /** 実測の所要ミリ秒（ANALYZE のときだけ） */
  ms: number | null;
  children: PlanNode[];
}

export interface QueryPlan {
  root: PlanNode;
  /** 実測つきか */
  analyzed: boolean;
  /** 問い合わせ全体の所要ミリ秒（ANALYZE のときだけ） */
  totalMs: number | null;
  /** 読んだ行数の合計（ANALYZE のときだけ） */
  scannedRows: number | null;
}

/*
  DuckDB は内部処理の列（文字列の圧縮・展開）も計画に載せる。
  学習の役に立たないうえ場所を取るので、表示からは落とす。
*/
const INTERNAL = /__internal_[a-z_]*\(/;

/** 見積り行数は数値として別に出すので、要点の一覧からは外す */
const OMIT = new Set([
  'Estimated Cardinality',
  // 演算子の名前で分かるので二度書かない（SEQ_SCAN に "Type: Sequential Scan"）
  'Type',
]);

/** 1 つの値が長すぎると木の形が見えなくなるので、頭だけ出す */
const MAX_VALUE = 90;

function toText(value: unknown): string {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

/** extra_info を [名前, 値] の並びにする。内部処理だけの項目は落とす */
function readInfo(extra: unknown): [string, string][] {
  if (typeof extra !== 'object' || extra === null) return [];
  const out: [string, string][] = [];
  for (const [key, raw] of Object.entries(extra as Record<string, unknown>)) {
    if (OMIT.has(key)) continue;
    const values = (Array.isArray(raw) ? raw : [raw])
      .map(toText)
      .filter((v) => v !== '' && !INTERNAL.test(v));
    if (values.length === 0) continue;
    const joined = values.join(', ');
    out.push([key, joined.length > MAX_VALUE ? joined.slice(0, MAX_VALUE) + '…' : joined]);
  }
  return out;
}

function readNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function estimated(extra: unknown): number | null {
  if (typeof extra !== 'object' || extra === null) return null;
  return readNumber((extra as Record<string, unknown>)['Estimated Cardinality']);
}

type Raw = Record<string, unknown>;

/** EXPLAIN (FORMAT JSON) の 1 ノード */
function fromPhysical(node: Raw): PlanNode {
  const children = Array.isArray(node.children) ? (node.children as Raw[]) : [];
  return {
    name: String(node.name ?? '?'),
    info: readInfo(node.extra_info),
    rows: estimated(node.extra_info),
    actualRows: null,
    ms: null,
    children: children.map(fromPhysical),
  };
}

/** EXPLAIN (ANALYZE, FORMAT JSON) の 1 ノード */
function fromAnalyzed(node: Raw): PlanNode {
  const children = Array.isArray(node.children) ? (node.children as Raw[]) : [];
  const timing = readNumber(node.operator_timing);
  return {
    name: String(node.operator_name ?? node.operator_type ?? '?'),
    info: readInfo(node.extra_info),
    rows: estimated(node.extra_info),
    actualRows: readNumber(node.operator_cardinality),
    ms: timing === null ? null : timing * 1000,
    children: children.map(fromAnalyzed),
  };
}

/*
  ANALYZE の木は EXPLAIN_ANALYZE や RESULT_COLLECTOR といった
  「問い合わせを包むだけ」のノードから始まる。中身だけを見せる。
*/
const WRAPPERS = new Set(['EXPLAIN_ANALYZE', 'RESULT_COLLECTOR', 'QUERY', '?']);

function unwrap(node: PlanNode): PlanNode {
  let cur = node;
  while (WRAPPERS.has(cur.name) && cur.children.length === 1) cur = cur.children[0];
  return cur;
}

/**
 * EXPLAIN の 1 行（キーと値）から木を組む。
 * 形が想定と違えば null を返し、呼び出し側が文字列表示に落とせるようにする。
 */
export function parsePlan(key: string, json: string): QueryPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (key === 'physical_plan' || key === 'logical_plan') {
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (typeof first !== 'object' || first === null) return null;
    return {
      root: unwrap(fromPhysical(first as Raw)),
      analyzed: false,
      totalMs: null,
      scannedRows: null,
    };
  }

  if (key === 'analyzed_plan') {
    if (typeof parsed !== 'object' || parsed === null) return null;
    const raw = parsed as Raw;
    const latency = readNumber(raw.latency);
    return {
      // いちばん外側は問い合わせそのもの（演算子ではない）ので、中の木を出す
      root: unwrap(fromAnalyzed(raw)),
      analyzed: true,
      totalMs: latency === null ? null : latency * 1000,
      scannedRows: readNumber(raw.cumulative_rows_scanned),
    };
  }

  return null;
}

/** 木の全ノード数（表示の折りたたみ判断などに使う） */
export function countNodes(node: PlanNode): number {
  return 1 + node.children.reduce((n, c) => n + countNodes(c), 0);
}
