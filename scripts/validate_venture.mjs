// Validates the Venture Capital Layer (#23): Raise Capital, Dilution, Investor
// Expectations, and Board Influence. Deterministic Node script.
// Run: npm run validate:vc
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  acceptOffer,
  createSimulation,
  getCompanyEffects,
  getVentureEffects,
  getMetrics,
  isVentureRoundAvailable,
  raiseVentureRound,
  tickSimulation,
} from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
const IT = COMPANY_TYPES[0];

// A bootstrapped company starts fully owned, with neutral venture effects.
let s = createSimulation(IT);
assert(s.venture && s.venture.round === 0 && s.venture.founderEquity === 100, "A new company is bootstrapped (100% equity, no rounds).");
const neutral = getVentureEffects(s);
assert(neutral.leadInterval === 1 && neutral.expense === 1 && neutral.exitShare === 1, "No round raised → neutral venture effects.");
assert(isVentureRoundAvailable(s), "A bootstrapped company can raise a round.");

// --- Raise Capital ------------------------------------------------------------
let r1 = raiseVentureRound(s);
assert(r1.cash > s.cash, "Raising a round injects cash.");
assert(r1.venture.round === 1, "Raising advances the funding round.");
assert(r1.venture.raisedTotal === r1.cash - s.cash, "Raised total tracks the capital injected.");
assert(r1.venture.expectation > 0, "Raising sets an investor revenue expectation.");

// --- Dilution -----------------------------------------------------------------
assert(r1.venture.founderEquity < 100, "Raising dilutes founder equity.");
let r2 = raiseVentureRound(r1);
assert(r2.venture.founderEquity < r1.venture.founderEquity, "Each round dilutes further.");
// Dilution shrinks the founder's acquisition cash-out (vs a bootstrapped founder).
function acquisitionProceeds(sim) {
  const withOffer = { ...sim, activeOffer: { kind: "acquisition", amount: 100000, buyerId: "apex", reasons: ["growth"] } };
  return acceptOffer(withOffer).cash - sim.cash;
}
const dilutedShare = getVentureEffects(r2).exitShare;
assert(dilutedShare < 1 && Math.abs(acquisitionProceeds(r2) - Math.round(100000 * dilutedShare)) <= 1, "A diluted founder pockets only their equity share of an acquisition.");
assert(acquisitionProceeds(createSimulation(IT)) === 100000, "A bootstrapped founder keeps the full acquisition amount.");

// --- Board Influence ----------------------------------------------------------
assert(r2.venture.investorInfluence > r1.venture.investorInfluence, "Each round increases investor (board) influence.");
// Board influence pushes growth: a shorter lead interval via getCompanyEffects.
assert(getCompanyEffects(r2).leadInterval < getCompanyEffects(s).leadInterval, "Board influence shortens the lead interval (growth push).");
// Rounds are capped, and once investors hold control no more rounds are available.
let many = s;
for (let i = 0; i < 6; i += 1) many = raiseVentureRound(many);
assert(many.venture.round <= many.venture.round && many.venture.round === 4, "Funding rounds are capped at the maximum.");
assert(!isVentureRoundAvailable(many), "No further rounds once the cap / influence ceiling is reached.");

// Raising is unavailable once a destiny path is committed.
let committed = raiseVentureRound(createSimulation(IT));
committed.destinyPath = "merge";
assert(!isVentureRoundAvailable(committed), "Raising is blocked after committing to a destiny path.");

// --- Investor Expectations ----------------------------------------------------
// Missing the expectation builds pressure (and pressure raises the burn rate).
let miss = raiseVentureRound(createSimulation(IT));
miss.venture.expectation = 1e9; // impossible to meet
miss.venture.checkTimer = 0;
miss.revenue = 0;
const expenseBefore = getCompanyEffects(miss).expense;
miss = tickSimulation(miss, 0.2);
assert(miss.venture.pressure > 0, "Missing the investor expectation builds pressure.");
assert(getCompanyEffects(miss).expense > expenseBefore, "Investor pressure raises the burn rate (expense).");

// Meeting the expectation eases pressure and raises the bar.
let hit = raiseVentureRound(createSimulation(IT));
hit.venture.pressure = 40;
hit.venture.expectation = 1;
hit.venture.checkTimer = 0;
hit.revenue = 100000;
const prevExpectation = hit.venture.expectation;
hit = tickSimulation(hit, 0.2);
assert(hit.venture.pressure < 40, "Meeting the expectation eases investor pressure.");
assert(hit.venture.expectation > prevExpectation, "Investors raise the bar after a target is met.");

// --- Metrics view -------------------------------------------------------------
const view = getMetrics(r1).venture;
assert(view && view.founderEquity < 100 && typeof view.available === "boolean" && view.raiseAmount > 0, "Metrics expose the venture view.");

console.log(`Venture Capital validation passed (${checks} checks).`);
