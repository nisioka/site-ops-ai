import { google } from "googleapis";

/** getGoogleAuth が返す認証クライアントの型(google-auth-library を直接 import しないため) */
export type AuthClient = ReturnType<typeof getGoogleAuth>;

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

/**
 * 環境変数からサービスアカウント鍵の中身を取り出す。
 * クラウド実行では鍵ファイルを置けないため、Secret に JSON 本体(または base64)を入れる運用を想定。
 * 秘匿値なので、パースに失敗しても中身はエラーメッセージに載せない。
 */
function credentialsFromEnv(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON をパースできません。サービスアカウント鍵 JSON 本体、" +
        "またはそれを base64 エンコードした文字列を設定してください。",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON が JSON オブジェクトではありません。");
  }
  return parsed as Record<string, unknown>;
}

/**
 * サービスアカウント認証クライアントを返す。認証情報は次の優先順で解決する。
 *   1. GOOGLE_SERVICE_ACCOUNT_JSON — 鍵 JSON 本体 or base64(クラウド実行向け)
 *   2. GOOGLE_APPLICATION_CREDENTIALS — 鍵 JSON のファイルパス(ローカル実行向け)
 * スコープは GA4 Data API / Search Console API の read-only。
 */
export function getGoogleAuth() {
  const credentials = credentialsFromEnv();
  if (credentials) {
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // googleapis がパスから鍵を読む
    return new google.auth.GoogleAuth({ scopes: SCOPES });
  }
  throw new Error(
    "サービスアカウント認証情報が未設定です。次のいずれかを設定してください。\n" +
      "  GOOGLE_SERVICE_ACCOUNT_JSON  鍵 JSON 本体または base64(クラウド実行はこちら)\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS  鍵 JSON のファイルパス(ローカル実行はこちら)",
  );
}
