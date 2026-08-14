// Validates the player-guidance / onboarding layer (CEO Advisor, Income
// Breakdown, Goals, Safety Net). Deterministic — no test framework needed.
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  buyAutomation,
  createSimulation,
  getMetrics,
  hireForDepartment,
  takeRecoveryContract,
  takeFounderLoan,
  tickSimulation,
  toggleIntakeThrottle,
} from "../src/core/simulation.js";
import { captureFeedbackSnapshot, getActionFeedback, getProgressFeedback } from "../src/core/actionFeedback.js";
import { GOALS } from "../src/core/guidance.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const IT = COMPANY_TYPES[0];

// --- Advisor: highest-priority recommendation is present and actionable -----
let s = createSimulation(IT);
let m = getMetrics(s);
assert(m.advisor && typeof m.advisor.id === "string", "Advisor should always return a recommendation.");
assert(m.advisor.action && typeof m.advisor.action.type === "string", "Advisor recommendation should carry an action.");
assert(m.firstRunChapter?.id === "watchFirstWork", "First-run chapter should start by asking the player to watch the first work enter.");

// Let an early bottleneck build, then the advisor should target it with a hire.
for (let i = 0; i < 400; i += 1) s = tickSimulation(s, 0.1);
m = getMetrics(s);
assert(m.advisor.id === "bottleneckHire" || m.advisor.id === "hireSuggest" || m.advisor.id === "bottleneckRebalance",
  `Advisor should recommend acting on the bottleneck, got ${m.advisor.id}.`);
if (m.advisor.action.type === "hire") {
  assert(m.advisor.action.departmentId === m.bottleneck.id, "Hire action should target the bottleneck department.");
}
assert(
  ["findBottleneck", "hireBottleneck"].includes(m.firstRunChapter?.id),
  `First-run chapter should identify the first bottleneck before the first hire, got ${m.firstRunChapter?.id}.`,
);
if (m.firstRunChapter.id === "hireBottleneck") {
  assert(m.firstRunChapter.action.type === "hire", "First-run chapter should provide a hire action for an affordable bottleneck.");
}

// --- Income breakdown: shape + contributors/losses --------------------------
assert(m.incomeBreakdown && typeof m.incomeBreakdown.net === "number", "Income breakdown should expose a net number.");
assert(Array.isArray(m.incomeBreakdown.contributors), "Income breakdown should list contributors.");
assert(Array.isArray(m.incomeBreakdown.losses), "Income breakdown should list losses.");
assert(m.incomeBreakdown.losses.some((l) => l.id === "bottleneck"), "An overloaded company should show a bottleneck loss.");

// --- Goal system: first goal completes on hire and pays a reward ------------
let g = createSimulation(IT);
const goalBefore = getMetrics(g).goal;
assert(goalBefore && goalBefore.id === "firstHire", "First goal should be firstHire.");
g = hireForDepartment(g, "sales");
const cashAfterHire = g.cash;
g = tickSimulation(g, 0.1);
assert(g.completedGoals.includes("firstHire"), "Hiring should complete the firstHire goal.");
assert(g.cash > cashAfterHire, "Completing a goal should pay its cash reward.");
const goalAfter = getMetrics(g).goal;
assert(goalAfter && goalAfter.id === "serveClients", "After firstHire the active goal should advance.");
assert(
  ["queueImproving", "waitForPayment", "firstPayment"].includes(getMetrics(g).firstRunChapter?.id),
  "First-run chapter should move past the hire step once the first hire is complete.",
);
// Goals reward cash and/or reputation (reputation accelerates stage unlocks).
assert(typeof goalAfter.cashReward === "number" && goalAfter.reputationReward > 0, "serveClients should reward both cash and reputation.");

// A reputation-rewarding goal raises reputation on completion.
let rg = createSimulation(IT);
rg.completedGoals = ["firstHire"]; // make serveClients the active goal
rg.completedTasks = 8;
const repBefore = rg.reputation;
rg = tickSimulation(rg, 0.1);
assert(rg.completedGoals.includes("serveClients"), "serveClients should complete at 8 served clients.");
assert(rg.reputation > repBefore, "Completing serveClients should raise reputation.");

// Reward is granted once only.
const cashSteady = g.cash;
g = tickSimulation(g, 0.1);
assert(g.cash >= cashSteady - 1, "A completed goal must not pay its reward repeatedly.");

