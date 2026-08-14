// Validates Expanded IPO Gameplay (#18): Board of Directors, Quarterly Guidance,
// Shareholder Votes, and Activist Investors. Deterministic Node script.
// Run: npm run validate:ipo
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  chooseDestiny,
  chooseStrategicDecision,
  createSimulation,
  tickSimulation,
} from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
// IPO is an Advanced-tier (Enterprise Corporation) capability — the IPO path
// only unlocks for a company whose tier grants it (see data/careerTiers.js).
const ENTERPRISE = COMPANY_TYPES.find((company) => company.id === "enterprise-corp");

// Force a company to enterprise maturity so the IPO path is reachable.
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

function goPublic() {
  const ipo = chooseDestiny(mature(createSimulation(ENTERPRISE)), "ipo");
  ipo.legacyEvent = null; // dismiss the IPO milestone overlay so events can generate
  return ipo;
}

// A fresh public company has the new governance fields.
let base = goPublic();
assert(typeof base.publicCompany.boardAlignment === "number", "Public company tracks board alignment.");
assert(base.publicCompany.guidance === "balanced", "Public company starts on balanced guidance.");
assert(base.publicCompany.activist === null, "No activist campaign at IPO.");

// --- Quarterly Guidance ------------------------------------------------------
let g = goPublic();
g.strategicEvent = { id: "g", type: "ipoGuidance", choices: ["guidanceConservative", "guidanceBalanced", "guidanceAggressive"] };
const aggressive = chooseStrategicDecision(g, "guidanceAggressive");
const conservative = chooseStrategicDecision(g, "guidanceConservative");
assert(aggressive.publicCompany.guidance === "aggressive", "Aggressive guidance sets the stance.");
assert(aggressive.publicCompany.quarterlyExpectation > conservative.publicCompany.quarterlyExpectation, "Aggressive guidance raises the quarterly target vs conservative.");
assert(aggressive.publicCompany.investorPressure > g.publicCompany.investorPressure, "Aggressive guidance raises investor pressure (higher stakes).");

// Guidance scales the quarterly-review swing: the same strong quarter rewards an
// aggressive guidance more than a conservative one (and the QuarterReview contract
// is preserved — a strong quarter raises the stock either way).
function strongQuarter(stance) {
  let s = goPublic();
  s.publicCompany.guidance = stance;
  s.publicCompany.quarterTimer = 0;
  s.strategicEventCooldown = 0;
  s = tickSimulation(s, 1);
  const before = s.publicCompany.stockPrice;
  const after = chooseStrategicDecision(s, "acceptQuarterPlan");
  return { before, after: after.publicCompany.stockPrice, score: after.publicCompany.lastQuarterScore };
}
const aggQuarter = strongQuarter("aggressive");
const conQuarter = strongQuarter("conservative");
assert(aggQuarter.after > aggQuarter.before && conQuarter.after > conQuarter.before, "A strong quarter raises the stock on any guidance (contract preserved).");
assert(aggQuarter.score === 5, "A fully strong quarter still meets all five criteria (contract preserved).");
assert(aggQuarter.after - aggQuarter.before > conQuarter.after - conQuarter.before, "Aggressive guidance amplifies the quarterly-review reward.");

// --- Board of Directors ------------------------------------------------------
// Board alignment drifts from market performance: a strong, confident company
// pulls it up, a weak/low-confidence one drags it down.
function boardDrift(confidence, profit) {
  let s = goPublic();
  s.publicCompany.boardAlignment = 55;
  s.publicCompany.shareholderConfidence = confidence;
  s.revenue = profit > 0 ? 400000 : 1000;
  s.expenses = profit > 0 ? 100000 : 9000;
  s.publicCompany.quarterTimer = 1e9; // avoid the review firing during the drift window
  for (let i = 0; i < 200; i += 1) s = tickSimulation(s, 0.5);
  return s.publicCompany.boardAlignment;
}
assert(boardDrift(90, 1) > 55, "A strong, confident company raises board alignment.");
assert(boardDrift(25, -1) < 55, "A weak, low-confidence company erodes board alignment.");

