// Career Tier progression regression suite. Verifies the data-driven tier system
// that gates "an entirely new level of business management" per company tier:
//   • Beginner companies expose NO investors, exits, M&A, IPO, government,
//     holding, or multi-company mechanics.
//   • Intermediate companies add investors + the exit options (sell / merge).
//   • Advanced companies add IPO / board / government / holding / multi-company.
//   • Capabilities are cumulative across tiers.
//   • Company unlock gating advances with the founder career (ventures + prestige).
//   • The founder graduation milestone is the Beginner-tier progression path.
//
// Deterministic + dependency-free, like the other validate_* scripts.

import { COMPANY_TYPES, COMPANY_TYPES_BY_ID } from "../src/data/companyTypes.js";
import {
  TIER_ORDER,
  companyHasCapability,
  getCompanyTier,
  getCompanyUnlockHint,
  getTierCapabilities,
  getUnlockedTierIndex,
  getVenturesCompleted,
  isCompanyUnlocked,
} from "../src/data/careerTiers.js";
import {
  createSimulation,
  getMetrics,
  graduateCompany,
  isVentureRoundAvailable,
} from "../src/core/simulation.js";
import { evaluateOfferGeneration, getEvolutionMetrics, getStageIndex } from "../src/core/evolution.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
function section(title) {
  console.log(`\n• ${title}`);
}

// Force a state to enterprise maturity so any tier-allowed strategic path/offer
// would be eligible if its tier granted the capability.
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
      department.staff.push({ id: `t_${nextId}`, departmentId: department.id, characterType: "black_employee" });
      nextId += 1;
    }
  }
  state.nextEmployeeId = nextId;
  return state;
}

const COFFEE = COMPANY_TYPES_BY_ID["coffee-shop"];
const DIGITAL = COMPANY_TYPES_BY_ID["digital-agency"];
const IT = COMPANY_TYPES_BY_ID["it-company"];
const TECH = COMPANY_TYPES_BY_ID["tech-startup"];
const ENTERPRISE = COMPANY_TYPES_BY_ID["enterprise-corp"];
const HOLDING = COMPANY_TYPES_BY_ID["holding-company"];
const FUND = COMPANY_TYPES_BY_ID["investment-fund"];
const GOV = COMPANY_TYPES_BY_ID["government-contractor"];

// =========================================================================
// 1. Tier classification + cumulative capabilities
// =========================================================================
section("1. Tier classification + cumulative capabilities");
{
  assert(getCompanyTier(COFFEE) === "beginner" && getCompanyTier(DIGITAL) === "beginner", "Coffee Shop + Digital Agency are Beginner");
  assert(getCompanyTier(IT) === "intermediate" && getCompanyTier(TECH) === "intermediate", "IT + Tech Startup are Intermediate");
  assert(["advanced"].includes(getCompanyTier(ENTERPRISE)) && getCompanyTier(GOV) === "advanced", "Enterprise + Government Contractor are Advanced");

  const beginnerCaps = new Set(getTierCapabilities("beginner"));
  const intermediateCaps = new Set(getTierCapabilities("intermediate"));
  const advancedCaps = new Set(getTierCapabilities("advanced"));
  assert([...beginnerCaps].every((c) => intermediateCaps.has(c)), "Intermediate includes every Beginner capability (cumulative)");
  assert([...intermediateCaps].every((c) => advancedCaps.has(c)), "Advanced includes every Intermediate capability (cumulative)");
  assert(TIER_ORDER.length === 3 && TIER_ORDER[0] === "beginner", "Three tiers, Beginner first");
}

// =========================================================================
// 2. Beginner tier exposes NONE of the late-game mechanics
// =========================================================================
section("2. Beginner tier locks investors/exits/M&A/IPO/government/holding");
{
  for (const company of [COFFEE, DIGITAL]) {
    for (const cap of ["investors", "exits", "ipo", "government", "board", "holding", "multiCompany", "productLaunch"]) {
      assert(!companyHasCapability(company, cap), `Beginner ${company.id} must NOT have capability '${cap}'`);
    }
    const m = mature(createSimulation(company));
    const evo = getEvolutionMetrics(m);
    assert(evaluateOfferGeneration(m, evo, getStageIndex(evo)) === null, `Beginner ${company.id} never receives buyout/merger offers`);
    assert(isVentureRoundAvailable(m) === false, `Beginner ${company.id} cannot raise venture capital`);
    const metrics = getMetrics(m);
    assert(metrics.evolution.paths.length === 0, `Beginner ${company.id} exposes no strategic paths`);
    assert(metrics.evolution.hasStrategicPaths === false, `Beginner ${company.id} flags no strategic paths`);
    assert(metrics.venture?.capable === false, `Beginner ${company.id} hides the venture panel`);
  }
}