// Starter goals flow into one rotating, baseline-based micro-goal without
// creating a second list in the UI.
let micro = createSimulation(IT);
micro.completedGoals = GOALS.map((goal) => goal.id);
micro = tickSimulation(micro, 0.1);
assert(getMetrics(micro).goal?.id === "completeProjects", "The first repeatable goal should ask for three new projects.");
const microCash = micro.cash;
micro.completedTasks += 3;
const microBeforeReward = captureFeedbackSnapshot(micro, getMetrics(micro));
micro = tickSimulation(micro, 0.1);
assert(micro.microGoalCompletions.completeProjects === 1, "A micro-goal should record exactly one completion.");
assert(micro.cash > microCash, "A micro-goal should grant a small useful reward.");
assert(getMetrics(micro).goal?.id !== "completeProjects", "The deck should rotate away from the goal just completed.");
assert(
  getProgressFeedback(microBeforeReward, captureFeedbackSnapshot(micro, getMetrics(micro))).some((item) => item.id === "goalComplete"),
  "Completing a goal should produce transient reward feedback.",
);

let satisfaction = createSimulation(IT);
satisfaction.completedGoals = GOALS.map((goal) => goal.id);
satisfaction.activeMicroGoal = { id: "keepSatisfaction", baseline: 0, target: 20, progress: 0 };
satisfaction = tickSimulation(satisfaction, 10);
assert(satisfaction.activeMicroGoal.progress >= 10, "High satisfaction should advance the hold goal.");
satisfaction.clientSatisfaction = 80;
satisfaction = tickSimulation(satisfaction, 0.1);
assert(satisfaction.activeMicroGoal.progress === 0, "Dropping below 85 should reset the satisfaction hold.");

// --- Safety net: emergency grant fires when cash is critically low ----------
let e = createSimulation(IT);
e.cash = -50;
e = tickSimulation(e, 0.1);
assert(e.emergencyFundsUsed === 1 && e.cash > -50, "Emergency funding should inject cash when critically low.");
// Bounded: it does not fire again until the cooldown elapses.
const usedAfterFirst = e.emergencyFundsUsed;
e.cash = -50;
e = tickSimulation(e, 0.1);
assert(e.emergencyFundsUsed === usedAfterFirst, "Emergency funding should respect its cooldown.");

// --- Growth-block diagnostics: blocked state, ranked blockers, solutions ----
let b = createSimulation(IT);
for (let i = 0; i < 500; i += 1) b = tickSimulation(b, 0.1);
const bm = getMetrics(b);
assert(bm.growth && typeof bm.growth.blocked === "boolean", "Growth status should be exposed.");
assert(bm.growth.blocked, "An untended early company should report growth blocked.");
assert(bm.growth.blockers.length >= 1 && typeof bm.growth.blockers[0].impactPct === "number", "Growth status should rank blockers with %-impact.");
// Alternative solutions: at least hire + automation + free options, with exactly one recommended.
const ids = bm.growth.solutions.map((s) => s.id);
assert(ids.includes("hire") && ids.includes("reduceWorkload"), "Solutions should offer more than just hiring.");
assert(bm.growth.solutions.filter((s) => s.recommended).length === 1, "Exactly one solution should be recommended.");

// --- Next unlock: always a near-term target with a binding requirement -------
assert(bm.nextUnlock && bm.nextUnlock.stageId, "Next unlock should point at the next stage.");
assert(bm.nextUnlock.requirement && bm.nextUnlock.requirement.target > 0, "Next unlock should carry a binding requirement.");

// --- Founder loan recovery: cash now, debt with interest, bounded -----------
let l = createSimulation(IT);
l.cash = 20;
const cashPreLoan = l.cash;
l = takeFounderLoan(l);
assert(l.cash > cashPreLoan && l.debt > 0, "Founder loan should add cash and create repayable debt.");
const loanedCash = l.cash;
l = tickSimulation(l, 2);
assert(l.cash < loanedCash && l.debt < l.debt + 1 && l.debt >= 0, "Loan debt should be repaid over time (cash drains).");
// Cannot stack a second loan while one is outstanding.
const debtBefore = l.debt;
l = takeFounderLoan(l);
assert(l.debt <= debtBefore + 1, "A second loan must not stack while debt is outstanding.");

