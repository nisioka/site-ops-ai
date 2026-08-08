import type { Snapshot } from "../types.js";

/**
 * PageSpeed Insights API から Core Web Vitals(フィールドデータ = CrUX 由来)を取得。
 * PSI_API_KEY 未設定時は null を返す(=CWV 検知をスキップ)。
 * 対象 URL は GSC のサイト URL から推定(sc-domain: は https://domain/ に変換)。
 */
export async function collectCwv(gscSiteUrl: string): Promise<Snapshot["cwv"]> {
  const apiKey = process.env.PSI_API_KEY;
  if (!apiKey) return null;

  const origin = gscSiteUrl.startsWith("sc-domain:")
    ? `https://${gscSiteUrl.slice("sc-domain:".length)}/`
    : gscSiteUrl;

  const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  url.searchParams.set("url", origin);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("strategy", "mobile");

  const res = await fetch(url);
  if (!res.ok) {
    return { lcp: null, inp: null, cls: null, source: `psi_error_${res.status}` };
  }
  const json = (await res.json()) as {
    loadingExperience?: { metrics?: Record<string, { percentile?: number }> };
  };
  const m = json.loadingExperience?.metrics ?? {};
  return {
    lcp: m.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    inp: m.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    cls: m.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null,
    source: "psi_field_data",
  };
}
