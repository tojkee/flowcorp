// Validates Expanded Government Gameplay (#19): Real Contract Bidding,
// Procurement Competition, Audits, and Compliance Events. Deterministic Node
// script. Run: npm run validate:gov
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { createSimulation, chooseDestiny, chooseStrategicDecision, tickSimulation } from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
// Government contracting is an Advanced-tier (Government Contractor) capability —
// the government path only unlocks for a company whose tier grants it.
const GOV_CO = COMPANY_TYPES.find((company) => company.id === "government-contractor");

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

function gov() {
  const g = chooseDestiny(mature(createSimulation(GOV_CO)), "government");
  g.legacyEvent = null; // dismiss the milestone overlay so events can generate
  return g;
}

function contractEvent(tender) {
  return {
    id: "tender",
    type: "govContractOffer",
    choices: ["bidAggressive", "bidStandard", "bidPremium", "declineContract"],
    tender,
  };
}

// A fresh government contractor has the expanded bidding + audit-history fields.
let base = gov();
assert(typeof base.compliance.contractsLost === "number", "Compliance tracks lost tenders.");
assert(typeof base.compliance.auditsFined === "number", "Compliance tracks audit history.");

// --- Procurement competition: a contract offer carries a tender ---------------
let offer = gov();
offer.strategicEventCooldown = 0;
offer.elapsed = 0; // govContractOffer is the first type in the rotation
offer = tickSimulation(offer, 0.2);
assert(offer.strategicEvent?.type === "govContractOffer", "A contract offer (tender) is generated for a contractor.");
assert(offer.strategicEvent.tender && offer.strategicEvent.tender.rivals >= 2, "The tender carries a procurement-competition rival field.");
assert(["low", "medium", "high"].includes(offer.strategicEvent.tender.competition), "The tender has a competition level.");

// --- Real contract bidding: win/lose against the competition ------------------
// Strong compliance + reputation, light competition → win.
let win = gov();
win.compliance.complianceScore = 85;
win.reputation = 85;
win.strategicEvent = contractEvent({ value: 60000, rivals: 2, competition: "low" });
const won = chooseStrategicDecision(win, "bidStandard");
assert(won.compliance.lastBid?.won === true, "A strong bid wins a low-competition tender.");
assert(won.compliance.nationalContracts === win.compliance.nationalContracts + 1, "Winning adds a national contract.");
assert(won.compliance.pendingPayment > 0, "A won contract schedules a delayed payment.");

// Weak position, fierce competition → lose; no contract, a small standing knock.
let lose = gov();
lose.compliance.complianceScore = 40;
lose.reputation = 40;
lose.strategicEvent = contractEvent({ value: 60000, rivals: 4, competition: "high" });
const lost = chooseStrategicDecision(lose, "bidPremium");
assert(lost.compliance.lastBid?.won === false, "A weak premium bid loses a fierce tender.");
assert(lost.compliance.nationalContracts === lose.compliance.nationalContracts, "A lost tender adds no contract.");
assert(lost.compliance.contractsLost === 1, "A lost tender is recorded.");

// Bid stance matters: against the same tender, an aggressive bid wins where a
// premium bid loses (procurement competition + stance decide the outcome).
function bidOutcome(stance) {
  let s = gov();
  s.compliance.complianceScore = 60;
  s.reputation = 60;
  s.strategicEvent = contractEvent({ value: 50000, rivals: 3, competition: "medium" });
  return chooseStrategicDecision(s, stance).compliance.lastBid.won;
}
assert(bidOutcome("bidAggressive") === true && bidOutcome("bidPremium") === false, "Bid stance changes the outcome on a borderline tender (aggressive wins, premium loses).");

// Stance payout tradeoff: a won premium bid pays more than a won aggressive bid.
function wonPayout(stance) {
  let s = gov();
  s.compliance.complianceScore = 95;
  s.reputation = 95;
  s.compliance.pendingPayment = 0;
  s.strategicEvent = contractEvent({ value: 60000, rivals: 2, competition: "low" });
  return chooseStrategicDecision(s, stance).compliance.pendingPayment;
}
assert(wonPayout("bidPremium") > wonPayout("bidAggressive"), "A premium win pays more than an aggressive win.");

// --- Compliance events --------------------------------------------------------
let cert = gov();
const beforeScore = cert.compliance.complianceScore;
const beforeCash = cert.cash;
cert.strategicEvent = { id: "cert", type: "govCertification", choices: ["pursueCertification", "skipCertification"] };
const certified = chooseStrategicDecision(cert, "pursueCertification");
assert(certified.compliance.complianceScore > beforeScore, "Pursuing certification raises the compliance score.");
assert(certified.cash < beforeCash, "Certification costs cash.");
assert(certified.compliance.auditRisk < cert.compliance.auditRisk, "Certification lowers audit risk.");

let blow = gov();
blow.strategicEvent = { id: "wb", type: "govWhistleblower", choices: ["investigateReport", "downplayReport"] };
const downplayed = chooseStrategicDecision(blow, "downplayReport");
assert(downplayed.compliance.auditRisk > blow.compliance.auditRisk, "Downplaying a whistleblower report raises audit risk.");
const investigated = chooseStrategicDecision(blow, "investigateReport");
assert(investigated.compliance.complianceScore > blow.compliance.complianceScore, "Investigating a report strengthens compliance.");

// --- Audits: fire on accumulated pressure, fine scales with the contract book -
function auditFine(contracts) {
  let s = gov();
  s.compliance.complianceScore = 20; // non-compliant → fined
  s.compliance.nationalContracts = contracts;
  s.compliance.auditRisk = 80;
  s.compliance.auditPressure = 15; // at the threshold → audit fires this tick
  s.cash = 1_000_000;
  const out = tickSimulation(s, 0.2);
  return out.compliance;
}
const smallBook = auditFine(1);
const bigBook = auditFine(8);
assert(smallBook.lastAudit === "fined" && smallBook.auditsFined === 1, "A non-compliant company is fined when an audit fires.");
assert(bigBook.lastFine > smallBook.lastFine, "Audit fines scale with the size of the contract book (exposure).");

// A compliant company passes its audit cleanly.
let pass = gov();
pass.compliance.complianceScore = 90;
pass.compliance.auditRisk = 80;
pass.compliance.auditPressure = 15;
const passed = tickSimulation(pass, 0.2);
assert(passed.compliance.lastAudit === "passed" && passed.compliance.auditsPassed === 1, "A compliant company passes the audit.");

console.log(`Expanded government gameplay validation passed (${checks} checks).`);
