// Player guidance layer: onboarding, clarity, and "what should I do next" help.
//
// This module is PURE — it only reads a simulation `state` (and the derived
// `metrics` from getMetrics) and returns plain data. simulation.js owns the
// (immutable) mutations: granting goal rewards and emergency funding happen in
// the tick via the helpers exported here so they persist and fire once.
//
// It powers the onboarding & anti-stuck systems described in ARCHITECTURE.md
// ("Player Guidance & Onboarding"): the CEO Advisor, the Income Breakdown, the
// Goal system, the Next-Unlock view, the early-game Safety Net, and the
// Growth-Block diagnostics / alternative solutions / economic recovery.

// --- Tunables -------------------------------------------------------------

const CRITICAL_CASH = 0;
const LOW_CASH = 400; // mirrors notifications.LOW_CASH_THRESHOLD intent
const IDLE_UTIL_THRESHOLD = 0.4; // below this a department is "paying for idle capacity"

// Early-game safety net: a one-time-ish cash injection so a new player cannot
// soft-lock in their first session. Bounded and only while still early.
export const EMERGENCY_CASH_THRESHOLD = 300;
export const EMERGENCY_GRANT = 1200;
export const MAX_EMERGENCY_FUNDS = 3;
export const EMERGENCY_COOLDOWN_SECONDS = 60;

// Founder Loan: a player-triggered recovery that gives cash now and is repaid
// with interest over time (helps, but does not remove consequences). Always
// available when soft-locked, so the game is never permanently unwinnable.
export const FOUNDER_LOAN_AMOUNT = 3000;
export const FOUNDER_LOAN_INTEREST = 0.3; // repay 1.3x
export const FOUNDER_LOAN_REPAY_PER_SEC = 20;
export const MAX_LOANS = 3;

// Intake throttle: a free alternative to spending — slow incoming work so an
// overloaded department's queue can drain (at the cost of less revenue).
export const INTAKE_THROTTLE_FACTOR = 2.2;

// Recovery contract: a special high-value contract that restores momentum when
// stuck — a small upfront advance plus a couple of lucrative leads to deliver.
// Unlike the loan (debt) or grant (free cash), it gives paying work. Bounded.
export const RECOVERY_CONTRACT_ADVANCE = 600;
export const RECOVERY_CONTRACT_LEADS = 2;
export const RECOVERY_CONTRACT_VALUE_MULT = 6;
export const RECOVERY_CONTRACT_COOLDOWN_SECONDS = 90;
export const MAX_RECOVERY_CONTRACTS = 3;

// --- Income breakdown -----------------------------------------------------

