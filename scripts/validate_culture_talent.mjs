// Validates Company Culture (#12) and Special Employees (#13).
// Deterministic Node script. Run: npm run validate:culture
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { CULTURES } from "../src/data/culture.js";
import { SPECIALISTS } from "../src/data/specialists.js";
import {
  chooseCulture,
  createSimulation,
  getCompanyEffects,
  getMetrics,
  hireSpecialist,
  specialistCost,
  tickSimulation,
} from "../src/core/simulation.js";
import { evaluateNotifications } from "../src/core/notifications.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];

// --- Company culture (#12): bonus + weakness via effects ---------------------
let s = createSimulation(IT);
const neutral = getCompanyEffects(s);
assert(neutral.taskValue === 1 && neutral.expense === 1, "No culture should be neutral.");
assert(CULTURES.length === 5, "There should be five cultures.");

// Each culture changes the effect bundle in some way (a real bonus/weakness).
for (const culture of CULTURES) {
  const after = getCompanyEffects(chooseCulture(s, culture.id));
  const changed = ["taskValue", "expense", "leadInterval", "speedMultiplier", "accuracyBonus", "satisfactionBonus"].some((k) => after[k] !== neutral[k]);
  assert(changed, `Culture ${culture.id} should change the company effects.`);
}

// Fast Growth shortens the lead interval; Cost Efficient lowers expenses.
assert(getCompanyEffects(chooseCulture(s, "fastGrowth")).leadInterval < 1, "Fast Growth should shorten the lead interval.");
assert(getCompanyEffects(chooseCulture(s, "costEfficient")).expense < 1, "Cost Efficient should lower expenses.");
// Re-picking replaces (never compounds).
let r = chooseCulture(s, "innovation");
r = chooseCulture(r, "quality");
assert(r.culture === "quality", "Re-picking a culture should replace the previous one.");
assert(getMetrics(r).culture.active === "quality", "Metrics should expose the active culture.");

// Culture unlocks its signature dynamic event into the pool.
// (innovation → breakthrough). Force events and confirm it can appear.
let inno = chooseCulture(createSimulation(IT), "innovation");
let sawSignature = false;
for (let i = 0; i < 400 && !sawSignature; i += 1) {
  inno.dynamicEventCooldown = 0; // force an event each loop
  inno = tickSimulation(inno, 0.2);
  if (inno.lastDynamicEvent?.type === "breakthrough") sawSignature = true;
}
assert(sawSignature, "An active culture's signature event should be able to fire.");
// A different culture's signature event should NOT fire for innovation.
let inno2 = chooseCulture(createSimulation(IT), "innovation");
let sawForeign = false;
for (let i = 0; i < 300; i += 1) {
  inno2.dynamicEventCooldown = 0;
  inno2 = tickSimulation(inno2, 0.2);
  if (["qualityAward", "growthSpurt", "efficiencyWin", "referralWave"].includes(inno2.lastDynamicEvent?.type)) sawForeign = true;
}
assert(!sawForeign, "Another culture's signature event must not fire.");

// --- Special employees (#13): rare availability + persistent perk ------------
assert(SPECIALISTS.length === 4, "There should be four special employees.");
// Availability is gated to Small Business.
let early = createSimulation(IT);
early.specialistCooldown = 0;
early = tickSimulation(early, 0.2);
assert(early.availableSpecialist === null, "No specialist should be offered before Small Business.");

let s2 = createSimulation(IT);
s2.reachedStages = ["startup", "small-business"];
s2.specialistCooldown = 0;
s2.cash = 200000;
s2 = tickSimulation(s2, 0.2);
assert(s2.availableSpecialist, "A specialist should be offered once established.");
assert(specialistCost(s2, s2.availableSpecialist) > 0, "An offered specialist has a signing cost.");

// Signing applies a persistent perk and clears the offer.
const offered = s2.availableSpecialist;
const before = getCompanyEffects(s2);
s2 = hireSpecialist(s2, offered);
assert(s2.specialHires.includes(offered), "Signing should add the specialist to the roster.");
assert(s2.availableSpecialist === null, "Signing should clear the current offer.");
const after = getCompanyEffects(s2);
const perkChanged = ["taskValue", "expense", "leadInterval", "speedMultiplier", "accuracyBonus", "satisfactionBonus"].some((k) => after[k] !== before[k]);
assert(perkChanged, "Signing a specialist should grant a persistent perk.");
// Cannot sign one that is not the current offer.
const sneaky = hireSpecialist(s2, "exGoogleEngineer");
assert(!sneaky.specialHires.includes("exGoogleEngineer") || s2.specialHires.includes("exGoogleEngineer"), "Cannot sign a specialist that is not currently offered.");

// A specialist offer raises a notification.
let n = createSimulation(IT);
n.availableSpecialist = "rockstarSales";
const items = evaluateNotifications(n, getMetrics(n), 10_000_000_000, {}).newItems;
const item = items.find((i) => i.ruleId === "specialistAvailable");
assert(item && item.vars.specialistId === "rockstarSales", "An available specialist should raise a specialistAvailable notification.");

console.log(`Culture & special employees validation passed (${checks} checks).`);
