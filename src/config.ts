import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { SiteConfigSchema, type SiteConfig } from "./types.js";

/** サイト設定の既定パス(サイトリポジトリからの相対) */
export const CONFIG_PATH = join(".claude", "site-ops.yml");
/** スナップショットの保存先(サイトリポジトリからの相対) */
export const SNAPSHOT_DIR = ".site-ops";

/**
 * サイト設定を読み込む。カレントディレクトリ = 対象サイトのリポジトリ。
 * @param configPath 明示指定(省略時は .claude/site-ops.yml)
 * @param cwd 基準ディレクトリ(既定はプロセスの CWD)
 */
export function loadSiteConfig(configPath?: string, cwd = process.cwd()): SiteConfig {
  const path = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(cwd, configPath)
    : resolve(cwd, CONFIG_PATH);

  if (!existsSync(path)) {
    throw new Error(
      `サイト設定が見つかりません: ${path}\n` +
        `対象サイトのリポジトリ直下で実行し、${CONFIG_PATH} を用意してください。`,
    );
  }
  const raw = parseYaml(readFileSync(path, "utf8"));
  return SiteConfigSchema.parse(raw);
}

/** スナップショット保存ディレクトリの絶対パス */
export function snapshotDir(cwd = process.cwd()): string {
  return resolve(cwd, SNAPSHOT_DIR);
}
