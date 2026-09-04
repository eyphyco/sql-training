# SQL Training

**公開URL: https://eyphyco.github.io/sql-training/**

集計・ウィンドウ関数・結合・実行計画・DB設計を、**問題を解く → 自動採点 → 解説を読む** の流れで学ぶ個人用ハンズオンアプリ。

SQL の実行はすべてブラウザ内の **DuckDB-WASM** で完結する。サーバも認証も不要で、GitHub Pages などの静的ホスティングにそのまま置ける。

## クイックスタート

```bash
npm install
npm run dev        # http://localhost:5173
```

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ |
| `npm run build` | 型チェック + 本番ビルド（`dist/`） |
| `npm run preview` | ビルド結果をローカル配信（既定 4173 番） |
| `npm run validate` | **問題データの検証**。全問の `schema_sql` / `seed_data_sql` / `expected_query` を Node の DuckDB で実際に実行し、必須項目・ID 重複・採点条件の整合性まで確認する |
| `npm run show -- <問題ID>` | その問題の模範解答を実行して結果を表示（作問時の確認用） |
| `npm run smoke` | Playwright によるブラウザ疎通確認（先に `npm run preview` が必要） |
| `npm run lint` | oxlint |

## 収録している問題

全 52 問。フェーズごとに Lv1（易）〜 Lv3（難）を用意している。

| # | フェーズ | 問題数 | 主なテーマ |
|---|---|---|---|
| 1 | 集計の基礎 | 8 | `GROUP BY` / `HAVING` / 条件付き集計 / `ROLLUP` |
| 2 | ウィンドウ関数 | 8 | `RANK` 系の違い / 累積和 / `LAG` / フレーム指定 / `LAST_VALUE` の罠 |
| 3 | 結合の基礎〜応用 | 8 | 外部結合の `ON` と `WHERE` / 自己結合 / ファンアウト / `FULL OUTER` / 非等値結合 |
| 4 | 実行計画とインデックス | 7 | `EXPLAIN` の読み方 / sargable / 複合索引 / 結合アルゴリズム / 直積の発見 |
| 5 | サブクエリの最適化 | 6 | `EXISTS` / `NOT IN` の NULL 破壊 / 相関サブクエリの書き換え / 関係除算 |
| 6 | DB設計・正規化 | 9 | 1NF〜BCNF / 候補キー / 連関エンティティ / 索引設計 |
| 7 | 応用・総合問題 | 6 | 前年同月比 / 粗利と構成比 / 優良顧客抽出 / リピート分析 / 設計論述 |

問題形式は 3 種類。

- **`sql_query`**（37 問）… SQL を書いて実行、結果セットで自動採点
- **`multiple_choice`**（11 問）… 選択式。正誤を即判定
- **`written`**（4 問）… 記述式。模範解答と採点観点を表示して自己採点

## 教材

問題を解く前に読む教科書を `/learn` に置いている。**フェーズ = 章**で、章は節に分かれる（7 章 / 32 節）。

- **`/learn`** … 章の目次
- **`/learn/:phaseId`** … 章を通して読む。節ごとに、その節で解く問題への導線が付く
- **問題ページの先頭** … その問題に対応する節だけを表示する。`たたむ` で隠せる

隠した状態は端末に残る（`localStorage` の `sql-training:lesson-open`）。一度たたむと以降の問題でもたたまれたままなので、「もう読んだ」人の邪魔にならない。

### 問題との対応

対応表は**教材側の `sections[].problems` だけ**が持つ。問題データ側には教材への参照を書かない（1 か所で完結させ、二重管理を避けるため）。問題ページは実行時にこれを反転させて逆引きしている。

`npm run validate` が次を検査する。

- 節が参照する問題 ID が実在すること
- **全問がどこかの節から参照されていること**（教材の無い問題を作れない）
- 節 ID が重複しないこと、ファイル名と `phase` が一致すること

### 教材を書き足す

[src/data/lessons/phase*.json](src/data/lessons) を編集する。1 節はこの形。

