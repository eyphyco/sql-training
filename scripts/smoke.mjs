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
  // 下地の明るさは相対輝度で見る。色そのものを直書きすると
  // 配色を変えるたびに落ちて、実際に確かめたいこと（明暗の向き）を見失う
  const bodyLuma = () =>
    page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.body)
        .backgroundColor.match(/\d+(\.\d+)?/g)
        .slice(0, 3)
        .map((v) => {
          const c = Number(v) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    });
  const darkLuma = await bodyLuma();
  await page.click('button[aria-label="ライト"]');
  check('ライトに切り替わる', (await themeOf()) === 'light');
  const lightLuma = await bodyLuma();
  check(
    'ライトの下地が明るく、ダークの下地が暗い',
    lightLuma > 0.6 && darkLuma < 0.05,
    `light ${lightLuma.toFixed(3)} / dark ${darkLuma.toFixed(3)}`,
  );
  // つまみは 1 つの要素を動かしている。途中位置を取れれば滑っている
  const thumb = page.locator('[data-testid="theme-thumb"]');
  const thumbX = () => thumb.evaluate((el) => el.getBoundingClientRect().x);
  const checkedLabel = () =>
    page.locator('[role="radiogroup"] button[aria-checked="true"]').getAttribute('aria-label');
  await page.click('button[aria-label="システム設定に従う"]');
  await page.waitForTimeout(45);
  const thumbMid = await thumbX();
  await page.waitForTimeout(600);
  const thumbEnd = await thumbX();
  check(
    'テーマのつまみが滑って移動する',
    Math.abs(thumbMid - thumbEnd) > 2,
    `途中 ${thumbMid.toFixed(0)} / 到達 ${thumbEnd.toFixed(0)}`,
  );
  // 選ばれた瞬間、アイコンが回りながら起き上がる
  const iconTransform = await page
    .locator('button[aria-label="システム設定に従う"] span')
    .evaluate((el) => getComputedStyle(el).transform);
  check('切り替えた側のアイコンが元の姿勢に戻っている', iconTransform === 'none', iconTransform);
  check(
    'システム追従に戻せる',
    (await page.evaluate(() => localStorage.getItem('sql-training:theme'))) === null,
  );

  // つまみをつまんで動かしても切り替えられる
  await page.click('button[aria-label="ライト"]');
  await page.waitForTimeout(500);
  const grab = await thumb.boundingBox();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2 + 20, grab.y + grab.height / 2, { steps: 6 });
  const dragMid = await thumbX();
  await page.mouse.move(grab.x + grab.width / 2 + 32, grab.y + grab.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  check(
    'つまみを引いてテーマを変えられる',
    (await checkedLabel()) === 'ダーク' && (await themeOf()) === 'dark',
    `${await checkedLabel()} / 引いている途中 x=${dragMid.toFixed(0)}`,
  );

  // 端を越えて引いても外れない
  const edge = await thumb.boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 - 400, edge.y + edge.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const leftEnd = await thumbX();
  check(
    'つまみは端で止まる',
    (await checkedLabel()) === 'ライト' && Math.abs(leftEnd - (await thumbX())) < 1,
    `${await checkedLabel()} / x=${leftEnd.toFixed(0)}`,
  );

  // 半端な位置で離すと近い方へ吸い付く（選択は変わらない）
  const half = await thumb.boundingBox();
  await page.mouse.move(half.x + half.width / 2, half.y + half.height / 2);
  await page.mouse.down();
  await page.mouse.move(half.x + half.width / 2 + 9, half.y + half.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  check(
    '半端な位置で離すと元の区画へ戻る',
    (await checkedLabel()) === 'ライト' && Math.abs((await thumbX()) - leftEnd) < 1,
    `${await checkedLabel()} / x=${(await thumbX()).toFixed(0)}`,
  );
  await page.click('button[aria-label="システム設定に従う"]');
  await page.waitForTimeout(400);

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
  // 進捗バーの区切りも /learn/N へのリンクなので、カードだけを数える
  const chapters = await page.locator('[data-testid="chapter-card"]').count();
  check('教材の目次に全章が並ぶ', chapters === LESSONS.length, `${chapters} / ${LESSONS.length} 章`);

  const progress = page.locator('[data-testid="curriculum-progress"]');
  check(
    '教材に全体の進捗バーが出る',
    (await progress.innerText()).includes(`/ ${ALL_PROBLEMS.length} 問`),
  );

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
  check('章でも進捗バーが出る', (await progress.count()) === 1);

  // 読み進み線がスクロールに追従する
  const readingWidth = () =>
    page
      .locator('[data-testid="reading-progress"]')
      .evaluate((el) => el.getBoundingClientRect().width);
  const readTop = await readingWidth();
  const tocCurrent = () => page.locator('[data-testid="chapter-nav-current"]').innerText();
  // 目次の帯は layoutId で位置を繋いでいる。途中位置を取れれば滑っている
  const tocY = () =>
    page
      .locator('[data-testid="chapter-nav-current"] span')
      .first()
      .evaluate((el) => el.getBoundingClientRect().y);
  const tocFrom = await tocCurrent();
  const tocYFrom = await tocY();
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(60);
  const tocYMid = await tocY();
  await page.waitForTimeout(700); // バネが落ち着くのを待つ
  const readMid = await readingWidth();
  check(
    '読み進み線がスクロールで伸びる',
    readMid > readTop + 10,
    `${readTop.toFixed(0)}px → ${readMid.toFixed(0)}px`,
  );
  const tocTo = await tocCurrent();
  const tocYTo = await tocY();
  check(
    '目次が読んでいる節に追従する',
    tocFrom !== tocTo,
    `${tocFrom.replace(/\s+/g, ' ')} → ${tocTo.replace(/\s+/g, ' ')}`,
  );
  check(
    '目次の帯が滑って移動する',
    Math.abs(tocYMid - tocYTo) > 3,
    `${tocYFrom.toFixed(0)} → 途中 ${tocYMid.toFixed(0)} → ${tocYTo.toFixed(0)}`,
  );
  await page.mouse.wheel(0, -3000);
  await page.waitForTimeout(700);

  // 目次を押すと、そのページのまま節まで滑って移動する
  // （HashRouter なので href="#節id" だと別ページへ飛んでしまう）
  const scrollY = () => page.evaluate(() => window.scrollY);
  const hashOf = () => page.evaluate(() => location.hash);
  const jumpFrom = await scrollY();
  await page.locator('[data-testid="chapter-nav"] button').nth(2).click();
  await page.waitForTimeout(120);
  const jumpMid = await scrollY();
  await page.waitForTimeout(700);
  const jumpTo = await scrollY();
  check(
    '目次を押すと URL を変えずに節へ送る',
    (await hashOf()).includes('/learn/2') && jumpTo > jumpFrom + 200,
    `${await hashOf()} / scrollY ${jumpFrom.toFixed(0)} → ${jumpTo.toFixed(0)}`,
  );
  check(
    '節への移動が滑らかに進む',
    Math.abs(jumpMid - jumpTo) > 50,
    `${jumpFrom.toFixed(0)} → 途中 ${jumpMid.toFixed(0)} → ${jumpTo.toFixed(0)}`,
  );
  // 固定ヘッダに隠れない位置で止まる
  const headTop = await page
    .locator('section[id]')
    .nth(2)
    .evaluate((el) => el.getBoundingClientRect().top);
  check('節の見出しがヘッダに隠れない', headTop > 56 && headTop < 120, `上端 ${headTop.toFixed(0)}px`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // 2. 問題一覧
  await page.goto(`${base}#/problems`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href*="#/problems/phase1-lv1-001"]');
  const listed = await page.locator('ul li a[href*="#/problems/"]').count();
  check(
    '問題一覧に全問表示される',
    listed === ALL_PROBLEMS.length,
    `${listed} / ${ALL_PROBLEMS.length} 件`,
  );

  // 絞り込むと、残った行が滑って詰まる（layout アニメーション）
  const lastPhase = Math.max(...ALL_PROBLEMS.map((p) => p.phase));
  const tailId = ALL_PROBLEMS.filter((p) => p.phase === lastPhase)[0].id;
  const tailY = () =>
    page.locator(`a[href$="#/problems/${tailId}"]`).evaluate((el) => el.getBoundingClientRect().y);
  const listFrom = await tailY();
  await page.locator('[data-testid="phase-chip"]').nth(lastPhase - 1).click();
  await page.waitForTimeout(150);
  const listMid = await tailY();
  await page.waitForTimeout(800);
  const listTo = await tailY();
  check(
    '絞り込んだ行が滑って詰まる',
    listTo < listFrom - 100 && Math.abs(listMid - listTo) > 20,
    `${listFrom.toFixed(0)} → 途中 ${listMid.toFixed(0)} → ${listTo.toFixed(0)}`,
  );
  await page.goto(`${base}#/problems`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href*="#/problems/phase1-lv1-001"]');

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
  // 開閉はアニメーションするので、消えるまで待つ（固定待ちだと閉じ切る前に読んでしまう）
  const collapsed = await page
    .waitForFunction(
      (needle) => !(document.querySelector('[data-testid="lesson"]')?.innerText ?? '').includes(needle),
      lessonBody,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  check('教材をたためる', collapsed);
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

  // 空のまま EXPLAIN を押しても「EXPLAIN undefined」を投げない
  await typeSql('');
  await page.click('[data-testid="explain"]');
  await page.waitForTimeout(600);
  const emptyExplain = await page.locator('[data-testid="result-pane"]').innerText();
  check(
    '空のまま EXPLAIN しても実行と同じ案内が出る',
    emptyExplain.includes('SQL が入力されていません') && !emptyExplain.includes('undefined'),
  );

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

  // 8h. 進捗サイドバーから移動できる / 現在地が滑って動く
  const nav = page.locator('[data-testid="problem-nav"]');
  check('問題ページに進捗サイドバーが出る', (await nav.count()) === 1);
  check('現在の問題が 1 つだけ強調される', (await page.locator('[data-testid="nav-current"]').count()) === 1);
  const currentY = () =>
    page
      .locator('[data-testid="nav-current"] span')
      .first()
      .evaluate((el) => el.getBoundingClientRect().y);
  const navFrom = await currentY();
  await nav.locator('a[href*="phase1-lv2-005"]').click();
  await page.waitForTimeout(45);
  const navMid = await currentY();
  await page.waitForTimeout(700);
  const navTo = await currentY();
  check(
    'サイドバーから別の問題へ移動できる',
    page.url().includes('phase1-lv2-005') && navTo !== navFrom,
    page.url().split('#')[1],
  );
  check(
    '現在地の帯が滑って移動する',
    Math.abs(navMid - navTo) > 3,
    `${navFrom.toFixed(0)} → 途中 ${navMid.toFixed(0)} → ${navTo.toFixed(0)}`,
  );

  // 9. 進捗が localStorage に残る
  await page.goto(base, { waitUntil: 'networkidle' });
  const stored = await page.evaluate(() => localStorage.getItem('sql-training:progress:v1'));
  const parsed = JSON.parse(stored ?? '{}');
  check('進捗が localStorage に保存される', parsed?.solvedProblems?.['phase1-lv1-001']?.solved === true);

  // ホームの進捗バーは 0 から伸びる。
  // 読み込み後に測ると伸び終わっていることがあるので、描画前に
  // 仕込んだ観測者で最小値を拾う（addInitScript はページの JS より先に走る）。
  await page.addInitScript(() => {
    window.__meterMin = 2;
    const tick = () => {
      const el = document.querySelector('[role="progressbar"] > *');
      if (el) {
        const a = new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
        if (a < window.__meterMin) window.__meterMin = a;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const meterTo = await page
    .locator('[role="progressbar"] > *')
    .first()
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  const meterMin = await page.evaluate(() => window.__meterMin);
  check(
    'ホームの進捗バーが 0 から伸びる',
    meterTo > 0 && meterMin < meterTo / 2,
    `scaleX ${meterMin.toFixed(3)} → ${meterTo.toFixed(3)}`,
  );

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

  // 採点後、正解の選択肢だけが持ち上がる
  await page.waitForTimeout(600);
  const lifts = await page.locator('[data-testid="choice-option"]').evaluateAll((els) =>
    els.map((el) => Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)),
  );
  const answerIndex = mcId.options.findIndex((o) => o.id === mcId.correct_option_id);
  check(
    '正解の選択肢だけが持ち上がる',
    lifts[answerIndex] < 0 && lifts.filter((y) => y < 0).length === 1,
    `translateY = [${lifts.join(', ')}]`,
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

  // 12b. 正解が教材の進捗バーに反映される
  await page.goto(`${base}#/learn`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900); // 数え上げの完了を待つ
  const solvedShown = await page.locator('[data-testid="progress-solved"]').innerText();
  const storedProgress = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('sql-training:progress:v1'))) ?? '{}',
  );
  const expectedSolved = Object.values(storedProgress.solvedProblems ?? {}).filter(
    (r) => r.solved,
  ).length;
  check(
    '正解数が進捗バーに反映される',
    solvedShown.trim() === String(expectedSolved),
    `表示 ${solvedShown.trim()} / 保存 ${expectedSolved}`,
  );

  // 13. フェーズでフィルタできる
  await page.goto(`${base}#/problems?phase=6`, { waitUntil: 'networkidle' });
  const p6 = ALL_PROBLEMS.filter((p) => p.phase === 6).length;
  const shown = await page.locator('ul li a[href*="/problems/"]').count();
  check('フェーズでフィルタできる', shown === p6, `${shown} / ${p6} 件`);

  // 14. 「視差効果を減らす」設定を尊重する（MotionConfig reducedMotion="user"）
  const reducedCtx = await browser.newContext({ reducedMotion: 'reduce' });
  const reducedPage = await reducedCtx.newPage();
  await reducedPage.goto(`${base}#/problems/phase1-lv1-001`, { waitUntil: 'domcontentloaded' });
  await reducedPage.waitForSelector('[data-testid="lesson-toggle"]', { timeout: 60000 });
  await reducedPage.waitForTimeout(500); // 描画が落ち着いてから押す
  await reducedPage.click('[data-testid="lesson-toggle"]');
  await reducedPage.waitForTimeout(60); // 通常なら 260ms かけて縮む
  // 高さで見る。通常は 60ms 時点でまだ半分以上残っているが、
  // 設定が効いていれば見出しの高さまで縮み切っている
  const reducedHeight = await reducedPage
    .locator('[data-testid="lesson"]')
    .evaluate((el) => el.getBoundingClientRect().height);
  check(
    '視差効果を減らす設定では開閉が即座に終わる',
    reducedHeight < 120,
    `${reducedHeight.toFixed(0)}px`,
  );
  await reducedCtx.close();

  check('コンソールエラーが無い', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('例外が発生しなかった', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} / ${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
