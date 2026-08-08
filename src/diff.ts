import type { SiteConfig, Snapshot, Signal } from "./types.js";

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * スナップショット内の現/前期間データを突き合わせ、閾値を超えた項目をシグナル化する。
 * 数値はすべて実データ由来。AI/レポートはこの metrics を根拠に引用する。
 */
export function detectSignals(snap: Snapshot, cfg: SiteConfig): Signal[] {
  const t = cfg.thresholds;
  const signals: Signal[] = [];

  // 1. GA4 総セッション急落
  const sess = snap.ga4.totals.sessions ?? 0;
  const prevSess = snap.ga4.previousTotals.sessions ?? 0;
  const sessChange = pctChange(sess, prevSess);
  if (sessChange <= -t.traffic_drop_pct) {
    signals.push({
      kind: "ga4_traffic_drop",
      severity: sessChange <= -t.traffic_drop_pct * 2 ? "high" : "medium",
      target: "site",
      summary: `セッションが前期間比 ${round(sessChange)}%(${prevSess}→${sess})`,
      metrics: { sessions: sess, previousSessions: prevSess, changePct: round(sessChange) },
    });
  }

  // 2. GSC クリック急落
  const clicks = snap.gsc.totals.clicks;
  const prevClicks = snap.gsc.previousTotals.clicks;
  const clickChange = pctChange(clicks, prevClicks);
  if (clickChange <= -t.ctr_drop_pct) {
    signals.push({
      kind: "gsc_click_drop",
      severity: clickChange <= -t.ctr_drop_pct * 2 ? "high" : "medium",
      target: "site",
      summary: `検索クリックが前期間比 ${round(clickChange)}%(${prevClicks}→${clicks})`,
      metrics: {
        clicks,
        previousClicks: prevClicks,
        changePct: round(clickChange),
        impressions: snap.gsc.totals.impressions,
      },
    });
  }

  // 3. ページ単位の掲載順位悪化
  const prevPageMap = new Map(snap.gsc.previousPages.map((p) => [p.key, p]));
  for (const page of snap.gsc.pages) {
    if (page.impressions < t.min_impressions) continue;
    const prev = prevPageMap.get(page.key);
    if (!prev) continue;
    const worsened = page.position - prev.position; // 正=順位が下がった(悪化)
    if (worsened >= t.rank_drop) {
      signals.push({
        kind: "page_rank_drop",
        severity: worsened >= t.rank_drop * 2 ? "high" : "medium",
        target: page.key,
        summary: `平均掲載順位が ${round(prev.position)}位→${round(page.position)}位に悪化`,
        metrics: {
          page: page.key,
          position: round(page.position),
          previousPosition: round(prev.position),
          delta: round(worsened),
          impressions: page.impressions,
          clicks: page.clicks,
        },
      });
    }
  }

  // 4. 高表示・低CTR クエリ(タイトル/メタ改善の候補)
  for (const q of snap.gsc.queries) {
    if (q.impressions < t.min_impressions) continue;
    if (q.ctr * 100 < t.low_ctr_pct) {
      signals.push({
        kind: "high_impression_low_ctr",
        severity: "low",
        target: q.key,
        summary: `「${q.key}」表示${q.impressions}回 / CTR ${round(q.ctr * 100)}% / 平均${round(q.position)}位`,
        metrics: {
          query: q.key,
          impressions: q.impressions,
          clicks: q.clicks,
          ctrPct: round(q.ctr * 100, 2),
          position: round(q.position),
        },
      });
    }
  }

  // 5. Core Web Vitals 悪化(閾値は Google 標準: LCP>2500ms, INP>200ms, CLS>0.1)
  if (snap.cwv) {
    const { lcp, inp, cls } = snap.cwv;
    const poor: string[] = [];
    if (lcp !== null && lcp > 2500) poor.push(`LCP ${lcp}ms`);
    if (inp !== null && inp > 200) poor.push(`INP ${inp}ms`);
    if (cls !== null && cls > 10) poor.push(`CLS ${round(cls / 100, 2)}`); // PSI は CLS*100 で返す
    if (poor.length > 0) {
      signals.push({
        kind: "cwv_poor",
        severity: "medium",
        target: "site",
        summary: `Core Web Vitals が基準未達: ${poor.join(", ")}`,
        metrics: { lcp: lcp ?? "n/a", inp: inp ?? "n/a", cls: cls ?? "n/a", source: snap.cwv.source },
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return signals.sort((a, b) => order[a.severity] - order[b.severity]);
}
