import { google } from "googleapis";
import type { AuthClient } from "./auth.js";
import type { PeriodPair } from "../dates.js";

const analyticsdata = google.analyticsdata("v1beta");

/** runReport の metricValues を name→number のマップに畳む(単一行想定) */
function totalsFromRows(
  metricHeaders: { name?: string | null }[] | undefined,
  row: { metricValues?: { value?: string | null }[] } | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!metricHeaders || !row?.metricValues) return out;
  metricHeaders.forEach((h, i) => {
    const name = h.name ?? `metric_${i}`;
    out[name] = Number(row.metricValues?.[i]?.value ?? 0);
  });
  return out;
}

const CORE_METRICS = [
  { name: "sessions" },
  { name: "engagedSessions" },
  { name: "engagementRate" },
  { name: "conversions" },
  { name: "totalUsers" },
];

export interface Ga4Result {
  totals: Record<string, number>;
  previousTotals: Record<string, number>;
  topPages: Array<{
    path: string;
    sessions: number;
    engagementRate: number;
    conversions: number;
  }>;
}

/** GA4 の総計(現/前期間)と流入上位ページを取得 */
export async function collectGa4(
  auth: AuthClient,
  propertyId: string,
  periods: PeriodPair,
): Promise<Ga4Result> {
  const authClient = (await auth.getClient()) as never;

  // 総計: 現在期間 + 前期間 を1リクエストで
  const totalsRes = await analyticsdata.properties.runReport({
    auth: authClient,
    property: propertyId,
    requestBody: {
      dateRanges: [
        { startDate: periods.period.start, endDate: periods.period.end, name: "current" },
        {
          startDate: periods.previousPeriod.start,
          endDate: periods.previousPeriod.end,
          name: "previous",
        },
      ],
      metrics: CORE_METRICS,
      // dateRange 名で行が分かれる
      dimensions: [{ name: "dateRange" }],
    },
  });

  const headers = totalsRes.data.metricHeaders ?? undefined;
  const rows = totalsRes.data.rows ?? [];
  const currentRow = rows.find((r) => r.dimensionValues?.[0]?.value === "current");
  const previousRow = rows.find((r) => r.dimensionValues?.[0]?.value === "previous");

  // 流入上位ページ(現在期間)
  const pagesRes = await analyticsdata.properties.runReport({
    auth: authClient,
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate: periods.period.start, endDate: periods.period.end }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "engagementRate" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "20",
    },
  });

  const topPages = (pagesRes.data.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "(unknown)",
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
    engagementRate: Number(r.metricValues?.[1]?.value ?? 0),
    conversions: Number(r.metricValues?.[2]?.value ?? 0),
  }));

  return {
    totals: totalsFromRows(headers, currentRow),
    previousTotals: totalsFromRows(headers, previousRow),
    topPages,
  };
}
