import { google } from "googleapis";

/** getGoogleAuth が返す認証クライアントの型(google-auth-library を直接 import しないため) */
export type AuthClient = ReturnType<typeof getGoogleAuth>;

/**
 * サービスアカウント認証クライアントを返す。
 * 鍵は環境変数 GOOGLE_APPLICATION_CREDENTIALS (JSON ファイルパス) から自動取得される。
 * スコープは GA4 Data API / Search Console API の read-only。
 */
export function getGoogleAuth() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS が未設定です。サービスアカウント鍵 JSON のパスを指定してください。",
    );
  }
  return new google.auth.GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
  });
}
