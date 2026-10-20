# site-ops-ai

GA4（Google Analytics 4）と Search Console のデータを収集し、
**サイトのコードと突き合わせて改善を判断する**ための道具立て。

判断そのものは Claude Code のセッションが行う。このリポジトリが提供するのは2つ。

| 提供物 | 中身 |
| --- | --- |
| **収集 CLI** (`src/`) | GA4 / GSC / PSI を叩いてスナップショットを保存し、中立な差分要約を出す |
| **スキル** (`skills/site-ops/`) | 数値の読み方、コードとの突き合わせ方、PR / Issue / 何もしない の判断基準 |

## 設計方針

**閾値で深刻度を判定しない。** 「🔴 高 流入急落 -80%」のようなラベル付けは、母数の小ささや
交絡（表示回数は増えているのにクリックだけ減った等）を隠してしまい、機械的な起票につながる。
CLI は数値を並べるところまでを担い、深刻度と打ち手の判断は、実際のコードを読める AI 側に委ねる。

**各サイトのリポジトリで動かす。** 「/damage-calculator の掲載順位が落ちた」に対する打ち手は、
そのページのコードを見ないと決まらない。同じリポジトリで動かせば、AI は原因を特定でき、
修正を PR にでき、ビルドして結果を検証できる。中央集権のパイプラインではどれもできない。

**「何もしない」を正常な結末として扱う。** 変化がノイズの範囲なら、何もしないのが正しい。

## 全体像

```text
各サイトのリポジトリ/                     このリポジトリ
├── .claude/
│   ├── site-ops.yml    ← サイト固有の設定    site-ops.example.yml
│   └── skills/site-ops/ ← スキル(コピー or プラグイン)  skills/site-ops/
├── .site-ops/
│   └── 2026-08-08.json ← スナップショット(コミットする)
├── scripts/site-ops/   ← 収集 CLI(取り込み)  src/
└── src/ ...            ← 診断対象のコード
                            ↑
               pnpm site-ops collect で収集
```

## セットアップ

### 1. Google サービスアカウント（一度だけ）

GA/GSC には専用コネクタが無いため、公式 API をサービスアカウントで叩く。

1. GCP で**サービスアカウント**を作成し、JSON 鍵を発行
2. **GA4 Data API** と **Search Console API** を有効化
3. サービスアカウントのメールアドレスを付与
   - 各 **GA4 プロパティ** に「閲覧者」
   - 各 **Search Console プロパティ** に「ユーザー（制限付きで可）」

GSC の `gsc_site_url` はプロパティ登録と**完全一致**が必要。ドメインプロパティで登録している
場合は URL ではなく `sc-domain:example.com` 形式で書く。

### 2. 各サイトのリポジトリに設定を置く

`site-ops.example.yml` を `<サイトのリポジトリ>/.claude/site-ops.yml` にコピーして埋める。

```yaml
name: "サイトA"
ga4_property_id: "properties/123456789"
gsc_site_url: "sc-domain:example.com"
context: |
  何のサイトか / 誰が使うか / 何を成果とみなすか
```

`context` は AI の判断材料になる。数値だけでは打ち手が決まらないので、ここを書くかどうかで
提案の質が変わる。

### 3. スナップショットの公開範囲を決める

`.site-ops/<date>.json` には**検索クエリの文字列・ページ別の流入数・掲載順位**が入る。
これをコミットするかどうかは、リポジトリの公開設定で分ける。

| リポジトリ | 方針 |
| --- | --- |
| private | コミットする。履歴がトレンド判断の材料になる |
| **public** | **コミットしない。** `.gitignore` に `.site-ops/` を追加する |

public リポジトリにコミットすると、どんな検索語で流入しているか、各ページに何人来ているかが
そのまま公開される。事業判断の材料を第三者に渡すことになるので、既定では避ける。
公開しても構わないと判断した場合のみコミットする。

public リポジトリでは履歴が残らないため `history` によるトレンド判断ができない。
単週のスナップショットだけで判断することになる点は許容する。

**保持期間。** スナップショットは古くなるほど価値が下がる。判断に使うのは直近8週程度なので、
それを超えたものは削除してよい。長期保存が必要なら GA4 / GSC 側を参照する。

