import { describe, expect, it } from 'vitest';
import { countNodes, parsePlan } from './plan';

/*
  実データの形をそのまま縮めたもの（DuckDB-WASM から採取）。
  キーの名前や入れ子の形が変わったら、ここが落ちて気づける。
*/
const PHYSICAL = JSON.stringify([
  {
    name: 'HASH_GROUP_BY',
    extra_info: { Groups: '#0', Aggregates: 'count_star()', 'Estimated Cardinality': '4' },
    children: [
      {
        name: 'PROJECTION',
        extra_info: {
          Projections: ['#0', '__internal_compress_integral_utinyint(#1, 1)'],
          'Estimated Cardinality': '6',
        },
        children: [
          {
            name: 'SEQ_SCAN',
            extra_info: {
              Table: 'memory.main.orders',
              Type: 'Sequential Scan',
              Projections: 'customer_id',
              'Estimated Cardinality': '6',
            },
            children: [],
          },
        ],
      },
    ],
  },
]);

const ANALYZED = JSON.stringify({
  latency: 0.0173,
  cumulative_rows_scanned: 11,
  operator_name: undefined,
  children: [
    {
      operator_name: 'EXPLAIN_ANALYZE',
      operator_type: 'EXPLAIN_ANALYZE',
      operator_timing: 0,
      operator_cardinality: 0,
      extra_info: {},
      children: [
        {
          operator_name: 'ORDER_BY',
          operator_type: 'ORDER_BY',
          operator_timing: 0.0002,
          operator_cardinality: 4,
          extra_info: { 'Order By': 'n DESC' },
          children: [
            {
              operator_name: 'SEQ_SCAN',
              operator_type: 'SEQ_SCAN',
              operator_timing: 0.0042,
              operator_cardinality: 5,
              extra_info: { Table: 'customers', 'Estimated Cardinality': '5' },
              children: [],
            },
          ],
        },
      ],
    },
  ],
});

describe('parsePlan — 見積り', () => {
  const plan = parsePlan('physical_plan', PHYSICAL)!;

  it('木として読める', () => {
    expect(plan.root.name).toBe('HASH_GROUP_BY');
    expect(countNodes(plan.root)).toBe(3);
    expect(plan.analyzed).toBe(false);
  });

  it('見積り行数を数値で持つ', () => {
    expect(plan.root.rows).toBe(4);
    expect(plan.root.children[0].children[0].rows).toBe(6);
  });

  it('見積りは要点の一覧に重ねて出さない', () => {
    expect(plan.root.info.map(([k]) => k)).not.toContain('Estimated Cardinality');
  });

  it('演算子の名前で分かる Type は落とす', () => {
    const scan = plan.root.children[0].children[0];
    expect(scan.info.map(([k]) => k)).toEqual(['Table', 'Projections']);
  });

  it('内部処理の列は出さない', () => {
    const projection = plan.root.children[0];
    expect(projection.info).toEqual([['Projections', '#0']]);
  });

  it('実測の欄は空のまま', () => {
    expect(plan.root.actualRows).toBeNull();
    expect(plan.root.ms).toBeNull();
  });
});

describe('parsePlan — 実測', () => {
  const plan = parsePlan('analyzed_plan', ANALYZED)!;

  it('包みのノードを飛ばして演算子から始める', () => {
    expect(plan.root.name).toBe('ORDER_BY');
    expect(countNodes(plan.root)).toBe(2);
  });

  it('実測の行数と時間をミリ秒で持つ', () => {
    expect(plan.root.actualRows).toBe(4);
    expect(plan.root.ms).toBeCloseTo(0.2, 5);
    expect(plan.root.children[0].ms).toBeCloseTo(4.2, 5);
  });

  it('全体の時間と読んだ行数を持つ', () => {
    expect(plan.analyzed).toBe(true);
    expect(plan.totalMs).toBeCloseTo(17.3, 5);
    expect(plan.scannedRows).toBe(11);
  });

  it('見積りと実測を並べて持てる', () => {
    const scan = plan.root.children[0];
    expect([scan.rows, scan.actualRows]).toEqual([5, 5]);
  });
});

describe('parsePlan — 読み取れないとき', () => {
  it.each([
    ['JSON でない', 'physical_plan', 'not json'],
    ['知らないキー', 'something_else', '[]'],
    ['中身が空', 'physical_plan', 'null'],
  ])('%s は null を返す（呼び出し側が落ちないように）', (_name, key, json) => {
    expect(parsePlan(key, json)).toBeNull();
  });
});
