import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { snapshotDir } from "./config.js";
import { getGoogleAuth } from "./google/auth.js";
import { collectGa4 } from "./google/ga4.js";
import { collectGsc } from "./google/gsc.js";
import { collectCwv } from "./google/psi.js";
import { periodPair } from "./dates.js";
import { SnapshotSchema, type SiteConfig, type Snapshot } from "./types.js";

/**
 * GA4 / GSC / CWV を収集し、.site-ops/<date>.json に保存して返す。
 * 3系統は独立に失敗しうるので allSettled で全件の結果を見る
 * (Promise.all だと最初に落ちた1件のエラーしか出ず、切り分けができない)。
 */
export async function collectSite(config: SiteConfig, windowDays = 7): Promise<Snapshot> {
  const auth = getGoogleAuth();
  const periods = periodPair(windowDays);

  const [ga4, gsc, cwv] = await Promise.allSettled([
    collectGa4(auth, config.ga4_property_id, periods),
    collectGsc(auth, config.gsc_site_url, periods),
    collectCwv(config.gsc_site_url),
  ]);

  const failures: string[] = [];
  if (ga4.status === "rejected") failures.push(`GA4 (${config.ga4_property_id}): ${reason(ga4)}`);
  if (gsc.status === "rejected") failures.push(`GSC (${config.gsc_site_url}): ${reason(gsc)}`);
  if (failures.length > 0) {
    throw new Error(`データ取得に失敗しました。\n  ${failures.join("\n  ")}`);
  }
  // CWV は任意。失敗しても収集全体は止めない
  if (cwv.status === "rejected") {
    console.error(`警告: Core Web Vitals の取得に失敗しました: ${reason(cwv)}`);
  }

  const collectedAt = new Date().toISOString();
  const snapshot: Snapshot = SnapshotSchema.parse({
    site: config.name,
    collectedAt,
    period: periods.period,
    previousPeriod: periods.previousPeriod,
    ga4: (ga4 as PromiseFulfilledResult<unknown>).value,
    gsc: (gsc as PromiseFulfilledResult<unknown>).value,
    cwv: cwv.status === "fulfilled" ? cwv.value : null,
  });

  const dir = snapshotDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${collectedAt.slice(0, 10)}.json`),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );
  return snapshot;
}

function reason(r: PromiseRejectedResult): string {
  return r.reason instanceof Error ? r.reason.message : String(r.reason);
}

/** 保存済みスナップショットを新しい順に読み込む(壊れたファイルは読み飛ばす) */
export function loadSnapshots(limit = 1): Snapshot[] {
  const dir = snapshotDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);

  const out: Snapshot[] = [];
  for (const f of files) {
    try {
      out.push(SnapshotSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
    } catch (e) {
      console.error(`警告: スナップショットを読めませんでした (${f}): ${(e as Error).message}`);
    }
  }
  return out;
}