// Explains where money comes from and what is limiting it, in $/min.
// net = grossIncome - expenses (the real arithmetic). The `losses` list is
// diagnostic (why income isn't higher / where money is wasted), not subtracted
// again from net.
export function getIncomeBreakdown(state, metrics, advisor = null) {
  const avgPayout = state.completedTasks > 0 ? state.revenue / state.completedTasks : state.companyType.baseTaskValue;
  const grossIncome = Math.max(0, metrics.throughputPerMinute * avgPayout);
  const expenses = metrics.expensePerSecond * 60;
  const expenseModifier = state.modifiers?.expense ?? 1;

  // Each department's share of recent throughput → its share of the income flow.
  const windows = state.departments.map((d) => d.throughputWindow?.length ?? 0);
  const totalWindow = windows.reduce((sum, value) => sum + value, 0);
  const contributors = state.departments
    .map((department, index) => ({
      departmentId: department.id,
      amount: totalWindow > 0 ? grossIncome * (windows[index] / totalWindow) : 0,
    }))
    .filter((entry) => entry.amount > 0.5)
    .sort((a, b) => b.amount - a.amount);

  const losses = [];
  const bottleneck = metrics.bottleneck;
  if (metrics.bottleneckPenalty > 0 && bottleneck) {
    const retainedShare = Math.max(0.01, 1 - metrics.bottleneckPenalty);
    losses.push({ id: "bottleneck", departmentId: bottleneck.id, amount: grossIncome * metrics.bottleneckPenalty / retainedShare });
  }
  // Idle capacity: payroll spent on under-utilized departments (wasted money).
  let idle = 0;
  for (const department of state.departments) {
    const utilization = department.bottleneck?.utilization ?? 0;
    if (utilization < IDLE_UTIL_THRESHOLD) {
      const payrollPerMin = ((department.employees * department.employeeCost) / 20) * 60 * expenseModifier;
      idle += payrollPerMin * (1 - utilization);
    }
  }
  if (idle > 1) losses.push({ id: "idle", amount: idle });

  // Actual paid projects, grouped into adjacent one-minute windows. This is the
  // factual source for trend and top-earner messaging; the gross estimate above
  // remains the forward-looking throughput model.
  const recentRevenue = (state.recentRevenue ?? []).filter((entry) => state.elapsed - entry.time <= 120);
  const currentEvents = recentRevenue.filter((entry) => state.elapsed - entry.time <= 60);
  const previousEvents = recentRevenue.filter((entry) => {
    const age = state.elapsed - entry.time;
    return age > 60 && age <= 120;
  });
  const currentRevenue = currentEvents.reduce((sum, entry) => sum + entry.amount, 0);
  const previousRevenue = previousEvents.reduce((sum, entry) => sum + entry.amount, 0);
  const trend = getRevenueTrend(currentRevenue, previousRevenue, metrics);
  const topSource = getTopRevenueSource(currentEvents);

  const rankedLeaks = [...losses];
  if (grossIncome < expenses) rankedLeaks.push({ id: "operatingCosts", amount: expenses });
  rankedLeaks.sort((a, b) => b.amount - a.amount || (a.id === "operatingCosts" ? -1 : b.id === "operatingCosts" ? 1 : 0));
  const biggestLeak = rankedLeaks[0] ?? null;
  const bottleneckLoss = losses.find((loss) => loss.id === "bottleneck") ?? null;

  return {
    grossIncome,
    expenses,
    net: grossIncome - expenses,
    contributors,
    losses: losses.sort((a, b) => b.amount - a.amount),
    trend,
    topSource,
    biggestLeak,
    bottleneckImpact: bottleneckLoss
      ? { departmentId: bottleneckLoss.departmentId, amount: bottleneckLoss.amount, percent: Math.round(metrics.bottleneckPenalty * 100) }
      : null,
    actionEffect: getExpectedActionEffect(state, metrics, advisor),
  };
}

function getRevenueTrend(current, previous, metrics) {
  let direction = "waiting";
  if (current > 0 && previous <= 0) direction = "rising";
  else if (previous > 0) {
    const change = (current - previous) / previous;
    direction = change >= 0.1 ? "rising" : change <= -0.1 ? "falling" : "steady";
  }
  const reason = direction === "falling" && metrics.bottleneckPenalty > 0
    ? "bottleneck"
    : direction === "falling"
      ? "fewerPayments"
      : direction === "rising"
        ? "morePayments"
        : direction;
  return { direction, reason, current, previous };
}

function getTopRevenueSource(events) {
  const grouped = new Map();
  for (const entry of events) {
    const key = `${entry.clientId ?? "unknown"}:${entry.projectId ?? "unknown"}`;
    const current = grouped.get(key) ?? {
      clientId: entry.clientId,
      projectId: entry.projectId,
      amount: 0,
      projects: 0,
    };
    current.amount += entry.amount;
    current.projects += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.amount - a.amount)[0] ?? null;
}

function getExpectedActionEffect(state, metrics, advisor) {
  const action = advisor?.action;
  if (!action || action.type === "none" || action.type === "evolution") return null;
  const department = action.departmentId
    ? state.departments.find((entry) => entry.id === action.departmentId)
    : metrics.bottleneck;
  if (action.type === "hire" && department) {
    return { actionType: "hire", metric: "throughput", percent: hireGainPct(department), departmentId: department.id };
  }
  if (action.type === "rebalance" && metrics.bottleneck) {
    return {
      actionType: "rebalance",
      metric: "revenue",
      percent: Math.max(5, Math.round(metrics.bottleneckPenalty * 100)),
      departmentId: metrics.bottleneck.id,
    };
  }
  if (action.type === "automation" && metrics.nextAutomation) {
    return {
      actionType: "automation",
      metric: "throughput",
      percent: automationGainPct(metrics.bottleneck ?? state.departments[0], metrics.nextAutomation),
      toolId: metrics.nextAutomation.id,
    };
  }
  return null;
}

// --- CEO Advisor ----------------------------------------------------------

