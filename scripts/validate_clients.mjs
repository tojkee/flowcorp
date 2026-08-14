// Validates the Real Client System (#6) and the Recovery Contract (#5).
// Deterministic Node script — no framework. Run: npm run validate:clients
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { CLIENTS, PROJECTS } from "../src/data/clients.js";
import { createSimulation, getClientReputationEffects, getMetrics, takeRecoveryContract, tickSimulation } from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];
const clientIds = new Set(CLIENTS.map((c) => c.id));
const projectIds = new Set(PROJECTS);

// --- Real clients: leads carry client identity, budget, and a deadline --------
let s = createSimulation(IT);
for (let i = 0; i < 200; i += 1) s = tickSimulation(s, 0.1);
const lead = s.tasks.find((t) => t.clientId);
assert(lead, "New leads should be created as client projects.");
assert(clientIds.has(lead.clientId), "A lead's clientId should come from the client roster.");
assert(projectIds.has(lead.projectId), "A lead should carry a project id.");
assert(typeof lead.industry === "string" && lead.industry.length > 0, "A lead should carry its client's industry.");
assert(lead.value > 0, "A lead should carry a budget (value).");
assert(typeof lead.deadline === "number" && lead.deadline > lead.bornAt, "A lead should carry a delivery deadline.");

// Clients view surfaces in-flight projects + a satisfaction score.
const clients = getMetrics(s).clients;
assert(clients && typeof clients.satisfaction === "number", "Metrics should expose client satisfaction.");
assert(Array.isArray(clients.active) && clients.active.length >= 1, "Metrics should list active client projects.");
assert(clientIds.has(clients.active[0].clientId), "An active client entry should reference a roster client.");

// --- Late delivery reduces client satisfaction (the bottleneck consequence) ---
// A starved single-employee company backs up, so deliveries run late and the
// rolling satisfaction falls below the on-time 100.
let slow = createSimulation(IT);
for (const d of slow.departments) {
  d.employees = 1;
  d.staff = d.staff.slice(0, 1);
}
slow.companyType = { ...slow.companyType, leadInterval: 0.6 };
for (let i = 0; i < 1400; i += 1) slow = tickSimulation(slow, 0.5);
assert(slow.completedTasks > 0, "The slow company should still complete some projects.");
assert(slow.clientSatisfaction < 100, "Late deliveries should pull client satisfaction below 100.");

// --- Recovery contract (#5): advance + high-value leads, bounded --------------
let r = createSimulation(IT);
r.cash = 80;
const tasksBefore = r.tasks.length;
const cashBefore = r.cash;
r = takeRecoveryContract(r);
assert(r.cash > cashBefore, "A recovery contract should pay an upfront advance.");
assert(r.tasks.length > tasksBefore, "A recovery contract should inject new client projects.");
const injected = r.tasks[r.tasks.length - 1];
assert(injected.value > IT.baseTaskValue * 3, "Recovery-contract projects should be high-value.");
assert(r.recoveryContractsUsed === 1 && r.recoveryContractCooldown > 0, "Taking a recovery contract sets its cooldown.");
// Bounded: a second one is blocked until the cooldown elapses.
const usedAfterFirst = r.recoveryContractsUsed;
r = takeRecoveryContract(r);
assert(r.recoveryContractsUsed === usedAfterFirst, "A recovery contract must respect its cooldown.");
// Availability is exposed for the growth-block panel.
let stuck = createSimulation(IT);
stuck.cash = -100;
assert(getMetrics(stuck).growth.recovery.recoveryAvailable === true, "A stuck company should be offered a recovery contract.");

// --- Client reputation effects: satisfaction drives gameplay (#7) -------------
// Higher satisfaction → bigger project budgets, more referrals (shorter lead
// interval), and higher buyout offers than a lower-satisfaction company.
function repEffects(satisfaction) {
  return getClientReputationEffects({ clientSatisfaction: satisfaction });
}
const happy = repEffects(100);
const unhappy = repEffects(60);
assert(happy.budgetMultiplier > unhappy.budgetMultiplier, "Higher satisfaction should grant bigger project budgets.");
assert(happy.leadIntervalMultiplier < unhappy.leadIntervalMultiplier, "Higher satisfaction should shorten the lead interval (more referrals).");
assert(happy.offerPremium > unhappy.offerPremium, "Higher satisfaction should raise buyout offers.");
assert(happy.tier === "happy" && unhappy.tier === "unhappy", "Satisfaction tiers should classify happy vs unhappy.");

assert(repEffects(100).budgetMultiplier / repEffects(60).budgetMultiplier > 1.2, "Happy vs unhappy budget multiplier gap should be meaningful (>20%).");

// Offer amount reflects client reputation: a happy company's generated offer
// carries the satisfaction premium over baseline.
const offerEffectsHappy = getMetrics(Object.assign(createSimulation(IT), { clientSatisfaction: 100 })).clients;
assert(offerEffectsHappy.offerPct > 0, "A happy client base should report a positive offer premium.");
const offerEffectsUnhappy = getMetrics(Object.assign(createSimulation(IT), { clientSatisfaction: 60 })).clients;
assert(offerEffectsUnhappy.offerPct < 0, "An unhappy client base should report a negative offer premium.");

console.log(`Client system & recovery validation passed (${checks} checks).`);
