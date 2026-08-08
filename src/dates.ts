/**
 * 日付ユーティリティ。GSC はデータ反映が 2〜3 日遅れるため、
 * 「終端日」を今日から数日遡らせた地点に置く。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface PeriodPair {
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
}

/**
 * 直近 windowDays 日と、その直前 windowDays 日(前期間)のペアを返す。
 * @param windowDays 期間長(既定7日=週次)
 * @param lagDays 終端日を今日から何日遡らせるか(GSC遅延対策, 既定3日)
 * @param now 基準日(テスト用。省略時は現在)
 */
export function periodPair(windowDays = 7, lagDays = 3, now = new Date()): PeriodPair {
  const end = new Date(now.getTime() - lagDays * DAY_MS);
  const start = new Date(end.getTime() - (windowDays - 1) * DAY_MS);
  const prevEnd = new Date(start.getTime() - DAY_MS);
  const prevStart = new Date(prevEnd.getTime() - (windowDays - 1) * DAY_MS);
  return {
    period: { start: toISODate(start), end: toISODate(end) },
    previousPeriod: { start: toISODate(prevStart), end: toISODate(prevEnd) },
  };
}