// Returns the single highest-priority recommendation as data the UI localizes.
// action.type maps to a GameScreen handler: hire / rebalance / automation /
// evolution / none. vars carry stable ids (departmentId, tool, stage) that the
// UI translates at render time.
export function getAdvisorRecommendation(state, metrics) {
  const bottleneck = metrics.bottleneck;
  const bottleneckState = bottleneck?.bottleneck;
  const impact = Math.round(metrics.bottleneckPenalty * 100);
  const hireCost = bottleneck ? metrics.hireCosts[bottleneck.id] ?? 0 : 0;

  // 1. Cash crisis — stop spending, earn first.
  if (metrics.cash < CRITICAL_CASH) {
    return { id: "cashCritical", tone: "critical", vars: {}, action: { type: "none" } };
  }

  // 2. Overloaded bottleneck — clear it (hire if affordable, else rebalance).
  if (bottleneckState?.isOverloaded) {
    if (metrics.cash >= hireCost) {
      return { id: "bottleneckHire", tone: "warning", vars: { department: bottleneck.id, impact }, action: { type: "hire", departmentId: bottleneck.id } };
    }
    return { id: "bottleneckRebalance", tone: "warning", vars: { department: bottleneck.id, impact }, action: { type: "rebalance" } };
  }

  // 3. Cash getting low (but not yet critical).
  if (metrics.cash < LOW_CASH) {
    return { id: "cashLow", tone: "warning", vars: {}, action: { type: "none" } };
  }

  // 4. Very early — teach where revenue comes from.
  if (state.completedTasks < 3) {
    return { id: "watchFlow", tone: "info", vars: {}, action: { type: "none" } };
  }

  // 5. Automation is affordable and a better next investment than a hire.
  if (metrics.nextAutomation && metrics.nextAutomation.affordable) {
    return { id: "automation", tone: "info", vars: { tool: metrics.nextAutomation.id }, action: { type: "automation" } };
  }

  // 6. A tight (but not yet overloaded) department — a hire should lift throughput.
  if (bottleneck && metrics.cash >= hireCost && (bottleneck.queue.length >= 3 || (bottleneckState?.utilization ?? 0) >= 0.85)) {
    return { id: "hireSuggest", tone: "info", vars: { department: bottleneck.id }, action: { type: "hire", departmentId: bottleneck.id } };
  }

  // 7. Healthy — push toward the next stage.
  return { id: "grow", tone: "good", vars: { stage: metrics.evolution.nextStageId ?? metrics.evolution.stageId }, action: { type: "evolution" } };
}

// --- Goal system ----------------------------------------------------------

function totalEmployees(state) {
  return state.departments.reduce((sum, department) => sum + department.employees, 0);
}

function startingEmployeeTotal(state) {
  return Object.values(state.companyType.startingEmployees ?? {}).reduce((sum, value) => sum + value, 0);
}

// Ordered onboarding goals: each teaches a system and rewards progress with
// cash (which also offsets the "I spent all my money" trap). Goals are
// achievable and complete in order; metric/target read state directly so the
// tick can evaluate them without full metrics.
// Each goal rewards cash and/or reputation. Cash offsets early overspending;
// reputation accelerates the next lifecycle stage, which is what unlocks new
// strategic paths/offers — so the reward set spans cash, reputation, and (via the
// objectives themselves: automation tier, Small Business stage) unlocks.
export const GOALS = [
  { id: "firstHire", cashReward: 400, reputationReward: 0, metric: totalEmployees, target: (state) => startingEmployeeTotal(state) + 1, format: "count" },
  { id: "serveClients", cashReward: 300, reputationReward: 4, metric: (state) => state.completedTasks, target: () => 8, format: "count" },
  { id: "unlockAutomation", cashReward: 600, reputationReward: 0, metric: (state) => state.ownedAutomations.length, target: () => 2, format: "count" },
  { id: "reachSmallBusiness", cashReward: 600, reputationReward: 6, metric: (state) => (state.reachedStages?.includes("small-business") ? 1 : 0), target: () => 1, format: "flag" },
  { id: "growRevenue", cashReward: 1200, reputationReward: 8, metric: (state) => Math.round(state.revenue), target: () => 25000, format: "money" },
];