// A misaligned board calls a board meeting (a real decision), and a buyback
// realigns it.
let bm = goPublic();
bm.publicCompany.boardAlignment = 30;
bm.publicCompany.quarterTimer = 60;
bm.strategicEventCooldown = 0;
bm = tickSimulation(bm, 0.5);
assert(bm.strategicEvent?.type === "ipoBoardMeeting", "A misaligned board calls a board meeting.");
const realigned = chooseStrategicDecision(bm, "boardBuyback");
assert(realigned.publicCompany.boardAlignment > bm.publicCompany.boardAlignment, "A buyback realigns the board.");
assert(realigned.publicCompany.boardAlignment <= 100, "Board alignment stays bounded.");

// Granting a board seat is a control concession (tracked) that strongly realigns.
let seat = goPublic();
seat.strategicEvent = { id: "bm", type: "ipoBoardMeeting", choices: ["boardBuyback", "boardGrantSeat", "boardDefendStrategy"] };
const seated = chooseStrategicDecision(seat, "boardGrantSeat");
assert(seated.publicCompany.boardSeatsGranted === 1, "Granting a board seat is recorded as a concession.");

// --- Shareholder Votes -------------------------------------------------------
let vote = goPublic();
vote.strategicEvent = { id: "sv", type: "ipoShareholderVote", choices: ["backProposal", "negotiateProposal", "rejectProposal"] };
const cashBefore = vote.cash;
const backed = chooseStrategicDecision(vote, "backProposal");
assert(backed.cash < cashBefore, "Backing a shareholder proposal (a dividend) spends cash.");
assert(backed.publicCompany.shareholderConfidence > vote.publicCompany.shareholderConfidence, "Backing the proposal raises shareholder confidence.");
// Rejecting is a gamble: you lose face when confidence is weak.
let weakVote = goPublic();
weakVote.publicCompany.shareholderConfidence = 40;
weakVote.strategicEvent = { id: "sv2", type: "ipoShareholderVote", choices: ["backProposal", "negotiateProposal", "rejectProposal"] };
const lost = chooseStrategicDecision(weakVote, "rejectProposal");
assert(lost.publicCompany.shareholderConfidence < weakVote.publicCompany.shareholderConfidence, "Rejecting a proposal with weak confidence loses the vote (confidence drops).");

// --- Activist Investors ------------------------------------------------------
// Sustained high pressure + low confidence summons an activist.
let act = goPublic();
act.publicCompany.investorPressure = 82;
act.publicCompany.shareholderConfidence = 40;
act.publicCompany.activistTimer = 0;
act = tickSimulation(act, 0.2);
assert(act.publicCompany.activist && act.publicCompany.activist.demandId, "An activist emerges under sustained pressure + weak confidence.");

// The activist event is generated, and settling clears the campaign + relieves pressure.
act.strategicEventCooldown = 0;
act.publicCompany.quarterTimer = 60;
act = tickSimulation(act, 0.2);
assert(act.strategicEvent?.type === "ipoActivist", "An active activist generates an activist decision.");
const settled = chooseStrategicDecision(act, "appeaseActivist");
assert(settled.publicCompany.activist === null, "Settling with the activist clears the campaign.");
assert(settled.publicCompany.investorPressure < act.publicCompany.investorPressure, "Settling relieves investor pressure.");

// A proxy fight from a strong position defeats the activist; from a weak one it
// costs a board seat.
function proxyFight(boardAlignment, confidence) {
  let s = goPublic();
  s.publicCompany.activist = { demandId: "boardSeat" };
  s.publicCompany.boardAlignment = boardAlignment;
  s.publicCompany.shareholderConfidence = confidence;
  s.strategicEvent = { id: "a", type: "ipoActivist", choices: ["appeaseActivist", "fightActivist", "buybackActivist"] };
  return chooseStrategicDecision(s, "fightActivist");
}
const wonFight = proxyFight(80, 70);
const lostFight = proxyFight(30, 30);
assert(wonFight.publicCompany.activist === null && wonFight.publicCompany.shareholderConfidence > 70, "A proxy fight from strength defeats the activist and lifts confidence.");
assert(lostFight.publicCompany.boardSeatsGranted === 1, "Losing a proxy fight forces a board-seat concession.");

console.log(`Expanded IPO gameplay validation passed (${checks} checks).`);