// =========================================================================
// 3. Intermediate adds investors + exits (sell / merge), not IPO/government
// =========================================================================
section("3. Intermediate adds investors + exits");
{
  for (const company of [IT, TECH]) {
    assert(companyHasCapability(company, "investors"), `Intermediate ${company.id} has investors`);
    assert(companyHasCapability(company, "exits"), `Intermediate ${company.id} has exits`);
    assert(!companyHasCapability(company, "ipo"), `Intermediate ${company.id} must NOT have IPO`);
    assert(!companyHasCapability(company, "holding"), `Intermediate ${company.id} must NOT have holding`);
    const m = mature(createSimulation(company));
    const evo = getEvolutionMetrics(m);
    m.offerCooldown = 0;
    assert(evaluateOfferGeneration(m, evo, getStageIndex(evo)) !== null, `Intermediate ${company.id} can receive an exit offer`);
    assert(isVentureRoundAvailable(m) === true, `Intermediate ${company.id} can raise venture capital`);
    const ids = getMetrics(m).evolution.paths.map((p) => p.id);
    assert(ids.includes("sell") && ids.includes("merge"), `Intermediate ${company.id} exposes sell + merge paths`);
    assert(!ids.includes("ipo") && !ids.includes("government") && !ids.includes("holding"), `Intermediate ${company.id} hides advanced paths`);
  }
}

// =========================================================================
// 4. Advanced unlocks corporate strategy (IPO / board / government / holding)
// =========================================================================
section("4. Advanced unlocks corporate strategy");
{
  for (const cap of ["ipo", "government", "board", "holding", "multiCompany", "investmentFund"]) {
    assert(companyHasCapability(ENTERPRISE, cap), `Enterprise Corporation has capability '${cap}'`);
  }
  const empireProfile = { prestige: 600, founderExperience: 300, companiesSold: 3 };
  const ent = mature(createSimulation(ENTERPRISE, empireProfile));
  const unlocked = getMetrics(ent).evolution.unlockedPaths;
  assert(unlocked.includes("ipo"), "Advanced company can unlock the IPO path");
  assert(unlocked.includes("government"), "Advanced company can unlock the government path");
  assert(unlocked.includes("holding"), "Advanced company can unlock the holding path at prestige 5");
  assert(getCompanyTier(HOLDING) === "advanced" && getCompanyTier(FUND) === "advanced", "Holding Company + Investment Fund are Advanced");
}

// =========================================================================
// 5. Company unlock gating advances with the founder career
// =========================================================================
section("5. Company unlock gating advances with the founder career");
{
  const fresh = null;
  assert(getUnlockedTierIndex(fresh) === 0, "A brand-new founder has only the Beginner tier");
  assert(isCompanyUnlocked(COFFEE, fresh) && !isCompanyUnlocked(IT, fresh), "Fresh founder: Beginner unlocked, Intermediate locked");
  assert(getCompanyUnlockHint(IT, fresh)?.id === "ventures", "Locked Intermediate shows a ventures hint");

  const oneVenture = { companiesGraduated: 1 };
  assert(getVenturesCompleted(oneVenture) === 1, "Graduation counts as a completed venture");
  assert(getUnlockedTierIndex(oneVenture) === 1, "One completed company unlocks the Intermediate tier");
  assert(isCompanyUnlocked(IT, oneVenture) && !isCompanyUnlocked(ENTERPRISE, oneVenture), "One venture: Intermediate unlocked, Advanced locked");

  const twoVentures = { companiesSold: 1, companiesGraduated: 1 };
  assert(getUnlockedTierIndex(twoVentures) === 2, "Two completed companies unlock the Advanced tier");
  assert(isCompanyUnlocked(ENTERPRISE, twoVentures), "Two ventures unlock the Enterprise Corporation");
  assert(!isCompanyUnlocked(HOLDING, twoVentures), "Holding Company still needs the prestige-5 empire tier");
  assert(getCompanyUnlockHint(HOLDING, twoVentures)?.id === "prestige", "Locked Holding Company shows a prestige hint");

  const empire = { companiesSold: 3, prestige: 600 };
  assert(isCompanyUnlocked(HOLDING, empire) && isCompanyUnlocked(FUND, empire), "The prestige-5 empire unlocks Holding Company + Investment Fund");

  // A high-prestige veteran route (no completed companies) also unlocks tiers.
  assert(getUnlockedTierIndex({ prestige: 500 }) === 2, "A prestige-5 veteran unlocks Advanced even without exits");
}

// =========================================================================
// 6. Founder graduation is the Beginner progression path
// =========================================================================
section("6. Founder graduation milestone");
{
  const grown = mature(createSimulation(COFFEE));
  assert(getMetrics(grown).evolution.canGraduate === true, "A grown Beginner company can graduate");
  const after = graduateCompany(grown);
  assert(after.founderProfile.companiesGraduated === 1, "Graduation increments the graduated counter");
  assert(after.destinyPath === "graduated", "Graduation commits a 'graduated' destiny so offers stop");
  assert(after.legacyEvent?.type === "graduation", "Graduation raises the legacy transition overlay");
  assert(after.founderProfile.prestige > grown.founderProfile.prestige, "Graduation grants founder prestige");

  // An immature Beginner company cannot graduate yet.
  const young = createSimulation(COFFEE);
  assert(getMetrics(young).evolution.canGraduate === false, "A startup-stage company cannot graduate yet");
  // Graduation is one-shot (re-calling is a no-op once committed).
  const twice = graduateCompany(after);
  assert(twice.founderProfile.companiesGraduated === 1, "Graduation cannot be farmed (one-shot per company)");
}

console.log(`\nCareer-tier validation passed (${checks} checks).`);