// Repeatable micro-goals take over after the ordered starter chain. Each one
// captures a baseline when assigned, so progress is about the next small win
// rather than lifetime totals. Eligibility keeps situational goals actionable;
// completing projects is the universal fallback.
export const MICRO_GOALS = [
  {
    id: "completeProjects",
    cashReward: 300,
    reputationReward: 1,
    format: "count",
    eligible: () => true,
    create: (state) => ({ baseline: state.completedTasks, target: 3, progress: 0 }),
    metric: (state, active) => state.completedTasks - active.baseline,
  },
  {
    id: "keepSatisfaction",
    cashReward: 150,
    reputationReward: 3,
    format: "duration",
    eligible: (state) => (state.clientSatisfaction ?? 100) >= 85,
    create: () => ({ baseline: 0, target: 20, progress: 0 }),
    metric: (_state, active) => active.progress,
  },
  {
    id: "solveBottleneck",
    cashReward: 350,
    reputationReward: 1,
    format: "flag",
    eligible: (state) => state.departments.some((department) => department.bottleneck?.isOverloaded),
    create: (state) => ({ baseline: state.solvedBottlenecks ?? 0, target: 1, progress: 0 }),
    metric: (state, active) => (state.solvedBottlenecks ?? 0) - active.baseline,
  },
  {
    id: "reachPositiveProfit",
    cashReward: 250,
    reputationReward: 2,
    format: "flag",
    eligible: (state) => state.revenue - state.expenses <= 0 && state.completedTasks > 0,
    create: () => ({ baseline: 0, target: 1, progress: 0 }),
    metric: (state) => (state.revenue - state.expenses > 0 ? 1 : 0),
  },
  {
    id: "resolveCeoSituation",
    cashReward: 200,
    reputationReward: 3,
    format: "flag",
    eligible: (state) => Boolean(state.ceoDecision),
    create: (state) => ({ baseline: state.resolvedCeoSituations ?? 0, target: 1, progress: 0 }),
    metric: (state, active) => (state.resolvedCeoSituations ?? 0) - active.baseline,
  },
];

const MICRO_GOAL_BY_ID = Object.fromEntries(MICRO_GOALS.map((goal) => [goal.id, goal]));

export function getActiveGoal(state) {
  const done = state.completedGoals ?? [];
  return GOALS.find((goal) => !done.includes(goal.id)) ?? null;
}

export function createNextMicroGoal(state) {
  const cursor = state.microGoalCursor ?? 0;
  const previousId = state.lastMicroGoalId ?? null;
  const candidates = MICRO_GOALS.filter((goal) => goal.eligible(state));
  const distinct = candidates.filter((goal) => goal.id !== previousId);
  const pool = distinct.length ? distinct : candidates;
  const goal = pool[cursor % pool.length] ?? MICRO_GOALS[0];
  return { id: goal.id, ...goal.create(state) };
}

export function advanceMicroGoal(state, dt) {
  const active = state.activeMicroGoal;
  if (!active || active.id !== "keepSatisfaction") return active;
  const holding = (state.clientSatisfaction ?? 100) >= 85;
  return { ...active, progress: holding ? active.progress + dt : 0 };
}

// UI view of the current goal: clamped current/target, reward, completion ratio.
export function getGoalView(state) {
  const starterGoal = getActiveGoal(state);
  const goal = starterGoal ?? MICRO_GOAL_BY_ID[state.activeMicroGoal?.id];
  if (!goal) return null;
  const active = starterGoal ? null : state.activeMicroGoal;
  const target = starterGoal ? goal.target(state) : active.target;
  const current = Math.min(starterGoal ? goal.metric(state) : goal.metric(state, active), target);
  return {
    id: goal.id,
    current,
    target,
    cashReward: goal.cashReward,
    reputationReward: goal.reputationReward ?? 0,
    format: goal.format,
    kind: starterGoal ? "starter" : "micro",
    ratio: target > 0 ? current / target : 1,
  };
}

// --- First-run mini-chapter -----------------------------------------------


function initialHireDone(state) {
  return totalEmployees(state) >= startingEmployeeTotal(state) + 1 || (state.completedGoals ?? []).includes("firstHire");
}

