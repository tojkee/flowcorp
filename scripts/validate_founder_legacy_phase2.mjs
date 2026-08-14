import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  acceptOffer,
  chooseAcquisitionPath,
  chooseDestiny,
  chooseStrategicDecision,
  createSimulation,
  getHireCost,
  getMetrics,
  negotiateOffer,
  tickSimulation,
} from "../src/core/simulation.js";
import { getPrestigeLevel, getPrestigeUnlockEffects } from "../src/core/founderLegacy.js";
import { evaluateOfferGeneration, getEvolutionMetrics, getStageIndex } from "../src/core/evolution.js";

// IPO / government / holding are Advanced-tier capabilities (see
// data/careerTiers.js), so those layers are exercised on the matching Advanced
// company. Acquisition/merger (exits) stay on the Intermediate companies below.
const ENTERPRISE = COMPANY_TYPES.find((company) => company.id === "enterprise-corp");
const GOV_CO = COMPANY_TYPES.find((company) => company.id === "government-contractor");
const HOLDING = COMPANY_TYPES.find((company) => company.id === "holding-company");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

let acquired = acceptOffer(withOffer(mature(createSimulation(COMPANY_TYPES[0])), "acquisition"));
assert(acquired.founderProfile.founderExperience > 0, "Acquisition should add founder experience.");
assert(acquired.founderProfile.legacyPoints > 0, "Acquisition should add legacy points.");
const transition = chooseAcquisitionPath(acquired, "transition");
assert(transition.acquisitionTransition, "Transition CEO choice should create transition objectives.");
const transitionDecision = chooseStrategicDecision(transition, "pushIntegration");
assert(transitionDecision.acquisitionTransition.systemsIntegration > transition.acquisitionTransition.systemsIntegration, "Transition choice should affect systems integration.");

const nextCompany = createSimulation(COMPANY_TYPES[1], acquired.founderProfile);
assert(nextCompany.reputation > 6, "New company should inherit starting reputation bonus.");
assert(nextCompany.cash > 4500, "New company should inherit legacy cash bonus.");

let merged = acceptOffer(withOffer(mature(createSimulation(COMPANY_TYPES[2])), "merger", 180000, "atlas"));
merged.legacyEvent = null;
merged.strategicEvent = { id: "merge_test", type: "mergeDepartments", choices: ["mergeDepartments", "keepBoth", "cutRedundancy"] };
const mergedDecision = chooseStrategicDecision(merged, "mergeDepartments");
assert(mergedDecision.integration.progress > merged.integration.progress, "Merger choice should affect integration progress.");
assert(mergedDecision.integration.duplicatedDepartments < merged.integration.duplicatedDepartments, "Merger choice should reduce duplicate departments.");
assert(typeof merged.integration.morale === "number", "Merger integration should track staff morale.");

// New merger event types (restructuring decision, leadership overlap) affect state.
merged.strategicEvent = { id: "r", type: "restructuring", choices: ["payoffDebt", "phasedRestructure", "deferRestructure"] };
const restructured = chooseStrategicDecision(merged, "payoffDebt");
assert(restructured.integration.restructuringDebt < merged.integration.restructuringDebt, "Restructuring choice should cut restructuring debt.");
merged.strategicEvent = { id: "l", type: "leadershipOverlap", choices: ["promoteOne", "coLeadership", "externalHire"] };
const coLed = chooseStrategicDecision(merged, "coLeadership");
assert(coLed.integration.morale > merged.integration.morale, "Co-leadership choice should raise morale.");
const promoted = chooseStrategicDecision(merged, "promoteOne");
assert(promoted.integration.cultureConflict > merged.integration.cultureConflict, "Promoting one leader should raise culture conflict.");

// Integration health feeds the live sim: high culture conflict + low morale drag
// throughput. Uses the Logistics flow (COMPANY_TYPES[4]) because it has no random
// QA-rejection branch, so completion counts are deterministic and the comparison
// isolates the integration drag.
function completedAfter(withIntegration) {
  let s = createSimulation(COMPANY_TYPES[4]);
  s.companyType = { ...s.companyType, leadInterval: 0.5 };
  if (withIntegration) {
    s.integration = { cultureConflict: 100, morale: 0, duplicatedDepartments: 0, restructuringDebt: 0, progress: 100 };
  }
  for (let i = 0; i < 60; i += 1) s = tickSimulation(s, 1);
  return s.completedTasks;
}
assert(completedAfter(true) < completedAfter(false), "Merger integration drag should reduce throughput.");

