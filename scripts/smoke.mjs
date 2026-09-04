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
const lessonDir = join(dirname(fileURLToPath(import.meta.url)), '../src/data/lessons');
const LESSONS = readdirSync(lessonDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(lessonDir, f), 'utf8')));
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
  const homeText = await page.locator('main').innerText();
  check('ホームが表示される', homeText.includes('学習の進捗') && homeText.includes('カリキュラム'));
  check('フェーズカードが7枚', (await page.locator('a[href*="/problems?phase="]').count()) === 7);

  // 1b. テーマ切り替え
  const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('button[aria-label="ダーク"]');
  check('ダークに切り替わる', (await themeOf()) === 'dark');
  await page.reload({ waitUntil: 'networkidle' });
  check('リロード後もダークが保持される', (await themeOf()) === 'dark');
  await page.click('button[aria-label="ライト"]');
  check('ライトに切り替わる', (await themeOf()) === 'light');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('ライトの背景色が明るい', bg === 'rgb(233, 237, 245)', bg);
  await page.click('button[aria-label="システム設定に従う"]');
  check(
    'システム追従に戻せる',
    (await page.evaluate(() => localStorage.getItem('sql-training:theme'))) === null,
  );

  // 1c. ガラス（背後をぼかす面）が実際に効いていること
  const glass = await page.evaluate(() => {
    const panel = document.querySelector('.glass');
    const chrome = document.querySelector('.glass-chrome');
    return {
      panel: panel ? getComputedStyle(panel).backdropFilter : '',
      chrome: chrome ? getComputedStyle(chrome).backdropFilter : '',
    };
  });
  check('カードの背後がぼける', /blur/.test(glass.panel), glass.panel);
  check('ヘッダの背後がぼける', /blur/.test(glass.chrome), glass.chrome);

  // 1d. 教材
  await page.goto(`${base}#/learn`, { waitUntil: 'networkidle' });
  const chapters = await page.locator('a[href*="#/learn/"]').count();
  check('教材の目次に全章が並ぶ', chapters === LESSONS.length, `${chapters} / ${LESSONS.length} 章`);

  await page.click('a[href*="#/learn/2"]');
  await page.waitForSelector('text=この章の内容');
  const chapterText = await page.locator('main').innerText();
  check(
    '章に節の本文が表示される',
    chapterText.includes('UNBOUNDED PRECEDING'),
  );
  check(
    '節からその問題へ行ける',
    (await page.locator('a[href*="#/problems/phase2-"]').count()) > 0,
  );

  // 2. 問題一覧
  await page.goto(`${base}#/problems`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href*="#/problems/phase1-lv1-001"]');
  const listed = await page.locator('ul li a[href*="#/problems/"]').count();
  check(
    '問題一覧に全問表示される',
    listed === ALL_PROBLEMS.length,
    `${listed} / ${ALL_PROBLEMS.length} 件`,
  );

  // 3. 問題を開き DuckDB が起動する
  await page.click('a[href*="#/problems/phase1-lv1-001"]');
  // 問題文や教材にも students の語が出るので、右ペインを testid で名指しする
  const rightPane = page.locator('[data-testid="result-pane"]');
  await rightPane.locator('text=13 行').waitFor({ timeout: 60000 });
  check('DuckDB が初期化されスキーマが表示される', true);
  check(
    'シードデータが投入されている（students 13行）',
    (await rightPane.innerText()).includes('students'),
  );

  // 3b. 問題の前に教材が出る / たたんだ状態が端末に残る
  const lessonPanel = page.locator('[data-testid="lesson"]');
  check('問題ページに教材が表示される', (await lessonPanel.count()) === 1);
  // たたむと見出しには節名が残るので、本文にしか出ない語で判定する
  const lessonBody = '論理的な評価順序';
  check('教材の本文が開いている（既定）', (await lessonPanel.innerText()).includes(lessonBody));
  await page.click('[data-testid="lesson-toggle"]');
  await page.waitForTimeout(200);
  check('教材をたためる', !(await lessonPanel.innerText()).includes(lessonBody));
  await page.reload({ waitUntil: 'networkidle' });
  await rightPane.locator('text=13 行').waitFor({ timeout: 60000 });
  check(
    'リロード後もたたんだままになる',
    !(await page.locator('[data-testid="lesson"]').innerText()).includes(lessonBody),
  );
  await page.click('[data-testid="lesson-toggle"]');
  await page.waitForTimeout(200);

  // 4. クエリ実行
  await typeSql('SELECT class, AVG(score) FROM students GROUP BY class');
  await page.click('[data-testid="run"]');
  await rightPane.locator('table tbody tr').first().waitFor({ timeout: 30000 });
  const cells = await rightPane.locator('table tbody tr').count();
  check('実行結果が表示される（4クラス）', cells === 4, `${cells} 行`);

  // 5. 不正解の採点
  await page.click('[data-testid="answer"]');
  await page.waitForSelector('text=不正解', { timeout: 30000 });
  check('不正解が正しく判定される', true);

  // 6. 正解の採点
  await typeSql('SELECT class, AVG(score) FROM students GROUP BY class HAVING AVG(score) >= 70');
  await page.click('[data-testid="run"]');
  await page.waitForTimeout(500);
  await page.click('[data-testid="answer"]');
  await page.waitForSelector('text=正解！', { timeout: 30000 });
  check('正解が正しく判定される', true);
  check('正解後に解説が開示される', (await page.locator('text=模範解答').count()) > 0);

  // 7. エディタ変更後の警告
  await typeSql('SELECT 1');
  await page.click('[data-testid="answer"]');
  await page.waitForSelector('text=エディタの内容が実行後に変更されています', { timeout: 10000 });
  check('未実行の変更を検知して警告する', true);

  // 8. EXPLAIN
  await typeSql('SELECT class, count(*) FROM students GROUP BY class');
  await page.click('[data-testid="explain"]');
  await page.waitForSelector('text=SEQ_SCAN', { timeout: 30000 });
  check('EXPLAIN の実行計画が表示される', true);

  // 8b. Tab の挙動: 候補が出ているときは確定、出ていなければインデント
  await typeSql('');
  await page.click('.cm-content');
  await page.keyboard.type('SELECT * FROM stu', { delay: 25 });
  await page.waitForSelector('.cm-tooltip-autocomplete', { timeout: 10000 });
  // CodeMirror は候補表示から interactionDelay(既定75ms)以内のキー入力を無視する
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const completed = (await page.locator('.cm-content').innerText()).trim();
  check('補完候補が出ているとき Tab で確定できる', completed.includes('FROM students'), completed);

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('SELECT 1', { delay: 20 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const indented = await page.locator('.cm-content').innerText();
  check('候補が無いとき Tab はインデントのまま', /^\s+SELECT 1/.test(indented), JSON.stringify(indented));

  // 8c. F5 で実行できること（ブラウザのリロードは抑止する）
  await page.evaluate(() => {
    window.__f5Prevented = undefined;
    // アプリ側は capture で拾って stopPropagation するので、確認用も capture で登録する。
    // 同じ要素に登録したリスナー同士は stopPropagation の影響を受けない。
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'F5') {
          // 既定動作の抑止は全ハンドラの実行後に確認する
          setTimeout(() => {
            window.__f5Prevented = e.defaultPrevented;
          }, 0);
        }
      },
      true,
    );
  });
  await typeSql('SELECT 7 AS lucky');
  await page.keyboard.press('F5');
  await page.waitForTimeout(900);
  const f5cell = await rightPane.locator('table tbody tr td').nth(1).innerText();
  check('F5 でクエリを実行できる', f5cell === '7', f5cell);
  check(
    'F5 のブラウザ既定動作（リロード）を抑止する',
    (await page.evaluate(() => window.__f5Prevented)) === true,
  );

  // 8d. Ctrl+Enter が CodeMirror の Mod-Enter（空行挿入）と二重に動かないこと
  await typeSql('SELECT 8 AS eight');
  const linesBefore = await page.locator('.cm-line').count();
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.waitForTimeout(900);
  check('Ctrl+Enter で空行が挿入されない', (await page.locator('.cm-line').count()) === linesBefore);
  check(
    'Ctrl+Enter でクエリを実行できる',
    (await rightPane.locator('table tbody tr td').nth(1).innerText()) === '8',
  );

  // 8e. リロードされても書きかけの SQL と直近の結果が戻ること
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=students', { timeout: 60000 });
  await page.waitForTimeout(800);
  check(
    'リロード後も SQL が復元される',
    (await page.locator('.cm-content').innerText()).includes('SELECT 8 AS eight'),
  );
  check(
    'リロード後も直近の実行結果が復元される',
    (await rightPane.locator('table tbody tr td').nth(1).innerText()) === '8',
  );

  // 8f. F5 を抑止できないブラウザ向けの案内
  await page.evaluate(() => sessionStorage.setItem('sql-training:f5-at', String(Date.now())));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=students', { timeout: 60000 });
  check(
    'F5 を抑止できなかった場合に案内を表示する',
    (await page.locator('text=リロードを抑止できませんでした').count()) > 0,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=students', { timeout: 60000 });
  check(
    '案内は一度きりで出続けない',
    (await page.locator('text=リロードを抑止できませんでした').count()) === 0,
  );

  // 8g. 大きすぎる結果は保存しない（間引いて復元すると ANSWER が誤判定するため）
  await typeSql('SELECT i FROM range(3000) t(i)');
  await page.click('[data-testid="run"]');
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=students', { timeout: 60000 });
  await page.waitForTimeout(800);
  check(
    '大きすぎる結果は復元せず SQL だけ戻す',
    (await page.locator('.cm-content').innerText()).includes('range(3000)') &&
      (await page.locator('text=「実行」を押すと').count()) > 0,
  );

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
    (await page.locator(mcCorrect ? 'text=正解' : 'text=不正解').count()) > 0,
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
