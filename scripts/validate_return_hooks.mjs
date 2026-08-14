// Validates important return reasons, priority, dedupe, and condition latching.
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { createSimulation, getMetrics } from "../src/core/simulation.js";
import { evaluateNotifications } from "../src/core/notifications.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];
const NOW = 10_000_000_000;

function evaluate(sim, previous = {}, context = {}, now = NOW) {
  return evaluateNotifications(
    sim,
    getMetrics(sim),
    now,
    previous.lastFired ?? {},
    previous.activeKeys ?? [],
    context,
  );
}

function onlyRule(sim, ruleId, context = {}) {
  const result = evaluate(sim, {}, context);
  assert(result.newItems.length === 1, `${ruleId} should produce one focused notification.`);
  assert(result.newItems[0].ruleId === ruleId, `${ruleId} should be the selected return reason.`);
  return result;
}

// Important client decision.
let sim = createSimulation(IT);
sim.ceoDecision = { id: "client-1", type: "clientComplaint", choices: ["apologizeClient"] };
onlyRule(sim, "clientDecisionWaiting");

// Risky narrative CEO situation.
sim = createSimulation(IT);
sim.ceoDecision = { id: "risk-1", type: "midnightLaunch", narrative: true, choices: ["delayLaunch"] };
onlyRule(sim, "riskyCeoSituation");

// Major contract close to deadline, carrying stable localization ids.
sim = createSimulation(IT);
sim.elapsed = 100;
sim.tasks.push({
  id: "major-1",
  status: "queued",
  departmentId: "sales",
  clientId: "northstar",
  projectId: "analytics-dashboard",
  value: IT.baseTaskValue * 2,
  rareContract: true,
  deadline: 125,
});
const deadlineResult = onlyRule(sim, "majorContractDeadline");
assert(deadlineResult.newItems[0].vars.clientId === "northstar", "Deadline alert should carry the client id.");
assert(deadlineResult.newItems[0].vars.seconds === 25, "Deadline alert should carry remaining seconds.");
sim.tasks.push({
  id: "major-2",
  status: "queued",
  departmentId: "sales",
  clientId: "meridian",
  projectId: "website-redesign",
  value: IT.baseTaskValue * 2,
  rareContract: true,
  deadline: 120,
});
const overlappingDeadline = evaluate(sim, deadlineResult, {}, NOW + 5_000);
assert(overlappingDeadline.newItems.length === 0, "Overlapping major deadlines should remain one alert episode.");

// Company report ready.
sim = createSimulation(IT);
sim.companyReport = { id: "report-1", improvement: { id: "steady", vars: {} }, risk: { id: "none", vars: {} } };
onlyRule(sim, "companyReportReady");

// Rare specialist available.
sim = createSimulation(IT);
sim.availableSpecialist = "rockstar-sales";
const specialistResult = onlyRule(sim, "specialistAvailable");
assert(specialistResult.newItems[0].vars.specialistId === "rockstar-sales", "Specialist alert should carry the specialist id.");

// Meaningful offline progress is fed through the same evaluator.
sim = createSimulation(IT);
const offlineResult = onlyRule(sim, "offlineProgressReady", {
  offlineSummary: { awaySeconds: 90, revenue: 1200, completedProjects: 3 },
});
assert(offlineResult.newItems[0].vars.projects === 3, "Offline alert should summarize completed projects.");
assert(offlineResult.newItems[0].vars.revenue === 1200, "Offline alert should summarize revenue.");

// A severe bottleneck is latched: it fires once, stays quiet while unresolved,
// and may fire again only after clearing and recurring beyond its cooldown.
sim = createSimulation(IT);
const bottleneck = sim.departments[0];
bottleneck.queue = Array.from({ length: 15 }, (_, i) => `queued-${i}`);
bottleneck.active = ["active-1"];
bottleneck.bottleneck = { isOverloaded: true, severity: 0.9, queueGrowthRate: 8, utilization: 1, completionSlowdown: 0.3 };
const first = onlyRule(sim, "severeBottleneck");
const unresolved = evaluate(sim, first, {}, NOW + 200_000);
assert(unresolved.newItems.length === 0, "An unresolved bottleneck should not repeat after its cooldown.");

sim.companyReport = { id: "report-during-bottleneck", improvement: { id: "steady", vars: {} }, risk: { id: "none", vars: {} } };
const weakerLater = evaluate(sim, unresolved, {}, NOW + 205_000);
assert(weakerLater.newItems.length === 0, "An unresolved strong reason should suppress a newly appearing weaker reason.");
assert(weakerLater.activeKeys.includes("report:report-during-bottleneck"), "A suppressed later reason should still be latched.");
sim.companyReport = null;

bottleneck.queue = [];
bottleneck.active = [];
bottleneck.bottleneck = { isOverloaded: false, severity: 0, queueGrowthRate: 0, utilization: 0, completionSlowdown: 0 };
const cleared = evaluate(sim, weakerLater, {}, NOW + 210_000);
assert(!cleared.activeKeys.includes(`severeBottleneck:${bottleneck.id}`), "Clearing the bottleneck should release its latch.");

bottleneck.queue = Array.from({ length: 15 }, (_, i) => `again-${i}`);
bottleneck.active = ["active-2"];
bottleneck.bottleneck = { isOverloaded: true, severity: 0.9, queueGrowthRate: 8, utilization: 1, completionSlowdown: 0.3 };
const recurred = evaluate(sim, cleared, {}, NOW + 220_000);
assert(recurred.newItems[0]?.ruleId === "severeBottleneck", "A resolved bottleneck may notify when it genuinely recurs.");

// Several simultaneous conditions still produce one strongest reason, and all
// lower-priority active conditions are latched instead of cascading next tick.
sim.companyReport = { id: "report-priority", improvement: { id: "steady", vars: {} }, risk: { id: "none", vars: {} } };
sim.availableSpecialist = "rockstar-sales";
const prioritized = evaluate(sim, {}, {}, NOW + 300_000);
assert(prioritized.newItems.length === 1, "One evaluation should emit at most one return reason.");
assert(prioritized.newItems[0].ruleId === "severeBottleneck", "The most urgent active reason should win.");
assert(prioritized.activeKeys.includes("report:report-priority"), "Suppressed report should still be latched.");
assert(prioritized.activeKeys.includes("specialist:rockstar-sales"), "Suppressed specialist should still be latched.");
const noCascade = evaluate(sim, prioritized, {}, NOW + 305_000);
assert(noCascade.newItems.length === 0, "Lower-priority reasons should not cascade on the next check.");

console.log(`Important return hooks validation passed (${checks} checks).`);
