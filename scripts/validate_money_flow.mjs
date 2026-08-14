// Validates the Company/Finance money-flow explanation model.
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { createSimulation, getMetrics, tickSimulation } from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];

// Fresh companies explain the payment loop before revenue arrives.
let sim = createSimulation(IT);
let money = getMetrics(sim).incomeBreakdown;
assert(Array.isArray(sim.recentRevenue), "A new simulation should initialize paid-project history.");
assert(money.trend.direction === "waiting", "A company without payments should show the waiting explanation.");
assert(money.topSource === null, "A company without payments should not invent a top source.");

// Real project completion records a bounded, localizable payment event.
for (let i = 0; i < 2400 && sim.completedTasks === 0; i += 1) sim = tickSimulation(sim, 0.1);
assert(sim.completedTasks > 0, "The normal simulation should complete a paid project.");
assert(sim.recentRevenue.length > 0, "A paid project should append revenue history.");
const paid = sim.recentRevenue[sim.recentRevenue.length - 1];
assert(paid.amount > 0 && paid.clientId && paid.projectId, "Payment history should retain amount and stable client/project ids.");

// Adjacent 60-second windows drive trend, and current payments aggregate by
// real client/project source rather than department throughput.
sim = createSimulation(IT);
sim.elapsed = 120;
sim.recentRevenue = [
  { time: 45, amount: 200, clientId: "northstar", projectId: "analytics-dashboard" },
  { time: 105, amount: 600, clientId: "meridian", projectId: "website-redesign" },
  { time: 112, amount: 400, clientId: "meridian", projectId: "website-redesign" },
  { time: 118, amount: 250, clientId: "nova", projectId: "prototype-development" },
];
money = getMetrics(sim).incomeBreakdown;
assert(money.trend.current === 1250 && money.trend.previous === 200, "Trend should compare actual adjacent-minute revenue.");
assert(money.trend.direction === "rising" && money.trend.reason === "morePayments", "Higher current payments should explain rising revenue.");
assert(money.topSource.clientId === "meridian" && money.topSource.amount === 1000, "Top source should aggregate the highest-paying client/project pair.");

// Falling revenue under overload explicitly points to the bottleneck and
// quantifies both the payout percentage and estimated money lost per minute.
sim.recentRevenue = [
  { time: 45, amount: 1200, clientId: "northstar", projectId: "analytics-dashboard" },
  { time: 112, amount: 200, clientId: "meridian", projectId: "website-redesign" },
];
sim.completedTasks = 3;
sim.revenue = 1600;
const dept = sim.departments[0];
dept.queue = Array.from({ length: 16 }, (_, index) => `q-${index}`);
dept.active = ["active"];
dept.throughputWindow = [110, 115];
dept.bottleneck = { isOverloaded: true, severity: 0.9, queueGrowthRate: 10, utilization: 1, completionSlowdown: 0.3 };
money = getMetrics(sim).incomeBreakdown;
assert(money.trend.direction === "falling" && money.trend.reason === "bottleneck", "Falling revenue under overload should name the bottleneck as the reason.");
assert(money.bottleneckImpact?.percent > 0 && money.bottleneckImpact.amount > 0, "Bottleneck impact should expose percent and money lost.");
assert(money.actionEffect?.actionType === "hire" && money.actionEffect.percent > 0, "The recommended bottleneck hire should include an expected effect.");

// When current operating costs exceed modelled income, Finance names that as
// the largest leak instead of implying a department created the loss.
sim = createSimulation(IT);
money = getMetrics(sim).incomeBreakdown;
assert(money.net < 0, "A fresh company with no throughput should currently run at a loss.");
assert(money.biggestLeak?.id === "operatingCosts", "Operating costs should explain a current loss when they exceed income.");

// Old saves receive the history default on their next tick.
delete sim.recentRevenue;
sim = tickSimulation(sim, 0.1);
assert(Array.isArray(sim.recentRevenue), "Old saves without payment history should normalize on tick.");
sim.recentRevenue = [{ time: sim.elapsed - 121, amount: 50, clientId: "old", projectId: "old" }];
sim = tickSimulation(sim, 0.1);
assert(sim.recentRevenue.length === 0, "Paid-project history should prune entries older than 120 seconds.");

console.log(`Money-flow clarity validation passed (${checks} checks).`);
