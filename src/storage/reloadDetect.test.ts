import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  detectUnpreventedReload はモジュール内に答えを覚える（StrictMode で
  2 回呼ばれても同じ答えを返すため）。ケースごとに読み込み直す。
*/
async function fresh() {
  vi.resetModules();
  return import('./workbenchSession');
}

const setNavType = (type: string) =>
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type }] as never);

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('detectUnpreventedReload', () => {
  it('F5 の記録が無ければ false', async () => {
    setNavType('reload');
    const { detectUnpreventedReload } = await fresh();
    expect(detectUnpreventedReload()).toBe(false);
  });

  it('F5 を横取りした直後にリロードされていたら true', async () => {
    setNavType('reload');
    const { detectUnpreventedReload, markF5Handled } = await fresh();
    markF5Handled();
    expect(detectUnpreventedReload()).toBe(true);
  });

  it('リロードでない遷移では false（通常の画面遷移を誤検出しない）', async () => {
    setNavType('navigate');
    const { detectUnpreventedReload, markF5Handled } = await fresh();
    markF5Handled();
    expect(detectUnpreventedReload()).toBe(false);
  });

  it('3 秒より前の記録は無視する（手動の Ctrl+R を誤検出しない）', async () => {
    setNavType('reload');
    const { detectUnpreventedReload } = await fresh();
    sessionStorage.setItem('sql-training:f5-at', String(Date.now() - 5000));
    expect(detectUnpreventedReload()).toBe(false);
  });

  it('一度判定したら記録は消す（次のリロードに持ち越さない）', async () => {
    setNavType('reload');
    const { detectUnpreventedReload, markF5Handled } = await fresh();
    markF5Handled();
    detectUnpreventedReload();
    expect(sessionStorage.getItem('sql-training:f5-at')).toBeNull();
  });

  it('2 回目以降は同じ答えを返す（StrictMode の二重呼び出し）', async () => {
    setNavType('reload');
    const { detectUnpreventedReload, markF5Handled } = await fresh();
    markF5Handled();
    expect(detectUnpreventedReload()).toBe(true);
    expect(detectUnpreventedReload()).toBe(true);
  });

  it('navigation の情報が取れなくても落ちない', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([] as never);
    const { detectUnpreventedReload, markF5Handled } = await fresh();
    markF5Handled();
    expect(detectUnpreventedReload()).toBe(false);
  });

  it('sessionStorage が使えなくても落ちない', async () => {
    setNavType('reload');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { detectUnpreventedReload } = await fresh();
    expect(detectUnpreventedReload()).toBe(false);
  });
});
