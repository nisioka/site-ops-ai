# site-ops-ai

GA4（Google Analytics 4）と Search Console のデータを定期収集し、
**問題・改善余地を検知 → AI が優先度付き修正提案を投下**する運用ツール。
サイト設定ファイルを増やすだけで **複数サイトを汎用的に** 回せる。

> **配置について**: 本ディレクトリは `pokemon-battle-simulator` リポジトリ内に置かれているが、
> `package.json` を持つ完全自己完結構成。専用リポジトリ（例: `nisioka/site-ops-ai`）へ
> そのままコピー / `git subtree split` で切り出して独立運用できる。

## できること

- GA4 Data API + Search Console API から週次データを収集（前期間比つき）
- 閾値ベースで異常を検知
  - 流入（セッション）急落 / 検索クリック急落
  - ページ単位の掲載順位悪化
  - 高表示・低CTR クエリ（タイトル・メタ改善の候補）
  - Core Web Vitals 未達（任意 / PageSpeed Insights）
- 検知結果を Markdown レポート化、または各サイトの GitHub Issue として起票
- ルーティンで無人週次運用（`prompts/analysis-prompt.md` に沿って AI が提案を作成）

## セットアップ

### 1. 依存インストール

```bash
pnpm install
```

### 2. Google サービスアカウントの用意（ここだけ手作業が必要）

GA/GSC には専用コネクタが無いため、公式 API をサービスアカウントで叩く。

1. GCP で **サービスアカウント**を作成し、JSON 鍵を発行
2. **GA4 Data API** と **Search Console API** を有効化
3. サービスアカウントのメールアドレスを付与:
   - 各 **GA4 プロパティ** に「閲覧者」ロール
   - 各 **Search Console プロパティ** に「ユーザー」を追加（制限付きで可）
4. 鍵 JSON をこのディレクトリに置く（`.gitignore` 済み。**コミット厳禁**）

```bash
cp .env.example .env
# .env の GOOGLE_APPLICATION_CREDENTIALS に鍵JSONのパスを設定
```

### 3. サイトを登録

```bash
cp sites/_example.yml sites/site-a.yml
# ga4_property_id / gsc_site_url / output.repo などを埋める
```

3サイト目以降は `sites/site-b.yml`, `sites/site-c.yml` を足すだけ。

## 使い方

```bash
pnpm ops:sites                     # 登録済みサイト一覧
pnpm ops:collect                   # 全サイトのスナップショットを取得・保存
pnpm ops:collect --site site-a     # 特定サイトのみ
pnpm ops:report --site site-a      # 最新スナップショットから検知レポートを表示
pnpm ops:run --site site-a --dry-run   # collect→検知→出力 の全工程を確認(送信しない)
pnpm ops:run                       # 本番: 出力先(Issue/Markdown)へ投下
```

データは `.data/<site>/<date>.json` に蓄積され、前回比較の材料になる。

## ルーティン（定期実行）

週次自動運用の登録手順は [`routine/README.md`](./routine/README.md) を参照。

## 構成

```
site-ops-ai/
├── sites/                # サイト設定(1サイト=1 yml)。これを増やすだけで汎用化
│   └── _example.yml
├── prompts/
│   └── analysis-prompt.md  # ルーティンで AI が従う分析手順
├── routine/
│   └── README.md           # 定期実行の登録方法
├── src/
│   ├── cli.ts              # ops CLI エントリ (sites/collect/report/run)
│   ├── config.ts           # サイト設定ローダ(yaml + zod 検証)
│   ├── types.ts            # 設定/スナップショット/シグナルのスキーマ
│   ├── dates.ts            # 期間計算(GSC遅延対策つき)
│   ├── collect.ts          # 収集オーケストレーション + スナップショット永続化
│   ├── diff.ts             # 閾値ベースの異常検知(シグナル生成)
│   ├── report.ts           # Markdown レポート生成
│   ├── google/
│   │   ├── auth.ts         # サービスアカウント認証
│   │   ├── ga4.ts          # GA4 Data API
│   │   ├── gsc.ts          # Search Console API
│   │   └── psi.ts          # PageSpeed Insights(CWV, 任意)
│   └── output/
│       └── github-issue.ts # GitHub Issue 起票
└── .data/                  # スナップショット/レポート(gitignore)
```

## 設計方針

- **収集は決定的（コード）／提案は AI**。数値の取得・異常検知はコードで再現可能にし、
  「原因仮説と修正提案」という判断部分だけ AI に委ねる。AI は必ず収集データを根拠に引用する
  （プロンプトでハルシネーションを禁止）。
- **サイト差分は設定ファイルに閉じる**。ロジックは1本で、`sites/*.yml` を足すだけで横展開できる。
