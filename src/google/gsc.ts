import { google } from "googleapis";
import type { AuthClient } from "./auth.js";
import type { PeriodPair } from "../dates.js";
import type { GscRow } from "../types.js";

const searchconsole = google.searchconsole("v1");

interface QueryOpts {
  siteUrl: string;
  start: string;
  end: string;
  dimensions: string[];
  rowLimit?: number;
}

async function query(
  authClient: never,
  { siteUrl, start, end, dimensions, rowLimit = 25 }: QueryOpts,
): Promise<GscRow[]> {
  const res = await searchconsole.searchanalytics.query({
    auth: authClient,
    siteUrl,
    requestBody: {
      startDate: start,
      endDate: end,
      dimensions,
      rowLimit,
      dataState: "final",
    },
  });
  return (res.data.rows ?? []).map((r) => ({
    key: r.keys?.join(" | ") ?? "(unknown)",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

/** dimensions 無しの総計を1行取得 */
async function totals(authClient: never, siteUrl: string, start: string, end: string) {
  const res = await searchconsole.searchanalytics.query({
    auth: authClient,
    siteUrl,
    requestBody: { startDate: start, endDate: end, dataState: "final" },
  });
  const row = res.data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

export interface GscResult {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  previousTotals: { clicks: number; impressions: number; ctr: number; position: number };
  queries: GscRow[];
  pages: GscRow[];
  previousPages: GscRow[];
}

/** Search Console から総計(現/前)・クエリ上位・ページ(現/前)を取得 */
export async function collectGsc(
  auth: AuthClient,
  siteUrl: string,
  periods: PeriodPair,
): Promise<GscResult> {
  const authClient = (await auth.getClient()) as never;
  const { period, previousPeriod } = periods;

  const [totalsCur, totalsPrev, queries, pages, previousPages] = await Promise.all([
    totals(authClient, siteUrl, period.start, period.end),
    totals(authClient, siteUrl, previousPeriod.start, previousPeriod.end),
    query(authClient, {
      siteUrl,
      start: period.start,
      end: period.end,
      dimensions: ["query"],
      rowLimit: 50,
    }),
    query(authClient, {
      siteUrl,
      start: period.start,
      end: period.end,
      dimensions: ["page"],
      rowLimit: 50,
    }),
    query(authClient, {
      siteUrl,
      start: previousPeriod.start,
      end: previousPeriod.end,
      dimensions: ["page"],
      rowLimit: 50,
    }),
  ]);

  return { totals: totalsCur, previousTotals: totalsPrev, queries, pages, previousPages };
}
