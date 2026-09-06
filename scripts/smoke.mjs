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

/*
  独立した検査のまとまり。中で落ちても、その 1 件を失敗にして次へ進む。
  1 本道の操作（問題を開く → 実行する → 採点する）は前の手順に依存するので
  そのまま並べているが、自分の context を持つ検査はここで切り離す。
*/
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, String(e).split('\n')[0]);
  }
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
  // 色は一瞬では入れ替わらない（.theme-fading）。落ち着いてから測る
  await page.waitForTimeout(700);
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
  // 切り替えた瞬間、外れた側は沈み、選ばれた側は下から昇る
  const iconY = (label) =>
    page
      .locator(`button[aria-label="${label}"] span`)
      .evaluate((el) => Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42));
  await page.click('button[aria-label="ライト"]');
  await page.waitForTimeout(700);
  await page.click('button[aria-label="ダーク"]');
  await page.waitForTimeout(150);
  const sinking = await iconY('ライト');
  const rising = await iconY('ダーク');
  await page.waitForTimeout(700);
  check('外れた側のアイコンが沈む', sinking > 4, `y=${sinking}`);
  check(
    '選ばれた側のアイコンが下から昇る',
    rising > 4 && (await iconY('ダーク')) === 0,
    `途中 y=${rising} → ${await iconY('ダーク')}`,
  );
  check('沈んだアイコンは元の位置に戻る', (await iconY('ライト')) === 0);
  await page.click('button[aria-label="システム設定に従う"]');
  await page.waitForTimeout(700);
  check(
    'システム追従に戻せる',
    (await page.evaluate(() => localStorage.getItem('sql-training:theme'))) === null,
  );

  /*
    配色は一瞬で入れ替えず、短く色をつなぐ。
    Service Worker の登録と資産の保存が初回読み込みと重なるとコマが落ちるので、
    落ち着いてから測る（見たいのは通常時の見え方）。
  */
  await page.evaluate(() => navigator.serviceWorker?.ready).catch(() => {});
  await page.waitForTimeout(300);
  const fade = await page.evaluate(async () => {
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const lum = (s) => {
      const [r, g, b] = s
        .match(/\d+(\.\d+)?/g)
        .slice(0, 3)
        .map(Number);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    document.querySelector('button[aria-label="ライト"]').click();
    await new Promise((r) => setTimeout(r, 600));
    const from = lum(getComputedStyle(document.body).backgroundColor);
    const samples = [];
    const t0 = performance.now();
    document.querySelector('button[aria-label="ダーク"]').click();
    await new Promise((done) => {
      const tick = () => {
        const t = performance.now() - t0;
        const cs = getComputedStyle(document.body);
        const bg = lum(cs.backgroundColor);
        const fg = lum(cs.color);
        const hi = Math.max(bg, fg) + 0.05;
        const lo = Math.min(bg, fg) + 0.05;
        samples.push({ t, bg, ratio: hi / lo });
        if (t > 900) return done();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const to = samples[samples.length - 1].bg;
    const between = samples.filter((s) => s.bg < from - 0.05 && s.bg > to + 0.02).length;
    let dip = 0;
    let prev = 0;
    for (const s of samples) {
      if (s.ratio < 3) dip += s.t - prev;
      prev = s.t;
    }
    return { from, to, between, dip, minRatio: Math.min(...samples.map((s) => s.ratio)) };
  });
  check(
    '配色は一瞬で入れ替わらず、途中の色を通る',
    // コマ数は機械の忙しさで前後する。ここで見たいのは「一瞬で入れ替わらない」こと
    fade.from > 0.6 && fade.to < 0.05 && fade.between >= 2,
    `途中の色 ${fade.between} コマ`,
  );
  /*
    黒い文字と白い下地が入れ替わる以上、途中で必ず両方が中間の灰色になる
    瞬間を通る。避けられないので「短く抜けること」だけを見る。
    フレームの取り方で数十 ms ぶれるため、閾値はゆるめの回帰検知にしてある。
  */
  check(
    '入れ替わりの途中で文字が読めなくなる時間が短い',
    fade.dip < 110,
    `最小 ${fade.minRatio.toFixed(2)}:1 / 3:1 未満 ${Math.round(fade.dip)}ms`,
  );
  await page.waitForTimeout(400);

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
  // ルートは遅延読み込みなので、networkidle のあとに本体を取りに行く。
  // 中身が出るまで待ってから数える
  await page.waitForSelector('[data-testid="chapter-card"]');
  // 進捗バーの区切りも /learn/N へのリンクなので、カードだけを数える
  const chapters = await page.locator('[data-testid="chapter-card"]').count();
  check(
    '教材の目次に全章が並ぶ',
    chapters === LESSONS.length,
    `${chapters} / ${LESSONS.length} 章`,
  );

  const progress = page.locator('[data-testid="curriculum-progress"]');
  check(
    '教材に全体の進捗バーが出る',
    (await progress.innerText()).includes(`/ ${ALL_PROBLEMS.length} 問`),
  );

  await page.click('a[href*="#/learn/2"]');
  await page.waitForSelector('text=教材の目次');
  const chapterText = await page.locator('main').innerText();
  check('章に節の本文が表示される', chapterText.includes('UNBOUNDED PRECEDING'));
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
  // 節の罫は「読んだところまで」塗る（scaleY で伸ばしている）
  const railScale = () =>
    page
      .locator('[data-testid="chapter-nav-rail"]')
      .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m22);
  const tocFrom = await tocCurrent();
  const tocYFrom = await tocY();
  const railFrom = await railScale();
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(60);
  const tocYMid = await tocY();
  await page.waitForTimeout(700); // バネが落ち着くのを待つ
  const readMid = await readingWidth();
  /*
    読み進みの線はヘッダー下端に固定している。ナビの選択の印を下線にすると
    同じ行に同じ色・同じ太さで並び、1 本の途切れた線に見える。重ならないこと。
  */
  const onBar = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="reading-progress"]').getBoundingClientRect();
    return [...document.querySelectorAll('header nav a *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.bottom > bar.top && r.top < bar.bottom;
    }).length;
  });
  check('章ページで読み進みの線とナビの印が重ならない', onBar === 0, `重なり ${onBar} 件`);

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
  const railTo = await railScale();
  check(
    '読んだところまで目次の罫が伸びる',
    railTo > railFrom + 0.1,
    `${railFrom.toFixed(2)} → ${railTo.toFixed(2)}`,
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
  await page.locator('[data-testid="chapter-nav"] [data-testid="section-link"]').last().click();
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
  // 固定ヘッダに隠れない位置で止まる（押したのは最後の節）
  const headTop = await page
    .locator('section[id]')
    .last()
    .evaluate((el) => el.getBoundingClientRect().top);
  check(
    '節の見出しがヘッダに隠れない',
    headTop > 56 && headTop < 120,
    `上端 ${headTop.toFixed(0)}px`,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  // 目次には全 7 章が並び、開くのは今いる章だけ
  const chapterRows = await page
    .locator('[data-testid="chapter-row"], [data-testid="chapter-row-current"]')
    .count();
  const sectionButtons = () => page.locator('[data-testid="chapter-nav"] li button').count();
  check(
    '章ページの目次に全ての章が並ぶ',
    chapterRows === LESSONS.length,
    `${chapterRows} / ${LESSONS.length} 章`,
  );
  check(
    '開いているのは今いる章だけ',
    (await sectionButtons()) === LESSONS[1].sections.length,
    `${await sectionButtons()} 節（第 2 章は ${LESSONS[1].sections.length} 節）`,
  );

  // 目次から別の章へ飛べる。今いる章の下地は滑って移動する
  const rowY = () =>
    page
      .locator('[data-testid="chapter-row-current"]')
      .evaluate((el) => el.getBoundingClientRect().y);
  const chapFrom = await rowY();
  await page.locator('[data-testid="chapter-nav"] a[href$="#/learn/7"]').click();
  await page.waitForTimeout(150);
  const chapMid = await rowY();
  await page.waitForTimeout(900);
  const chapTo = await rowY();
  check(
    '目次から別の章へ飛べる',
    (await hashOf()).includes('/learn/7') &&
      (await page.locator('main h1').innerText()).includes(LESSONS[6].title),
    `${await hashOf()}`,
  );
  const openTitles = await page.locator('[data-testid="chapter-nav"] li button').allInnerTexts();
  check(
    '開く章が入れ替わる',
    openTitles.length === LESSONS[6].sections.length &&
      openTitles[0].includes(LESSONS[6].sections[0].title),
    `${openTitles.length} 節（第 7 章は ${LESSONS[6].sections.length} 節）・先頭「${openTitles[0]?.replace(/\s+/g, ' ')}」`,
  );
  check(
    '今いる章の下地が滑って移動する',
    chapTo > chapFrom + 20 && Math.abs(chapMid - chapTo) > 5,
    `${chapFrom.toFixed(0)} → 途中 ${chapMid.toFixed(0)} → ${chapTo.toFixed(0)}`,
  );
  await page.goto(`${base}#/learn/2`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=教材の目次');
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
  await page
    .locator('[data-testid="phase-chip"]')
    .nth(lastPhase - 1)
    .click();
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
      (needle) =>
        !(document.querySelector('[data-testid="lesson"]')?.innerText ?? '').includes(needle),
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
  check(
    '候補が無いとき Tab はインデントのまま',
    /^\s+SELECT 1/.test(indented),
    JSON.stringify(indented),
  );

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
  check(
    'Ctrl+Enter で空行が挿入されない',
    (await page.locator('.cm-line').count()) === linesBefore,
  );
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

  // 8j. 実行計画は木で出す（生の枠線図ではなく）
  await typeSql('SELECT class, count(*) FROM students GROUP BY class ORDER BY 2 DESC');
  await page.click('[data-testid="explain"]');
  await rightPane.locator('[data-testid="plan-tree"]').waitFor({ timeout: 30000 });
  const planText = await rightPane.locator('[data-testid="plan-tree"]').innerText();
  check(
    '実行計画が演算子の木として出る',
    /SEQ_SCAN/.test(planText) && /GROUP_BY/.test(planText) && !planText.includes('┌'),
    planText.split('\n')[0],
  );

  await page.click('[data-testid="plan-analyze"]');
  await page.waitForTimeout(2000);
  const analyzed = await rightPane.innerText();
  check(
    '実測（ANALYZE）で所要時間と実測行数が出る',
    /全体 [\d.]+ ms/.test(analyzed) && /実測 \d+/.test(analyzed),
    (analyzed.match(/全体 [\d.]+ ms/) ?? ['—'])[0],
  );

  // 8k. エラーの行がエディタで分かる
  await typeSql('SELECT *\nFROM students\nWHERE nonexistent_column = 1');
  await page.click('[data-testid="run"]');
  await page.waitForSelector('.cm-error-line', { timeout: 30000 });
  const markedLine = await page.evaluate(() => {
    const marked = document.querySelector('.cm-error-line');
    const lines = [...document.querySelectorAll('.cm-line')];
    return lines.indexOf(marked) + 1;
  });
  check('エラーの行がエディタで示される', markedLine === 3, `${markedLine} 行目に印`);

  await page.click('.cm-content');
  await page.keyboard.type(' ');
  await page.waitForTimeout(300);
  check(
    '書き換えると印は消える（行がずれるため）',
    (await page.locator('.cm-error-line').count()) === 0,
  );

  // 8i. 実行結果とスキーマの読みやすさ
  await typeSql("SELECT DATE '2024-03-05' AS d, 1234 AS n, 'x' AS s");
  await page.click('[data-testid="run"]');
  await rightPane.locator('table tbody tr').first().waitFor({ timeout: 30000 });
  const bodyCells = await rightPane.locator('table tbody tr td').allInnerTexts();
  check(
    'DATE 列が日付として表示される',
    bodyCells.includes('2024-03-05'),
    bodyCells.filter(Boolean).join(' | '),
  );
  // 数値だけの列は右に寄せる（# 列・d 列・n 列・s 列の順）
  const aligns = await rightPane
    .locator('table tbody tr td')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).textAlign));
  check(
    '数値の列だけ右に寄る',
    aligns[1] === 'left' && aligns[2] === 'right' && aligns[3] === 'left',
    `d=${aligns[1]} n=${aligns[2]} s=${aligns[3]}`,
  );
  const weights = await page.evaluate(() => {
    const pane = document.querySelector('[data-testid="result-pane"]');
    const th = pane.querySelector('table thead th:nth-child(2)');
    const td = pane.querySelector('table tbody td:nth-child(2)');
    return [getComputedStyle(th).fontWeight, getComputedStyle(td).fontWeight].map(Number);
  });
  check(
    '見出しがデータより太い（どこからがデータか分かる）',
    weights[0] > weights[1],
    `見出し ${weights[0]} / データ ${weights[1]}`,
  );

  await rightPane.getByRole('button', { name: 'スキーマ' }).click();
  await page.waitForTimeout(600);
  const look = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="schema-table"]');
    const col = document.querySelector('[data-testid="schema-column"]');
    const read = (el) => {
      const s = getComputedStyle(el);
      return {
        weight: Number(s.fontWeight),
        color: s.color,
        left: el.getBoundingClientRect().left,
      };
    };
    return {
      table: read(table),
      col: read(col),
      sticky: getComputedStyle(table.closest('header')).position,
    };
  });
  check(
    'スキーマでテーブル名と列名が見分けられる',
    look.table.weight > look.col.weight &&
      look.table.color !== look.col.color &&
      look.col.left - look.table.left > 8,
    `太さ ${look.table.weight}/${look.col.weight}・字下げ ${(look.col.left - look.table.left).toFixed(0)}px`,
  );
  check('テーブル名の帯が貼り付く（列を送っても迷子にならない）', look.sticky === 'sticky');

  // 8h. 進捗サイドバーから移動できる / 現在地が滑って動く
  const nav = page.locator('[data-testid="problem-nav"]');
  check('問題ページに進捗サイドバーが出る', (await nav.count()) === 1);
  check(
    '現在の問題が 1 つだけ強調される',
    (await page.locator('[data-testid="nav-current"]').count()) === 1,
  );
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
  check(
    '進捗が localStorage に保存される',
    parsed?.solvedProblems?.['phase1-lv1-001']?.solved === true,
  );

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
  const lifts = await page
    .locator('[data-testid="choice-option"]')
    .evaluateAll((els) =>
      els.map((el) => Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)),
    );
  const answerIndex = mcId.options.findIndex((o) => o.id === mcId.correct_option_id);
  check(
    '正解の選択肢だけが持ち上がる',
    lifts[answerIndex] < 0 && lifts.filter((y) => y < 0).length === 1,
    `translateY = [${lifts.join(', ')}]`,
  );

  // 10b. 日付を含む問題が正解と判定される
  //     （DATE を数値のまま扱っていた頃の表示バグを直したので、採点も一緒に見る）
  const dateProblem = ALL_PROBLEMS.find((p) => p.id === 'phase3-lv1-001');
  await page.goto(`${base}#/problems/${dateProblem.id}`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="result-pane"]').locator('text=行').first().waitFor({
    timeout: 60000,
  });
  await typeSql(dateProblem.expected_query);
  await page.click('[data-testid="run"]');
  await page.locator('[data-testid="result-pane"] table tbody tr').first().waitFor({
    timeout: 30000,
  });
  const dateCells = await page
    .locator('[data-testid="result-pane"] table tbody td')
    .allInnerTexts();
  check(
    '日付の列が結果でも日付のまま出る',
    dateCells.some((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.trim())),
    dateCells.slice(0, 5).join(' | '),
  );
  await page.click('[data-testid="answer"]');
  await page.waitForSelector('text=解説', { timeout: 30000 });
  check('日付を含む問題が正解と判定される', (await page.locator('text=不正解').count()) === 0);

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
  // 「進捗データ」はヘッダのナビにも出るので、ページ側の見出しで待つ
  await page.waitForSelector('main h1:has-text("設定")');
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
  await page.waitForSelector('ul li a[href*="/problems/"]');
  const p6 = ALL_PROBLEMS.filter((p) => p.phase === 6).length;
  const shown = await page.locator('ul li a[href*="/problems/"]').count();
  check('フェーズでフィルタできる', shown === p6, `${shown} / ${p6} 件`);

  // 13b. 同じ種類の中は OR。Lv1 と Lv3 を同時に見られる
  await page.goto(`${base}#/problems`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="level-chip"]');
  /*
    AnimatePresence は退場中の行を DOM に残す（消える行の席を先に空けるため）。
    その場で数えると消える前の数を拾い、逆に「変わらなくなるまで待つ」だけだと
    退場が始まる前の静止を掴んでしまう。期待値に届くまで待ち、届いた数を返す。
  */
  const countOf = (selector) => page.locator(selector).count();
  const waitCount = async (selector, want) => {
    await page
      .waitForFunction(
        ([sel, n]) => document.querySelectorAll(sel).length === n,
        [selector, want],
        { timeout: 4000 },
      )
      .catch(() => {});
    return countOf(selector);
  };
  const ROW = 'ul li a[href*="/problems/"]';
  const levelChip = (n) => page.locator('[data-testid="level-chip"]').nth(n - 1);
  const expected1 = ALL_PROBLEMS.filter((p) => p.level === 1).length;
  const expected13 = ALL_PROBLEMS.filter((p) => p.level === 1 || p.level === 3).length;
  await levelChip(1).click();
  const onlyLv1 = await waitCount(ROW, expected1);
  await levelChip(3).click();
  const lv1and3 = await waitCount(ROW, expected13);
  check(
    'レベルを 2 つ同時に選べる（Lv1 と Lv3）',
    onlyLv1 === expected1 && lv1and3 === expected13,
    `Lv1 ${onlyLv1}/${expected1} → Lv1+Lv3 ${lv1and3}/${expected13}`,
  );

  // 選んだ条件は URL に載る（この状態を貼って共有できる）
  const shareUrl = page.url();
  check(
    '複数選択が URL に載る',
    shareUrl.includes('level=1%2C3') || shareUrl.includes('level=1,3'),
    shareUrl.split('?')[1] ?? '',
  );

  // 13c. 種類どうしは AND（フェーズ 1 かつ Lv1・Lv3）
  const expectedAnd = ALL_PROBLEMS.filter((p) => p.phase === 1 && p.level !== 2).length;
  await page.locator('[data-testid="phase-chip"]').first().click();
  const andCount = await waitCount(ROW, expectedAnd);
  check('種類どうしは AND で効く', andCount === expectedAnd, `${andCount} / ${expectedAnd} 件`);

  // 13d. 「絞り込み中」から 1 つずつ外せる
  const activeBefore = await countOf('[data-testid="active-chip"]');
  await page.locator('[data-testid="active-chip"]').first().click();
  const activeAfter = await waitCount('[data-testid="active-chip"]', 2);
  check(
    '絞り込み中の札を押すとその条件だけ外れる',
    activeBefore === 3 && activeAfter === 2,
    `${activeBefore} → ${activeAfter} 件`,
  );

  // 13d-2. 記録している「間違えた」から絞り込める
  await page.goto(`${base}#/problems?status=missed`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="status-chip"]');
  await page.waitForTimeout(500);
  const missedRows = await page.locator(ROW).count();
  const missedIds = await page
    .locator(ROW)
    .evaluateAll((els) => els.map((a) => a.getAttribute('href')));
  check(
    '「間違えた」で絞り込める',
    missedRows > 0 &&
      missedRows < ALL_PROBLEMS.length &&
      missedIds.some((h) => h.includes('phase1-lv1-001')),
    `${missedRows} / ${ALL_PROBLEMS.length} 件`,
  );

  // 13e. タグは既定で畳まれていて、開くと問題数の多い順に並ぶ
  await page.goto(`${base}#/problems`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="tag-toggle"]');
  const panelClosed = await page.getByTestId('filter-panel').boundingBox();
  check(
    'タグは畳まれていて、一覧の高さを取らない',
    (await page.locator('[data-testid="tag-chip"]').count()) === 0 && panelClosed.height < 240,
    `絞り込みパネル ${panelClosed.height.toFixed(0)}px`,
  );

  /*
    ハッシュだけの移動では画面が作り直されないので、開閉と検索語が前の手順から
    引き継がれる。畳んでから開き直して、いつも同じ状態から始める。
  */
  const openTags = async () => {
    const toggle = page.getByTestId('tag-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'true') {
      await toggle.click();
      await waitCount('[data-testid="tag-chip"]', 0);
    }
    await toggle.click();
    return waitCount('[data-testid="tag-chip"]', 72);
  };

  const openedTags = await openTags();
  const panelOpen = await page.getByTestId('filter-panel').boundingBox();
  const tagCounts = await page
    .locator('[data-testid="tag-chip"]')
    .evaluateAll((els) => els.map((el) => Number(el.dataset.count)));
  const descending = tagCounts.every((n, i) => i === 0 || tagCounts[i - 1] >= n);
  check(
    'タグが問題数の多い順に並ぶ',
    openedTags === 72 && tagCounts[0] > 1 && descending,
    `${openedTags} 件 ${tagCounts.slice(0, 6).join(' ≥ ')} …`,
  );
  // 開いても中で送る。パネルごと伸びると問題一覧が画面から押し出される
  const box = await page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="tag-chip"]').parentElement;
    return { scroll: scroller.scrollHeight, view: scroller.clientHeight };
  });
  check(
    '開いた一覧は中で送る（パネルが伸び切らない）',
    box.scroll > box.view && panelOpen.height < 420,
    `一覧 ${box.view}px に ${box.scroll}px ぶん・パネル ${panelOpen.height.toFixed(0)}px`,
  );

  // 13f. タグを検索で絞れる
  await page.getByLabel('タグを探す').fill('join');
  await page.waitForTimeout(400);
  const joinTags = await page
    .locator('[data-testid="tag-chip"]')
    .evaluateAll((els) => els.map((el) => el.textContent));
  check(
    'タグを検索で絞り込める',
    joinTags.length > 0 && joinTags.every((t) => t.toLowerCase().includes('join')),
    `72 → ${joinTags.length} 件（${joinTags.join(' ')}）`,
  );

  // 13g. チップの件数は他の条件に追随し、0 件になるものは押せなくなる
  await page.goto(`${base}#/problems?phase=6`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="level-chip"]');
  const levelShown = await page
    .locator('[data-testid="level-chip"]')
    .evaluateAll((els) => els.map((el) => Number(el.dataset.count)));
  const levelReal = [1, 2, 3].map(
    (l) => ALL_PROBLEMS.filter((p) => p.phase === 6 && p.level === l).length,
  );
  check(
    'チップの件数が他の条件に追随する',
    JSON.stringify(levelShown) === JSON.stringify(levelReal),
    `表示 ${levelShown.join('/')} 実データ ${levelReal.join('/')}`,
  );
  // 0 件のチップは押せない（この条件だと大半のタグが 0 件になる）
  await openTags();
  const tagState = await page
    .locator('[data-testid="tag-chip"]')
    .evaluateAll((els) => els.map((el) => ({ n: Number(el.dataset.count), off: el.disabled })));
  check(
    '0 件になるチップは押せない',
    tagState.some((t) => t.n === 0) && tagState.every((t) => t.off === (t.n === 0)),
    `${tagState.filter((t) => t.off).length} / ${tagState.length} 個が無効`,
  );

  // 13h. 畳んでも選んだタグは「絞り込み中」に残る
  await page.locator('[data-testid="tag-chip"]:not([disabled])').first().click();
  await page.waitForTimeout(400);
  await page.getByTestId('tag-toggle').click();
  await waitCount('[data-testid="tag-chip"]', 0);
  const toggleLabel = await page.getByTestId('tag-toggle').innerText();
  check(
    '畳んでも選んだタグを見失わない',
    toggleLabel.includes('1 件を選択中') &&
      (await page.locator('[data-testid="active-chip"]').count()) === 2,
    `つまみ「${toggleLabel.trim()}」`,
  );

  await step('ホームの読み込み', async () => {
    // 13i. ホームでは問題の本文を読まない（一覧に要るのはメタだけ）
    const homeCtx = await browser.newContext();
    const homePage = await homeCtx.newPage();
    const fetched = [];
    homePage.on('response', (r) => fetched.push(r.url()));
    await homePage.goto(base, { waitUntil: 'networkidle' });
    await homePage.waitForSelector('main h1');
    const bodyChunks = fetched.filter((u) => /\/phase\d+-[A-Za-z0-9_-]+\.js/.test(u));
    check(
      'ホームでは問題の本文を読まない',
      bodyChunks.length === 0,
      bodyChunks.length ? bodyChunks.join(' ') : '本文チャンク 0 件',
    );
    await homeCtx.close();
  });
  await step('古いタブの扱い', async () => {
    // 13j. チャンクが取れなくても白い画面にしない（再デプロイ後の古いタブ）
    // Service Worker はキャッシュから返してしまうので、この検査では止める
    //（見たいのは「取りに行って失敗したとき」の振る舞い）
    const staleCtx = await browser.newContext({ serviceWorkers: 'block' });
    const stalePage = await staleCtx.newPage();
    await stalePage.goto(base, { waitUntil: 'networkidle' });
    // 問題一覧のチャンクだけ落とす。古い版のタブで起きることと同じ
    await stalePage.route(/ProblemList-.*\.js/, (route) => route.abort());
    await stalePage.click('header nav a[href$="#/problems"]');
    const caught = await stalePage
      .waitForSelector('[data-testid="error-boundary"]', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    const staleText = caught
      ? await stalePage.locator('[data-testid="error-boundary"]').innerText()
      : '';
    check(
      'チャンクが取れないときに案内を出す（白い画面にしない）',
      caught && staleText.includes('再読み込み'),
      staleText.split('\n')[0],
    );
    // 別の画面へ移れば元に戻る
    await stalePage.click('header nav a[href$="#/learn"]');
    const recovered = await stalePage
      .waitForSelector('main h1:has-text("教材")', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check('別の画面へ移ればエラー表示は消える', recovered);
    await staleCtx.close();
  });
  await step('オフライン', async () => {
    // 13k. 資産を持っておき、通信が無くても開ける
    const swCtx = await browser.newContext();
    const swPage = await swCtx.newPage();
    await swPage.goto(base, { waitUntil: 'networkidle' });
    const swReady = await swPage
      .evaluate(() => navigator.serviceWorker?.ready.then(() => true))
      .catch(() => false);
    // 資産を拾わせてから通信を切る
    await swPage.reload({ waitUntil: 'networkidle' });
    await swCtx.setOffline(true);
    await swPage.reload({ waitUntil: 'load' }).catch(() => {});
    const offlineText = await swPage
      .locator('main')
      .innerText()
      .catch(() => '');
    check(
      '通信が無くても開ける（Service Worker）',
      swReady === true && offlineText.includes('学習の進捗'),
      swReady ? (offlineText ? '本文が出た' : '本文が出ない') : 'SW が起動しない',
    );
    await swCtx.setOffline(false);
    await swCtx.close();
  });
  await step('視差効果を減らす設定', async () => {
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
  });
  await step('狭い画面', async () => {
    // 15. 狭い画面でヘッダが崩れない
    const narrowCtx = await browser.newContext({
      viewport: { width: 390, height: 800 },
      isMobile: true,
      hasTouch: true,
    });
    const narrowPage = await narrowCtx.newPage();
    await narrowPage.goto(`${base}#/problems`, { waitUntil: 'networkidle' });
    await narrowPage.waitForSelector('ul li a[href*="/problems/"]');
    const narrow = await narrowPage.evaluate(() => {
      // whitespace-nowrap なので、入り切らなければ中身がはみ出す
      const items = [...document.querySelectorAll('header nav a')].map((a) => ({
        t: a.textContent.trim(),
        bad:
          a.scrollWidth > a.clientWidth + 1 || a.getBoundingClientRect().right > window.innerWidth,
      }));
      return {
        // 版面が要求より広がっていたら、内容が入り切らず縮小されたということ
        layout: window.innerWidth,
        docW: document.documentElement.scrollWidth,
        broken: items.filter((i) => i.bad).map((i) => i.t),
      };
    });
    check(
      '狭い画面（390px）でナビが折れも切れもしない',
      narrow.broken.length === 0 && narrow.layout === 390,
      `版面 ${narrow.layout}px${narrow.broken.length ? ' / ' + narrow.broken.join(',') : ''}`,
    );
    check(
      '狭い画面で横スクロールが出ない',
      narrow.docW <= narrow.layout,
      `文書 ${narrow.docW}px / 画面 ${narrow.layout}px`,
    );
    // ナビの印は 1 つを使い回して滑る（layoutId）
    await page.goto(`${base}#/learn`, { waitUntil: 'networkidle' });
    // ハッシュだけの移動では画面が作り直されないので、目的の項目が現在地になるまで待つ
    await page.waitForSelector('header nav a[href$="#/learn"][aria-current="page"] span');
    await page.waitForTimeout(700); // 直前の移動で滑っている最中に測らない
    const pillX = () =>
      page
        .locator('header nav a[aria-current="page"] span')
        .first()
        .evaluate((el) => el.getBoundingClientRect().x);
    const pillFrom = await pillX();
    await page.click('header nav a[href$="#/problems"]');
    await page.waitForTimeout(80);
    const pillMid = await pillX();
    await page.waitForTimeout(700);
    const pillTo = await pillX();
    check(
      'ナビの選択の印が滑って移動する',
      pillTo > pillFrom + 20 && pillMid > pillFrom && pillMid < pillTo,
      `${pillFrom.toFixed(0)} → 途中 ${pillMid.toFixed(0)} → ${pillTo.toFixed(0)}`,
    );

    // 狭い画面でタグを開いたとき、説明が縦に割れない
    await narrowPage.getByTestId('tag-toggle').click();
    await narrowPage.waitForSelector('[data-testid="tag-chip"]');
    await narrowPage.waitForTimeout(400);
    const hint = await narrowPage
      .locator('text=問題数の多い順')
      .evaluate((el) => el.getBoundingClientRect().height);
    const narrowDoc = await narrowPage.evaluate(() => document.documentElement.scrollWidth);
    check(
      '狭い画面でタグを開いても説明が 1 行に収まる',
      hint < 24 && narrowDoc <= 390,
      `説明の高さ ${hint.toFixed(0)}px / 文書 ${narrowDoc}px`,
    );
    await narrowCtx.close();
  });

  check(
    'コンソールエラーが無い',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '),
  );
} catch (e) {
  check('例外が発生しなかった', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} / ${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);
