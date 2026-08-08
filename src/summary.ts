import type { Snapshot } from "./types.js";

/**
 * スナップショットを「判断材料としての差分」に整形する。
 *
 * ここでは深刻度の判定をしない。閾値で "🔴 高 流入急落" のようにラベル付けすると、
 * 母数の小ささや交絡(表示回数は増えているのにクリックだけ減った等)が見えなくなり、
 * 機械的な起票につながる。判断は実際のコードを見られる AI 側で行う。
 */

export interface MetricRow {
  metric: string;
  current: number;
  previous: number;
  /** 前期間が 0 の場合は変化率を定義しないので null */
  changePct: number | null;
  delta: number;
}

export interface PageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctrPct: number;
  position: number;
  previousClicks: number | null;
  previousImpressions: number | null;
  previousPosition: number | null;
  /** 正 = 掲載順位が下がった(悪化)。前期間にデータが無ければ null */
  positionDelta: number | null;
}

export interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctrPct: number;
  position: number;
}

export interface Summary {
  site: string;
  collectedAt: string;
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  totals: MetricRow[];
  /** 検索での露出が大きい順。前期間との突き合わせ済み */
  pages: PageRow[];
  /** 現期間の検索クエリ。露出が大きい順 */
  queries: QueryRow[];
  /** GA4 の流入上位ページ */
  landingPages: Snapshot["ga4"]["topPages"];
  cwv: Snapshot["cwv"];
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function metricRow(metric: string, current: number, previous: number): MetricRow {
  return {
    metric,
    current: round(current, 3),
    previous: round(previous, 3),
    changePct: previous === 0 ? null : round(((current - previous) / previous) * 100),
    delta: round(current - previous, 3),
  };
}

export function buildSummary(snap: Snapshot): Summary {
  const g = snap.ga4;
  const s = snap.gsc;

  // GA4 の totals は API のヘッダ名がそのままキー。旧スナップショットは conversions を持つ
  const keyEvents = (t: Record<string, number>) => t.keyEvents ?? t.conversions ?? 0;

  const totals: MetricRow[] = [
    metricRow("セッション (GA4)", g.totals.sessions ?? 0, g.previousTotals.sessions ?? 0),
    metricRow("ユーザー (GA4)", g.totals.totalUsers ?? 0, g.previousTotals.totalUsers ?? 0),
    metricRow(
      "エンゲージ率 (GA4)",
      (g.totals.engagementRate ?? 0) * 100,
      (g.previousTotals.engagementRate ?? 0) * 100,
    ),
    metricRow("キーイベント (GA4)", keyEvents(g.totals), keyEvents(g.previousTotals)),
    metricRow("クリック (GSC)", s.totals.clicks, s.previousTotals.clicks),
    metricRow("表示回数 (GSC)", s.totals.impressions, s.previousTotals.impressions),
    metricRow("CTR% (GSC)", s.totals.ctr * 100, s.previousTotals.ctr * 100),
    metricRow("平均掲載順位 (GSC)", s.totals.position, s.previousTotals.position),
  ];

  const prevPages = new Map(s.previousPages.map((p) => [p.key, p]));
  const pages: PageRow[] = s.pages
    .map((p) => {
      const prev = prevPages.get(p.key);
      return {
        page: p.key,
        clicks: p.clicks,
        impressions: p.impressions,
        ctrPct: round(p.ctr * 100, 2),
        position: round(p.position),
        previousClicks: prev ? prev.clicks : null,
        previousImpressions: prev ? prev.impressions : null,
        previousPosition: prev ? round(prev.position) : null,
        positionDelta: prev ? round(p.position - prev.position) : null,
      };
    })
    .sort((a, b) => b.impressions - a.impressions);

  const queries: QueryRow[] = s.queries
    .map((q) => ({
      query: q.key,
      clicks: q.clicks,
      impressions: q.impressions,
      ctrPct: round(q.ctr * 100, 2),
      position: round(q.position),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  return {
    site: snap.site,
    collectedAt: snap.collectedAt,
    period: snap.period,
    previousPeriod: snap.previousPeriod,
    totals,
    pages,
    queries,
    landingPages: g.topPages,
    cwv: snap.cwv,
  };
}

// ============================================================
// Markdown 整形(標準出力・PR/Issue への貼り付け用)
// ============================================================

/**
 * 外部由来の文字列を Markdown の表セルに入れられる形へ整える。
 *
 * 検索クエリとページ URL は第三者が任意に作れる（そのクエリで検索して自サイトを
 * 表示させればよい）。この出力は PR / Issue の本文になり、AI も読む。
 * 素通しにすると表崩れ・HTML 混入・指示文の混入を許すため、構造を壊す文字を無害化する。
 */
const CELL_MAX = 200;

function cell(value: string): string {
  const escaped = value
    .replace(/[\r\n]+/g, " ") // 改行は行区切りとして解釈されるため潰す
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|") // セル区切りを壊さない
    .replace(/[`*_[\]]/g, (c) => `\\${c}`) // コード/強調/リンク記法を無効化
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.length > CELL_MAX ? `${escaped.slice(0, CELL_MAX)}…` : escaped;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v > 0 ? "+" : ""}${v}%`;
}

function signed(v: number | null): string {
  return v === null ? "—" : `${v > 0 ? "+" : ""}${v}`;
}

/** @param context サイトの前提(site-ops.yml の context)。あれば冒頭に差し込む */
export function renderSummary(summary: Summary, context?: string): string {
  const L: string[] = [];
  L.push(`# ${cell(summary.site)} サイト計測サマリ`);
  L.push("");
  L.push(
    `- 対象期間: ${summary.period.start} 〜 ${summary.period.end}` +
      `（前期間: ${summary.previousPeriod.start} 〜 ${summary.previousPeriod.end}）`,
  );
  L.push(`- 収集日時: ${summary.collectedAt}`);
  L.push("");
  if (context?.trim()) {
    L.push("## サイトの前提");
    L.push("");
    L.push(context.trim());
    L.push("");
  }

  L.push("## 総計");
  L.push("");
  L.push("| 指標 | 今期間 | 前期間 | 差 | 変化率 |");
  L.push("| --- | ---: | ---: | ---: | ---: |");
  for (const r of summary.totals) {
    L.push(
      `| ${r.metric} | ${r.current} | ${r.previous} | ${signed(r.delta)} | ${pct(r.changePct)} |`,
    );
  }
  L.push("");
  L.push("掲載順位は値が小さいほど上位。変化率は母数が小さいと大きく振れる点に注意。");
  L.push("");

  L.push(`## 検索ページ（表示回数順・${summary.pages.length}件）`);
  L.push("");
  if (summary.pages.length === 0) {
    L.push("データなし。");
  } else {
    L.push("| ページ | クリック | 表示 | CTR% | 掲載順位 | 前期順位 | 順位差 |");
    L.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const p of summary.pages) {
      L.push(
        `| ${cell(p.page)} | ${p.clicks} | ${p.impressions} | ${p.ctrPct} | ${p.position} | ` +
          `${p.previousPosition ?? "—"} | ${signed(p.positionDelta)} |`,
      );
    }
    L.push("");
    L.push("順位差は正が悪化。前期順位が「—」のページは前期間に露出が無かった。");
  }
  L.push("");

  L.push(`## 検索クエリ（表示回数順・${summary.queries.length}件）`);
  L.push("");
  if (summary.queries.length === 0) {
    L.push("データなし。");
  } else {
    L.push("| クエリ | クリック | 表示 | CTR% | 掲載順位 |");
    L.push("| --- | ---: | ---: | ---: | ---: |");
    for (const q of summary.queries) {
      L.push(
        `| ${cell(q.query)} | ${q.clicks} | ${q.impressions} | ${q.ctrPct} | ${q.position} |`,
      );
    }
  }
  L.push("");

  L.push(`## 流入上位ページ（GA4・${summary.landingPages.length}件）`);
  L.push("");
  if (summary.landingPages.length === 0) {
    L.push("データなし。");
  } else {
    L.push("| パス | セッション | エンゲージ率 | キーイベント |");
    L.push("| --- | ---: | ---: | ---: |");
    for (const p of summary.landingPages) {
      L.push(
        `| ${cell(p.path)} | ${p.sessions} | ${round(p.engagementRate * 100)}% | ${p.keyEvents} |`,
      );
    }
  }
  L.push("");

  L.push("## Core Web Vitals");
  L.push("");
  if (!summary.cwv) {
    L.push("未取得（PSI_API_KEY 未設定）。");
  } else if (summary.cwv.lcp === null && summary.cwv.inp === null && summary.cwv.cls === null) {
    L.push(
      `フィールドデータなし（source: ${cell(summary.cwv.source)}）。` +
        "実ユーザーのトラフィックが CrUX の閾値に満たない場合、値は返らない。",
    );
  } else {
    L.push(`- LCP: ${summary.cwv.lcp ?? "—"} ms（基準 2500 以下）`);
    L.push(`- INP: ${summary.cwv.inp ?? "—"} ms（基準 200 以下）`);
    L.push(`- CLS: ${summary.cwv.cls ?? "—"}（PSI は 100 倍値。基準 10 以下）`);
    L.push(`- source: ${cell(summary.cwv.source)}`);
  }
  L.push("");
  return L.join("\n");
}
