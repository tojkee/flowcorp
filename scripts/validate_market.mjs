// Validates Market Share (#16) and Industry Trends (#17).
// Deterministic Node script. Run: npm run validate:market
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { INDUSTRY_TRENDS, INDUSTRY_TREND_BY_ID, INDUSTRY_TREND_DURATION_SECONDS } from "../src/data/industryTrends.js";
import {
  createSimulation,
  getCompanyEffects,
  getMarketShareEffects,
  getMetrics,
  tickSimulation,
} from "../src/core/simulation.js";
import { evaluateNotifications } from "../src/core/notifications.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
const IT = COMPANY_TYPES[0];
const NOW = 10_000_000_000;

// --- Market Share (#16) ------------------------------------------------------
let s = createSimulation(IT);
assert(typeof s.marketShare === "number", "Market share is tracked on the state.");
assert(s.marketShare > 0 && s.marketShare < 20, "A new startup begins with a small market share.");

// Market share drifts toward a target set by company strength. Suppress trends
// so the only driver is the company itself, and give it real strength.
let grow = createSimulation(IT);
const startShare = grow.marketShare;
for (let i = 0; i < 600; i += 1) {
  grow.industryTrendCooldown = 1e9; // keep the climate neutral
  grow.industryTrend = null;
  grow.reputation = 90; // a strong, reputable company
  grow = tickSimulation(grow, 0.5);
}
assert(grow.marketShare > startShare, "A strong company should grow market share over time.");

// Market share effects: dominance speeds leads, raises valuation, lifts reputation;
// a tiny share is a mild disadvantage. Centred so ~25% is roughly neutral.
const leader = getMarketShareEffects({ marketShare: 70 });
const niche = getMarketShareEffects({ marketShare: 5 });
assert(leader.tier === "leader" && niche.tier === "niche", "Share maps to a tier (leader/challenger/niche).");
assert(leader.leadIntervalMultiplier < niche.leadIntervalMultiplier, "Higher share shortens the lead interval (more inbound work).");
assert(leader.valuationMultiplier > niche.valuationMultiplier, "Higher share raises buyout valuation.");
assert(leader.reputationBonus > niche.reputationBonus, "Higher share lifts the reputation bonus.");

// The market-share lead bonus actually feeds lead generation: a market leader
// generates more leads than a niche player over the same window (all else equal).
// Measure leads *created* (nextTaskId), since completion is capacity-bound.
function leadsCreated(share) {
  let sim = createSimulation(COMPANY_TYPES[4]); // Logistics: no random QA branch
  for (let i = 0; i < 200; i += 1) {
    sim.marketShare = share;
    sim.industryTrend = null;
    sim.industryTrendCooldown = 1e9;
    sim.dynamicEventCooldown = 1e9;
    sim.competitorCooldown = 1e9;
    sim = tickSimulation(sim, 0.5);
  }
  return sim.nextTaskId;
}
assert(leadsCreated(80) > leadsCreated(2), "A market leader generates more leads than a niche player.");

// Metrics expose the market-share view.
const mv = getMetrics(createSimulation(IT)).marketShare;
assert(typeof mv.share === "number" && mv.tier && typeof mv.valuationPct === "number", "Metrics expose the market-share view.");

// --- Industry Trends (#17) ---------------------------------------------------
assert(INDUSTRY_TRENDS.length >= 4, "There is an industry-trend roster (AI boom, recession, supply chain, regulations).");
assert(["aiBoom", "recession", "supplyChainCrisis", "newRegulations"].every((id) => INDUSTRY_TREND_BY_ID[id]), "Required trend ids exist.");

// A trend activates when the cooldown elapses, from the known set, with a duration.
let t = createSimulation(IT);
t.industryTrendCooldown = 0;
t = tickSimulation(t, 0.2);
assert(t.industryTrend && INDUSTRY_TREND_BY_ID[t.industryTrend.id], "An industry trend activates when due.");
assert(t.industryTrend.remaining > 0 && t.industryTrend.remaining <= INDUSTRY_TREND_DURATION_SECONDS, "An active trend has a remaining duration.");
assert(t.lastIndustryTrend && t.lastIndustryTrend.trendId === t.industryTrend.id, "The activated trend is recorded for notification.");

// A trend expires after its duration and the market returns to neutral.
let expire = createSimulation(IT);
expire.industryTrend = { id: "aiBoom", severity: "good", remaining: 2 };
for (let i = 0; i < 6; i += 1) expire = tickSimulation(expire, 1);
assert(expire.industryTrend === null, "A trend expires after its duration (market returns to neutral).");
assert(expire.industryTrendCooldown > 0, "Expiry starts the neutral-gap cooldown before the next trend.");

// Trend effects apply at read time via getCompanyEffects (and are felt in the
// economy): AI Boom speeds leads + raises payout; Recession does the opposite.
const boomFx = getCompanyEffects({ culture: null, specialHires: [], industryTrend: { id: "aiBoom" } });
const recessionFx = getCompanyEffects({ culture: null, specialHires: [], industryTrend: { id: "recession" } });
const neutralFx = getCompanyEffects({ culture: null, specialHires: [], industryTrend: null });
assert(boomFx.leadInterval < neutralFx.leadInterval && boomFx.taskValue > neutralFx.taskValue, "AI Boom speeds leads and raises payout.");
assert(recessionFx.leadInterval > neutralFx.leadInterval && recessionFx.taskValue < neutralFx.taskValue, "Recession slows leads and lowers payout.");

// Industry climate shifts the economy: in an AI boom a company earns more than
// in a recession over the same window (deterministic — events suppressed).
function revenueUnder(trendId) {
  let sim = createSimulation(COMPANY_TYPES[4]);
  for (let i = 0; i < 220; i += 1) {
    sim.industryTrend = { id: trendId, severity: "x", remaining: 1e9 };
    sim.industryTrendCooldown = 1e9;
    sim.dynamicEventCooldown = 1e9;
    sim.competitorCooldown = 1e9;
    sim = tickSimulation(sim, 0.5);
  }
  return sim.revenue;
}
assert(revenueUnder("aiBoom") > revenueUnder("recession"), "An AI boom out-earns a recession over the same period.");

// A new trend raises a localizable notification carrying the trend id.
let n = createSimulation(IT);
n.lastIndustryTrend = { id: "aiBoom_1", trendId: "aiBoom", severity: "good", at: 0 };
const item = evaluateNotifications(n, getMetrics(n), NOW, {}).newItems.find((i) => i.ruleId === "industryTrend");
assert(item && item.vars.trendId === "aiBoom", "A new trend raises a localizable notification.");

// Metrics expose the active trend view.
let tv = createSimulation(IT);
tv.industryTrend = { id: "recession", severity: "bad", remaining: 40 };
const trendView = getMetrics(tv).industryTrend;
assert(trendView && trendView.id === "recession" && trendView.remaining === 40, "Metrics expose the active industry-trend view.");

console.log(`Market share & industry trends validation passed (${checks} checks).`);
