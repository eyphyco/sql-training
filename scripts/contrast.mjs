/**
 * 配色のコントラスト比を、実際に描画されたピクセルから測る。
 *
 * トークンの値だけで計算するとガラス（半透明の面＋背後のにじみ）を
 * 無視してしまうので、スクリーンショットを撮って読む。
 * 文字は面積が小さいので、1 パーセンタイルを前景、99 パーセンタイルを
 * 背景と見なしてアンチエイリアスの外れ値を落としている。
 *
 * 使い方: node scripts/contrast.mjs [base-url]
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const MIN = 4.5; // WCAG AA（通常サイズの文字）
const SCALE = 2;

const NG = 'SELECT class, AVG(score) AS avg_score FROM students GROUP BY class;';
const OK =
  'SELECT class, AVG(score) AS avg_score\nFROM students\nGROUP BY class\nHAVING AVG(score) >= 70;';

/** 画像の一部を読み、明暗の両端からコントラスト比を出す */
function ratioOfRegion([base64, box]) {
  return (async () => {
    // CSP の connect-src が data: を許していないので fetch は使わず、自前で復号する
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(img.width, img.height);
    const cx = canvas.getContext('2d');
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(box.x, box.y, box.w, box.h).data;
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const ls = [];
    for (let i = 0; i < data.length; i += 4) {
      ls.push(0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]));
    }
    ls.sort((a, b) => a - b);
    const lo = ls[Math.floor(ls.length * 0.01)];
    const hi = ls[Math.floor(ls.length * 0.99)];
    return (hi + 0.05) / (lo + 0.05);
  })();
}

const rows = [];
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1150 },
    deviceScaleFactor: SCALE,
  });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem('sql-training:theme', t), theme);

  const measure = async (label, selector, nth = 0) => {
    const loc = page.locator(selector).nth(nth);
    if ((await loc.count()) === 0) throw new Error(`見つからない: ${selector}`);
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const shot = await page.screenshot();
    const r = await loc.boundingBox();
    const box = {
      x: Math.round(r.x * SCALE),
      y: Math.round(r.y * SCALE),
      w: Math.round(r.width * SCALE),
      h: Math.round(r.height * SCALE),
    };
    const ratio = await page.evaluate(ratioOfRegion, [shot.toString('base64'), box]);
    rows.push([theme, label, ratio]);
  };

  await page.goto(`${base}/#/problems/phase1-lv1-001`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="run"]', { timeout: 60000 });
  await page.waitForTimeout(1500);

  const submit = async (sql) => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(sql);
    await page.locator('[data-testid="run"]').click();
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="answer"]').click();
    await page.waitForTimeout(1400);
  };

  await submit(NG);
  await measure('不正解の見出し (danger)', 'text=不正解：結果セットが期待と一致しません');
  await submit(OK);
  await measure('正解の見出し (success)', 'text=正解！結果セットが完全に一致しました。');

  await page.goto(`${base}/#/problems/phase2-lv2-004`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="problem-nav"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await measure('ナビの現在地 (accent)', 'header nav a[aria-current="page"]');
  await measure('本文 (fg)', '.md p');
  await measure('パンくずリンク (muted)', 'a:has-text("ウィンドウ関数")');
  await measure('実行ボタン (on-accent)', '[data-testid="run"]');
  await measure('サイドバー現在地 (accent)', '[data-testid="nav-current"] span', 2);
  await measure('問題 ID (subtle)', 'span.font-mono');

  // 右ペイン: 型のチップと、1 行おきに敷いた帯の上の値
  const pane = page.locator('[data-testid="result-pane"]');
  await pane.getByRole('button', { name: 'スキーマ' }).click();
  await page.waitForTimeout(500);
  await measure('列の型チップ (subtle)', '[data-testid="schema-type"]');
  await pane.getByRole('button', { name: '実行結果' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('SELECT * FROM monthly_sales;');
  await page.locator('[data-testid="run"]').click();
  await page.waitForTimeout(1200);
  await measure('帯を敷いた行の値 (fg)', '[data-testid="result-pane"] tbody tr:nth-child(3) td', 1);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('SELECT store FROM monthly_sales;');
  await page.waitForTimeout(400);
  await measure('SQL キーワード (syntax)', '.cm-line');

  // 教材の目次（今いる章と、読んでいる節）
  await page.goto(`${base}/#/learn/2`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="chapter-row-current"]');
  await page.waitForTimeout(900);
  await measure('目次の今いる章 (accent)', '[data-testid="chapter-row-current"]');
  await measure('目次の読んでいる節 (accent)', '[data-testid="chapter-nav-current"]');

  await ctx.close();
}
await browser.close();

let low = 0;
for (const [theme, label, ratio] of rows) {
  const ok = ratio >= MIN;
  if (!ok) low += 1;
  console.log(
    `${ok ? 'OK  ' : 'LOW '} ${theme.padEnd(5)} ${label.padEnd(26)} ${ratio.toFixed(2)}:1`,
  );
}
console.log(low === 0 ? `\n${rows.length} 件すべて ${MIN}:1 以上` : `\n${low} 件が ${MIN}:1 未満`);
process.exit(low === 0 ? 0 : 1);
