// Validates the CEO Inbox (#8): everyday decision messages are generated and
// each choice mutates state. Deterministic Node script. Run: npm run validate:ceo
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { CEO_CHOICE_BY_ID, CEO_SITUATIONS } from "../src/data/ceoSituations.js";
import { chooseCeoDecision, createSimulation, getMetrics, tickSimulation } from "../src/core/simulation.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];

// --- A CEO decision is generated during normal play --------------------------
let s = createSimulation(IT);
let decision = null;
for (let i = 0; i < 600 && !decision; i += 1) {
  s = tickSimulation(s, 0.2);
  if (s.ceoDecision) decision = s.ceoDecision;
}
assert(decision, "A CEO decision should appear during normal play.");
assert(decision.choices.length >= 2, "A CEO decision should offer at least two choices.");
assert("ceoDecision" in getMetrics(s), "Metrics should expose the pending CEO decision.");

// --- Choosing applies consequences and clears the inbox slot ----------------
const choice = decision.choices[0];
const after = chooseCeoDecision(s, choice);
assert(after.ceoDecision === null, "Choosing should clear the pending decision.");
assert(after.ceoInboxCooldown > 0, "Choosing should start the inbox cooldown.");
assert(after.resolvedCeoSituations === 1, "Choosing should advance CEO-situation goal progress.");

// --- Each decision type's choices actually change state ----------------------
// Client complaint: compensate spends cash and lifts satisfaction.
let cc = createSimulation(IT);
cc.clientSatisfaction = 70;
cc.ceoDecision = { id: "cc", type: "clientComplaint", choices: ["compensateClient", "apologizeClient", "ignoreComplaint"] };
const cashBefore = cc.cash;
const comp = chooseCeoDecision(cc, "compensateClient");
assert(comp.cash < cashBefore, "Compensating a client should spend cash.");
assert(comp.clientSatisfaction > 70, "Compensating a client should raise satisfaction.");
// Ignoring drops satisfaction + reputation.
const ignored = chooseCeoDecision(cc, "ignoreComplaint");
assert(ignored.clientSatisfaction < 70, "Ignoring a complaint should lower satisfaction.");

// Employee request: approving a raise spends cash and raises reputation.
let er = createSimulation(IT);
er.ceoDecision = { id: "er", type: "employeeRequest", choices: ["approveRaise", "offerPerks", "denyRequest"] };
const repBefore = er.reputation;
const raised = chooseCeoDecision(er, "approveRaise");
assert(raised.cash < er.cash, "Approving a raise should spend cash.");
assert(raised.reputation > repBefore, "Approving a raise should raise reputation.");

// Investor question: investing in growth raises the taskValue modifier.
let iq = createSimulation(IT);
iq.ceoDecision = { id: "iq", type: "investorQuestion", choices: ["investGrowth", "focusProfit", "reassureInvestors"] };
const grown = chooseCeoDecision(iq, "investGrowth");
assert(grown.modifiers.taskValue > iq.modifiers.taskValue, "Investing in growth should raise the task-value modifier.");
const profit = chooseCeoDecision(iq, "focusProfit");
assert(profit.modifiers.expense < iq.modifiers.expense, "Focusing on profit should lower the expense modifier.");

// Manager recommendation: approving a change shortens the lead interval modifier.
let mr = createSimulation(IT);
mr.ceoDecision = { id: "mr", type: "managerRecommendation", choices: ["followManager", "declineManager"] };
const followed = chooseCeoDecision(mr, "followManager");
assert(followed.modifiers.leadInterval < mr.modifiers.leadInterval, "Following the manager should shorten the lead interval.");

// An invalid choice is a no-op (does not clear or mutate).
let safe = createSimulation(IT);
safe.ceoDecision = { id: "safe", type: "clientComplaint", choices: ["compensateClient"] };
const noop = chooseCeoDecision(safe, "notARealChoice");
assert(noop.ceoDecision !== null, "An invalid choice should not clear the decision.");

