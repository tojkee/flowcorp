// Validates Employee Happiness & Retention (#14) and Competitor Companies (#15).
// Deterministic Node script. Run: npm run validate:morale
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { COMPETITORS } from "../src/data/competitors.js";
import { createSimulation, getMetrics, giveRaise, raiseCost, tickSimulation } from "../src/core/simulation.js";
import { evaluateNotifications } from "../src/core/notifications.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
const IT = COMPANY_TYPES[0];
const NOW = 10_000_000_000;

// --- Employee happiness (#14) ------------------------------------------------
let s = createSimulation(IT);
assert(typeof s.employeeHappiness === "number", "Happiness is tracked.");
const startHappy = s.employeeHappiness;

// Salary expectations + burnout erode happiness over time when untended.
let drift = createSimulation(IT);
for (let i = 0; i < 600; i += 1) drift = tickSimulation(drift, 0.5); // ~5 min
assert(drift.employeeHappiness < startHappy, "Untended morale should decline (salary expectations + burnout).");
assert(drift.salaryPressure > 0, "Salary expectations should build over time.");

// A raise lifts morale and resets salary expectations (cost scales with headcount).
let r = createSimulation(IT);
r.employeeHappiness = 50;
r.salaryPressure = 40;
r.cash = 100000;
const cost = raiseCost(r);
assert(cost > 0, "A raise has a headcount-scaled cost.");
const beforeCash = r.cash;
r = giveRaise(r);
assert(r.cash === beforeCash - cost, "Giving raises spends the raise cost.");
assert(r.employeeHappiness > 50, "Giving raises lifts morale.");
assert(r.salaryPressure === 0, "Giving raises resets salary expectations.");

// Morale affects processing speed (motivation): a happier company is faster.
// Uses Logistics (COMPANY_TYPES[4] — no random QA-rejection branch) and pins
// happiness + suppresses random dynamic/competitor events each tick so the only
// variable is the motivation speed factor (deterministic completion count).
function completedAfter(happiness) {
  let sim = createSimulation(COMPANY_TYPES[4]);
  sim.companyType = { ...sim.companyType, leadInterval: 0.5 };
  for (let i = 0; i < 150; i += 1) {
    sim.employeeHappiness = happiness;
    sim.dynamicEventCooldown = 1e9;
    sim.competitorCooldown = 1e9;
    // Keep the industry climate neutral so the only variable is the motivation
    // speed factor (a random boom/recession would otherwise add throughput noise).
    sim.industryTrend = null;
    sim.industryTrendCooldown = 1e9;
    sim = tickSimulation(sim, 1);
  }
  return sim.completedTasks;
}
assert(completedAfter(100) > completedAfter(20), "Higher morale should raise throughput (motivation).");

// Metrics expose the morale view.
const view = getMetrics(createSimulation(IT)).morale;
assert(typeof view.happiness === "number" && typeof view.raiseCost === "number" && view.tier, "Metrics expose the morale view.");

// --- Competitor companies (#15) ----------------------------------------------
assert(COMPETITORS.length >= 3, "There is a competitor roster.");
let c = createSimulation(IT);
c.competitorCooldown = 0;
c = tickSimulation(c, 0.2);
assert(c.lastCompetitorEvent, "A competitor event fires when due.");
assert(["launchedProduct", "hiredTalent", "acquired"].includes(c.lastCompetitorEvent.type), "Competitor event has a known type.");
assert(COMPETITORS.some((x) => x.id === c.lastCompetitorEvent.competitorId), "Competitor event names a roster competitor.");

// Competitor news raises a notification with the competitor + event for i18n.
let n = createSimulation(IT);
n.lastCompetitorEvent = { id: "e1", type: "launchedProduct", competitorId: "apex", severity: "bad", at: 0 };
const item = evaluateNotifications(n, getMetrics(n), NOW, {}).newItems.find((i) => i.ruleId === "competitorEvent");
assert(item && item.vars.competitorId === "apex" && item.vars.compType === "launchedProduct", "Competitor news raises a localizable notification.");

console.log(`Morale & competitors validation passed (${checks} checks).`);