let ipo = chooseDestiny(mature(createSimulation(ENTERPRISE)), "ipo");
ipo.legacyEvent = null;
ipo.publicCompany.quarterTimer = 0;
ipo.strategicEventCooldown = 0;
ipo = tickSimulation(ipo, 1);
assert(ipo.strategicEvent?.type === "ipoQuarterReview", "IPO should generate quarterly review event.");
const ipoDecision = chooseStrategicDecision(ipo, "acceptQuarterPlan");
assert(ipoDecision.publicCompany.quarterTimer > 0, "IPO quarterly decision should reset quarter timer.");
assert(ipoDecision.publicCompany.stockPrice !== ipo.publicCompany.stockPrice, "IPO quarterly decision should affect stock price.");
// Strong quarter (revenue/profit/growth/reputation/no bottleneck) raises stock.
assert(ipoDecision.publicCompany.stockPrice > ipo.publicCompany.stockPrice, "A strong quarter should raise the stock price.");
assert(ipoDecision.publicCompany.lastQuarterScore === 5, "A fully strong quarter should meet all five criteria.");

// Weak quarter (misses target, unprofitable, negative growth, low reputation) drops stock.
let weakIpo = chooseDestiny(mature(createSimulation(ENTERPRISE)), "ipo");
weakIpo.legacyEvent = null;
weakIpo.publicCompany.quarterTimer = 0;
weakIpo.strategicEventCooldown = 0;
weakIpo.revenue = 1000;
weakIpo.expenses = 5000;
weakIpo.reputation = 20;
weakIpo.publicCompany.previousQuarterRevenue = 5000;
weakIpo = tickSimulation(weakIpo, 1);
const weakDecision = chooseStrategicDecision(weakIpo, "acceptQuarterPlan");
assert(weakDecision.publicCompany.stockPrice < weakIpo.publicCompany.stockPrice, "A weak quarter should lower the stock price.");
assert(weakDecision.publicCompany.shareholderConfidence < weakIpo.publicCompany.shareholderConfidence, "A weak quarter should reduce shareholder confidence.");

let government = chooseDestiny(mature(createSimulation(GOV_CO)), "government");
government.legacyEvent = null;
government.strategicEvent = { id: "gov_test", type: "govAuditNotice", choices: ["fullAuditPrep", "minimalAuditPrep"] };
const govDecision = chooseStrategicDecision(government, "fullAuditPrep");
assert(govDecision.compliance.auditRisk < government.compliance.auditRisk, "Government audit decision should reduce audit risk.");
assert(govDecision.compliance.complianceScore > government.compliance.complianceScore, "Government audit decision should improve compliance.");

// Government contract offer awards a delayed-payment contract when the bid wins
// the competitive tender (strong compliance + reputation vs a small rival field).
government.compliance.complianceScore = 85;
government.reputation = 85;
government.strategicEvent = {
  id: "gov_contract",
  type: "govContractOffer",
  choices: ["bidAggressive", "bidStandard", "bidPremium", "declineContract"],
  tender: { value: 60000, rivals: 2, competition: "low" },
};
const govContract = chooseStrategicDecision(government, "bidStandard");
assert(govContract.compliance.lastBid?.won === true, "A strong bid should win the competitive tender.");
assert(govContract.compliance.nationalContracts > government.compliance.nationalContracts, "Winning a tender should add a national contract.");
assert(govContract.compliance.pendingPayment > 0, "A won contract should schedule a delayed payment.");

// Delayed government payment lands in cash after its timer elapses.
let govPay = chooseDestiny(mature(createSimulation(GOV_CO)), "government");
govPay.legacyEvent = null;
govPay.compliance.pendingPayment = 50000;
govPay.compliance.paymentTimer = 2;
govPay.compliance.complianceScore = 80;
govPay.compliance.auditPressure = -1000; // keep audits out of this case
const cashBeforePay = govPay.cash;
govPay = tickSimulation(govPay, 3);
assert(govPay.compliance.pendingPayment === 0, "Pending contract payment should clear after the delay.");
assert(govPay.cash > cashBeforePay, "Delayed government payment should land in cash.");

