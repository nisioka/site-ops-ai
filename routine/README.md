# ルーティン（定期実行）の登録

このツールを週次で自動実行し、AI が修正提案を投下する運用の作り方。

## 仕組み

Claude のルーティン（scheduled trigger）を **「毎回まっさらなセッションを起動」** モードで登録し、
起動時プロンプトで `prompts/analysis-prompt.md` の手順を実行させる。1本のルーティンで全サイトを回せる。

## 前提（環境に用意しておくもの）

ルーティンが起動するセッションの実行環境に、以下を Secret / 環境変数で注入しておく:

| 変数 | 用途 |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | サービスアカウント鍵 JSON のパス |
| `GITHUB_TOKEN` | Issue 起票用（repo scope）。出力先が github_issue の場合 |
| `PSI_API_KEY` | 任意。Core Web Vitals を取得する場合 |

## 登録プロンプト（例）

ルーティンの発火プロンプトにこれを入れる:

```
site-ops-ai の週次サイト診断を実行してください。
1. `pnpm --dir site-ops-ai install` で依存を用意（初回のみ）
2. site-ops-ai/prompts/analysis-prompt.md の手順に厳密に従う
3. 各サイトの検知シグナルを実データ引用付きで分析し、優先度付き修正提案を出力先へ投下
数値は必ずスナップショットから引用し、推測で埋めないこと。
```

## cron の目安

- 週次: 毎週月曜 09:00（GSC のデータ反映遅延 2〜3日を吸収できる）
  - JST 09:00 は UTC 00:00 → `0 0 * * 1`
- 実行環境のタイムゾーンが UTC なら上記。JST 固定なら `0 9 * * 1`。

## 登録方法の選択肢

- **Claude Code のルーティン機能**（`create_trigger`）で、`create_new_session_on_fire: true` + 上記 cron + プロンプトを登録。
- あるいは **GitHub Actions**（`schedule:` の cron）で `pnpm ops:run` を回し、Issue 起票だけ行う構成でも良い
  （AI 分析を挟まないルールベース運用。まず数値レポートだけ欲しい場合に軽い）。

## 段階導入のおすすめ

1. まず手動で `pnpm ops:collect && pnpm ops:report` を実行し、検知内容の粒度・閾値を調整。
2. 次に `pnpm ops:run --dry-run` で出力イメージを確認。
3. 問題なければルーティン登録で無人化。