```json
{
  "id": "p1-eval-order",
  "title": "SQL が評価される順序",
  "body_md": "Markdown。表・コードブロックが使える",
  "problems": ["phase1-lv1-001", "phase1-lv1-003"]
}
```

## 表示

ヘッダー右のセグメンテッドコントロールで **ライト / ダーク / システム設定に従う** を切り替えられる（既定はシステム追従）。選択はブラウザに保存され、`system` のときは OS 側の変更にその場で追従する。描画前に配色を確定させているので、リロード時に白く光ることはない。

配色は [src/index.css](src/index.css) の CSS 変数 1 か所で定義している。`--c-canvas` / `--c-surface` / `--c-line` / `--c-fg` のような役割ベースのトークンを `@theme inline` で Tailwind ユーティリティ（`bg-surface`、`text-muted` など）に流し込む構成なので、**色を変えたいときは変数の値だけを書き換えればよい**。エディタのシンタックスハイライトも同じ変数を参照しており、テーマ切り替えに自動で追従する。

ライト/ダークの値は `light-dark()` で 1 つのトークンにまとめてあり、切り替えは `:root` の `color-scheme` を差し替えるだけ。同じ値を 2 か所に書かないので、片方だけ更新して色がずれる事故が起きない。

### 幅の使い分け

器は `max-w-page`（1600px）で、ヘッダーと本文で同じものを使い左端を揃えている。そのうえで**読む物と作る物で幅を変えている**。

- **読む物**（見出し・問題文・解答解説）は `max-w-prose-wide`（62rem）で止める。日本語は 1 行が長いと極端に読みにくいため。さらに `.md` の本文要素に `max-width: 54em` をかけている（コードブロックと表は対象外。横幅を使わせたい）
- **作る物**（SQL エディタと実行結果）は器いっぱいに広げる

左端は揃ったまま問題文だけ手前で終わる形になる。エディタと結果の高さは `clamp(460px, calc(100vh - 34rem), 820px)` で画面の高さに追従し、1080p なら ANSWER までスクロールなしで収まる。

### 問題ページの進捗サイドバー

問題ページの右に、7 フェーズを畳める目次を置いている。フェーズを開くとその中の問題が並び、クリックで移動できる。正解済みはチェック、いま解いている問題は帯で示す。

**作業領域の幅は減らしていない。** 問題文は `max-w-prose-wide`（62rem）で止めているので、器（1600px）との差が余白として空いていた。サイドバーはそこに入れてあり、SQL エディタと実行結果は今までどおり全幅のまま下に置く。

```
┌──────────────────────────────┬─────────────┐
│ 見出し・教材・問題文（62rem） │ サイドバー  │
├──────────────────────────────┴─────────────┤
│ SQL エディタ          │ 実行結果            │  ← 全幅のまま
└────────────────────────────────────────────┘
```

現在地の帯は `layoutId` で 1 つの要素を使い回しているので、問題を移動すると**滑って移動する**。これを成立させるため、画面遷移の `key` をパス全体から**先頭の区画**（`problems` / `learn` / `settings`）に変えた。同じ区画の中を移動するときは作り直さないので、サイドバーが生き残って位置を繋げられる。区画をまたぐときは今までどおりフェードする。

開いているフェーズは現在の問題に追従する。追従は effect ではなく**描画中の状態調整**で行っている（effect で `setState` すると 1 フレーム余分に描画される）。

### 教材ページの進捗表示

`/learn` と `/learn/:phaseId` の両方に **1 本の帯**を置いている。フェーズごとに区切り、**区切りの幅を問題数に比例**させてあるので、バーの長さがそのままフェーズの重さになる。全体の到達度と「どのフェーズが手つかずか」を同時に見せるのが狙い。

- 埋まり方は `scaleX` で伸ばす。transform なので「視差効果を減らす」設定では即座に確定する
- 正解数は 0 から数え上げる（同設定では数え上げない）
- 章ページでは、その章の区切りを強調して「全体の中のどこか」を示す
- 章は長いので、ヘッダー下に **読み進み線**（`useScroll` + `useSpring`）を出す。スクロール量に直結した動きなので、視差効果の設定では止めない

