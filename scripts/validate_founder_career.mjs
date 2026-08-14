// Validates Founder Traits (#21) and the Founder Skill Tree (#22).
// Deterministic Node script. Run: npm run validate:career
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { FOUNDER_SKILLS, FOUNDER_TRAITS, MAX_SKILL_LEVEL } from "../src/data/founderTraits.js";
import {
  createSimulation,
  getAutomationStatus,
  getCompanyEffects,
  getHireCost,
  getMetrics,
  upgradeFounderSkill,
} from "../src/core/simulation.js";
import {
  getFounderSkillEffects,
  getFounderSkillPoints,
  getFounderTraitEffects,
  getUnlockedTraits,
} from "../src/core/founderLegacy.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
const IT = COMPANY_TYPES[0];

// --- Founder Traits (#21) -----------------------------------------------------
assert(FOUNDER_TRAITS.length >= 4, "There is a founder-trait roster (visionary/operator/sales/financial).");

// A brand-new founder has no traits, so traits never change a first company.
let fresh = createSimulation(IT);
assert(getUnlockedTraits(fresh.founderProfile).length === 0, "A first-time founder has no traits unlocked.");
const neutralTrait = getFounderTraitEffects(fresh.founderProfile);
assert(neutralTrait.taskValue === 1 && neutralTrait.expense === 1 && neutralTrait.leadInterval === 1 && neutralTrait.speedMultiplier === 1, "No traits → neutral effects.");

// Traits unlock from career milestones and become real read-time bonuses.
let veteran = createSimulation(IT);
veteran.founderProfile.companiesFounded = 2; // visionary
veteran.founderProfile.companiesSold = 1; // salesExpert
veteran.founderProfile.mergersCompleted = 1; // operator
veteran.founderProfile.iposAchieved = 1; // financialGenius
const unlocked = getUnlockedTraits(veteran.founderProfile);
assert(["visionary", "operator", "salesExpert", "financialGenius"].every((id) => unlocked.includes(id)), "Career milestones unlock the matching traits.");
const traitFx = getFounderTraitEffects(veteran.founderProfile);
assert(traitFx.taskValue > 1, "Visionary raises project value.");
assert(traitFx.leadInterval < 1, "Sales Expert shortens the lead interval.");
assert(traitFx.expense < 1 && traitFx.speedMultiplier > 1, "Operator/Financial Genius lower costs and speed up work.");
// Traits feed the company effect hub.
const companyFx = getCompanyEffects(veteran);
assert(companyFx.taskValue > 1 && companyFx.expense < 1, "Unlocked traits flow into getCompanyEffects.");

// Each trait unlocks individually at its own milestone (spot-check Sales Expert).
let oneMilestone = createSimulation(IT);
oneMilestone.founderProfile.companiesSold = 1;
assert(getUnlockedTraits(oneMilestone.founderProfile).join() === "salesExpert", "Selling one company unlocks only Sales Expert.");

// --- Founder Skill Tree (#22) -------------------------------------------------
assert(FOUNDER_SKILLS.length === 4, "There are four founder skills.");

// Skill points are earned per founder level above 1, and the tree is inert until
// the player spends them.
let s = createSimulation(IT);
assert(getFounderSkillPoints(s.founderProfile).available === 0, "A level-1 founder has no skill points.");
const idleFx = getFounderSkillEffects(s.founderProfile);
assert(idleFx.hireCostMult === 1 && idleFx.startingCashMult === 1 && idleFx.automationCostMult === 1 && idleFx.offerMult === 1, "Unspent skills are neutral.");

// Prestige raises the derived founder level, granting points.
s.founderProfile.prestige = 350; // founder level 4 → 3 points
assert(getFounderSkillPoints(s.founderProfile).available === 3, "Founder level 4 grants 3 skill points.");

// Spending a point levels a skill and applies its effect (cheaper hires).
const hireBefore = getHireCost(s.departments[0], s);
let leveled = upgradeFounderSkill(s, "hiring");
assert(leveled.founderProfile.skills.hiring === 1, "Upgrading spends a point and raises the skill level.");
assert(getFounderSkillPoints(leveled.founderProfile).available === 2, "Available points drop after spending one.");
assert(getHireCost(leveled.departments[0], leveled) < hireBefore, "The Hiring skill makes hires cheaper.");

// Automation skill discounts tool costs (use a paid, higher-tier tool).
let autoSkilled = upgradeFounderSkill(s, "automation");
const paidTool = (sim) => getAutomationStatus(sim).find((tool) => tool.cost > 0);
assert(paidTool(autoSkilled).cost < paidTool(s).cost, "The Automation skill discounts tool costs.");

// Points are bounded: you cannot spend more than you have, and a skill caps out.
let drained = s;
for (let i = 0; i < 5; i += 1) drained = upgradeFounderSkill(drained, "fundraising");
assert(drained.founderProfile.skills.fundraising === 3 && drained.founderProfile.skills.fundraising <= MAX_SKILL_LEVEL, "A skill caps at MAX_SKILL_LEVEL and stops when points run out.");
assert(getFounderSkillPoints(drained.founderProfile).available === 0, "Spending is bounded by available points.");

// Fundraising raises the starting cash of a future company (persistent profile).
const richProfile = drained.founderProfile;
const poorProfile = s.founderProfile;
const richStart = createSimulation(IT, richProfile).cash;
const poorStart = createSimulation(IT, poorProfile).cash;
assert(richStart > poorStart, "The Fundraising skill increases a new company's starting cash.");

// Metrics expose the founder-career view.
const view = getMetrics(leveled).founderCareer;
assert(Array.isArray(view.traits) && view.skills && view.points, "Metrics expose the founder-career view (traits, skills, points).");

console.log(`Founder traits & skill tree validation passed (${checks} checks).`);
