import type { SiteConfig, Snapshot, Signal } from "./types.js";

const SEVERITY_LABEL: Record<Signal["severity"], string> = {
  high: "🔴 高",
  medium: "🟡 中",
  low: "🔵 低",
};

const KIND_LABEL: Record<Signal["kind"], string> = {
  ga4_traffic_drop: "流入急落 (GA4)",
  gsc_click_drop: "検索クリック急落 (GSC)",
  page_rank_drop: "掲載順位悪化 (GSC)",
  high_impression_low_ctr: "高表示・低CTR (GSC)",
  cwv_poor: "Core Web Vitals",
};

/**
 * シグナルを人間可読な Markdown レポートに変換する(ルールベース)。
 * AI 提案を挟まないシンプルな週次レポート、または AI 提案の土台として使う。
 */
export function renderReport(site: SiteConfig, snap: Snapshot, signals: Signal[]): string {
  const lines: string[] = [];
  lines.push(`# ${site.name} 週次サイト診断`);
  lines.push("");
  lines.push(
    `- 対象期間: ${snap.period.start} 〜 ${snap.period.end}（前期間: ${snap.previousPeriod.start} 〜 ${snap.previousPeriod.end}）`,
  );
  lines.push(`- 収集日時: ${snap.collectedAt}`);
  if (site.focus_kpi.length > 0) lines.push(`- 重点KPI: ${site.focus_kpi.join(", ")}`);
  lines.push("");

  // サマリ数値
  lines.push("## サマリ");
  lines.push("");
  lines.push("| 指標 | 今期間 | 前期間 |");
  lines.push("| --- | ---: | ---: |");
  lines.push(
    `| セッション (GA4) | ${snap.ga4.totals.sessions ?? 0} | ${snap.ga4.previousTotals.sessions ?? 0} |`,
  );
  lines.push(
    `| CV (GA4) | ${snap.ga4.totals.conversions ?? 0} | ${snap.ga4.previousTotals.conversions ?? 0} |`,
  );
  lines.push(
    `| クリック (GSC) | ${snap.gsc.totals.clicks} | ${snap.gsc.previousTotals.clicks} |`,
  );
  lines.push(
    `| 表示回数 (GSC) | ${snap.gsc.totals.impressions} | ${snap.gsc.previousTotals.impressions} |`,
  );
  lines.push("");

  // 検知シグナル
  lines.push(`## 検知した問題・改善余地（${signals.length}件）`);
  lines.push("");
  if (signals.length === 0) {
    lines.push("閾値を超える異常は検知されませんでした。");
  } else {
    for (const s of signals) {
      lines.push(`### ${SEVERITY_LABEL[s.severity]} ${KIND_LABEL[s.kind]} — ${s.target}`);
      lines.push("");
      lines.push(s.summary);
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(s.metrics, null, 2));
      lines.push("```");
      lines.push("");
    }
  }
  return lines.join("\n");
}
