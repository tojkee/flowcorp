// Industry Trends (#17): a periodically shifting industry-wide climate that
// applies broad, temporary economic effects — good and bad — to the whole
// company. One trend is active at a time for a fixed duration, then the market
// returns to neutral for a cooldown before the next trend. Trends are picked on
// a weighted roll (like dynamic events) and surfaced through the notification
// inbox; their `effects` reuse the same read-time effect keys as company
// culture/specialists (folded into `getCompanyEffects`), so they automatically
// shift lead generation, payout, processing speed, expenses, and accuracy with
// no new read points. `marketShareDrift` nudges the Market Share target and
// `valuationMultiplier` scales buyout valuations while the trend is active.
//
// Names + bodies are localized under `industryTrend.<id>.{name,body}`; the
// active trend is shown on the Growth tab and raised as a `notify.industryTrend`
// inbox item via `lastIndustryTrend`.

export const INDUSTRY_TRENDS = [
  {
    // AI Boom — demand surges: more inbound work, richer projects, faster work,
    // and the market expands (share grows, valuations rise).
    id: "aiBoom",
    severity: "good",
    weight: 3,
    effects: { leadInterval: 0.82, taskValue: 1.18, speedMultiplier: 1.08 },
    marketShareDrift: 7,
    valuationMultiplier: 1.12,
  },
  {
    // Recession — demand dries up: slower leads, thinner project budgets, and
    // depressed buyout valuations; market share erodes.
    id: "recession",
    severity: "bad",
    weight: 3,
    effects: { leadInterval: 1.2, taskValue: 0.82 },
    marketShareDrift: -5,
    valuationMultiplier: 0.85,
  },
  {
    // Supply Chain Crisis — operations seize up: work processes slower and costs
    // rise. Hits throughput hardest.
    id: "supplyChainCrisis",
    severity: "bad",
    weight: 2,
    effects: { speedMultiplier: 0.85, expense: 1.12 },
    marketShareDrift: -2,
    valuationMultiplier: 0.92,
  },
  {
    // New Regulations — compliance overhead: higher running costs and tighter
    // margins, but the bar rises industry-wide so share is only mildly affected.
    id: "newRegulations",
    severity: "bad",
    weight: 2,
    effects: { expense: 1.15, taskValue: 0.95 },
    marketShareDrift: -1,
    valuationMultiplier: 0.95,
  },
];

export const INDUSTRY_TREND_BY_ID = Object.fromEntries(INDUSTRY_TRENDS.map((trend) => [trend.id, trend]));

// How long a trend stays active, and the neutral gap before the next one.
export const INDUSTRY_TREND_DURATION_SECONDS = 110;
export const INDUSTRY_TREND_COOLDOWN_SECONDS = 80;
