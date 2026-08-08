import { z } from "zod";

// ============================================================
// サイト設定 (<site-repo>/.claude/site-ops.yml)
// ============================================================

export const SiteConfigSchema = z.object({
  /** 表示名。レポート見出しに使う */
  name: z.string(),
  /** GA4 プロパティ ID。"properties/123456789" 形式 */
  ga4_property_id: z
    .string()
    .regex(/^properties\/\d+$/, 'ga4_property_id は "properties/数字" 形式'),
  /** GSC プロパティ。"sc-domain:example.com" もしくは "https://example.com/" */
  gsc_site_url: z.string(),
  /**
   * サイトの性質・想定利用者・重点。判断材料として AI に渡る自由記述。
   * 数値だけでは打ち手が決まらないため、ここが判断の質を左右する。
   */
  context: z.string().default(""),
});
export type SiteConfig = z.infer<typeof SiteConfigSchema>;

// ============================================================
// スナップショット (<site-repo>/.site-ops/<date>.json)
// ============================================================

const GscRowSchema = z.object({
  key: z.string(), // query または page
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(), // 0..1
  position: z.number(),
});
export type GscRow = z.infer<typeof GscRowSchema>;

const GscTotalsSchema = z.object({
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
});

/**
 * 流入上位ページ。GA4 の conversions 廃止に伴い keyEvents へ移行したため、
 * 旧形式(conversions キー)で保存済みのスナップショットも読めるよう変換する。
 */
const TopPageSchema = z.preprocess(
  (v) => {
    if (v && typeof v === "object" && !("keyEvents" in v) && "conversions" in v) {
      const { conversions, ...rest } = v as Record<string, unknown>;
      return { ...rest, keyEvents: conversions };
    }
    return v;
  },
  z.object({
    path: z.string(),
    sessions: z.number(),
    engagementRate: z.number(),
    keyEvents: z.number(),
  }),
);

export const SnapshotSchema = z.object({
  site: z.string(),
  collectedAt: z.string(),
  period: z.object({ start: z.string(), end: z.string() }),
  previousPeriod: z.object({ start: z.string(), end: z.string() }),
  ga4: z.object({
    totals: z.record(z.number()),
    previousTotals: z.record(z.number()),
    topPages: z.array(TopPageSchema),
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
