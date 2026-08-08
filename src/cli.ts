#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { loadAllSites, loadSite, type LoadedSite } from "./config.js";
import { collectSite, loadLatestSnapshot } from "./collect.js";
import { detectSignals } from "./diff.js";
import { renderReport } from "./report.js";
import { createGithubIssue } from "./output/github-issue.js";

const program = new Command();
program
  .name("ops")
  .description("GA4 + Search Console からサイトの問題を検知し、修正提案の土台を作る運用CLI");

/** --site 指定があれば1件、無ければ全サイト */
function resolveSites(siteId?: string): LoadedSite[] {
  return siteId ? [loadSite(siteId)] : loadAllSites();
}

program
  .command("sites")
  .description("設定済みサイト一覧を表示")
  .action(() => {
    const sites = loadAllSites();
    if (sites.length === 0) {
      console.log("サイト未登録です。sites/<id>.yml を作成してください(_example.yml 参照)。");
      return;
    }
    for (const s of sites) {
      console.log(`- ${s.id}: ${s.config.name} [GA4 ${s.config.ga4_property_id} / GSC ${s.config.gsc_site_url}] → ${s.config.output.type}`);
    }
  });

program
  .command("collect")
  .description("GA4/GSC からスナップショットを取得・保存")
  .option("--site <id>", "対象サイトID(省略時は全サイト)")
  .option("--window <days>", "期間長(日)", "7")
  .action(async (opts: { site?: string; window: string }) => {
    const sites = resolveSites(opts.site);
    for (const site of sites) {
      const snap = await collectSite(site, Number(opts.window));
      console.log(`[${site.id}] 収集完了: ${snap.period.start}〜${snap.period.end} (sessions=${snap.ga4.totals.sessions ?? 0}, clicks=${snap.gsc.totals.clicks})`);
    }
  });

program
  .command("report")
  .description("最新スナップショットから Markdown レポートを生成(取得はしない)")
  .option("--site <id>", "対象サイトID(省略時は全サイト)")
  .option("--out <path>", "出力ファイルパス(省略時は標準出力)")
  .action((opts: { site?: string; out?: string }) => {
    const sites = resolveSites(opts.site);
    const chunks: string[] = [];
    for (const site of sites) {
      const snap = loadLatestSnapshot(site.id);
      if (!snap) {
        console.error(`[${site.id}] スナップショットがありません。先に collect してください。`);
        continue;
      }
      const signals = detectSignals(snap, site.config);
      chunks.push(renderReport(site.config, snap, signals));
    }
    const md = chunks.join("\n\n---\n\n");
    if (opts.out) {
      writeFileSync(opts.out, md, "utf8");
      console.log(`レポートを書き出しました: ${opts.out}`);
    } else {
      console.log(md);
    }
  });

program
  .command("run")
  .description("collect → 検知 → レポート → 出力(Issue/Markdown) を一括実行。ルーティン用")
  .option("--site <id>", "対象サイトID(省略時は全サイト)")
  .option("--window <days>", "期間長(日)", "7")
  .option("--dry-run", "出力先へ送らず結果を標準出力に表示")
  .action(async (opts: { site?: string; window: string; dryRun?: boolean }) => {
    const sites = resolveSites(opts.site);
    for (const site of sites) {
      const snap = await collectSite(site, Number(opts.window));
      const signals = detectSignals(snap, site.config);
      const md = renderReport(site.config, snap, signals);
      const title = `[${site.config.name}] 週次サイト診断 ${snap.period.start}〜${snap.period.end}（検知 ${signals.length}件）`;

      if (opts.dryRun || site.config.output.type === "markdown") {
        console.log(`\n===== ${site.id} =====\n${md}`);
        continue;
      }
      const url = await createGithubIssue(site.config.output, title, md);
      console.log(`[${site.id}] Issue 起票: ${url}`);
    }
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
