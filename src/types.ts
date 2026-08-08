import { z } from "zod";

// ============================================================
// サイト設定 (sites/<id>.yml) のスキーマ
// ============================================================

export const OutputConfigSchema = z.object({
  /** github_issue = 各サイト repo に Issue 起票 / markdown = ローカル .data にレポート出力のみ */
  type: z.enum(["github_issue", "markdown"]).default("markdown"),
  /** "owner/name" 形式。type=github_issue のとき必須 */
  repo: z.string().optional(),
  labels: z.array(z.string()).default([]),
  assignees: z.array(z.string()).default([]),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const ThresholdsSchema = z.object({
  /** 総セッションの前期間比 低下率(%)。超えたら検知 */
  traffic_drop_pct: z.number().default(30),
  /** GSC クリック/CTR の前期間比 低下率(%) */
  ctr_drop_pct: z.number().default(20),
  /** 平均掲載順位の悪化量(位)。ページ単位で検知 */
  rank_drop: z.number().default(3),
  /** これ未満の表示回数は分析対象から除外(ノイズ抑制) */
  min_impressions: z.number().default(100),
  /** 「高表示・低CTR」判定に使う CTR 上限(%)。これ未満かつ高表示なら改善余地あり */
  low_ctr_pct: z.number().default(1.0),
});
export type Thresholds = z.infer<typeof ThresholdsSchema>;

export const SiteConfigSchema = z.object({
  /** 表示名 */
  name: z.string(),
  /** GA4 プロパティ ID。"properties/123456789" 形式 */
  ga4_property_id: z.string().regex(/^properties\/\d+$/, 'ga4_property_id は "properties/数字" 形式'),
  /** GSC サイト URL。"sc-domain:example.com" もしくは "https://example.com/" */
  gsc_site_url: z.string(),
  /** 重点 KPI(自由記述)。AI 分析プロンプトへのヒントとして渡す */
  focus_kpi: z.array(z.string()).default([]),
  thresholds: ThresholdsSchema.default({}),
  output: OutputConfigSchema.default({}),
});
export type SiteConfig = z.infer<typeof SiteConfigSchema>;

// ============================================================
// スナップショット (.data/<site>/<date>.json) のスキーマ
// ============================================================

const GscRowSchema = z.object({
  key: z.string(), // query or page
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(), // 0..1
  position: z.number(),
});

const GscTotalsSchema = z.object({
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
});

export const SnapshotSchema = z.object({
  site: z.string(),
  collectedAt: z.string(),
  period: z.object({ start: z.string(), end: z.string() }),
  previousPeriod: z.object({ start: z.string(), end: z.string() }),
  ga4: z.object({
    totals: z.record(z.number()),
    previousTotals: z.record(z.number()),
    topPages: z.array(
      z.object({
        path: z.string(),
        sessions: z.number(),
        engagementRate: z.number(),
        conversions: z.number(),
      }),
    ),
  }),
  gsc: z.object({
    totals: GscTotalsSchema,
    previousTotals: GscTotalsSchema,
    queries: z.array(GscRowSchema),
    pages: z.array(GscRowSchema),
    previousPages: z.array(GscRowSchema),
  }),
  cwv: z
    .object({
      lcp: z.number().nullable(),
      inp: z.number().nullable(),
      cls: z.number().nullable(),
      source: z.string(),
    })
    .nullable(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type GscRow = z.infer<typeof GscRowSchema>;

// ============================================================
// 検知シグナル (diff の出力)
// ============================================================

export type SignalSeverity = "high" | "medium" | "low";

export interface Signal {
  /** 機械可読な種別 */
  kind:
    | "ga4_traffic_drop"
    | "gsc_click_drop"
    | "page_rank_drop"
    | "high_impression_low_ctr"
    | "cwv_poor";
  severity: SignalSeverity;
  /** 対象(ページパス / クエリ / "site" 全体) */
  target: string;
  /** 人間向け1行サマリ。数値は必ず実データから */
  summary: string;
  /** 生の数値。AI/レポートが引用する根拠 */
  metrics: Record<string, number | string>;
}
