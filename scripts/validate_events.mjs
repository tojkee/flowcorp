// Validates Dynamic Events (#9) and Notification Expansion (#10).
// Deterministic Node script. Run: npm run validate:events
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { createSimulation, DYNAMIC_EVENTS, getMetrics, tickSimulation } from "../src/core/simulation.js";
import { evaluateNotifications } from "../src/core/notifications.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];
const eventsById = Object.fromEntries(DYNAMIC_EVENTS.map((e) => [e.type, e]));

// --- A dynamic event fires during play and is recorded -----------------------
let s = createSimulation(IT);
s.dynamicEventCooldown = 0;
s = tickSimulation(s, 0.2);
assert(s.lastDynamicEvent, "A dynamic event should fire when due.");
assert(typeof s.lastDynamicEvent.type === "string", "A dynamic event records its type.");
assert(["good", "bad"].includes(s.lastDynamicEvent.severity), "A dynamic event records a good/bad severity.");

// --- Each event covers the required examples and applies a real effect -------
for (const type of ["employeeQuit", "majorClientComplaint", "serverOutage", "viralSuccess", "negativePress", "industryBoom", "industryDownturn"]) {
  assert(eventsById[type], `Dynamic event "${type}" should exist.`);
}

// employeeQuit removes capacity
const eq = createSimulation(IT);
const empBefore = eq.departments.reduce((n, d) => n + d.employees, 0);
eventsById.employeeQuit.apply(eq);
assert(eq.departments.reduce((n, d) => n + d.employees, 0) < empBefore, "Employee Quit should reduce headcount.");

// majorClientComplaint lowers satisfaction
const mc = createSimulation(IT);
eventsById.majorClientComplaint.apply(mc);
assert(mc.clientSatisfaction < 100, "Major Client Complaint should lower client satisfaction.");

// serverOutage costs cash
const so = createSimulation(IT);
const cashBefore = so.cash;
eventsById.serverOutage.apply(so);
assert(so.cash < cashBefore, "Server Outage should cost cash.");

// viralSuccess injects leads and lifts reputation
const vs = createSimulation(IT);
const tasksBefore = vs.tasks.length;
const repBefore = vs.reputation;
eventsById.viralSuccess.apply(vs);
assert(vs.tasks.length > tasksBefore, "Viral Success should inject new client leads.");
assert(vs.reputation > repBefore, "Viral Success should raise reputation.");

// negativePress lowers reputation
const np = createSimulation(IT);
const npRep = np.reputation;
eventsById.negativePress.apply(np);
assert(np.reputation < npRep, "Negative Press should lower reputation.");

// --- Notification expansion (#10) --------------------------------------------
// NOW must exceed the longest cooldown (FIRE_ONCE_MS) so once-per-key rules fire
// from a fresh (empty) lastFired map.
const NOW = 10_000_000_000;
function fire(sim) {
  return evaluateNotifications(sim, getMetrics(sim), NOW, {}).newItems.map((i) => i.ruleId);
}

// Client at risk fires when satisfaction is low.
const risk = createSimulation(IT);
risk.clientSatisfaction = 70;
assert(fire(risk).includes("clientAtRisk"), "Low client satisfaction should raise a clientAtRisk notification.");
const safe = createSimulation(IT);
safe.clientSatisfaction = 100;
assert(!fire(safe).includes("clientAtRisk"), "A happy client base should not raise clientAtRisk.");

// Important decision available fires when a CEO decision is pending.
const dec = createSimulation(IT);
dec.ceoDecision = { id: "d1", type: "employeeRequest", choices: ["approveRaise"] };
assert(fire(dec).includes("decisionWaiting"), "A pending CEO decision should raise decisionWaiting.");

// Dynamic events surface as notifications, split by tone.
const bad = createSimulation(IT);
bad.lastDynamicEvent = { id: "x1", type: "employeeQuit", severity: "bad", at: 0 };
const badItems = evaluateNotifications(bad, getMetrics(bad), NOW, {}).newItems;
const badItem = badItems.find((i) => i.ruleId === "dynamicEventBad");
assert(badItem, "A bad dynamic event should raise a dynamicEventBad notification.");
assert(badItem.vars.eventType === "employeeQuit", "The dynamic-event notification carries the event type for localization.");

const good = createSimulation(IT);
good.lastDynamicEvent = { id: "x2", type: "viralSuccess", severity: "good", at: 0 };
assert(fire(good).includes("dynamicEventGood"), "A good dynamic event should raise a dynamicEventGood notification.");

console.log(`Dynamic events & notifications validation passed (${checks} checks).`);