// An audit fires under high audit risk and fines a non-compliant contractor.
// Employees are zeroed so the only cash movement is the audit fine (isolation).
let govAudit = chooseDestiny(mature(createSimulation(GOV_CO)), "government");
govAudit.legacyEvent = null;
for (const d of govAudit.departments) {
  d.employees = 0;
  d.staff = [];
  d.queue = [];
  d.active = [];
}
govAudit.tasks = [];
govAudit.compliance.complianceScore = 30;
govAudit.compliance.auditRisk = 90;
govAudit.compliance.auditPressure = 0;
const cashBeforeAudit = govAudit.cash;
let auditFired = false;
for (let i = 0; i < 200 && !auditFired; i += 1) {
  govAudit = tickSimulation(govAudit, 1);
  if (govAudit.compliance.lastAudit) auditFired = true;
}
assert(auditFired, "An audit should fire under sustained high audit risk.");
assert(govAudit.compliance.lastAudit === "fined", "A non-compliant contractor should be fined by the audit.");
assert(govAudit.cash < cashBeforeAudit, "A failed audit should reduce cash via a fine.");

const prestigeProfile = { ...acquired.founderProfile, prestige: 520, founderExperience: 220 };
const prestigeCompany = mature(createSimulation(HOLDING, prestigeProfile));
const unlocked = getMetrics(prestigeCompany).evolution.unlockedPaths;
assert(unlocked.includes("holding"), "Prestige level 5 should unlock Founder Portfolio path.");

// Section 9 — Founder Portfolio (holding) is an honest read-only asset ledger.
const holding = chooseDestiny(prestigeCompany, "holding");
assert(holding.portfolio?.unlocked, "Holding path should unlock the Founder Portfolio.");
const portfolioView = getMetrics(holding).evolution.portfolio;
assert(Array.isArray(portfolioView.assets) && portfolioView.assets.length >= 1, "Portfolio should list companies as assets.");
assert(portfolioView.assets.length === holding.founderProfile.companies.length, "Portfolio asset list should be derived live from the founder profile.");
assert(typeof portfolioView.totalValuation === "number", "Portfolio should report a total valuation summary.");
assert(portfolioView.assets.some((c) => c.id === portfolioView.activeCompanyId), "Portfolio should include the active company.");

// Section 2 — prestige unlocks affect gameplay.
const lowProfile = { prestige: 0, founderExperience: 0 };
const highProfile = { prestige: 500, founderExperience: 0 };
const lowStart = createSimulation(COMPANY_TYPES[0], lowProfile);
const highStart = createSimulation(COMPANY_TYPES[0], highProfile);
assert(getPrestigeLevel(highProfile) === 5, "Prestige 500 should be level 5.");
assert(highStart.reputation > lowStart.reputation, "Higher prestige should grant more starting reputation.");
assert(highStart.cash > lowStart.cash, "Higher prestige should grant a larger starting cash bonus.");
const dept = highStart.departments[0];
assert(
  getHireCost(dept, highStart) < getHireCost(dept, lowStart),
  "Prestige level 3+ elite managers should discount hiring.",
);

// Section 3 — founder experience accelerates prestige tier unlock pacing.
assert(getPrestigeLevel({ prestige: 90, founderExperience: 0 }) === 1, "90 prestige alone stays level 1.");
assert(getPrestigeLevel({ prestige: 90, founderExperience: 200 }) > 1, "Experience should push the prestige tier higher.");

// Section 2 — merger negotiation gated by prestige level 4.
const lowMerger = withOffer(mature(createSimulation(COMPANY_TYPES[0], lowProfile)), "merger", 120000, "nimbus");
lowMerger.activeOffer.negotiable = getPrestigeLevel(lowMerger.founderProfile) >= 4;
const lowMergerAfter = negotiateOffer(lowMerger);
assert(lowMergerAfter.activeOffer.amount === lowMerger.activeOffer.amount, "Low-prestige merger negotiation should not raise the offer.");
assert(getPrestigeUnlockEffects(highProfile).mergerNegotiation === true, "Prestige level 4+ should unlock merger negotiation.");

// Section 4 — negotiateTerms is a one-time choice (cannot be farmed).
let negotiated = chooseAcquisitionPath(acquired, "negotiateTerms");
assert(negotiated.legacyEvent.negotiated === true, "Negotiating terms should mark the event negotiated.");
const negotiatedTwice = chooseAcquisitionPath(negotiated, "negotiateTerms");
assert(negotiatedTwice.cash === negotiated.cash, "Repeated negotiation must not award more cash.");
assert(negotiatedTwice.founderProfile.prestige === negotiated.founderProfile.prestige, "Repeated negotiation must not award more prestige.");

// Section 5 — strategic offers respect destinyPath (no regeneration after a path).
const committed = mature(createSimulation(COMPANY_TYPES[0]));
committed.destinyPath = "merge";
const evo = getEvolutionMetrics(committed);
assert(
  evaluateOfferGeneration(committed, evo, getStageIndex(evo)) === null,
  "Offer generation must return null once a destiny path is committed.",
);

console.log("Founder Legacy Phase 2 validation passed.");
