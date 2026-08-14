// Gameplay validation checklist (Founder Legacy Phase 2, item 11).
//
// A deterministic, dependency-free runner (no test framework in the project)
// that verifies the eight required gameplay behaviours, one labelled section
// each. Run with `npm run validate:gameplay`. The deeper regression suites live
// in validate_founder_legacy_phase2.mjs (legacy/strategic layers) and
// validate_guidance.mjs (onboarding/anti-stuck).

import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  acceptOffer,
  chooseAcquisitionPath,
  chooseDestiny,
  chooseStrategicDecision,
  createSimulation,
  getHireCost,
  getMetrics,
  tickSimulation,
} from "../src/core/simulation.js";
import { getPrestigeLevel } from "../src/core/founderLegacy.js";
import { evaluateOfferGeneration, getEvolutionMetrics, getStageIndex } from "../src/core/evolution.js";

// IPO, government, and holding are Advanced-tier capabilities (see
// data/careerTiers.js), so those mechanics are exercised on the matching
// Advanced company rather than an Intermediate one.
const ENTERPRISE = COMPANY_TYPES.find((company) => company.id === "enterprise-corp");
const GOV_CO = COMPANY_TYPES.find((company) => company.id === "government-contractor");
const HOLDING = COMPANY_TYPES.find((company) => company.id === "holding-company");

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
function section(title) {
  console.log(`\n• ${title}`);
}

// --- Shared deterministic helpers -----------------------------------------

