// Validates Department / Operations Managers (#11): hiring is gated and costs a
// salary; enabled policies automate hiring, automation, and rebalancing.
// Deterministic Node script. Run: npm run validate:managers
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  createSimulation,
  getMetrics,
  hireManager,
  isManagerAvailable,
  managerHireCost,
  tickSimulation,
  toggleManagerPolicy,
} from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];

// --- Availability is gated to the Small Business stage -----------------------
let s = createSimulation(IT);
assert(!isManagerAvailable(s), "Manager should be locked at startup.");
const lockedHire = hireManager(s);
assert(!lockedHire.manager.hired, "Hiring should be refused before the manager unlocks.");

// Unlock at small-business, then hire.
s.reachedStages = ["startup", "small-business"];
assert(isManagerAvailable(s), "Manager should unlock at the Small Business stage.");
s.cash = 50000;
const expBefore = getMetrics(s).expensePerSecond;
s = hireManager(s);
assert(s.manager.hired, "Hiring a manager should succeed when available and affordable.");
assert(s.cash === 50000 - managerHireCost(s), "Hiring should charge the upfront cost.");
assert(getMetrics(s).expensePerSecond > expBefore, "A hired manager should draw a recurring salary.");

// --- Auto-automate: the manager buys the next affordable tool ----------------
let auto = createSimulation(IT);
auto.reachedStages = ["startup", "small-business"];
auto.cash = 50000;
auto = hireManager(auto);
const toolsBefore = auto.manager ? auto.ownedAutomations.length : 0;
for (let i = 0; i < 60; i += 1) auto = tickSimulation(auto, 0.2);
assert(auto.ownedAutomations.length > toolsBefore, "Auto-automate should buy automation tools.");

// --- Auto-hire: the manager grows headcount when a bottleneck overloads ------
let hire = createSimulation(IT);
hire.reachedStages = ["startup", "small-business"];
hire.cash = 80000;
hire = hireManager(hire);
hire = toggleManagerPolicy(hire, "autoAutomate"); // isolate hiring from automation spend
const empBefore = hire.departments.reduce((n, d) => n + d.employees, 0);
for (let i = 0; i < 300; i += 1) hire = tickSimulation(hire, 0.2);
assert(hire.departments.reduce((n, d) => n + d.employees, 0) > empBefore, "Auto-hire should grow headcount at the bottleneck.");

// --- Policy toggle works and is respected ------------------------------------
let t = createSimulation(IT);
t.reachedStages = ["startup", "small-business"];
t.cash = 50000;
t = hireManager(t);
assert(t.manager.autoHire === true, "Policies default on when hired.");
t = toggleManagerPolicy(t, "autoHire");
assert(t.manager.autoHire === false, "Toggling a policy flips it.");
// A disabled-everything manager makes no operational changes.
let idle = createSimulation(IT);
idle.reachedStages = ["startup", "small-business"];
idle.cash = 80000;
idle = hireManager(idle);
idle = toggleManagerPolicy(idle, "autoHire");
idle = toggleManagerPolicy(idle, "autoRebalance");
idle = toggleManagerPolicy(idle, "autoAutomate");
const idleEmp = idle.departments.reduce((n, d) => n + d.employees, 0);
const idleTools = idle.ownedAutomations.length;
// Suppress the random dynamic-event stream (e.g. employeeQuit) and competitor
// events so this asserts only the manager's policies, not unrelated RNG.
for (let i = 0; i < 300; i += 1) {
  idle.dynamicEventCooldown = 1e9;
  idle.competitorCooldown = 1e9;
  idle = tickSimulation(idle, 0.2);
}
assert(idle.departments.reduce((n, d) => n + d.employees, 0) === idleEmp, "With auto-hire off, headcount is unchanged.");
assert(idle.ownedAutomations.length === idleTools, "With auto-automate off, no tools are bought.");

// --- Metrics expose the manager view -----------------------------------------
const view = getMetrics(s).manager;
assert(view.hired && typeof view.salaryPerSecond === "number" && typeof view.hireCost === "number", "Metrics should expose the manager view.");

console.log(`Department Managers validation passed (${checks} checks).`);