### 4. 収集 CLI を取り込む

`src/` 以下を `<サイトのリポジトリ>/scripts/site-ops/` にコピーし、依存とスクリプトを足す。

```bash
# サイトのリポジトリ直下で(site-ops-ai は取り込むタグを checkout しておく)
mkdir -p scripts/site-ops
cp -r ../site-ops-ai/src/. scripts/site-ops/
pnpm add commander googleapis yaml zod
pnpm add -D tsx
```

```jsonc
// package.json
"scripts": {
  "site-ops": "tsx --env-file-if-exists=.env scripts/site-ops/cli.ts"
}
```

`npx -y github:nisioka/site-ops-ai#v0.2.0` で直接実行する方式はやめた。無人のスケジュール
実行では、取得したコードの実行が「外部コードの実行」として auto mode に拒否され、診断が
走らない。取り込んでおけば、実行されるコードはリポジトリにコミットされたものに限られ、
何が動いたかも履歴から特定できる。

サイト側が zod 4 でもそのまま動く（`z.record` はキーと値の2引数で書いている）。
import の `.js` 拡張子は tsx が `.ts` に解決するので、書き換えなくてよい。

### 5. スキルを配置

プラグインとして入れるか、`skills/site-ops/SKILL.md` を
`<サイトのリポジトリ>/.claude/skills/site-ops/SKILL.md` にコピーする。

### 6. 定期実行

クラウドでのスケジュール実行の手順は [`routine/README.md`](./routine/README.md) を参照。

## CLI

対象サイトのリポジトリ直下で実行する。設定は `.claude/site-ops.yml` を読み、
スナップショットは `.site-ops/<date>.json` に保存される。

```bash
pnpm site-ops collect              # 収集して保存し、要約を出力
pnpm site-ops collect --json       # 要約を JSON で
pnpm site-ops collect --window 28  # 期間長を変える(既定7日)
pnpm site-ops summary              # 保存済みから再出力(取得しない)
pnpm site-ops history              # 数週分の推移(トレンド判断用)
```

`--config <path>` で設定ファイルの場所を変えられる。

### リリース手順

このリポジトリ側で変更を入れたら、タグを打ってから各サイトへ取り込み直す。

```bash
# package.json の version を上げてマージしたあと
git tag v0.3.0 && git push origin v0.3.0
```

各サイトリポジトリで、そのタグの `src/` を `scripts/site-ops/` へコピーし直す
（[セットアップの4](#4-収集-cli-を取り込む)と同じ手順）。コミットメッセージには取り込んだ
タグを書き、どのバージョンが動いているかを履歴から追えるようにする。

### 認証情報

次のどちらかを環境変数で渡す。

| 変数 | 用途 |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 鍵 JSON の**本体**または base64。クラウド実行はこちら |
| `GOOGLE_APPLICATION_CREDENTIALS` | 鍵 JSON の**ファイルパス**。ローカル実行はこちら |
| `PSI_API_KEY` | 任意。設定すると Core Web Vitals も取得する |

## このリポジトリでの開発

```bash
pnpm install
pnpm typecheck
pnpm ops collect --config ./path/to/site-ops.yml   # .env を読んで tsx で直接実行
```

`pnpm ops` は `.env` があれば読み込む（`cp .env.example .env`）。

## 移行メモ

旧構成では `sites/<id>.yml` に全サイトの設定を集約し、閾値検知の結果をそのまま
GitHub Issue に起票していた。現在は各サイトのリポジトリに設定を分散し、起票の判断は
AI が行う。旧 `sites/` の内容は以下の通りなので、各リポジトリの `.claude/site-ops.yml` に移す。

| リポジトリ | ga4_property_id | gsc_site_url |
| --- | --- | --- |
| `nisioka/pokemon-battle-simulator` | `properties/546114476` | `https://p-battle-simulator.vercel.app/` |
| `nisioka/sun0range.com` | `properties/317202891` | `https://sun0range.tech.server-on.net/` |
| `nisioka/www.malpractice-committee.com` | `properties/546120577` | `https://www.malpractice-committee.tech.server-on.net/` |