// A compact, non-blocking first-run chapter that teaches the core loop through
// live simulation milestones. It deliberately reuses existing actions (hire,
// automation sheet, Growth tab) and never mutates state itself.
export function getFirstRunChapter(state, metrics) {
  const bottleneck = metrics.bottleneck;
  const hireCost = bottleneck ? metrics.hireCosts[bottleneck.id] ?? 0 : 0;
  const hired = initialHireDone(state);

  // A new company now opens with work already flowing (see seedInitialPipeline),
  // so this opening beat is gated on "nothing has been PAID yet" rather than on
  // an empty pipeline — the player watches that first project reach Payment.
  if (!hired && state.completedTasks === 0) {
    return {
      id: "watchFirstWork",
      step: 1,
      total: 6,
      tone: "info",
      vars: {},
      action: { type: "none" },
    };
  }

  if (!hired) {
    const canHire = bottleneck && metrics.cash >= hireCost;
    return {
      id: canHire ? "hireBottleneck" : "findBottleneck",
      step: 2,
      total: 6,
      tone: canHire ? "warning" : "info",
      vars: { department: bottleneck?.id, cost: hireCost },
      action: canHire && bottleneck ? { type: "hire", departmentId: bottleneck.id } : { type: "none" },
    };
  }

  if (state.completedTasks === 0) {
    const queue = bottleneck?.queue.length ?? 0;
    return {
      id: queue > 0 ? "queueImproving" : "waitForPayment",
      step: 3,
      total: 6,
      tone: "good",
      vars: { department: bottleneck?.id, queue },
      action: { type: "none" },
    };
  }

  if (state.completedTasks < 2) {
    return {
      id: "firstPayment",
      step: 4,
      total: 6,
      tone: "good",
      vars: { amount: metrics.revenue },
      action: { type: "none" },
    };
  }

  if ((state.ownedAutomations?.length ?? 0) < 2) {
    return {
      id: "firstAutomation",
      step: 5,
      total: 6,
      tone: "info",
      vars: { tool: metrics.nextAutomation?.id },
      action: { type: "automation" },
    };
  }

  if (state.completedTasks < 8 || !state.reachedStages?.includes("small-business")) {
    return {
      id: "openGrowth",
      step: 6,
      total: 6,
      tone: "good",
      vars: { stage: metrics.evolution.nextStageId ?? metrics.evolution.stageId },
      action: { type: "evolution" },
    };
  }

  return null;
}

// Returns the active goal if its completion condition is now met (else null).
export function checkGoalCompletion(state) {
  const starterGoal = getActiveGoal(state);
  if (starterGoal && starterGoal.metric(state) >= starterGoal.target(state)) return { ...starterGoal, kind: "starter" };
  if (starterGoal || !state.activeMicroGoal) return null;
  const goal = MICRO_GOAL_BY_ID[state.activeMicroGoal.id];
  if (goal && goal.metric(state, state.activeMicroGoal) >= state.activeMicroGoal.target) return { ...goal, kind: "micro" };
  return null;
}

// --- Early-game safety net ------------------------------------------------

export function isEmergencyEligible(state) {
  const stillEarly = !state.reachedStages?.includes("growing-company");
  return stillEarly && state.cash < EMERGENCY_CASH_THRESHOLD && (state.emergencyFundsUsed ?? 0) < MAX_EMERGENCY_FUNDS;
}

// A founder loan can be taken when none is outstanding and the loan cap is not
// reached. Always offered when soft-locked, guaranteeing recoverability.
export function isLoanAvailable(state) {
  return (state.debt ?? 0) <= 0 && (state.loansTaken ?? 0) < MAX_LOANS;
}

// A recovery contract is available off cooldown and under the cap.
export function isRecoveryContractAvailable(state) {
  return (state.recoveryContractCooldown ?? 0) <= 0 && (state.recoveryContractsUsed ?? 0) < MAX_RECOVERY_CONTRACTS;
}

// --- Growth diagnostics, alternative solutions & recovery -----------------

// Approximate throughput gain (%) from adding one employee to a department.
// Diminishing with current size; clearly a rough "~%" estimate for the player.
function hireGainPct(department) {
  const capacity = Math.max(1, department.employees);
  return Math.max(8, Math.min(50, Math.round(100 / (capacity + 1))));
}

// Approximate throughput gain (%) from buying the next automation tool, summed
// from its speed / capacity / value effects.
function automationGainPct(department, automation) {
  if (!automation) return 0;
  let pct = Math.round(((automation.speedMultiplier ?? 1) - 1) * 100);
  if ((automation.capacityBonus ?? 0) > 0) pct += Math.round(100 / (Math.max(1, department.employees) + 1));
  if ((automation.valueMultiplier ?? 1) > 1) pct += Math.round(((automation.valueMultiplier ?? 1) - 1) * 100);
  return Math.max(5, Math.min(45, pct));
}