// --- Situation registry is declarative, compact, and includes narrative cards
const narrativeSituations = CEO_SITUATIONS.filter((situation) => situation.code);
assert(CEO_SITUATIONS.length >= 9, "The CEO Inbox should have a broad data-driven situation registry.");
assert(narrativeSituations.length >= 5, "The registry should include at least five narrative situation cards.");
assert(CEO_SITUATIONS.every((situation) => situation.choices.length >= 2 && situation.choices.length <= 3), "Every CEO situation should have 2-3 choices.");
assert(CEO_SITUATIONS.every((situation) => situation.choices.every((choice) => choice.effects && CEO_CHOICE_BY_ID[choice.id])), "Every choice should declare effects and be indexed.");

// Mature normal play rotates into a narrative situation, not only legacy cards.
let rotation = createSimulation(IT);
rotation.completedTasks = 12;
rotation.reputation = 20;
rotation.departments[0].employees += 1;
rotation.departments[0].staff.push({ id: "test_ceo", departmentId: rotation.departments[0].id, characterType: "black_employee" });
let sawNarrative = false;
for (let i = 0; i < 20 && !sawNarrative; i += 1) {
  rotation.ceoDecision = null;
  rotation.ceoInboxCooldown = 0;
  rotation.elapsed = i * 11;
  rotation = tickSimulation(rotation, 0.1);
  sawNarrative = Boolean(rotation.ceoDecision?.narrative);
}
assert(sawNarrative, "Eligible narrative situations should appear through the normal CEO Inbox rotation.");

// Archive Tape: publishing boosts reputation but damages trust and accelerates risk.
let archive = createSimulation(IT);
archive.clientSatisfaction = 90;
archive.dynamicEventCooldown = 75;
archive.ceoDecision = { id: "archive", type: "archiveTape", choices: ["containArchiveLeak", "callArchiveClient", "publishArchiveFirst"] };
const archiveResult = chooseCeoDecision(archive, "publishArchiveFirst");
assert(archiveResult.reputation > archive.reputation, "Publishing the archive should raise reputation.");
assert(archiveResult.clientSatisfaction < archive.clientSatisfaction, "Publishing the archive should damage client satisfaction.");
assert(archiveResult.dynamicEventCooldown < archive.dynamicEventCooldown, "Publishing the archive should make a future event arrive sooner.");

// Viral demand: accepting everything injects real work and strains morale.
let viral = createSimulation(IT);
viral.ceoDecision = { id: "viral", type: "viralDemand", choices: ["acceptViralDemand", "premiumViralDemand", "waitlistViralDemand"] };
const tasksBeforeViral = viral.tasks.length;
const viralResult = chooseCeoDecision(viral, "acceptViralDemand");
assert(viralResult.tasks.length >= tasksBeforeViral + 3, "Accepting viral demand should add three real projects to the pipeline.");
assert(viralResult.employeeHappiness < viral.employeeHappiness, "Accepting viral demand should lower morale.");

// Resignation: the named departure removes real operating capacity.
let resignation = createSimulation(IT);
resignation.departments[0].employees += 1;
resignation.departments[0].staff.push({ id: "test_departure", departmentId: resignation.departments[0].id, characterType: "woman_employee" });
resignation.ceoDecision = { id: "resignation", type: "keyResignation", choices: ["counterKeyEmployee", "promoteDeputy", "acceptResignation"] };
const employeesBeforeResignation = resignation.departments.reduce((sum, department) => sum + department.employees, 0);
const resignationResult = chooseCeoDecision(resignation, "acceptResignation");
assert(resignationResult.departments.reduce((sum, department) => sum + department.employees, 0) === employeesBeforeResignation - 1, "Accepting a resignation should remove one employee.");

// Invoice dispute: collections trades client trust for immediate cash.
let invoice = createSimulation(IT);
invoice.ceoDecision = { id: "invoice", type: "invoiceDispute", choices: ["refundInvoice", "sendAuditTrail", "collectInvoiceNow"] };
const invoiceResult = chooseCeoDecision(invoice, "collectInvoiceNow");
assert(invoiceResult.cash > invoice.cash, "Collecting a disputed invoice should add cash.");
assert(invoiceResult.clientSatisfaction < invoice.clientSatisfaction, "Collecting immediately should lower client satisfaction.");

console.log(`CEO Inbox validation passed (${checks} checks).`);