// Force a state to enterprise maturity so acquisition/IPO/government paths unlock.
function mature(state) {
  state.revenue = 420000;
  state.expenses = 100000;
  state.completedTasks = 120;
  state.reputation = 85;
  state.cash = 500000;
  state.ownedAutomations = ["spreadsheet", "crm", "task-tracker", "accounting-system"];
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

function withOffer(state, kind, amount = 250000, buyerId = "megacorp") {
  state.activeOffer = { id: `${kind}_${amount}`, kind, buyerId, amount, reasons: ["growth"], negotiable: true, negotiated: false };
  return state;
}

// =========================================================================
// 1. Prestige unlocks affect gameplay
// =========================================================================
section("1. Prestige unlocks affect gameplay");
{
  const low = createSimulation(COMPANY_TYPES[0], { prestige: 0, founderExperience: 0 });
  const high = createSimulation(COMPANY_TYPES[0], { prestige: 500, founderExperience: 0 });
  assert(getPrestigeLevel({ prestige: 500 }) === 5, "prestige 500 resolves to level 5");
  assert(high.reputation > low.reputation, "higher prestige grants more starting reputation");
  assert(high.cash > low.cash, "higher prestige grants more starting cash");
  assert(getHireCost(high.departments[0], high) < getHireCost(low.departments[0], low), "prestige 3+ discounts hiring (elite managers)");
  const unlocked = getMetrics(mature(createSimulation(HOLDING, { prestige: 520, founderExperience: 220 }))).evolution.unlockedPaths;
  assert(unlocked.includes("holding"), "prestige level 5 unlocks the Founder Portfolio path");
}

// =========================================================================
// 2. Founder experience persists (across companies)
// =========================================================================
section("2. Founder experience persists");
{
  const acquired = acceptOffer(withOffer(mature(createSimulation(COMPANY_TYPES[0])), "acquisition"));
  assert(acquired.founderProfile.founderExperience > 0, "an exit awards founder experience");
  const xp = acquired.founderProfile.founderExperience;
  const next = createSimulation(COMPANY_TYPES[1], acquired.founderProfile);
  assert(next.founderProfile.founderExperience === xp, "founder experience carries into the next company");
}

// =========================================================================
// 3. Acquisition choice outcomes work
// =========================================================================
section("3. Acquisition choice outcomes work");
{
  const acquired = acceptOffer(withOffer(mature(createSimulation(COMPANY_TYPES[0])), "acquisition"));
  const transition = chooseAcquisitionPath(acquired, "transition");
  assert(transition.acquisitionTransition, "‘stay as transition CEO’ creates transition objectives");
  const pushed = chooseStrategicDecision(transition, "pushIntegration");
  assert(pushed.acquisitionTransition.systemsIntegration > transition.acquisitionTransition.systemsIntegration, "a transition decision changes systems integration");

  const negotiated = chooseAcquisitionPath(acquired, "negotiateTerms");
  assert(negotiated.legacyEvent.negotiated === true, "negotiate-terms resolves the negotiation");
  const twice = chooseAcquisitionPath(negotiated, "negotiateTerms");
  assert(twice.cash === negotiated.cash, "negotiate-terms is one-time (cannot be farmed)");
}

// =========================================================================
// 4. Strategic offers respect destinyPath
// =========================================================================
section("4. Strategic offers respect destinyPath");
{
  const committed = mature(createSimulation(COMPANY_TYPES[0]));
  committed.destinyPath = "merge";
  const evo = getEvolutionMetrics(committed);
  assert(evaluateOfferGeneration(committed, evo, getStageIndex(evo)) === null, "no new offers once a destiny path is committed");
}

// =========================================================================
// 5. Merger event choices affect state
// =========================================================================
section("5. Merger event choices affect state");
{
  const merged = acceptOffer(withOffer(mature(createSimulation(COMPANY_TYPES[2])), "merger", 180000, "atlas"));
  merged.legacyEvent = null;
  merged.strategicEvent = { id: "m", type: "mergeDepartments", choices: ["mergeDepartments", "keepBoth", "cutRedundancy"] };
  const decided = chooseStrategicDecision(merged, "mergeDepartments");
  assert(decided.integration.progress > merged.integration.progress, "merging departments advances integration progress");
  assert(decided.integration.duplicatedDepartments < merged.integration.duplicatedDepartments, "merging departments reduces duplicate departments");

  merged.strategicEvent = { id: "l", type: "leadershipOverlap", choices: ["promoteOne", "coLeadership", "externalHire"] };
  const coLed = chooseStrategicDecision(merged, "coLeadership");
  assert(coLed.integration.morale > merged.integration.morale, "a culture/leadership choice changes morale");
}

// =========================================================================
// 6. IPO quarterly review changes stock / confidence
// =========================================================================
section("6. IPO quarterly review changes stock/confidence");
{
  // Strong quarter raises the stock price.
  let strong = chooseDestiny(mature(createSimulation(ENTERPRISE)), "ipo");
  strong.legacyEvent = null;
  strong.publicCompany.quarterTimer = 0;
  strong.strategicEventCooldown = 0;
  strong = tickSimulation(strong, 1);
  assert(strong.strategicEvent?.type === "ipoQuarterReview", "a quarterly review event is generated");
  const strongAfter = chooseStrategicDecision(strong, "acceptQuarterPlan");
  assert(strongAfter.publicCompany.stockPrice > strong.publicCompany.stockPrice, "a strong quarter raises the stock price");

  // Weak quarter lowers stock price and shareholder confidence.
  let weak = chooseDestiny(mature(createSimulation(ENTERPRISE)), "ipo");
  weak.legacyEvent = null;
  weak.publicCompany.quarterTimer = 0;
  weak.strategicEventCooldown = 0;
  weak.revenue = 1000;
  weak.expenses = 5000;
  weak.reputation = 20;
  weak.publicCompany.previousQuarterRevenue = 5000;
  weak = tickSimulation(weak, 1);
  const weakAfter = chooseStrategicDecision(weak, "acceptQuarterPlan");
  assert(weakAfter.publicCompany.stockPrice < weak.publicCompany.stockPrice, "a weak quarter lowers the stock price");
  assert(weakAfter.publicCompany.shareholderConfidence < weak.publicCompany.shareholderConfidence, "a weak quarter lowers shareholder confidence");
}

// =========================================================================
// 7. Government audit events affect compliance / reputation
// =========================================================================
section("7. Government audit events affect compliance/reputation");
{
  const gov = chooseDestiny(mature(createSimulation(GOV_CO)), "government");
  gov.legacyEvent = null;
  gov.strategicEvent = { id: "a", type: "govAuditNotice", choices: ["fullAuditPrep", "minimalAuditPrep"] };
  const repBefore = gov.reputation;
  const prepped = chooseStrategicDecision(gov, "fullAuditPrep");
  assert(prepped.compliance.auditRisk < gov.compliance.auditRisk, "full audit prep lowers audit risk");
  assert(prepped.compliance.complianceScore > gov.compliance.complianceScore, "full audit prep raises compliance score");
  assert(prepped.reputation > repBefore, "full audit prep improves reputation");
}

// =========================================================================
// 8. New company inherits bonuses correctly
// =========================================================================
section("8. New company inherits bonuses correctly");
{
  const baseline = createSimulation(COMPANY_TYPES[0]);
  const acquired = acceptOffer(withOffer(mature(createSimulation(COMPANY_TYPES[0])), "acquisition"));
  const next = createSimulation(COMPANY_TYPES[1], acquired.founderProfile);
  assert(next.reputation > baseline.reputation, "new company starts with bonus reputation");
  assert(next.cash > baseline.cash, "new company starts with bonus cash");
  assert(next.founderProfile.legacyBonuses.startingReputation >= 5, "legacy reputation bonus persists onto the new company");
}

console.log(`\nGameplay validation passed (${checks} checks).`);
