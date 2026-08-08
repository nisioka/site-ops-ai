import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, type LoadedSite } from "./config.js";
import { getGoogleAuth } from "./google/auth.js";
import { collectGa4 } from "./google/ga4.js";
import { collectGsc } from "./google/gsc.js";
import { collectCwv } from "./google/psi.js";
import { periodPair } from "./dates.js";
import { SnapshotSchema, type Snapshot } from "./types.js";

function siteDataDir(siteId: string): string {
  return join(DATA_DIR, siteId);
}

/** 1サイト分を収集し、.data/<site>/<collectedAt>.json に保存して返す */
export async function collectSite(site: LoadedSite, windowDays = 7): Promise<Snapshot> {
  const auth = getGoogleAuth();
  const periods = periodPair(windowDays);

  const [ga4, gsc, cwv] = await Promise.all([
    collectGa4(auth, site.config.ga4_property_id, periods),
    collectGsc(auth, site.config.gsc_site_url, periods),
    collectCwv(site.config.gsc_site_url),
  ]);

  const collectedAt = new Date().toISOString();
  const snapshot: Snapshot = SnapshotSchema.parse({
    site: site.id,
    collectedAt,
    period: periods.period,
    previousPeriod: periods.previousPeriod,
    ga4,
    gsc,
    cwv,
  });

  const dir = siteDataDir(site.id);
  mkdirSync(dir, { recursive: true });
  const fileName = `${collectedAt.slice(0, 10)}.json`;
  writeFileSync(join(dir, fileName), JSON.stringify(snapshot, null, 2), "utf8");
  return snapshot;
}

/** 最新のスナップショット(なければ null)を読み込む。excludeCollectedAt で自分自身を除外可 */
export function loadLatestSnapshot(siteId: string, excludeCollectedAt?: string): Snapshot | null {
  const dir = siteDataDir(siteId);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  for (const f of files) {
    const snap = SnapshotSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (snap.collectedAt !== excludeCollectedAt) return snap;
  }
  return null;
}