// 2–3 alternative ways to relieve the current bottleneck, each with cost and an
// estimated effect, so the player never assumes "hire" is the only option.
export function getBottleneckSolutions(state, metrics) {
  const department = metrics.bottleneck;
  if (!department) return [];
  const solutions = [];

  const hireCost = metrics.hireCosts[department.id] ?? 0;
  solutions.push({
    id: "hire",
    action: { type: "hire", departmentId: department.id },
    cost: hireCost,
    estimatePct: hireGainPct(department),
    affordable: metrics.cash >= hireCost,
    free: false,
  });

  const automation = metrics.nextAutomation;
  if (automation) {
    solutions.push({
      id: "automation",
      action: { type: "automation" },
      cost: automation.cost,
      toolId: automation.id,
      estimatePct: automationGainPct(department, automation),
      affordable: metrics.cash >= automation.cost,
      free: false,
    });
  }

  // Free options — relieve pressure without spending.
  solutions.push({
    id: "reduceWorkload",
    action: { type: "throttle" },
    cost: 0,
    estimatePct: null,
    affordable: true,
    free: true,
    active: Boolean(state.intakeThrottled),
  });
  solutions.push({ id: "wait", action: { type: "none" }, cost: 0, estimatePct: null, affordable: true, free: true });

  return solutions;
}

// True when the player has no affordable meaningful action and is losing money
// — the economic soft-lock the recovery systems must prevent from being terminal.
export function isSoftLocked(state, metrics) {
  const hireCosts = Object.values(metrics.hireCosts ?? {});
  const cheapestHire = hireCosts.length ? Math.min(...hireCosts) : Infinity;
  const cheapestAutomation = metrics.nextAutomation?.cost ?? Infinity;
  const cheapestAction = Math.min(cheapestHire, cheapestAutomation);
  return metrics.cash < cheapestAction && metrics.profit <= 0 && metrics.cash < LOW_CASH;
}

// "Why am I stuck?" — whether growth is blocked, the ranked constraints (with
// %-impact), the alternative solutions (with a recommendation), and the recovery
// options available.
export function getGrowthStatus(state, metrics) {
  const bottleneck = metrics.bottleneck;
  const overloaded = Boolean(bottleneck?.bottleneck?.isOverloaded);
  const penaltyPct = Math.round(metrics.bottleneckPenalty * 100);
  const income = metrics.incomeBreakdown;

  // Ranked growth blockers (biggest constraints first).
  const blockers = [];
  if (overloaded && penaltyPct > 0) blockers.push({ id: "bottleneck", departmentId: bottleneck.id, impactPct: penaltyPct });
  if (metrics.cash < LOW_CASH) {
    const shortfall = Math.max(0, 1 - Math.max(0, metrics.cash) / LOW_CASH);
    blockers.push({ id: "cashLow", impactPct: Math.max(4, Math.round(shortfall * 12)) });
  }
  const idleLoss = (income?.losses ?? []).find((loss) => loss.id === "idle");
  if (idleLoss && income.grossIncome > 0) {
    blockers.push({ id: "idle", impactPct: Math.max(3, Math.min(20, Math.round((idleLoss.amount / income.grossIncome) * 100))) });
  }
  blockers.sort((a, b) => b.impactPct - a.impactPct);

  const softlock = isSoftLocked(state, metrics);
  const blocked = overloaded || metrics.cash < LOW_CASH || softlock;

  const solutions = blocked && bottleneck ? getBottleneckSolutions(state, metrics) : [];
  if (solutions.length) {
    // Recommend the highest-estimate affordable purchase; otherwise a free option.
    const bestBuy = solutions
      .filter((solution) => !solution.free && solution.affordable)
      .sort((a, b) => (b.estimatePct ?? 0) - (a.estimatePct ?? 0))[0];
    const recommended = bestBuy || solutions.find((s) => s.id === "reduceWorkload") || solutions.find((s) => s.id === "wait");
    if (recommended) recommended.recommended = true;
  }

  return {
    blocked,
    reasonId: blockers[0]?.id ?? (overloaded ? "bottleneck" : null),
    departmentId: bottleneck?.id ?? null,
    blockers: blockers.slice(0, 3),
    solutions,
    recovery: {
      loanAvailable: isLoanAvailable(state),
      loanAmount: FOUNDER_LOAN_AMOUNT,
      recoveryAvailable: isRecoveryContractAvailable(state),
      softlock,
    },
  };
}

// The next capability the player is working toward: the next lifecycle stage and
// the single requirement that is currently the binding constraint, so there is
// always a meaningful near-term target with a reward.
export function getNextUnlock(state, metrics) {
  const evolution = metrics.evolution;
  if (!evolution?.nextStageId) return null;
  const unmet = (evolution.requirements ?? []).filter((req) => !req.met);
  const binding = unmet.sort((a, b) => a.current / a.target - b.current / b.target)[0] ?? null;
  return {
    kind: "stage",
    stageId: evolution.nextStageId,
    requirement: binding ? { key: binding.key, current: binding.current, target: binding.target } : null,
  };
}
