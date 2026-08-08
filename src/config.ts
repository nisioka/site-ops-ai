import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { SiteConfigSchema, type SiteConfig } from "./types.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SITES_DIR = join(ROOT, "sites");
export const DATA_DIR = join(ROOT, ".data");

export interface LoadedSite {
  /** ファイル名から拡張子と先頭アンダースコアを除いた ID (例: site-a) */
  id: string;
  config: SiteConfig;
}

/** sites/<id>.yml を1件読み込み・検証する */
export function loadSite(id: string): LoadedSite {
  const path = join(SITES_DIR, `${id}.yml`);
  if (!existsSync(path)) {
    throw new Error(`サイト設定が見つかりません: ${path}`);
  }
  const raw = parseYaml(readFileSync(path, "utf8"));
  const config = SiteConfigSchema.parse(raw);
  return { id, config };
}

/** sites/ 配下の全サイト(先頭 _ のテンプレは除外)を読み込む */
export function loadAllSites(): LoadedSite[] {
  if (!existsSync(SITES_DIR)) return [];
  return readdirSync(SITES_DIR)
    .filter((f) => f.endsWith(".yml") && !basename(f).startsWith("_"))
    .map((f) => loadSite(basename(f, ".yml")));
}
