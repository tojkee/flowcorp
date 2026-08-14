// Validates Expanded Merger Gameplay (#20): Department Integration, Leadership
// Conflicts, Corporate Politics, and Synergy Bonuses. Deterministic Node script.
// Run: npm run validate:merger
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  acceptOffer,
  chooseStrategicDecision,
  createSimulation,
  getCompanyEffects,
  tickSimulation,
} from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
const IT = COMPANY_TYPES[0];

function mature(state) {
  state.revenue = 420000;
  state.expenses = 100000;
  state.completedTasks = 120;
  state.reputation = 85;
  state.cash = 500000;
  let nextId = state.nextEmployeeId;
  for (const department of state.departments) {
    while (department.employees < 5) {
      department.employees += 1;
      department.staff.push({ id: `test_${nextId}`, departmentId: department.id, characterType: "black_employee" });
      nextId += 1;
    }
  }
  state.nextEmployeeId = nextId;
  return state;
}

function merge(company = IT) {
  const s = mature(createSimulation(company));
  s.activeOffer = { kind: "merger", amount: 200000, buyerId: "apex", reasons: ["growth"] };
  const m = acceptOffer(s);
  m.legacyEvent = null; // dismiss the merger milestone overlay so events can generate
  return m;
}

// A merged company has the expanded integration fields.
let base = merge();
assert(base.integration && typeof base.integration.synergy === "number", "Integration tracks synergy.");
assert(typeof base.integration.politics === "number", "Integration tracks corporate politics.");
assert(typeof base.integration.leadershipConflict === "number", "Integration tracks leadership conflict.");
assert(base.integration.integratedDepartments === 0, "No departments integrated yet at merger time.");

// --- Department Integration ---------------------------------------------------
let di = merge();
di.strategicEvent = { id: "md", type: "mergeDepartments", choices: ["mergeDepartments", "keepBoth", "cutRedundancy"] };
const integrated = chooseStrategicDecision(di, "mergeDepartments");
assert(integrated.integration.integratedDepartments === 1, "Merging a duplicate department counts an integration.");
assert(integrated.integration.duplicatedDepartments === di.integration.duplicatedDepartments - 1, "Merging reduces the duplicate-department count.");
assert(integrated.integration.synergy > di.integration.synergy, "Integrating a department grants synergy.");

// A department also finishes integrating in the tick when its progress completes,
// counting an integration + synergy.
let prog = merge();
prog.integration.progress = 99.9;
prog.integration.cultureConflict = 0; // so progress advances fast
const beforeIntegrated = prog.integration.integratedDepartments;
prog = tickSimulation(prog, 1);
assert(prog.integration.integratedDepartments > beforeIntegrated, "A department that finishes integrating in the tick is counted.");

// --- Leadership Conflicts -----------------------------------------------------
let lc = merge();
lc.strategicEvent = { id: "lo", type: "leadershipOverlap", choices: ["promoteOne", "coLeadership", "externalHire"] };
const promoted = chooseStrategicDecision(lc, "promoteOne");
assert(promoted.integration.leadershipConflict < lc.integration.leadershipConflict, "Promoting one leader resolves the leadership conflict.");
assert(promoted.integration.politics > lc.integration.politics, "Sidelining a leader breeds resentment (more politics).");
const external = chooseStrategicDecision(lc, "externalHire");
assert(external.integration.leadershipConflict < lc.integration.leadershipConflict, "An outside hire defuses the leadership conflict.");

// --- Corporate Politics -------------------------------------------------------
let cp = merge();
cp.strategicEvent = { id: "cp", type: "corporatePolitics", choices: ["mediateFactions", "consolidatePower", "openForum"] };
const mediated = chooseStrategicDecision(cp, "mediateFactions");
assert(mediated.integration.politics < cp.integration.politics, "Mediating factions cuts corporate politics.");
assert(mediated.integration.morale > cp.integration.morale, "Mediation lifts morale.");
const consolidated = chooseStrategicDecision(cp, "consolidatePower");
assert(consolidated.integration.politics < cp.integration.politics && consolidated.integration.morale < cp.integration.morale, "Consolidating power cuts politics but costs morale.");

// Politics drifts toward the friction between the orgs (culture + leadership),
// so unresolved conflict breeds politics over time.
let drift = merge();
drift.integration.cultureConflict = 100;
drift.integration.leadershipConflict = 100;
drift.integration.politics = 20;
for (let i = 0; i < 200; i += 1) {
  drift.dynamicEventCooldown = 1e9;
  drift = tickSimulation(drift, 0.5);
}
assert(drift.integration.politics > 20, "Unresolved culture + leadership conflict breeds corporate politics.");

// --- Synergy Bonuses ----------------------------------------------------------
// A calm, well-integrated merger builds synergy, which becomes a read-time bonus
// (higher payout, lower costs, faster work).
function builtSynergy() {
  let s = merge(COMPANY_TYPES[4]);
  s.integration.cultureConflict = 5;
  s.integration.politics = 5;
  s.integration.leadershipConflict = 5;
  s.integration.morale = 90;
  s.integration.restructuringDebt = 0;
  s.integration.integratedDepartments = 3;
  for (let i = 0; i < 400; i += 1) {
    s.dynamicEventCooldown = 1e9;
    s = tickSimulation(s, 0.5);
  }
  return s;
}
const synergized = builtSynergy();
assert(synergized.integration.synergy > 60, "A calm, well-integrated merger builds significant synergy.");
const fx = getCompanyEffects(synergized);
assert(fx.taskValue > 1 && fx.expense < 1 && fx.speedMultiplier > 1, "Synergy is a real read-time bonus (payout up, costs down, faster work).");

// Synergy is neutral with no integration (it never helps a non-merged company).
const neutral = getCompanyEffects(createSimulation(IT));
assert(Math.abs(neutral.taskValue - 1) < 1e-9 && Math.abs(neutral.speedMultiplier - 1) < 1e-9, "No integration → no synergy effect.");

// A fresh merger has ~no synergy bonus yet, so the integration drag is felt first
// (the upside is earned, not automatic) — and it is clearly weaker than a built one.
const chaotic = getCompanyEffects(merge());
assert(Math.abs(chaotic.taskValue - 1) < 0.05, "A fresh merger has negligible synergy until it is earned.");
assert(chaotic.taskValue < fx.taskValue, "A built-synergy merger out-earns a fresh one.");

console.log(`Expanded merger gameplay validation passed (${checks} checks).`);
