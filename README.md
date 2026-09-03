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

## 表示

ヘッダー右のセグメンテッドコントロールで **ライト / ダーク / システム設定に従う** を切り替えられる（既定はシステム追従）。選択はブラウザに保存され、`system` のときは OS 側の変更にその場で追従する。描画前に配色を確定させているので、リロード時に白く光ることはない。

配色は [src/index.css](src/index.css) の CSS 変数 1 か所で定義している。`--c-canvas` / `--c-surface` / `--c-line` / `--c-fg` のような役割ベースのトークンを `@theme inline` で Tailwind ユーティリティ（`bg-surface`、`text-muted` など）に流し込む構成なので、**色を変えたいときは変数の値だけを書き換えればよい**。エディタのシンタックスハイライトも同じ変数を参照しており、テーマ切り替えに自動で追従する。

ライト/ダークの値は `light-dark()` で 1 つのトークンにまとめてあり、切り替えは `:root` の `color-scheme` を差し替えるだけ。同じ値を 2 か所に書かないので、片方だけ更新して色がずれる事故が起きない。

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