`npm run smoke` で「バーの表示が `localStorage` の正解数と一致すること」と「読み進み線がスクロールで伸びること」を検査している。

### 動き（Motion）

[Motion](https://motion.dev/) を使っている。**動かすのは 3 つの目的があるときだけ**にした。

| 目的 | どこ | 仕組み |
| --- | --- | --- |
| 位置が入れ替わったことを見せる | テーマのつまみ、ナビとタブの下線 | `layoutId` で 1 つの要素を繋いで滑らせる |
| 現れた・消えたことを見せる | 教材の開閉、採点結果、ヒント、解答解説 | `AnimatePresence` と高さ / 不透明度 |
| 切り替わりの断絶を和らげる | 画面遷移 | 不透明度のみ 150ms |

時間・イージング・移動量は [src/components/motion.ts](src/components/motion.ts) に集約している（配色を `index.css` に集めたのと同じ理由）。移動量は 4〜8px に抑え、入りは 220ms 以内。位置が入れ替わるものだけバネにし、跳ね返らない値（`damping: 44`）にしている。

**動かしていないもの**も意識的に決めた。実行結果の表の行、問題一覧の行、ホームのカードは動かさない。読みたいものが出るまでの時間が延びるだけで、情報は増えないため。

`MotionConfig reducedMotion="user"` を入れてあるので、OS の「視差効果を減らす」設定では移動が止まり即座に反映される。`npm run smoke` で「つまみが途中位置を通ること」と「設定を有効にすると即座に終わること」の両方を検査している。

バンドルは gzip で約 398 kB → 454 kB（+56 kB）。`LazyMotion` も試したが、`layoutId` を使う以上 `domMax` が要るため削減にならなかったので、素の `motion` を使っている。

### ガラス（半透明の面）

面は canvas 以外すべて半透明で、背後をぼかして色を拾う。下地には視界に固定した淡い光（`body` の `radial-gradient`）を敷いていて、これがぼけて面に映り込む。

| クラス | 用途 |
| --- | --- |
| `.glass` | カード。ぼかし + 上辺のハイライト + 影 |
| `.glass-chrome` | 固定ヘッダ。内容が透けすぎないよう不透明度を上げる |
| `.glass-sticky` | スクロールする内容の上に留まる帯（表の見出し） |
| `.glass-pop` | 補完候補などの浮きもの |
| `.glass-edge` | 小さな操作子。ぼかしは親に任せ、縁の光だけ足す |

実装上の注意が 2 つある。

- **`-webkit-backdrop-filter` を同じルールに並べて書かない。** ビルド時のミニファイが重複プロパティを 1 つに畳み、標準プロパティのほうが消える（= Firefox でぼけなくなる）。古い Safari 向けの前置きは `@supports` の別ルールに置いている。`npm run smoke` に「カードの背後がぼける」検査を入れてあるので、これが再発すると落ちる。
- **`prefers-reduced-transparency: reduce`** のときは半透明とぼかしをやめ、不透明な面に落とす。

## 演習画面の使い方

- **左ペイン**: SQL エディタ（CodeMirror。テーブル名・列名の補完が効く）
  - `実行` / `F5` / `Ctrl+Enter` … クエリを実行して右ペインを更新する。
    `F5` は SSMS や DBeaver と同じ「実行」に割り当ててあり、SQL 問題を開いている間だけブラウザのリロードを抑止する。
    ページを再読み込みしたいときは `Ctrl+R`（横取りしていない）を使う。
    どちらも `window` の **capture フェーズ**で受けて `stopPropagation()` している。
    bubble で受けると `Ctrl+Enter` が CodeMirror の `Mod-Enter`（`insertBlankLine`）と二重に動き、
    実行と同時に空行が入ってしまうため
  - `EXPLAIN` … いまエディタにある SQL の実行計画を表示する
  - キー操作: `Tab` / `Enter` で補完を確定、`↑` `↓` で候補を選択、`Esc` で候補を閉じる、`Ctrl+Space` で候補を再表示。
    **候補が出ていないときの `Tab` は通常どおりインデント**（補完の確定を `indentWithTab` より高い優先度に置き、候補が無ければインデントへ処理を落としている）
- **右ペイン**: `実行結果` / `スキーマ`（列定義と行数） / `実行計画` の 3 タブ
- **`ANSWER`** … **直近の実行結果**を使って採点する

「試しに実行して確かめる」と「これで提出する」を分けてあるので、実行せずに ANSWER を押したり、実行後にエディタを書き換えたまま提出した場合は警告が出る。

### リロードで作業が消えないようにしている

書きかけの SQL と直近の実行結果は、問題ごとに `sessionStorage`（`sql-training:workbench:v1:<問題ID>`）へ保存していて、リロード後に復元する。タブを閉じると消えるので、進捗（`localStorage`）とは別扱い。

DuckDB は WASM なのでページのリロードで必ず作り直される。これは避けられないため、**リロードされても画面の状態は戻る**という形で影響を消している。`F5` を横取りしたのにリロードが起きたブラウザでは、その旨と `Ctrl+Enter` を使うよう案内を出す。

### 採点のしくみ

1. 模範解答（`expected_query`）を**作り直した環境**で実行し、期待する結果セットを得る
2. 直近の実行結果と**多重集合として比較**する
   - 列名の違いは許容（別解を通すため）。列の**数と並び順**は一致が必要
   - `order_sensitive: false` ならソートしてから比較、`true` なら並び順も採点
   - 浮動小数は小数第 6 位に丸めて比較
   - 不一致のときは「足りない行」「余分な行」を並べて表示する
3. 問題に書き方の条件（例: ウィンドウ関数を使う、`NOT IN` 禁止、実行計画に `HASH_JOIN` が出ること）があれば、SQL 本文と `EXPLAIN` 出力を正規表現で追加検査する
4. 実行時エラーには、`GROUP BY` 漏れなど**よくあるミスの日本語解説**を添える

## 問題データの追加・編集

問題は**フェーズ単位の JSON 配列**で管理する（`src/data/problems/phase1.json` 〜 `phase7.json`）。
1 問 1 ファイルにするとファイル数が膨らみ編集しづらいため配列方式を採った。ファイルを増やせば `import.meta.glob` が自動で拾う。

型定義は [src/types.ts](src/types.ts) が正。最小構成は次のとおり。

```jsonc
{
  "id": "phase1-lv1-001",        // 接頭辞の phase 番号と phase フィールドは一致させる
  "type": "sql_query",
  "phase": 1,
  "level": 1,
  "title": "…",
  "prompt_md": "問題文（Markdown）",
  "schema_sql": "CREATE TABLE …;",
  "seed_data_sql": "INSERT INTO …;",
  "expected_query": "模範解答。期待値の生成と解答後の表示に使う",
  "judge": {
    "type": "result_set",
    "order_sensitive": false,
    "compare_columns": null,     // 列名を指定して比較したいときだけ配列で指定
    "sql_required": ["OVER\\s*\\("],        // 任意: SQL 本文への正規表現
    "sql_forbidden": ["NOT\\s+IN"],         // 任意
    "explain_required": ["HASH_JOIN"],      // 任意: EXPLAIN 出力への正規表現
    "explain_forbidden": ["CROSS_PRODUCT"], // 任意
    "pattern_hint": "違反時に表示する補足"
  },
  "starter_sql": "エディタの初期値（任意）。直すべき悪いクエリを置くのに使う",
  "hints_md": ["段階的に開示されるヒント"],
  "explanation_md": "解説（Markdown）",
  "alternative_md": "別解の紹介（任意）",
  "tags": ["having", "group by"]
}
```

追加したら必ず検証する。

```bash
npm run validate                      # 全問の SQL を実行して確認
npm run show -- phase1-lv1-001        # 模範解答の結果を目視確認
```

`validate` は「模範解答自身が `sql_required` / `explain_required` を満たすか」まで検査するので、**採点条件の書き間違いをその場で検出できる**。

## 進捗データ

`localStorage`（キー: `sql-training:progress:v1`）に保存する。

```jsonc
{
  "version": 1,
  "solvedProblems": {
    "phase1-lv1-001": { "solved": true, "attempts": 2, "lastSolvedAt": "2026-09-03" }
  },
  "history": [ { "problemId": "…", "at": "…", "correct": true } ]
}
```

`進捗データ` 画面から JSON のエクスポート／インポートができる。ブラウザのデータを消す前にダウンロードしておけば復元できる。
フェーズ別の集計はエクスポート時に計算して同梱する。

## デプロイ（GitHub Pages）

`.github/workflows/deploy.yml` により、`main` へ push すると自動でビルド・デプロイされる（Pages のソースは GitHub Actions に設定済み）。公開先は https://eyphyco.github.io/sql-training/ 。

- `vite.config.ts` の `base` は `'./'`（相対）なので、リポジトリ名を設定に埋め込まなくてもプロジェクトページで動く
- ルーティングは `HashRouter` を使っているため、リロード時の 404 対策（`404.html` など）は不要
- ワークフローはデプロイ前に `npm run validate` を走らせるので、**SQL が壊れた問題データは公開されない**

Vercel などにも `dist/` をそのまま置ける。

### ビルド成果物のサイズ

DuckDB の WebAssembly バイナリを 2 つ同梱するため `dist/` は約 80MB になる（配信時は gzip で 8〜9MB）。
`mvp` 版は WebAssembly の例外機能に対応しない古いブラウザ向けのフォールバックなので、モダンブラウザのみを対象にするなら [src/engine/duckdb.ts](src/engine/duckdb.ts) の `BUNDLES` から `mvp` を外してサイズを半減できる。

## 設計メモ

```
src/
├── components/   QueryEditor / ResultTable / SchemaPanel / SqlWorkbench / ChoiceQuestion / WrittenQuestion
│                 ui.tsx（Button・Card・Meter・Tag）、icons.tsx、editorTheme.ts
├── theme/        ライト/ダーク切り替え（ThemeProvider / themeContext / theme.ts）
├── data/         problems/*.json（問題データ）、phases.ts（カリキュラム定義）、problems.ts（ローダ）
├── engine/       duckdb.ts（初期化・実行・EXPLAIN）、judge.ts（採点・エラー解説）
├── storage/      progress.ts（localStorage）、progressContext.ts / ProgressProvider.tsx
├── pages/        Home / ProblemList / ProblemDetail / Settings
└── types.ts      問題データと進捗の型定義
```

- **DuckDB インスタンスはアプリ全体で 1 つ**を使い回し、問題を開くたびに既存のテーブル・ビュー・シーケンスをすべて削除してから `schema_sql` / `seed_data_sql` を流し直す
- 採点時は環境を作り直してから模範解答を実行するので、ユーザーのクエリがデータを書き換えていても正しく判定できる
- 問題データはビルド時に全件バンドルする（52 問で JS 約 1.3MB / gzip 約 390KB）。数百問規模になったらフェーズ単位の遅延ロードに切り替える

### DuckDB を使ううえでの注意（フェーズ4関連）

DuckDB は**列指向の分析用エンジン**で、行指向 DBMS のような索引探索（`INDEX_SCAN`）をほとんど使わない。`CREATE INDEX` を張って主キーの等値検索をしても、実行計画は `SEQ_SCAN` + ゾーンマップによるブロック読み飛ばしになる。

そのためフェーズ 4 では、

- **DuckDB の実行計画で実際に観測できること**（結合アルゴリズムの違い、述語プッシュダウン、直積の検出）は `sql_query` 問題として自動採点する
- **行指向 DBMS と情報処理技術者試験で問われる索引理論**（sargable、左端プレフィックス、選択率と駆動表）は `multiple_choice` 問題として扱う

という切り分けにしてある。解説中でもこの違いを明示している。

## 技術スタック

React 19 / TypeScript / Vite 8 / Tailwind CSS 4 / React Router（HashRouter） / CodeMirror 6 / `@duckdb/duckdb-wasm` / react-markdown。
開発用に `@duckdb/node-api`（問題データ検証）と Playwright（疎通確認）を使う。
