#!/usr/bin/env node
/**
 * ブラウザでの疎通確認（要: vite preview か dev サーバが起動していること）
 *   node scripts/smoke.mjs [baseUrl]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const problemDir = join(dirname(fileURLToPath(import.meta.url)), '../src/data/problems');
const ALL_PROBLEMS = readdirSync(problemDir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(problemDir, f), 'utf8')));
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function typeSql(sql) {
  await page.click('.cm-content');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  // CodeMirror の自動補完・自動閉じ括弧を避けるため、まとめて挿入する
  await page.evaluate((text) => navigator.clipboard.writeText(text), sql).catch(() => {});
  await page.keyboard.insertText(sql);
}

try {
  // 1. ホーム
  await page.goto(base, { waitUntil: 'networkidle' });
  check('ホームが表示される', (await page.locator('h1', { hasText: 'SQL Training' }).count()) > 0);
  check('フェーズカードが7枚', (await page.locator('a[href*="/problems?phase="]').count()) === 7);

  // 2. 問題一覧
  await page.click('text=問題一覧');
  await page.waitForSelector('a[href*="#/problems/phase1-lv1-001"]');
  const listed = await page.locator('ul li a[href*="#/problems/"]').count();
  check(
    '問題一覧に全問表示される',
    listed === ALL_PROBLEMS.length,
    `${listed} / ${ALL_PROBLEMS.length} 件`,
  );

  // 3. 問題を開き DuckDB が起動する
  await page.click('a[href*="#/problems/phase1-lv1-001"]');
  // 問題文中にも students の語が出るので、右ペイン（2つ目の section）で待つ
  const rightPane = page.locator('section').nth(1);
  await rightPane.locator('text=13 行').waitFor({ timeout: 60000 });
  check('DuckDB が初期化されスキーマが表示される', true);
  check(
    'シードデータが投入されている（students 13行）',
    (await rightPane.innerText()).includes('students'),
  );

  // 4. クエリ実行
  await typeSql('SELECT class, AVG(score) FROM students GROUP BY class');
  await page.click('button:has-text("実行")');
  await page.waitForSelector('table tbody tr', { timeout: 30000 });
  const cells = await page.locator('table tbody tr').count();
  check('実行結果が表示される（4クラス）', cells === 4, `${cells} 行`);

  // 5. 不正解の採点
  await page.click('button:has-text("ANSWER")');
  await page.waitForSelector('text=不正解', { timeout: 30000 });
  check('不正解が正しく判定される', true);

  // 6. 正解の採点
  await typeSql('SELECT class, AVG(score) FROM students GROUP BY class HAVING AVG(score) >= 70');
  await page.click('button:has-text("実行")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("ANSWER")');
  await page.waitForSelector('text=正解！', { timeout: 30000 });
  check('正解が正しく判定される', true);
  check('正解後に解説が開示される', (await page.locator('text=模範解答').count()) > 0);

  // 7. エディタ変更後の警告
  await typeSql('SELECT 1');
  await page.click('button:has-text("ANSWER")');
  await page.waitForSelector('text=エディタの内容が実行後に変更されています', { timeout: 10000 });
  check('未実行の変更を検知して警告する', true);

  // 8. EXPLAIN
  await typeSql('SELECT class, count(*) FROM students GROUP BY class');
  await page.click('button:has-text("EXPLAIN")');
  await page.waitForSelector('text=SEQ_SCAN', { timeout: 30000 });
  check('EXPLAIN の実行計画が表示される', true);

  // 9. 進捗が localStorage に残る
  await page.goto(base, { waitUntil: 'networkidle' });
  const stored = await page.evaluate(() => localStorage.getItem('sql-training:progress:v1'));
  const parsed = JSON.parse(stored ?? '{}');
  check('進捗が localStorage に保存される', parsed?.solvedProblems?.['phase1-lv1-001']?.solved === true);

  // 10. 選択式問題を解く
  const mcId = ALL_PROBLEMS.find((p) => p.type === 'multiple_choice');
  await page.goto(`${base}#/problems/${mcId.id}`, { waitUntil: 'networkidle' });
  await page.locator(`button:has-text("${mcId.options[0].text.slice(0, 20)}")`).click();
  await page.click('button:has-text("ANSWER")');
  await page.waitForSelector('text=解説', { timeout: 10000 });
  const mcCorrect = mcId.options[0].id === mcId.correct_option_id;
  check(
    '選択式問題が採点される',
    (await page.locator(mcCorrect ? 'text=◯ 正解' : 'text=× 不正解').count()) > 0,
  );

  // 11. 記述式問題を解く
  const wrId = ALL_PROBLEMS.find((p) => p.type === 'written');
  await page.goto(`${base}#/problems/${wrId.id}`, { waitUntil: 'networkidle' });
  await page.fill('textarea', 'テスト解答');
  await page.click('button:has-text("ANSWER")');
  await page.waitForSelector('text=模範解答', { timeout: 10000 });
  await page.click('button:has-text("理解できた")');
  check('記述式問題で模範解答と自己採点ができる', true);

  // 12. 進捗のエクスポート
  await page.goto(`${base}#/settings`, { waitUntil: 'networkidle' });
  check(
    '進捗データ画面が表示される',
    (await page.locator('button:has-text("エクスポート")').count()) > 0,
  );

  // 13. フェーズでフィルタできる
  await page.goto(`${base}#/problems?phase=6`, { waitUntil: 'networkidle' });
  const p6 = ALL_PROBLEMS.filter((p) => p.phase === 6).length;
  const shown = await page.locator('ul li a[href*="/problems/"]').count();
  check('フェーズでフィルタできる', shown === p6, `${shown} / ${p6} 件`);

  check('コンソールエラーが無い', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('例外が発生しなかった', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} / ${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
