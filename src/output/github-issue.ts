import type { OutputConfig } from "../types.js";

/**
 * GitHub REST API で Issue を1件起票する。GITHUB_TOKEN(repo scope) が必要。
 * @returns 作成された Issue の html_url
 */
export async function createGithubIssue(
  output: OutputConfig,
  title: string,
  body: string,
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN が未設定です(output.type=github_issue に必要)");
  if (!output.repo) throw new Error("output.repo が未設定です(\"owner/name\" 形式)");

  const res = await fetch(`https://api.github.com/repos/${output.repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      body,
      labels: output.labels,
      assignees: output.assignees,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub Issue 作成に失敗 (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { html_url: string };
  return json.html_url;
}