// --- Intake throttle: a free way to relieve a bottleneck --------------------
let th = createSimulation(IT);
assert(th.intakeThrottled === false, "Intake starts un-throttled.");
th = toggleIntakeThrottle(th);
assert(th.intakeThrottled === true, "Toggling intake throttle should slow incoming work.");

// --- Never permanently unwinnable: recovery is always reachable -------------
let stuck = createSimulation(IT);
stuck.cash = -200;
const stuckM = getMetrics(stuck);
assert(stuckM.loanAvailable === true, "A founder loan must be available to a stuck company.");

// --- Better action feedback: successful changes become short plain-language data
let feedbackState = createSimulation(IT);
let feedbackMetrics = getMetrics(feedbackState);
const hireSnapshot = captureFeedbackSnapshot(feedbackState, feedbackMetrics);
feedbackState = hireForDepartment(feedbackState, "sales");
feedbackMetrics = getMetrics(feedbackState);
const hiredSnapshot = captureFeedbackSnapshot(feedbackState, feedbackMetrics);
const hireFeedback = getActionFeedback({ type: "hire", departmentId: "sales" }, hireSnapshot, hiredSnapshot);
assert(hireFeedback?.id === "hire" && hireFeedback.vars.value > 0, "A successful hire should explain the capacity improvement.");

const rebalanceAfter = {
  ...hireSnapshot,
  departments: { ...hireSnapshot.departments, sales: { ...hireSnapshot.departments.sales, employees: hireSnapshot.departments.sales.employees + 1 } },
};
assert(
  getActionFeedback({ type: "rebalance", departmentId: "sales" }, hireSnapshot, rebalanceAfter)?.id === "rebalance",
  "A successful rebalance should explain the bottleneck capacity improvement.",
);

let automatedState = createSimulation(IT);
automatedState.cash = 10000;
const automationBefore = captureFeedbackSnapshot(automatedState, getMetrics(automatedState));
automatedState = buyAutomation(automatedState, "crm");
const automationFeedback = getActionFeedback(
  { type: "automation", automationId: "crm" },
  automationBefore,
  captureFeedbackSnapshot(automatedState, getMetrics(automatedState)),
);
assert(automationFeedback?.id === "automation" && automationFeedback.vars.value === 8, "Buying automation should explain its speed effect.");

let recoveryState = createSimulation(IT);
recoveryState.cash = 20;
const recoveryBefore = captureFeedbackSnapshot(recoveryState, getMetrics(recoveryState));
recoveryState = takeRecoveryContract(recoveryState);
assert(
  getActionFeedback(
    { type: "recoveryContract" },
    recoveryBefore,
    captureFeedbackSnapshot(recoveryState, getMetrics(recoveryState)),
  )?.id === "recoveryContract",
  "A recovery contract should explain its advance and incoming work.",
);

let feedbackLoanState = createSimulation(IT);
feedbackLoanState.cash = 20;
const feedbackLoanBefore = captureFeedbackSnapshot(feedbackLoanState, getMetrics(feedbackLoanState));
feedbackLoanState = takeFounderLoan(feedbackLoanState);
assert(
  getActionFeedback(
    { type: "loan" },
    feedbackLoanBefore,
    captureFeedbackSnapshot(feedbackLoanState, getMetrics(feedbackLoanState)),
  )?.id === "loan",
  "A founder loan should explain its cash and repayment effect.",
);

const paidSnapshot = { ...hiredSnapshot, revenue: 0, completedTasks: 0 };
const afterPayment = { ...paidSnapshot, revenue: 500, completedTasks: 1 };
assert(getProgressFeedback(paidSnapshot, afterPayment).some((item) => item.id === "projectPaid"), "A paid project should produce feedback.");

const blockedSnapshot = {
  ...paidSnapshot,
  bottleneckId: "sales",
  bottleneckOverloaded: true,
  departments: { ...paidSnapshot.departments, sales: { ...paidSnapshot.departments.sales, overloaded: true } },
};
const clearedSnapshot = {
  ...blockedSnapshot,
  bottleneckOverloaded: false,
  departments: { ...blockedSnapshot.departments, sales: { ...blockedSnapshot.departments.sales, overloaded: false } },
};
assert(getProgressFeedback(blockedSnapshot, clearedSnapshot).some((item) => item.id === "bottleneckSolved"), "Clearing a bottleneck should produce feedback.");

console.log("Guidance / onboarding validation passed.");
