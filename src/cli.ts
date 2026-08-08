#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { loadSiteConfig, CONFIG_PATH, SNAPSHOT_DIR } from "./config.js";
import { collectSite, loadSnapshots } from "./collect.js";
import { buildSummary, renderSummary } from "./summary.js";
import type { Snapshot } from "./types.js";

const program = new Command();
program
  .name("site-ops")
  .description(
    "GA4 + Search Console のデータを収集し、AI が判断するための材料を出す。\n" +
      `対象サイトのリポジトリ直下で実行し、設定は ${CONFIG_PATH} を読む。`,
  );

interface OutputOpts {
  config?: string;
  out?: string;
  json?: boolean;
}

/** 要約を標準出力またはファイルへ書き出す */
function emit(snap: Snapshot, opts: OutputOpts, context?: string): void {
  const summary = buildSummary(snap);
  const body = opts.json
    ? JSON.stringify(summary, null, 2)
    : renderSummary(summary, context);

  if (opts.out) {
    writeFileSync(opts.out, body, "utf8");
    console.log(`書き出しました: ${opts.out}`);
  } else {
    console.log(body);
  }
}

program
  .command("collect")
  .description(`GA4/GSC から収集し ${SNAPSHOT_DIR}/<date>.json に保存、要約を出力`)
  .option("--config <path>", `サイト設定のパス(既定: ${CONFIG_PATH})`)
  .option("--window <days>", "期間長(日)", "7")
  .option("--out <path>", "要約の出力先ファイル(省略時は標準出力)")
  .option("--json", "要約を JSON で出力")
  .action(async (opts: OutputOpts & { window: string }) => {
    const config = loadSiteConfig(opts.config);
    const windowDays = Number(opts.window);
    if (!Number.isFinite(windowDays) || windowDays < 1) {
      throw new Error(`--window は 1 以上の数値で指定してください: ${opts.window}`);
    }
    const snap = await collectSite(config, windowDays);
    console.error(
      `収集完了: ${snap.period.start}〜${snap.period.end} → ${SNAPSHOT_DIR}/${snap.collectedAt.slice(0, 10)}.json`,
    );
    emit(snap, opts, config.context);
  });

program
  .command("summary")
  .description("保存済みの最新スナップショットから要約を出力(取得はしない)")
  .option("--config <path>", `サイト設定のパス(既定: ${CONFIG_PATH})`)
  .option("--out <path>", "出力先ファイル(省略時は標準出力)")
  .option("--json", "JSON で出力")
  .action((opts: OutputOpts) => {
    const [snap] = loadSnapshots(1);
    if (!snap) {
      throw new Error(
        `${SNAPSHOT_DIR}/ にスナップショットがありません。先に collect を実行してください。`,
      );
    }
    let context: string | undefined;
    try {
      context = loadSiteConfig(opts.config).context;
    } catch {
      // 設定が無くてもスナップショット単体で要約は出せる
    }
    emit(snap, opts, context);
  });

program
  .command("history")
  .description("保存済みスナップショットの推移を出力(トレンド判断用)")
  .option("--limit <n>", "読み込む件数", "8")
  .action((opts: { limit: string }) => {
    const snaps = loadSnapshots(Number(opts.limit) || 8).reverse();
    if (snaps.length === 0) {
      throw new Error(`${SNAPSHOT_DIR}/ にスナップショットがありません。`);
    }
    console.log("| 期間 | セッション | クリック | 表示 | CTR% | 平均掲載順位 |");
    console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const s of snaps) {
      const ctr = Math.round(s.gsc.totals.ctr * 10000) / 100;
      const pos = Math.round(s.gsc.totals.position * 10) / 10;
      console.log(
        `| ${s.period.start}〜${s.period.end} | ${s.ga4.totals.sessions ?? 0} | ` +
          `${s.gsc.totals.clicks} | ${s.gsc.totals.impressions} | ${ctr} | ${pos} |`,
      );
    }
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
