import { AUTOMATIONS, AUTOMATION_BY_ID, AUTOMATION_ERA_INDEX, STARTER_AUTOMATION_IDS } from "../data/automations.js";
import { ACHIEVEMENT_IDS } from "../data/achievements.js";
import { CLIENTS, PROJECTS } from "../data/clients.js";
import { CULTURE_BY_ID } from "../data/culture.js";
import { SPECIALISTS, SPECIALIST_BY_ID } from "../data/specialists.js";
import { COMPETITORS, COMPETITOR_EVENTS } from "../data/competitors.js";
import { CEO_CHOICE_BY_ID, CEO_SITUATIONS, isCeoSituationEligible } from "../data/ceoSituations.js";
import { buildCompanyReport, captureCompanyReportSnapshot, COMPANY_REPORT_INTERVAL_SECONDS } from "./companyReport.js";
import {
  INDUSTRY_TRENDS,
  INDUSTRY_TREND_BY_ID,
  INDUSTRY_TREND_COOLDOWN_SECONDS,
  INDUSTRY_TREND_DURATION_SECONDS,
} from "../data/industryTrends.js";
import {
  EVOLUTION_STAGES,
  PATH_EFFECTS,
  STRATEGIC_PATHS,
  evaluateOfferGeneration,
  getCompanyValuation,
  getEvolutionMetrics,
  getOfferCooldownSeconds,
  getReputationTarget,
  getStageIndex,
  getStageProgress,
  getUnlockedPaths,
  OFFER_REJECT_COOLDOWN_SECONDS,
} from "./evolution.js";
import {
  advanceMicroGoal,
  checkGoalCompletion,
  createNextMicroGoal,
  EMERGENCY_COOLDOWN_SECONDS,
  EMERGENCY_GRANT,
  FOUNDER_LOAN_AMOUNT,
  FOUNDER_LOAN_INTEREST,
  FOUNDER_LOAN_REPAY_PER_SEC,
  getAdvisorRecommendation,
  getFirstRunChapter,
  getGoalView,
  getGrowthStatus,
  getIncomeBreakdown,
  getNextUnlock,
  INTAKE_THROTTLE_FACTOR,
  isEmergencyEligible,
  isLoanAvailable,
  isRecoveryContractAvailable,
  MAX_EMERGENCY_FUNDS,
  RECOVERY_CONTRACT_ADVANCE,
  RECOVERY_CONTRACT_COOLDOWN_SECONDS,
  RECOVERY_CONTRACT_LEADS,
  RECOVERY_CONTRACT_VALUE_MULT,
} from "./guidance.js";
import {
  addFounderProgress,
  applySkillUpgrade,
  getFounderSkillEffects,
  getFounderSkillPoints,
  getFounderTraitEffects,
  getLegacyBonusEffects,
  getPrestigeLevel,
  getPrestigeUnlockEffects,
  getPrestigeUnlocks,
  getUnlockedTraits,
  prepareFounderProfile,
  recordAcquisition,
  recordCompanyFounded,
  recordCompanySnapshot,
  recordGovernmentContractor,
  recordGraduation,
  recordIpo,
  recordMerger,
} from "./founderLegacy.js";
import { companyHasCapability, getCompanyTier } from "../data/careerTiers.js";

// Visual character variety only — character type never affects gameplay.
export const EMPLOYEE_CHARACTER_TYPES = ["black_employee", "red_employee", "woman_employee"];

const BASE_PROCESS_SECONDS = 6.6;
const MOVE_SECONDS = 1.25;
export const STARTING_CASH = 4_500;
const HIRE_BASE_COST = 400;
const HIRE_COST_PER_RATE = 10;
const HIRE_GROWTH = 0.15;
const AUTO_INVOICE_SPEEDUP = 2.1;
const QUEUE_HISTORY_SECONDS = 24;
const BOTTLENECK_QUEUE_THRESHOLD = 4;
const BOTTLENECK_UTILIZATION_THRESHOLD = 0.92;
const BOTTLENECK_GROWTH_THRESHOLD = 0.08;
const STRATEGIC_EVENT_COOLDOWN_SECONDS = 32;
// CEO Inbox: data-driven everyday messages and short narrative situation cards.
// One pending decision at a time, on a cooldown.
const CEO_INBOX_COOLDOWN_SECONDS = 45;
// Dynamic events: world events that happen TO the company (good and bad) on a
// cooldown, applied automatically and surfaced via a notification — reasons to
// return between sessions.
const DYNAMIC_EVENT_COOLDOWN_SECONDS = 75;
// Operations Manager: an optional hire that automates routine ops (auto-hire,
// auto-rebalance, auto-automate) so the player can focus on strategy. It draws a
// recurring salary and acts on a cadence, never spending below a cash buffer.
const MANAGER_HIRE_COST_MULT = 6; // upfront cost = baseTaskValue × this
const MANAGER_SALARY_RATE = 0.03; // recurring salary/sec = baseTaskValue × this
const MANAGER_ACTION_INTERVAL = 4; // seconds between automated actions
const MANAGER_CASH_BUFFER = 1500; // the manager never spends the company below this
// Special (rare star) employees: become available one at a time on a long
// cooldown once the company is established.
const SPECIALIST_COOLDOWN_SECONDS = 130;
// Employee happiness & retention: motivation (0..100) drifts toward a target set
// by burnout (overloaded departments) and growing salary expectations; the
// player counters it with raises/promotions. Low morale slows work and drives
// attrition (more frequent quits).
const SALARY_PRESSURE_RATE = 0.05; // salary expectations grow per second
const RAISE_HAPPINESS_BOOST = 22; // a raise lifts morale by this
const RAISE_COST_PER_HEAD = 0.5; // raise cost = baseTaskValue × this × headcount
// Competitor companies: a rival event stream that makes the world feel alive.
const COMPETITOR_COOLDOWN_SECONDS = 95;
// Market Share (#16): the company's share of its industry (0–100). It drifts
// toward a target set by the company's strength (reputation, throughput, stage)
// against a constant competitive headwind, shifted by the active industry trend.
// Higher share speeds lead generation, raises buyout valuations, and lifts the
// reputation target — so dominance compounds, but must be earned and defended.
const MARKET_COMPETITIVE_PRESSURE = 6; // rivals' constant pull on the share target
const MARKET_SHARE_DRIFT_RATE = 0.05; // EMA rate toward the target per second
const STARTING_MARKET_SHARE = 5;
// Venture Capital (#23): private funding rounds before committing to a destiny.
// Raising injects cash scaled by round + reputation, dilutes founder equity, and
// hands investors board influence + a revenue-growth expectation. Board influence
// pushes growth (faster leads); unmet expectations build pressure (higher burn);
// dilution shrinks the founder's share of an eventual acquisition cash-out.
const VENTURE_MAX_ROUNDS = 4;
const VENTURE_ROUND_NAMES = ["seed", "seriesA", "seriesB", "seriesC"]; // by round index
const VENTURE_DILUTION = [0.15, 0.13, 0.11, 0.1]; // fraction of remaining equity sold per round
const VENTURE_INFLUENCE_PER_ROUND = 18; // board influence gained per round
const VENTURE_INFLUENCE_CAP = 85; // above this, investors control — no more rounds
const VENTURE_CHECK_SECONDS = 60; // how often investors review growth expectations
const QUARTER_SECONDS = 75;
// Expanded IPO gameplay (#18): a public company is governed, not just graded.
// - Board of Directors: `boardAlignment` (0–100) is the board's confidence in the
//   CEO. It drifts from market performance; when it falls below the threshold the
//   board calls a meeting (a real decision) and low alignment also raises pressure.
// - Quarterly Guidance: the CEO sets a guidance stance that scales the quarterly
//   target and the size of the quarterly review's reward/penalty swing.
// - Activist Investors: sustained high pressure + low confidence summons an
//   activist with a demand; resolved by appease / proxy fight / buyback.
const BOARD_START_ALIGNMENT = 60;
const BOARD_MEETING_ALIGNMENT_THRESHOLD = 45;
const ACTIVIST_PRESSURE_THRESHOLD = 70;
const ACTIVIST_CONFIDENCE_THRESHOLD = 50;
const ACTIVIST_CHECK_SECONDS = 40;
const GUIDANCE_QUARTER_RATE = 0.25; // quarterly target ≈ revenue × this × stance multiplier
const GUIDANCE_MULTIPLIER = { conservative: 0.8, balanced: 1, aggressive: 1.25 };
const GUIDANCE_SWING = { conservative: 0.7, balanced: 1, aggressive: 1.4 }; // review reward/penalty scale
const ACTIVIST_DEMANDS = ["costCuts", "boardSeat", "buyback"];
const ACQUISITION_TRANSITION_SECONDS = 90;
// Founder graduation: the company must be at least this lifecycle stage (index 2
// = growing-company) before the founder can graduate from it. This makes the
// beginner→intermediate career step a reward for genuinely growing a company,
// not an instant skip.
const GRADUATE_MIN_STAGE = 2;
// Client project deadline window (from creation to final payment). Generous, so a
// healthy pipeline always delivers on time; only a backed-up (bottlenecked)
// company starts missing deadlines and losing client satisfaction.
const CLIENT_DEADLINE_SECONDS = 95;
// Government contractor pacing. National contracts pay on a delay (bureaucratic),
// and audits fire when accumulated audit pressure crosses a threshold. Pressure
// grows faster the higher the audit risk, so audits arrive sooner when the
// company is non-compliant. This is deterministic (no per-tick randomness) so it
// behaves identically online and during offline catch-up.
const GOV_PAYMENT_DELAY_SECONDS = 60;
const AUDIT_PRESSURE_THRESHOLD = 15;
const AUDIT_PASS_SCORE = 65;
// Expanded government gameplay (#19): national contracts are won through a real
// competitive tender, not handed over. Each tender has a rival field (procurement
// competition) that raises the bar; the win is decided deterministically from the
// bid stance + compliance + reputation, so it behaves identically online/offline.
// Bid stances trade win-chance against payout and audit risk.
const GOV_BID_WIN_BONUS = { bidAggressive: 18, bidStandard: 0, bidPremium: -12 };
const GOV_BID_PAYOUT_MULT = { bidAggressive: 0.8, bidStandard: 1, bidPremium: 1.35 };
const GOV_BID_RISK = { bidAggressive: 14, bidStandard: 8, bidPremium: 6 };
const GOV_TENDER_BASE_THRESHOLD = 45; // win when (compliance·0.4 + reputation·0.4 + stance) ≥ this + rivals·6
const GOV_TENDER_RIVAL_WEIGHT = 6;
// Typed per-company workflows. Each entry maps a department to the kind of token
// it produces and where that token goes next. A department with bugKind +
// reworkDepartmentId can reject work and route it back for rework.
const IT_FLOW = {
  sales: { outputKind: "requirement", nextDepartmentId: "analysis" },
  analysis: { outputKind: "development_task", nextDepartmentId: "development" },
  development: { outputKind: "development_task", nextDepartmentId: "qa" },
  qa: { outputKind: "invoice", nextDepartmentId: "accounting", bugKind: "bug", reworkDepartmentId: "development" },
  accounting: { outputKind: "payment", nextDepartmentId: "payment" },
};

// Lead -> Procurement -> Production -> Quality Control -> Warehouse -> Invoice -> Payment
const MANUFACTURING_FLOW = {
  sales: { outputKind: "requirement", nextDepartmentId: "procurement" },
  procurement: { outputKind: "development_task", nextDepartmentId: "production" },
  production: { outputKind: "development_task", nextDepartmentId: "quality-control" },
  "quality-control": { outputKind: "development_task", nextDepartmentId: "warehouse", bugKind: "bug", reworkDepartmentId: "production" },
  warehouse: { outputKind: "invoice", nextDepartmentId: "accounting" },
  accounting: { outputKind: "payment", nextDepartmentId: "payment" },
};

// Lead -> Dispatch -> Operations -> Tracking -> Support -> Invoice -> Payment
const LOGISTICS_FLOW = {
  sales: { outputKind: "requirement", nextDepartmentId: "dispatch" },
  dispatch: { outputKind: "development_task", nextDepartmentId: "operations" },
  operations: { outputKind: "development_task", nextDepartmentId: "tracking" },
  tracking: { outputKind: "support_ticket", nextDepartmentId: "support" },
  support: { outputKind: "invoice", nextDepartmentId: "accounting" },
  accounting: { outputKind: "payment", nextDepartmentId: "payment" },
};

const FLOWS = {
  "it-company": IT_FLOW,
  manufacturing: MANUFACTURING_FLOW,
  logistics: LOGISTICS_FLOW,
};

export function createSimulation(companyType, founderProfile = null) {
  let employeeCounter = 1;
  const preparedFounder = recordCompanyFounded(founderProfile, companyType);
  const legacyEffects = getLegacyBonusEffects(preparedFounder);
  const prestigeEffects = getPrestigeUnlockEffects(preparedFounder);

  const departments = companyType.departments.map((department, index) => {
    const lanePosition = getDepartmentPosition(index, companyType.departments.length);
    const count = companyType.startingEmployees[department.id] ?? 1;
    const staff = [];
    for (let i = 0; i < count; i += 1) {
      staff.push(makeEmployee(`emp_${employeeCounter}`, department.id));
      employeeCounter += 1;
    }

    return {
      ...department,
      ...lanePosition,
      employees: count,
      staff,
      queue: [],
      active: [],
      completed: 0,
      throughputWindow: [],
      queueHistory: [{ time: 0, size: 0 }],
      bottleneck: createBottleneckSnapshot({
        queueGrowthRate: 0,
        utilization: 0,
        severity: 0,
        completionSlowdown: 0,
        isOverloaded: false,
      }),
      totalWait: 0,
    };
  });

  return {
    companyType,
    departments,
    tasks: [],
    completedTasks: 0,
    // Bounded paid-project history powers accurate short-term money-flow
    // explanations without changing cumulative revenue or payout rules.
    recentRevenue: [],
    cash: Math.round(STARTING_CASH * legacyEffects.startingCashMultiplier * prestigeEffects.startingCashMultiplier * getFounderSkillEffects(preparedFounder).startingCashMult),
    revenue: 0,
    expenses: 0,
    elapsed: 0,
    leadTimer: 0,
    payrollTimer: 0,
    nextTaskId: 1,
    nextEmployeeId: employeeCounter,
    ownedAutomations: [...STARTER_AUTOMATION_IDS],
    // Achievements / celebration milestones (#5): unlocked ids + the most recent
    // (consumed once by the celebration overlay).
    achievements: [],
    lastAchievement: null,
    eventLog: ["Spreadsheet is installed."],
    // Company evolution (long-term lifecycle layer). Defaults keep the economy
    // neutral until the player commits to a destiny path.
    reputation: 6 + legacyEffects.startingReputation + prestigeEffects.startingReputationBonus,
    reachedStages: ["startup"],
    destinyPath: null,
    activeOffer: null,
    offerCooldown: 30,
    outcome: null,
    legacyEvent: null,
    strategicEvent: null,
    strategicEventCooldown: 18,
    acquisitionTransition: null,
    founderProfile: preparedFounder,
    publicCompany: null,
    integration: null,
    compliance: null,
    portfolio: null,
    // Player guidance / onboarding (see core/guidance.js).
    completedGoals: [],
    activeMicroGoal: null,
    microGoalCursor: 0,
    lastMicroGoalId: null,
    microGoalCompletions: {},
    solvedBottlenecks: 0,
    resolvedCeoSituations: 0,
    goalRewardSequence: 0,
    lastGoalReward: null,
    emergencyFundsUsed: 0,
    emergencyFundCooldown: 0,
    debt: 0,
    loansTaken: 0,
    intakeThrottled: false,
    recoveryContractsUsed: 0,
    recoveryContractCooldown: 0,
    // Client system (see data/clients.js): rolling client satisfaction.
    clientSatisfaction: 100,
    // CEO Inbox: pending everyday decision message (null when none).
    ceoDecision: null,
    ceoInboxCooldown: 25,
    // Recurring short-horizon company report. The baseline and pending report
    // persist so reloads cannot reset the cadence or lose an unread summary.
    companyReportTimer: COMPANY_REPORT_INTERVAL_SECONDS,
    companyReportBaseline: null,
    companyReport: null,
    companyReportSequence: 0,
    // Dynamic events: last world event that occurred (for notification), + cooldown.
    lastDynamicEvent: null,
    dynamicEventCooldown: 55,
    // Operations Manager: optional automation of routine ops (see updateManagers).
    manager: { hired: false, autoHire: true, autoRebalance: true, autoAutomate: true, actionTimer: 0 },
    // Company culture (chosen) + special star employees (rare hires).
    culture: null,
    specialHires: [],
    availableSpecialist: null,
    specialistCooldown: 90,
    // Employee happiness & retention.
    employeeHappiness: 85,
    salaryPressure: 0,
    // Competitor companies (rival event stream).
    lastCompetitorEvent: null,
    competitorCooldown: 65,
    // Market Share (#16): industry dominance (0–100), starts small for a startup.
    marketShare: STARTING_MARKET_SHARE,
    // Industry Trends (#17): the current industry climate (null = neutral), the
    // last activated trend (for notifications), and the neutral-gap cooldown.
    industryTrend: null,
    lastIndustryTrend: null,
    industryTrendCooldown: 60,
    // Venture Capital (#23): private funding rounds before any destiny path. The
    // founder owns 100% until they raise; raising injects cash but dilutes equity
    // and hands investors board influence + growth expectations.
    venture: {
      round: 0,
      founderEquity: 100,
      investorInfluence: 0,
      expectation: 0,
      raisedTotal: 0,
      pressure: 0,
      checkTimer: VENTURE_CHECK_SECONDS,
    },
    modifiers: { expense: 1, leadInterval: 1, taskValue: 1 },
  };
}

// An employee is a persistent visual entity. characterType is assigned once and
// kept for the employee's lifetime, including when moved between departments.
function makeEmployee(id, departmentId) {
  const characterType = EMPLOYEE_CHARACTER_TYPES[Math.floor(Math.random() * EMPLOYEE_CHARACTER_TYPES.length)];
  return { id, departmentId, characterType };
}

export function tickSimulation(state, dt) {
  const next = cloneState(state);
  const overloadedBefore = new Set(
    next.departments.filter((department) => department.bottleneck?.isOverloaded).map((department) => department.id),
  );
  next.elapsed += dt;
  next.recentRevenue = (next.recentRevenue ?? []).filter((entry) => next.elapsed - entry.time <= 120).slice(-80);
  next.leadTimer += dt;
  next.payrollTimer += dt;
  updateBottleneckSnapshots(next);

  const leadInterval = getLeadInterval(next);
  while (next.leadTimer >= leadInterval) {
    next.leadTimer -= leadInterval;
    enqueueNewTask(next);
  }

  for (const department of next.departments) {
    const capacity = getCapacity(next, department);
    while (department.queue.length > 0 && department.active.length < capacity) {
      const taskId = department.queue.shift();
      const task = next.tasks.find((item) => item.id === taskId);
      if (task) {
        task.status = "processing";
        task.departmentId = department.id;
        task.progress = 0;
        department.active.push(task.id);
      }
    }

    for (const taskId of [...department.active]) {
      const task = next.tasks.find((item) => item.id === taskId);
      if (!task) continue;

      task.progress += dt / getProcessingSeconds(next, department);
      if (task.progress >= 1) {
        department.active = department.active.filter((id) => id !== taskId);
        department.completed += 1;
        department.throughputWindow.push(next.elapsed);
        department.throughputWindow = department.throughputWindow.filter((time) => next.elapsed - time <= 60);
        moveTaskToNextStage(next, task, department);
      }
    }
  }

  const moveSpeed = getAutomationEffects(next).moveSpeedMultiplier;
  for (const task of next.tasks) {
    if (task.status !== "moving") continue;
    task.progress += (dt * moveSpeed) / MOVE_SECONDS;
    if (task.progress >= 1) {
      const target = getDepartmentById(next, task.targetDepartmentId);
      if (target) {
        task.status = "queued";
        task.departmentId = target.id;
        task.progress = 0;
        target.queue.push(task.id);
      } else {
        completeTask(next, task);
      }
    }
  }

  updateBottleneckSnapshots(next);
  const solvedNow = [...overloadedBefore].filter((id) => !getDepartmentById(next, id)?.bottleneck?.isOverloaded).length;
  if (solvedNow > 0) next.solvedBottlenecks = (next.solvedBottlenecks ?? 0) + solvedNow;

  if (next.payrollTimer >= 1) {
    const seconds = Math.floor(next.payrollTimer);
    next.payrollTimer -= seconds;
    const payroll = getExpensePerSecond(next) * seconds;
    next.cash -= payroll;
    next.expenses += payroll;
  }

  updateEvolution(next, dt);
  updateGuidance(next, dt);
  updateCeoInbox(next, dt);
  updateDynamicEvents(next, dt);
  updateManagers(next, dt);
  updateSpecialists(next, dt);
  updateHappiness(next, dt);
  updateCompetitors(next, dt);
  updateVenture(next, dt);
  updateCompanyReport(next, dt);
  updateAchievements(next);

  return next;
}

function updateCompanyReport(state, dt) {
  if (!state.companyReportBaseline) state.companyReportBaseline = captureCompanyReportSnapshot(state);
  if (state.companyReport) return;
  state.companyReportTimer = Math.max(0, (state.companyReportTimer ?? COMPANY_REPORT_INTERVAL_SECONDS) - dt);
  if (state.companyReportTimer > 0) return;

  const after = captureCompanyReportSnapshot(state);
  const sequence = (state.companyReportSequence ?? 0) + 1;
  state.companyReport = {
    id: `company_report_${sequence}`,
    sequence,
    ...buildCompanyReport(state.companyReportBaseline, after),
  };
  state.companyReportSequence = sequence;
  state.companyReportBaseline = after;
  state.companyReportTimer = COMPANY_REPORT_INTERVAL_SECONDS;
}

export function dismissCompanyReport(state) {
  const next = cloneState(state);
  next.companyReport = null;
  return next;
}

// Player-guidance mutations: grant goal rewards once and dispense the early-game
// safety net. Kept in the tick (not getMetrics) so rewards/funding persist and
// also apply during offline catch-up. Pure reads (advisor, income breakdown,
// goal view) are computed in getMetrics instead.
function updateGuidance(state, dt) {
  if (!getGoalView(state) && !state.activeMicroGoal) state.activeMicroGoal = createNextMicroGoal(state);
  state.activeMicroGoal = advanceMicroGoal(state, dt);

  // Goal rewards — one active goal completes per tick; offline catch-up runs
  // many ticks so a big jump still advances through the goal list in order.
  const goal = checkGoalCompletion(state);
  if (goal) {
    if (goal.kind === "starter") {
      state.completedGoals = [...(state.completedGoals ?? []), goal.id];
    } else {
      state.microGoalCompletions = {
        ...(state.microGoalCompletions ?? {}),
        [goal.id]: ((state.microGoalCompletions ?? {})[goal.id] ?? 0) + 1,
      };
      state.lastMicroGoalId = goal.id;
      state.microGoalCursor = (state.microGoalCursor ?? 0) + 1;
      state.activeMicroGoal = null;
    }
    state.cash += goal.cashReward ?? 0;
    if (goal.reputationReward) state.reputation = (state.reputation ?? 0) + goal.reputationReward;
    state.goalRewardSequence = (state.goalRewardSequence ?? 0) + 1;
    state.lastGoalReward = { id: goal.id, cash: goal.cashReward ?? 0, reputation: goal.reputationReward ?? 0 };
    state.eventLog = [`Goal reached: +${formatCost(goal.cashReward ?? 0)} reward.`, ...state.eventLog].slice(0, 4);
    if (!getGoalView(state) && !state.activeMicroGoal) state.activeMicroGoal = createNextMicroGoal(state);
  }

  state.recoveryContractCooldown = Math.max(0, (state.recoveryContractCooldown ?? 0) - dt);

  // Early-game safety net: a bounded emergency grant so a new player cannot
  // soft-lock by overspending in the first session.
  state.emergencyFundCooldown = Math.max(0, (state.emergencyFundCooldown ?? 0) - dt);
  if (isEmergencyEligible(state) && state.emergencyFundCooldown <= 0) {
    state.cash += EMERGENCY_GRANT;
    state.emergencyFundsUsed = (state.emergencyFundsUsed ?? 0) + 1;
    state.emergencyFundCooldown = EMERGENCY_COOLDOWN_SECONDS;
    state.eventLog = [`Emergency grant received: +${formatCost(EMERGENCY_GRANT)}.`, ...state.eventLog].slice(0, 4);
  }

  // Founder loan repayment: drains cash over time (counted as an expense for
  // transparency) — the recovery helps, but the debt is a real consequence.
  if ((state.debt ?? 0) > 0) {
    const payment = Math.min(state.debt, FOUNDER_LOAN_REPAY_PER_SEC * dt);
    state.cash -= payment;
    state.expenses += payment;
    state.debt -= payment;
    if (state.debt < 0.01) state.debt = 0;
  }
}

// Advances the long-term lifecycle layer once per tick: builds reputation,
// records stage transitions, and surfaces acquisition/merger opportunities.
// Runs inside tickSimulation so it also progresses during offline catch-up.
function updateEvolution(state, dt) {
  if (state.outcome) return;

  const evo = getEvolutionMetrics(state);

  // World layers, advanced before reputation so a market leader's standing feeds
  // its reputation this tick: the industry climate (trend) shifts the market and
  // the company's market share drifts toward its earned target.
  updateIndustryTrend(state, dt);
  updateMarketShare(state, evo, dt);

  // Reputation eases toward its target so it is earned (and lost) gradually. A
  // strong market position adds a bounded standing bonus to that target.
  const target = getReputationTarget(evo) + getMarketShareEffects(state).reputationBonus;
  state.reputation += (target - state.reputation) * Math.min(1, 0.05 * dt);
  evo.reputation = state.reputation;

  // Record newly reached lifecycle stages (used for milestone notifications).
  const stageIndex = getStageIndex(evo);
  for (let i = 0; i <= stageIndex; i += 1) {
    const stage = EVOLUTION_STAGES[i];
    if (!state.reachedStages.includes(stage.id)) {
      state.reachedStages = [...state.reachedStages, stage.id];
      state.founderProfile = addFounderProgress(state.founderProfile, { experience: 8 + i * 3, prestige: i >= 2 ? 4 : 0 });
      state.eventLog = [`Company is now a ${stage.id}.`, ...state.eventLog].slice(0, 4);
    }
  }

  // Strategic opportunities: surface one offer at a time, on a cooldown.
  if (state.offerCooldown > 0) {
    state.offerCooldown = Math.max(0, state.offerCooldown - dt);
  }
  if (!state.destinyPath && !state.activeOffer && state.offerCooldown <= 0) {
    const offer = evaluateOfferGeneration(state, evo, stageIndex);
    if (offer) {
      const premium = getPrestigeUnlockEffects(state.founderProfile).acquisitionPremium;
      if (offer.kind === "acquisition" && premium > 0) {
        offer.amount = Math.round(offer.amount * (1 + premium));
      }
      // Client reputation: a satisfied client base raises the buyout valuation.
      const clientPremium = getClientReputationEffects(state).offerPremium;
      offer.amount = Math.max(1, Math.round(offer.amount * (1 + clientPremium)));
      // Market position + industry climate: a dominant share lifts the valuation,
      // a downturn (recession/crisis) depresses it.
      const worldValuation = getMarketShareEffects(state).valuationMultiplier
        * (INDUSTRY_TREND_BY_ID[state.industryTrend?.id]?.valuationMultiplier ?? 1);
      // Founder "Negotiation" skill (#22) lifts buyout offers (×1 at level 0).
      const negotiation = getFounderSkillEffects(state.founderProfile).offerMult;
      offer.amount = Math.max(1, Math.round(offer.amount * worldValuation * negotiation));
      offer.baseAmount = offer.amount;
      state.activeOffer = offer;
      state.offerCooldown = getOfferCooldownSeconds();
      state.eventLog = [`${offer.buyerId} made a ${offer.kind} offer.`, ...state.eventLog].slice(0, 4);
    }
  }

  if (state.publicCompany) {
    updatePublicCompany(state, evo, dt);
  }
  if (state.integration) {
    updateIntegration(state, dt);
  }
  if (state.compliance) {
    updateCompliance(state, evo, dt);
  }
  if (state.acquisitionTransition) {
    updateAcquisitionTransition(state, dt);
  }
  updateStrategicEventGeneration(state, evo, dt);
  state.founderProfile = recordCompanySnapshot(state.founderProfile, state);
}

function updatePublicCompany(state, evo, dt) {
  const publicCompany = state.publicCompany;
  const profitMomentum = Math.max(-1, Math.min(1, evo.profit / Math.max(1, publicCompany.quarterlyExpectation)));
  publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + (profitMomentum * 1.8 - publicCompany.investorPressure * 0.01) * dt);
  publicCompany.analystReputation = clamp(0, 100, publicCompany.analystReputation + ((state.reputation ?? 0) - publicCompany.analystReputation) * 0.02 * dt);

  // Board of Directors (#18): the board's confidence in the CEO drifts from
  // market performance. A misaligned board adds investor pressure; a strongly
  // aligned board relieves it. An active activist campaign also pressures.
  const align = publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT;
  const boardTarget = clamp(0, 100, 30 + publicCompany.shareholderConfidence * 0.5 + profitMomentum * 15);
  publicCompany.boardAlignment = clamp(0, 100, align + (boardTarget - align) * 0.02 * dt);
  const boardPressure = align < 40 ? 0.05 : align > 70 ? -0.03 : 0;
  const activistPressure = publicCompany.activist ? 0.07 : 0;
  publicCompany.investorPressure = clamp(
    15,
    95,
    publicCompany.investorPressure + ((evo.profit < publicCompany.quarterlyExpectation ? 0.12 : -0.08) + boardPressure + activistPressure) * dt,
  );

  publicCompany.stockPrice = Math.max(1, publicCompany.stockPrice * (1 + (profitMomentum * 0.001 + (publicCompany.shareholderConfidence - 55) * 0.00003) * dt));
  publicCompany.quarterTimer = Math.max(0, (publicCompany.quarterTimer ?? QUARTER_SECONDS) - dt);

  // Activist Investors (#18): sustained high pressure + weak confidence invites
  // an activist to take a stake and make a demand (resolved via a decision).
  publicCompany.activistTimer = Math.max(0, (publicCompany.activistTimer ?? ACTIVIST_CHECK_SECONDS) - dt);
  if (!publicCompany.activist && publicCompany.activistTimer <= 0) {
    publicCompany.activistTimer = ACTIVIST_CHECK_SECONDS;
    if (publicCompany.investorPressure > ACTIVIST_PRESSURE_THRESHOLD && publicCompany.shareholderConfidence < ACTIVIST_CONFIDENCE_THRESHOLD) {
      publicCompany.activist = { demandId: ACTIVIST_DEMANDS[Math.floor(state.elapsed / 13) % ACTIVIST_DEMANDS.length] };
      state.eventLog = ["An activist investor took a stake.", ...state.eventLog].slice(0, 4);
    }
  }
}

function updateIntegration(state, dt) {
  const integration = state.integration;
  integration.progress = clamp(0, 100, integration.progress + Math.max(0.25, 1 - integration.cultureConflict / 120) * dt);
  integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 0.08 * dt);
  integration.restructuringDebt = clamp(0, 100, integration.restructuringDebt - 0.06 * dt);
  // Morale drifts toward a target set by how settled the culture is: high
  // conflict erodes morale, a calm integration lets it recover. Morale and
  // culture conflict both feed the live throughput drag (getIntegrationDrag).
  const morale = integration.morale ?? 70;
  integration.morale = clamp(0, 100, morale + (70 - integration.cultureConflict) * 0.01 * dt);

  // Corporate politics (#20): factionalism drifts toward how much friction exists
  // between the two legacy orgs (culture + leadership conflict), so unresolved
  // conflict breeds politics that the player must actively defuse.
  const leadership = integration.leadershipConflict ?? 0;
  const politicsTarget = (integration.cultureConflict + leadership) / 2;
  integration.politics = clamp(0, 100, (integration.politics ?? 0) + (politicsTarget - (integration.politics ?? 0)) * 0.02 * dt);
  // Leadership conflict eases slowly on its own; decisions resolve it faster.
  integration.leadershipConflict = clamp(0, 100, leadership - 0.05 * dt);

  // Synergy (#20): the merger upside. It is earned — it rises with successfully
  // integrated departments and a calm, motivated, low-politics organization, and
  // is held down by unresolved conflict and restructuring debt. Synergy feeds a
  // read-time bonus (getSynergyEffects), so a well-run merger eventually pays off.
  const synergyTarget = clamp(
    0,
    100,
    (integration.integratedDepartments ?? 0) * 18 +
      (100 - integration.cultureConflict) * 0.2 +
      (100 - integration.politics) * 0.15 +
      (100 - integration.leadershipConflict) * 0.15 +
      ((integration.morale ?? 70) - 50) * 0.3 -
      integration.restructuringDebt * 0.2,
  );
  integration.synergy = clamp(0, 100, (integration.synergy ?? 0) + (synergyTarget - (integration.synergy ?? 0)) * 0.03 * dt);

  if (integration.progress >= 100) {
    integration.duplicatedDepartments = Math.max(0, integration.duplicatedDepartments - 1);
    // A department finished integrating: a concrete, permanent synergy source.
    integration.integratedDepartments = (integration.integratedDepartments ?? 0) + 1;
    integration.synergy = clamp(0, 100, (integration.synergy ?? 0) + 6);
    integration.progress = integration.duplicatedDepartments > 0 ? 68 : 100;
  }
}

// A rough merger integration slows the whole company down: unresolved culture
// conflict, low morale, corporate politics, and leadership conflict add
// processing-time drag that decays as the player makes good integration
// decisions. This is the downside the synergy bonus (getSynergyEffects) works
// against — early on the drag dominates, a well-run integration flips to net gain.
function getIntegrationDrag(state) {
  const integration = state.integration;
  if (!integration) return 0;
  const culture = (integration.cultureConflict ?? 0) / 100;
  const lowMorale = 1 - (integration.morale ?? 100) / 100;
  const politics = (integration.politics ?? 0) / 100;
  const leadership = (integration.leadershipConflict ?? 0) / 100;
  return Math.min(0.45, culture * 0.2 + lowMorale * 0.12 + politics * 0.1 + leadership * 0.08);
}

// Whether the merger integration still needs the player's attention: unmerged
// departments, or lingering leadership/corporate-politics tension to defuse.
function integrationNeedsAttention(integration) {
  return integration.duplicatedDepartments > 0 || (integration.politics ?? 0) > 30 || (integration.leadershipConflict ?? 0) > 30;
}

// Synergy bonus (#20): the realized upside of a well-integrated merger, applied
// at read time (folded into getCompanyEffects). Higher payout, lower costs, and
// faster work — the reward for resolving culture/politics/leadership and merging
// departments. Zero (neutral) until synergy is built, so it never helps a chaotic
// merger and the early integration drag is felt first.
function getSynergyEffects(state) {
  const synergy = state.integration?.synergy ?? 0;
  const n = synergy / 100;
  return {
    synergy,
    taskValue: 1 + n * 0.18, // up to +18% payout
    expense: 1 - n * 0.12, // up to -12% running costs
    speedMultiplier: 1 + n * 0.12, // up to +12% processing speed
  };
}

function updateCompliance(state, evo, dt) {
  const compliance = state.compliance;
  compliance.publicReputation = clamp(0, 100, compliance.publicReputation + ((state.reputation ?? 0) - compliance.publicReputation) * 0.015 * dt);
  compliance.auditRisk = clamp(8, 90, compliance.auditRisk + (compliance.complianceScore < 70 ? 0.05 : -0.05) * dt);
  compliance.complianceScore = clamp(0, 100, compliance.complianceScore + (evo.stability - 0.5) * 0.08 * dt);

  // Delayed government payment: national contracts pay out after a delay, and a
  // weak compliance score gets part of the payment withheld (penalty risk).
  if ((compliance.pendingPayment ?? 0) > 0) {
    compliance.paymentTimer = Math.max(0, (compliance.paymentTimer ?? 0) - dt);
    if (compliance.paymentTimer <= 0) {
      const withheld = compliance.complianceScore >= 60 ? 1 : 0.7;
      const paid = Math.round(compliance.pendingPayment * withheld);
      state.cash += paid;
      state.revenue += paid;
      state.eventLog = [`National contract paid out ${formatCost(paid)}.`, ...state.eventLog].slice(0, 4);
      compliance.pendingPayment = 0;
    }
  }

  // Audits fire when accumulated pressure crosses the threshold; pressure builds
  // faster at higher audit risk. A strong compliance score passes cleanly; a weak
  // one draws a fine and a reputation hit — this is what makes audit risk and
  // compliance score matter instead of being decorative numbers.
  compliance.auditPressure = (compliance.auditPressure ?? 0) + (compliance.auditRisk / 100) * dt;
  if (compliance.auditPressure >= AUDIT_PRESSURE_THRESHOLD) {
    compliance.auditPressure = 0;
    compliance.auditsRun = (compliance.auditsRun ?? 0) + 1;
    if (compliance.complianceScore >= AUDIT_PASS_SCORE) {
      compliance.lastAudit = "passed";
      compliance.auditsPassed = (compliance.auditsPassed ?? 0) + 1;
      compliance.auditRisk = clamp(8, 90, compliance.auditRisk - 12);
      state.reputation += 2;
      state.eventLog = ["Passed a government audit.", ...state.eventLog].slice(0, 4);
    } else {
      // The fine scales with the contract portfolio: the more national contracts
      // you hold, the larger your exposure when an audit finds you non-compliant.
      const exposure = 1 + (compliance.nationalContracts ?? 1) * 0.1;
      const fine = Math.round((state.companyType.baseTaskValue * 40 + (AUDIT_PASS_SCORE - compliance.complianceScore) * 300) * exposure);
      compliance.lastAudit = "fined";
      compliance.auditsFined = (compliance.auditsFined ?? 0) + 1;
      compliance.lastFine = fine;
      state.cash -= fine;
      state.reputation = Math.max(0, state.reputation - 6);
      compliance.auditRisk = clamp(8, 90, compliance.auditRisk - 8);
      state.eventLog = [`Failed a government audit. Fined ${formatCost(fine)}.`, ...state.eventLog].slice(0, 4);
    }
  }
}

function updateAcquisitionTransition(state, dt) {
  const transition = state.acquisitionTransition;
  if (transition.completed) return;
  transition.daysRemaining = Math.max(0, transition.daysRemaining - dt);
  transition.systemsIntegration = clamp(0, 100, transition.systemsIntegration + 0.16 * dt);
  transition.morale = clamp(0, 100, transition.morale - 0.035 * dt);
  transition.clientRetention = clamp(0, 100, transition.clientRetention - (transition.buyerTrust < 45 ? 0.06 : 0.025) * dt);
  if (transition.daysRemaining <= 0 || transition.systemsIntegration >= 100) {
    transition.completed = true;
    const success = transition.morale >= 45 && transition.clientRetention >= 55;
    state.founderProfile = addFounderProgress(state.founderProfile, {
      experience: success ? 30 : 14,
      prestige: success ? 18 : 6,
      legacyPoints: success ? 3 : 1,
      reputation: success ? 4 : 1,
    });
    state.legacyEvent = { type: success ? "transitionComplete" : "transitionRough", amount: 0 };
  }
}

function updateStrategicEventGeneration(state, evo, dt) {
  if (state.legacyEvent || state.strategicEvent) return;
  if (state.strategicEventCooldown > 0) {
    state.strategicEventCooldown = Math.max(0, state.strategicEventCooldown - dt);
    return;
  }

  let event = null;
  if (state.acquisitionTransition && !state.acquisitionTransition.completed) {
    event = makeStrategicEvent("acquisitionSystems");
  } else if (state.integration && integrationNeedsAttention(state.integration)) {
    // While duplicate departments remain, the full slate of integration decisions
    // is in play; once they are merged, leadership and corporate-politics tension
    // can still demand attention until they settle.
    const types = state.integration.duplicatedDepartments > 0
      ? ["mergeDepartments", "cultureConflict", "clientOwnership", "restructuring", "leadershipOverlap", "corporatePolitics"]
      : ["corporatePolitics", "leadershipOverlap", "cultureConflict"];
    event = makeStrategicEvent(types[Math.floor(state.elapsed / 31) % types.length]);
  } else if (state.publicCompany) {
    const pc = state.publicCompany;
    if ((pc.quarterTimer ?? 0) <= 0) {
      // End-of-quarter review takes priority (it also resets the quarter timer).
      event = makeStrategicEvent("ipoQuarterReview");
    } else if (pc.activist) {
      // An activist campaign is the most urgent governance decision.
      event = makeStrategicEvent("ipoActivist");
    } else if ((pc.boardAlignment ?? BOARD_START_ALIGNMENT) < BOARD_MEETING_ALIGNMENT_THRESHOLD) {
      // A misaligned board calls a meeting / vote of confidence.
      event = makeStrategicEvent("ipoBoardMeeting");
    } else {
      const types = ["ipoGuidance", "ipoShareholderVote", "ipoProfitQuality", "ipoIssueShares"];
      event = makeStrategicEvent(types[Math.floor(state.elapsed / 37) % types.length]);
    }
  } else if (state.compliance) {
    const types = ["govContractOffer", "govAuditNotice", "govComplianceUpgrade", "govCertification", "govWhistleblower", "govDeadlinePressure"];
    const type = types[Math.floor(state.elapsed / 29) % types.length];
    // A contract offer carries the tender it is bid against (procurement competition).
    event = makeStrategicEvent(type, type === "govContractOffer" ? { tender: makeTender(state) } : {});
  }

  if (event) {
    state.strategicEvent = event;
    state.strategicEventCooldown = STRATEGIC_EVENT_COOLDOWN_SECONDS;
  }
}

function makeStrategicEvent(type, extra = {}) {
  const choicesByType = {
    acquisitionSystems: ["protectMorale", "pushIntegration", "clientAssurance"],
    mergeDepartments: ["mergeDepartments", "keepBoth", "cutRedundancy"],
    cultureConflict: ["jointWorkshops", "strongRules", "letTeamsSettle"],
    clientOwnership: ["unifiedAccounts", "splitAccounts", "premiumSupport"],
    restructuring: ["payoffDebt", "phasedRestructure", "deferRestructure"],
    leadershipOverlap: ["promoteOne", "coLeadership", "externalHire"],
    corporatePolitics: ["mediateFactions", "consolidatePower", "openForum"],
    ipoQuarterReview: ["acceptQuarterPlan", "resetGuidance"],
    ipoProfitQuality: ["shortTermProfit", "longTermQuality"],
    ipoIssueShares: ["issueShares", "preserveControl"],
    ipoGuidance: ["guidanceConservative", "guidanceBalanced", "guidanceAggressive"],
    ipoBoardMeeting: ["boardBuyback", "boardGrantSeat", "boardDefendStrategy"],
    ipoShareholderVote: ["backProposal", "negotiateProposal", "rejectProposal"],
    ipoActivist: ["appeaseActivist", "fightActivist", "buybackActivist"],
    govContractOffer: ["bidAggressive", "bidStandard", "bidPremium", "declineContract"],
    govAuditNotice: ["fullAuditPrep", "minimalAuditPrep"],
    govComplianceUpgrade: ["buyComplianceUpgrade", "delayComplianceUpgrade"],
    govCertification: ["pursueCertification", "skipCertification"],
    govWhistleblower: ["investigateReport", "downplayReport"],
    govDeadlinePressure: ["rushDelivery", "requestExtension"],
  };
  return {
    id: `${type}_${Date.now()}_${Math.round(Math.random() * 1000)}`,
    type,
    choices: choicesByType[type] ?? [],
    ...extra,
  };
}

// A government tender: the contract value plus the procurement competition it
// must be won against (a rival field that raises the bar). Derived deterministically
// from elapsed time so the same tender shows in the UI and at resolution.
function makeTender(state) {
  const rivals = 2 + (Math.floor(state.elapsed / 17) % 3); // 2..4 competing bidders
  const sizeStep = Math.floor(state.elapsed / 23) % 5; // 0..4
  const value = Math.round(state.companyType.baseTaskValue * (50 + sizeStep * 12));
  return { value, rivals, competition: rivals >= 4 ? "high" : rivals === 3 ? "medium" : "low" };
}

// --- CEO Inbox: everyday decision messages -------------------------------

function makeCeoDecision(situation) {
  return {
    id: `${situation.id}_${Date.now()}_${Math.round(Math.random() * 1000)}`,
    type: situation.id,
    choices: situation.choices.map((choice) => choice.id),
    icon: situation.icon,
    ...(situation.code ? { code: situation.code, channel: situation.channel, narrative: true } : {}),
  };
}

// Surfaces one eligible data-driven CEO situation at a time on a weighted,
// deterministic rotation. Skipped while a heavier decision (offer, legacy
// event, strategic event) is already pending so the player is never flooded.
function updateCeoInbox(state, dt) {
  if (state.legacyEvent || state.activeOffer || state.strategicEvent || state.ceoDecision) return;
  state.ceoInboxCooldown = Math.max(0, (state.ceoInboxCooldown ?? 0) - dt);
  if (state.ceoInboxCooldown > 0) return;

  const eligible = CEO_SITUATIONS.filter((situation) => isCeoSituationEligible(situation, state));
  const totalWeight = eligible.reduce((sum, situation) => sum + situation.weight, 0);
  let roll = Math.floor(state.elapsed / 11) % Math.max(1, totalWeight);
  let situation = eligible[0];
  for (const candidate of eligible) {
    roll -= candidate.weight;
    if (roll < 0) {
      situation = candidate;
      break;
    }
  }

  if (!situation) return;
  state.ceoDecision = makeCeoDecision(situation);
  state.ceoInboxCooldown = CEO_INBOX_COOLDOWN_SECONDS;
}

export function chooseCeoDecision(state, choiceId) {
  const next = cloneState(state);
  const decision = next.ceoDecision;
  if (!decision || !decision.choices.includes(choiceId)) return next;

  applyCeoDecision(next, CEO_CHOICE_BY_ID[choiceId]);
  next.resolvedCeoSituations = (next.resolvedCeoSituations ?? 0) + 1;
  next.ceoDecision = null;
  next.ceoInboxCooldown = CEO_INBOX_COOLDOWN_SECONDS;
  return next;
}

// CEO situation effects use existing simulation levers only. The data declares
// the tradeoff; this interpreter applies it without introducing new economies.
function applyCeoDecision(state, choice) {
  const effects = choice?.effects;
  if (!effects) return;
  const unit = state.companyType.baseTaskValue;
  if (effects.cashUnits) state.cash += Math.round(unit * effects.cashUnits);
  if (effects.reputation) state.reputation = Math.max(0, state.reputation + effects.reputation);
  if (effects.satisfaction) state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) + effects.satisfaction);
  if (effects.morale) state.employeeHappiness = clamp(0, 100, (state.employeeHappiness ?? 85) + effects.morale);
  if (effects.salaryPressure) state.salaryPressure = Math.max(0, (state.salaryPressure ?? 0) + effects.salaryPressure);
  if (effects.expenseMult) state.modifiers.expense *= effects.expenseMult;
  if (effects.leadIntervalMult) state.modifiers.leadInterval *= effects.leadIntervalMult;
  if (effects.taskValueMult) state.modifiers.taskValue *= effects.taskValueMult;
  if (effects.dynamicEventCooldown) state.dynamicEventCooldown = Math.max(8, (state.dynamicEventCooldown ?? 0) + effects.dynamicEventCooldown);
  if (effects.complianceRisk && state.compliance) state.compliance.auditRisk = clamp(0, 100, state.compliance.auditRisk + effects.complianceRisk);
  for (let index = 0; index < (effects.removeEmployees ?? 0); index += 1) {
    const department = [...state.departments].filter((candidate) => candidate.employees > 1).sort((a, b) => b.employees - a.employees)[0];
    if (!department) break;
    department.employees -= 1;
    department.staff = department.staff.slice(0, -1);
  }
  for (let index = 0; index < (effects.leadBurst ?? 0); index += 1) {
    enqueueLead(state, { rareContract: Boolean(effects.rareLeads), valueMult: effects.leadValueMult ?? 1 });
  }
}

// --- Dynamic events: world events that happen to the company --------------

// Data-driven world events (good and bad). `apply` mutates state immediately;
// `severity` drives the notification tone. `weight` biases random selection
// toward the more common, everyday events. Exported for deterministic testing.
export const DYNAMIC_EVENTS = [
  {
    type: "employeeQuit",
    severity: "bad",
    weight: 2,
    apply: (state) => {
      const donor = [...state.departments].filter((d) => d.employees > 1).sort((a, b) => getPressure(state, a) - getPressure(state, b))[0];
      if (donor) {
        donor.employees -= 1;
        donor.staff = donor.staff.slice(0, -1);
      } else {
        // No department can spare anyone — morale dips instead.
        state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) - 5);
      }
    },
  },
  {
    type: "majorClientComplaint",
    severity: "bad",
    weight: 2,
    apply: (state) => {
      state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) - 15);
    },
  },
  {
    type: "serverOutage",
    severity: "bad",
    weight: 2,
    apply: (state) => {
      state.cash -= Math.round(state.companyType.baseTaskValue * 8);
      state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) - 5);
    },
  },
  {
    type: "viralSuccess",
    severity: "good",
    weight: 1,
    apply: (state) => {
      for (let i = 0; i < 3; i += 1) enqueueLead(state, { rareContract: true, valueMult: 2 });
      state.reputation += 5;
    },
  },
  {
    type: "negativePress",
    severity: "bad",
    weight: 1,
    apply: (state) => {
      state.reputation = Math.max(0, state.reputation - 8);
      state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) - 5);
    },
  },
  {
    type: "industryBoom",
    severity: "good",
    weight: 1,
    apply: (state) => {
      for (let i = 0; i < 2; i += 1) enqueueLead(state, { valueMult: 1.5 });
      state.reputation += 3;
    },
  },
  {
    type: "industryDownturn",
    severity: "bad",
    weight: 1,
    apply: (state) => {
      state.reputation = Math.max(0, state.reputation - 4);
    },
  },
  // Culture signature events: each only enters the pool while its culture is
  // active (the culture's "unique event"). All positive — a culture paying off.
  {
    type: "breakthrough",
    severity: "good",
    weight: 1,
    culture: "innovation",
    apply: (state) => {
      enqueueLead(state, { rareContract: true, valueMult: 2 });
      enqueueLead(state, { rareContract: true, valueMult: 2 });
      state.reputation += 4;
    },
  },
  {
    type: "qualityAward",
    severity: "good",
    weight: 1,
    culture: "quality",
    apply: (state) => {
      state.reputation += 5;
      state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) + 6);
    },
  },
  {
    type: "growthSpurt",
    severity: "good",
    weight: 1,
    culture: "fastGrowth",
    apply: (state) => {
      for (let i = 0; i < 3; i += 1) enqueueLead(state, { valueMult: 1.5 });
    },
  },
  {
    type: "efficiencyWin",
    severity: "good",
    weight: 1,
    culture: "costEfficient",
    apply: (state) => {
      state.cash += Math.round(state.companyType.baseTaskValue * 10);
    },
  },
  {
    type: "referralWave",
    severity: "good",
    weight: 1,
    culture: "customerObsessed",
    apply: (state) => {
      enqueueLead(state, { valueMult: 1.5 });
      enqueueLead(state, { valueMult: 1.5 });
      state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) + 8);
    },
  },
];

// Fires one world event on a cooldown: applies its effect and records it on
// `lastDynamicEvent` so a notification rule surfaces it. Skipped while a heavier
// decision is pending so an auto-event never lands on top of a modal moment.
// The candidate pool excludes culture-signature events unless that culture is
// active, so each culture unlocks its unique event.
function updateDynamicEvents(state, dt) {
  if (state.legacyEvent || state.activeOffer) return;
  state.dynamicEventCooldown = Math.max(0, (state.dynamicEventCooldown ?? 0) - dt);
  if (state.dynamicEventCooldown > 0) return;

  const pool = DYNAMIC_EVENTS.filter((event) => !event.culture || event.culture === state.culture);
  // Retention: low morale makes employees quit more often.
  const lowMorale = (state.employeeHappiness ?? 85) < 50;
  const weightOf = (event) => (event.type === "employeeQuit" && lowMorale ? event.weight * 3 : event.weight);
  const totalWeight = pool.reduce((sum, event) => sum + weightOf(event), 0);
  let roll = Math.random() * totalWeight;
  let chosen = pool[0];
  for (const event of pool) {
    roll -= weightOf(event);
    if (roll <= 0) {
      chosen = event;
      break;
    }
  }

  chosen.apply(state);
  state.lastDynamicEvent = { id: `${chosen.type}_${Math.round(state.elapsed * 1000)}`, type: chosen.type, severity: chosen.severity, at: state.elapsed };
  state.dynamicEventCooldown = DYNAMIC_EVENT_COOLDOWN_SECONDS;
  state.eventLog = [`Event: ${chosen.type}.`, ...state.eventLog].slice(0, 4);
}

// --- Operations Manager: automate routine ops ----------------------------

export function managerHireCost(state) {
  return Math.round(state.companyType.baseTaskValue * MANAGER_HIRE_COST_MULT);
}

// The manager is unlocked once the company reaches Small Business — the player
// learns hiring/automation manually first, then delegates it.
export function isManagerAvailable(state) {
  return (state.reachedStages ?? []).includes("small-business");
}

// Runs the manager's enabled policies on a cadence: at most one routine action
// per interval, and never spending the company below MANAGER_CASH_BUFFER, so it
// reduces micromanagement without ever bankrupting the player.
function updateManagers(state, dt) {
  const manager = state.manager;
  if (!manager?.hired) return;
  manager.actionTimer = (manager.actionTimer ?? 0) - dt;
  if (manager.actionTimer > 0) return;
  manager.actionTimer = MANAGER_ACTION_INTERVAL;

  const buffer = MANAGER_CASH_BUFFER;

  // Auto-automate: buy the next affordable tool (highest long-term leverage).
  if (manager.autoAutomate) {
    const tool = getAutomationStatus(state).find((t) => t.unlocked && !t.owned && state.cash >= t.cost + buffer);
    if (tool) {
      state.cash -= tool.cost;
      state.ownedAutomations = [...state.ownedAutomations, tool.id];
      state.eventLog = [`Manager installed ${tool.name}.`, ...state.eventLog].slice(0, 4);
      return;
    }
  }

  // Auto-hire: clear an overloaded bottleneck when cash allows.
  if (manager.autoHire) {
    const bottleneck = getBottleneck(state);
    if (bottleneck?.bottleneck?.isOverloaded) {
      const cost = getHireCost(bottleneck, state);
      if (state.cash >= cost + buffer) {
        bottleneck.employees += 1;
        bottleneck.staff = [...bottleneck.staff, makeEmployee(`emp_${state.nextEmployeeId}`, bottleneck.id)];
        state.nextEmployeeId += 1;
        state.cash -= cost;
        state.eventLog = [`Manager hired into ${bottleneck.name}.`, ...state.eventLog].slice(0, 4);
        return;
      }
    }
  }

  // Auto-rebalance: move idle capacity to the bottleneck (free, so do it last).
  if (manager.autoRebalance) {
    const bottleneck = getBottleneck(state);
    const donor = [...state.departments]
      .filter((d) => d.id !== bottleneck?.id && d.employees > 1)
      .sort((a, b) => getPressure(state, a) - getPressure(state, b))[0];
    if (bottleneck && bottleneck.bottleneck?.isOverloaded && donor && getPressure(state, donor) < getPressure(state, bottleneck) - 2) {
      donor.employees -= 1;
      const moved = donor.staff[donor.staff.length - 1];
      donor.staff = donor.staff.slice(0, -1);
      bottleneck.employees += 1;
      if (moved) bottleneck.staff = [...bottleneck.staff, { ...moved, departmentId: bottleneck.id }];
      state.eventLog = [`Manager moved capacity to ${bottleneck.name}.`, ...state.eventLog].slice(0, 4);
    }
  }
}

export function hireManager(state) {
  const next = cloneState(state);
  if (next.manager.hired) return next;
  if (!isManagerAvailable(next)) {
    next.eventLog = ["An Operations Manager unlocks at the Small Business stage.", ...next.eventLog].slice(0, 4);
    return next;
  }
  const cost = managerHireCost(next);
  if (next.cash < cost) {
    next.eventLog = [`Need ${formatCost(cost)} to hire an Operations Manager.`, ...next.eventLog].slice(0, 4);
    return next;
  }
  next.cash -= cost;
  next.manager = { ...next.manager, hired: true, actionTimer: 0 };
  next.eventLog = ["Hired an Operations Manager.", ...next.eventLog].slice(0, 4);
  return next;
}

export function toggleManagerPolicy(state, policy) {
  const next = cloneState(state);
  if (!next.manager?.hired || !["autoHire", "autoRebalance", "autoAutomate"].includes(policy)) return next;
  next.manager = { ...next.manager, [policy]: !next.manager[policy] };
  return next;
}

// Holding Company executives (#26): an empire founder can appoint a professional
// executive to run a subsidiary. This installs + fully enables the Operations
// Manager (auto-hire / auto-rebalance / auto-automate), bypassing the manual-first
// Small-Business gate that applies when a player hires their own manager. Because
// the manager runs in updateManagers — including during offline catch-up — an
// executive-run subsidiary keeps performing on its own while it is paused, which
// is the point of delegating across a portfolio. The executive draws the usual
// manager salary (so it is a real ongoing cost).
export function appointExecutive(state) {
  const next = cloneState(state);
  if (next.manager?.hired) return next;
  next.cash -= managerHireCost(next);
  next.manager = { hired: true, autoHire: true, autoRebalance: true, autoAutomate: true, actionTimer: 0 };
  next.eventLog = ["Appointed an executive to run the company.", ...next.eventLog].slice(0, 4);
  return next;
}

// --- Company culture & special employees ----------------------------------

// Choosing a culture is a strategic commitment: it grants a persistent bonus and
// a matching weakness (see data/culture.js) and unlocks that culture's signature
// dynamic event. The player can re-pick (no hard lock) — the effect layer never
// compounds into permanent state.
export function chooseCulture(state, cultureId) {
  const next = cloneState(state);
  if (!CULTURE_BY_ID[cultureId]) return next;
  next.culture = cultureId;
  next.eventLog = [`Adopted a ${cultureId} culture.`, ...next.eventLog].slice(0, 4);
  return next;
}

export function specialistCost(state, id) {
  const specialist = SPECIALIST_BY_ID[id];
  return specialist ? Math.round(state.companyType.baseTaskValue * specialist.costMult) : 0;
}

// Sign the currently-available special employee: a one-time, expensive hire that
// grants a persistent company-wide perk. Available one at a time (see
// updateSpecialists), so signing one is a memorable moment.
export function hireSpecialist(state, id) {
  const next = cloneState(state);
  if (next.availableSpecialist !== id || (next.specialHires ?? []).includes(id)) return next;
  const cost = specialistCost(next, id);
  if (next.cash < cost) {
    next.eventLog = [`Need ${formatCost(cost)} to sign this specialist.`, ...next.eventLog].slice(0, 4);
    return next;
  }
  next.cash -= cost;
  next.specialHires = [...(next.specialHires ?? []), id];
  next.availableSpecialist = null;
  next.specialistCooldown = SPECIALIST_COOLDOWN_SECONDS;
  next.eventLog = [`Signed a star employee.`, ...next.eventLog].slice(0, 4);
  return next;
}

// Rarely surfaces one un-signed special employee at a time (once the company is
// established), recorded on `availableSpecialist` for the Talent panel + a
// notification. Skipped while a heavier decision is pending.
function updateSpecialists(state, dt) {
  if (!isManagerAvailable(state)) return; // shares the Small Business gate
  if (state.availableSpecialist || state.legacyEvent || state.activeOffer) return;
  state.specialistCooldown = Math.max(0, (state.specialistCooldown ?? 0) - dt);
  if (state.specialistCooldown > 0) return;

  const remaining = SPECIALISTS.filter((s) => !(state.specialHires ?? []).includes(s.id));
  if (remaining.length === 0) return;
  const pick = remaining[Math.floor(Math.random() * remaining.length)];
  state.availableSpecialist = pick.id;
  state.specialistCooldown = SPECIALIST_COOLDOWN_SECONDS;
}

// --- Employee happiness & retention ---------------------------------------

// Motivation drifts toward a target lowered by burnout (overloaded departments)
// and by growing salary expectations (reset when the player gives raises).
function updateHappiness(state, dt) {
  const overloaded = state.departments.filter((d) => d.bottleneck?.isOverloaded).length;
  const maxSeverity = Math.max(0, ...state.departments.map((d) => d.bottleneck?.severity ?? 0));
  state.salaryPressure = clamp(0, 100, (state.salaryPressure ?? 0) + dt * SALARY_PRESSURE_RATE);
  const burnout = overloaded * 8 + maxSeverity * 20;
  const target = clamp(0, 100, 95 - burnout - state.salaryPressure * 0.5);
  const current = state.employeeHappiness ?? 85;
  state.employeeHappiness = clamp(0, 100, current + (target - current) * Math.min(1, 0.03 * dt));
}

// Motivation factor on processing speed: happy teams work a little faster,
// burned-out teams slower (0.9 at 0 → 1.05 at 100 happiness).
function getHappinessSpeedFactor(state) {
  return 0.9 + ((state.employeeHappiness ?? 85) / 100) * 0.15;
}

// A raise / promotion: lifts morale and resets salary expectations. Cost scales
// with headcount, so a bigger team is pricier to keep happy.
export function raiseCost(state) {
  const headcount = state.departments.reduce((sum, d) => sum + d.employees, 0);
  return Math.round(state.companyType.baseTaskValue * RAISE_COST_PER_HEAD * headcount);
}

export function giveRaise(state) {
  const next = cloneState(state);
  const cost = raiseCost(next);
  if (next.cash < cost) {
    next.eventLog = [`Need ${formatCost(cost)} to give raises.`, ...next.eventLog].slice(0, 4);
    return next;
  }
  next.cash -= cost;
  next.employeeHappiness = clamp(0, 100, (next.employeeHappiness ?? 85) + RAISE_HAPPINESS_BOOST);
  next.salaryPressure = 0;
  next.eventLog = ["Gave raises and promotions — morale is up.", ...next.eventLog].slice(0, 4);
  return next;
}

// --- Competitor companies -------------------------------------------------

// A rival event stream: on a cooldown, a competitor does something (launches a
// product, poaches talent, gets acquired) that nudges the player's standing —
// the market reacts around you. Surfaced via a notification.
function updateCompetitors(state, dt) {
  state.competitorCooldown = Math.max(0, (state.competitorCooldown ?? 0) - dt);
  if (state.competitorCooldown > 0) return;

  const event = COMPETITOR_EVENTS[Math.floor(Math.random() * COMPETITOR_EVENTS.length)];
  const competitor = COMPETITORS[Math.floor(Math.random() * COMPETITORS.length)];
  if (event.type === "launchedProduct") {
    state.reputation = Math.max(0, state.reputation - 2);
    state.clientSatisfaction = clamp(0, 100, (state.clientSatisfaction ?? 100) - 2);
  } else if (event.type === "hiredTalent") {
    state.reputation = Math.max(0, state.reputation - 2);
  } else if (event.type === "acquired") {
    // A rival consolidates — you stand out a little more.
    state.reputation += 2;
  }
  state.lastCompetitorEvent = {
    id: `${event.type}_${Math.round(state.elapsed * 1000)}`,
    type: event.type,
    competitorId: competitor.id,
    severity: event.severity,
    at: state.elapsed,
  };
  state.competitorCooldown = COMPETITOR_COOLDOWN_SECONDS;
}

// --- Market Share (#16) -----------------------------------------------------

// Read-time effects of the current market share. Centred so ~25% (a credible
// challenger) is neutral; a market leader is a clear-but-bounded advantage and a
// tiny niche player a mild disadvantage. Consumed by getLeadInterval (referrals),
// offer generation (valuation), and the reputation target (standing).
export function getMarketShareEffects(state) {
  const share = clamp(0, 100, state.marketShare ?? 0);
  return {
    share,
    tier: share >= 50 ? "leader" : share >= 25 ? "challenger" : "niche",
    leadIntervalMultiplier: clamp(0.85, 1.1, 1 - (share - 25) / 250), // dominance → more inbound work
    valuationMultiplier: clamp(0.9, 1.35, 1 + (share - 25) / 120), // dominance → richer buyout offers
    reputationBonus: Math.min(10, share * 0.12), // a leader carries standing
  };
}

// Drift market share toward a target set by company strength (reputation,
// throughput, lifecycle stage) against a constant competitive headwind, shifted
// by the active industry trend. Deterministic given state, so it behaves
// identically online and during offline catch-up.
function updateMarketShare(state, evo, dt) {
  const stageIndex = getStageIndex(evo);
  const throughput = getThroughputPerMinute(state);
  const trendDrift = INDUSTRY_TREND_BY_ID[state.industryTrend?.id]?.marketShareDrift ?? 0;
  const target = clamp(
    0,
    100,
    (state.reputation ?? 0) * 0.5 + Math.min(30, throughput * 4) + stageIndex * 5 - MARKET_COMPETITIVE_PRESSURE + trendDrift,
  );
  const current = state.marketShare ?? STARTING_MARKET_SHARE;
  state.marketShare = clamp(0, 100, current + (target - current) * Math.min(1, MARKET_SHARE_DRIFT_RATE * dt));
}

// --- Industry Trends (#17) --------------------------------------------------

// Advance the industry climate: count down an active trend (reverting to neutral
// + starting the cooldown when it ends), or pick a new weighted trend once the
// neutral gap has elapsed. The active trend's effects are applied at read time
// via getCompanyEffects, so this only manages activation/expiry.
function updateIndustryTrend(state, dt) {
  if (state.industryTrend) {
    state.industryTrend.remaining = Math.max(0, (state.industryTrend.remaining ?? 0) - dt);
    if (state.industryTrend.remaining <= 0) {
      state.industryTrend = null;
      state.industryTrendCooldown = INDUSTRY_TREND_COOLDOWN_SECONDS;
    }
    return;
  }

  state.industryTrendCooldown = Math.max(0, (state.industryTrendCooldown ?? 0) - dt);
  if (state.industryTrendCooldown > 0) return;

  const totalWeight = INDUSTRY_TRENDS.reduce((sum, trend) => sum + trend.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = INDUSTRY_TRENDS[0];
  for (const trend of INDUSTRY_TRENDS) {
    roll -= trend.weight;
    if (roll <= 0) {
      chosen = trend;
      break;
    }
  }

  state.industryTrend = { id: chosen.id, severity: chosen.severity, remaining: INDUSTRY_TREND_DURATION_SECONDS };
  state.lastIndustryTrend = {
    id: `${chosen.id}_${Math.round(state.elapsed * 1000)}`,
    trendId: chosen.id,
    severity: chosen.severity,
    at: state.elapsed,
  };
  state.eventLog = [`Industry trend: ${chosen.id}.`, ...state.eventLog].slice(0, 4);
}

export function hireForDepartment(state, departmentId) {
  const next = cloneState(state);
  const department = getDepartmentById(next, departmentId) ?? getBottleneck(next) ?? next.departments[0];
  if (!department) return next;

  const cost = getHireCost(department, next);
  if (next.cash < cost) {
    next.eventLog = [`Need ${formatCost(cost)} to hire in ${department.name}.`, ...next.eventLog].slice(0, 4);
    return next;
  }

  department.employees += 1;
  department.staff = [...department.staff, makeEmployee(`emp_${next.nextEmployeeId}`, department.id)];
  next.nextEmployeeId += 1;
  next.cash -= cost;
  next.eventLog = [`Hired 1 employee into ${department.name}.`, ...next.eventLog].slice(0, 4);
  return next;
}

export function hireForBottleneck(state) {
  const bottleneck = getBottleneck(state) ?? state.departments[0];
  return hireForDepartment(state, bottleneck?.id);
}

export function buyAutomation(state, automationId) {
  const next = cloneState(state);
  const automation = AUTOMATION_BY_ID[automationId];
  if (!automation) return next;

  if (next.ownedAutomations.includes(automation.id)) {
    next.eventLog = [`${automation.name} is already installed.`, ...next.eventLog].slice(0, 4);
    return next;
  }

  if (!isAutomationUnlocked(next, automation)) {
    const missing = automation.requires
      .filter((id) => !next.ownedAutomations.includes(id))
      .map((id) => AUTOMATION_BY_ID[id]?.name ?? id);
    next.eventLog = [`${automation.name} needs ${missing.join(" + ")} first.`, ...next.eventLog].slice(0, 4);
    return next;
  }

  // Founder "Automation" skill (#22) discounts the tool's cost (×1 at level 0).
  const cost = Math.round(automation.cost * getFounderSkillEffects(next.founderProfile).automationCostMult);
  if (next.cash < cost) {
    next.eventLog = [`Need ${formatCost(cost)} for ${automation.name}.`, ...next.eventLog].slice(0, 4);
    return next;
  }

  next.cash -= cost;
  next.ownedAutomations = [...next.ownedAutomations, automation.id];
  next.eventLog = [`Installed ${automation.name}. ${automation.officeEffect}`, ...next.eventLog].slice(0, 4);
  return next;
}

// Spend one founder skill point to level a skill (Founder Skill Tree, #22).
export function upgradeFounderSkill(state, skillId) {
  const next = cloneState(state);
  next.founderProfile = applySkillUpgrade(next.founderProfile, skillId);
  return next;
}

export function rebalanceEmployees(state) {
  const next = cloneState(state);
  const bottleneck = getBottleneck(next);
  const donor = [...next.departments]
    .filter((department) => department.id !== bottleneck?.id && department.employees > 1)
    .sort((a, b) => getPressure(next, a) - getPressure(next, b))[0];

  if (!bottleneck || !donor) {
    next.eventLog = ["No useful rebalance is available.", ...next.eventLog].slice(0, 4);
    return next;
  }

  donor.employees -= 1;
  bottleneck.employees += 1;
  // Move the actual employee so their character identity follows them.
  const moved = donor.staff[donor.staff.length - 1];
  donor.staff = donor.staff.slice(0, -1);
  if (moved) {
    bottleneck.staff = [...bottleneck.staff, { ...moved, departmentId: bottleneck.id }];
  }
  next.eventLog = [`Moved capacity from ${donor.name} to ${bottleneck.name}.`, ...next.eventLog].slice(0, 4);
  return next;
}

// Economic recovery: take a founder loan (cash now, repaid with interest over
// time). Always available when no loan is outstanding and under the cap, so the
// game is never permanently unwinnable.
export function takeFounderLoan(state) {
  const next = cloneState(state);
  if (!isLoanAvailable(next)) {
    next.eventLog = ["A founder loan is not available right now.", ...next.eventLog].slice(0, 4);
    return next;
  }
  next.cash += FOUNDER_LOAN_AMOUNT;
  next.debt = (next.debt ?? 0) + Math.round(FOUNDER_LOAN_AMOUNT * (1 + FOUNDER_LOAN_INTEREST));
  next.loansTaken = (next.loansTaken ?? 0) + 1;
  next.eventLog = [`Founder loan: +${formatCost(FOUNDER_LOAN_AMOUNT)} now, repaid with interest.`, ...next.eventLog].slice(0, 4);
  return next;
}

// Free alternative to spending: toggle slowing the incoming workload so an
// overloaded department's queue can drain (at the cost of less revenue).
export function toggleIntakeThrottle(state) {
  const next = cloneState(state);
  next.intakeThrottled = !next.intakeThrottled;
  next.eventLog = [next.intakeThrottled ? "Reduced incoming workload." : "Resumed normal workload.", ...next.eventLog].slice(0, 4);
  return next;
}

// Economic recovery: take a special recovery contract — a small upfront advance
// plus a couple of high-value client leads to deliver. Restores momentum with
// paying work rather than debt. Bounded by a cooldown and a cap.
export function takeRecoveryContract(state) {
  const next = cloneState(state);
  if (!isRecoveryContractAvailable(next)) {
    next.eventLog = ["No recovery contract is available right now.", ...next.eventLog].slice(0, 4);
    return next;
  }
  next.cash += RECOVERY_CONTRACT_ADVANCE;
  for (let i = 0; i < RECOVERY_CONTRACT_LEADS; i += 1) {
    enqueueLead(next, { rareContract: true, valueMult: RECOVERY_CONTRACT_VALUE_MULT });
  }
  next.recoveryContractsUsed = (next.recoveryContractsUsed ?? 0) + 1;
  next.recoveryContractCooldown = RECOVERY_CONTRACT_COOLDOWN_SECONDS;
  next.eventLog = [`Recovery contract signed: +${formatCost(RECOVERY_CONTRACT_ADVANCE)} advance and ${RECOVERY_CONTRACT_LEADS} high-value projects.`, ...next.eventLog].slice(0, 4);
  return next;
}

// --- Company evolution actions -------------------------------------------

export function acceptOffer(state) {
  const next = cloneState(state);
  const offer = next.activeOffer;
  if (!offer) return next;

  if (offer.kind === "acquisition") {
    const evo = getEvolutionMetrics(next);
    const valuation = getCompanyValuation(next, evo, getStageIndex(evo));
    // Venture Capital (#23) dilution: the company sells for offer.amount, but the
    // founder only pockets their remaining equity share of it. Bootstrapped
    // founders keep 100%; heavy VC raising trades a bigger cash-out for cash now.
    const founderProceeds = Math.round(offer.amount * getVentureEffects(next).exitShare);
    next.cash += founderProceeds;
    next.founderProfile = recordAcquisition(next.founderProfile, next, offer, valuation);
    next.destinyPath = "acquisition-transition";
    next.legacyEvent = { type: "acquisition", amount: offer.amount, buyerId: offer.buyerId };
    next.modifiers = { ...next.modifiers, expense: next.modifiers.expense * 1.08, leadInterval: next.modifiers.leadInterval * 0.95 };
    next.activeOffer = null;
    next.eventLog = [`Acquisition by ${offer.buyerId} became a founder legacy milestone.`, ...next.eventLog].slice(0, 4);
    return next;
  }

  // Merger: capital injection, but bureaucracy raises ongoing expenses while the
  // larger network brings in clients faster.
  next.cash += offer.amount;
  next.destinyPath = "merge";
  next.founderProfile = recordMerger(next.founderProfile, next, offer);
  next.integration = {
    cultureConflict: 68,
    morale: 64,
    duplicatedDepartments: Math.max(2, Math.round(next.departments.length / 3)),
    restructuringDebt: 74,
    progress: 0,
    // Expanded merger gameplay (#20): department integration, leadership conflict,
    // corporate politics, and the synergy upside that a well-run merger earns.
    integratedDepartments: 0,
    leadershipConflict: 60,
    politics: 55,
    synergy: 0,
  };
  next.legacyEvent = { type: "merger", amount: offer.amount, buyerId: offer.buyerId };
  next.modifiers = { ...next.modifiers, expense: next.modifiers.expense * 1.25, leadInterval: next.modifiers.leadInterval * 0.85 };
  next.activeOffer = null;
  next.offerCooldown = OFFER_REJECT_COOLDOWN_SECONDS;
  next.eventLog = [`Merged with ${offer.buyerId}.`, ...next.eventLog].slice(0, 4);
  return next;
}

export function rejectOffer(state) {
  const next = cloneState(state);
  if (!next.activeOffer) return next;
  next.eventLog = [`Rejected the offer from ${next.activeOffer.buyerId}.`, ...next.eventLog].slice(0, 4);
  next.activeOffer = null;
  next.offerCooldown = OFFER_REJECT_COOLDOWN_SECONDS;
  return next;
}

export function negotiateOffer(state) {
  const next = cloneState(state);
  const offer = next.activeOffer;
  if (!offer || offer.negotiated) return next;

  // Merger negotiation is a prestige level 4 unlock; the offer carries the
  // negotiable flag decided at generation time.
  if (offer.negotiable === false) {
    next.eventLog = [`Negotiating this merger needs more founder prestige.`, ...next.eventLog].slice(0, 4);
    return next;
  }

  const evo = getEvolutionMetrics(next);
  offer.negotiated = true;
  // A strong company (reputation + profit) negotiates a higher price.
  if (evo.reputation >= 55 && evo.profit > 0) {
    const bump = 1.15 + evo.reputation / 400;
    offer.amount = Math.round(offer.amount * bump);
    next.eventLog = [`Negotiated a better offer with ${offer.buyerId}.`, ...next.eventLog].slice(0, 4);
  } else {
    next.eventLog = [`${offer.buyerId} would not improve the offer.`, ...next.eventLog].slice(0, 4);
  }
  next.activeOffer = offer;
  return next;
}

// Whether the founder can graduate from this company now. Graduation is the
// no-sale career milestone available to every tier, and the *only* progression
// step a Beginner company has (it cannot be sold/merged). Blocked once the
// company has committed to a destiny, has a live offer/legacy event to resolve,
// or is below the maturity bar.
function canGraduateCompany(state, stageIndex) {
  if (state.outcome) return false;
  if (state.destinyPath) return false;
  if (state.activeOffer) return false;
  if (state.legacyEvent) return false;
  return stageIndex >= GRADUATE_MIN_STAGE;
}

// Graduate the founder from a grown company. Records it in founder history as a
// graduation (career progress toward the next tier), then shows the shared
// legacy transition overlay whose "Found next company" continuation returns to
// company select with the founder profile intact. Unlike an exit there is no
// buyer or payout — this is purely a founder-career milestone.
export function graduateCompany(state) {
  const next = cloneState(state);
  const evo = getEvolutionMetrics(next);
  const stageIndex = getStageIndex(evo);
  if (!canGraduateCompany(next, stageIndex)) return next;
  const valuation = getCompanyValuation(next, evo, stageIndex);
  next.founderProfile = recordGraduation(next.founderProfile, next, valuation);
  next.destinyPath = "graduated";
  next.legacyEvent = { type: "graduation", companyId: next.companyType.id, amount: valuation };
  next.activeOffer = null;
  next.eventLog = [`Graduated from ${next.companyType.id}.`, ...next.eventLog].slice(0, 4);
  return next;
}

export function chooseDestiny(state, pathId) {
  const next = cloneState(state);
  if (next.destinyPath) return next;

  const evo = getEvolutionMetrics(next);
  const stageIndex = getStageIndex(evo);
  const unlocked = getUnlockedPaths(next, evo, stageIndex);
  const path = STRATEGIC_PATHS.find((item) => item.id === pathId);
  if (!path || path.kind !== "commit" || !unlocked.includes(pathId)) return next;

  next.destinyPath = pathId;
  const valuation = getCompanyValuation(next, evo, stageIndex);
  const effect = PATH_EFFECTS[pathId];
  if (effect) {
    next.modifiers = {
      expense: next.modifiers.expense * (effect.expense ?? 1),
      leadInterval: next.modifiers.leadInterval * (effect.leadInterval ?? 1),
      taskValue: next.modifiers.taskValue * (effect.taskValue ?? 1),
    };
  }
  if (pathId === "ipo") {
    next.publicCompany = {
      stockPrice: Math.max(12, Math.round(valuation / 45000)),
      shareholderConfidence: 58 + getLegacyBonusEffects(next.founderProfile).investorConfidence,
      quarterlyExpectation: Math.max(12000, Math.round(evo.totalRevenue * 0.28)),
      previousQuarterRevenue: evo.totalRevenue,
      quarterTimer: QUARTER_SECONDS,
      analystReputation: Math.round(evo.reputation),
      investorPressure: 35,
      // Expanded IPO governance (#18).
      boardAlignment: BOARD_START_ALIGNMENT, // board's confidence in the CEO (0–100)
      guidance: "balanced", // quarterly guidance stance (conservative/balanced/aggressive)
      boardSeatsGranted: 0, // concessions made to the board / activists
      activist: null, // active activist campaign { demandId } or null
      activistTimer: ACTIVIST_CHECK_SECONDS, // countdown to the next activist check
    };
    next.founderProfile = recordIpo(next.founderProfile, next, valuation);
    next.legacyEvent = { type: "ipo", amount: valuation };
  }
  if (pathId === "government") {
    next.compliance = {
      nationalContracts: 1,
      auditRisk: 42,
      complianceScore: 55 + getLegacyBonusEffects(next.founderProfile).complianceScore,
      publicReputation: Math.round(evo.reputation),
      pendingPayment: 0,
      paymentTimer: 0,
      auditPressure: 0,
      lastAudit: null,
      // Expanded government gameplay (#19): bidding + audit history.
      contractsLost: 0,
      lastBid: null,
      auditsRun: 0,
      auditsPassed: 0,
      auditsFined: 0,
      lastFine: 0,
    };
    next.founderProfile = recordGovernmentContractor(next.founderProfile, next, valuation);
    next.legacyEvent = { type: "government", amount: valuation };
  }
  if (pathId === "holding") {
    next.portfolio = {
      unlocked: true,
      activeCompanyId: next.companyType.id,
      assets: prepareFounderProfile(next.founderProfile).companies.map((company) => ({ ...company })),
    };
    next.founderProfile = addFounderProgress(next.founderProfile, { experience: 18, prestige: 8, legacyPoints: 1 });
    next.legacyEvent = { type: "portfolio", amount: valuation };
  }
  next.eventLog = [`Committed to the ${pathId} path.`, ...next.eventLog].slice(0, 4);
  return next;
}

export function dismissLegacyEvent(state) {
  const next = cloneState(state);
  next.legacyEvent = null;
  return next;
}

export function chooseAcquisitionPath(state, choiceId) {
  const next = cloneState(state);
  if (choiceId === "transition") {
    // A failed term negotiation costs buyer trust, which carries into the
    // transition as a lower starting trust (and so faster client churn).
    const buyerTrustPenalty = next.legacyEvent?.buyerTrustPenalty ?? 0;
    next.legacyEvent = null;
    next.acquisitionTransition = {
      daysRemaining: ACQUISITION_TRANSITION_SECONDS,
      morale: 72,
      buyerTrust: clamp(0, 100, 62 - buyerTrustPenalty),
      clientRetention: 82,
      systemsIntegration: 18,
      completed: false,
    };
    next.strategicEvent = makeStrategicEvent("acquisitionSystems");
    next.founderProfile = addFounderProgress(next.founderProfile, { experience: 12, prestige: 4 });
    return next;
  }
  if (choiceId === "negotiateTerms") {
    // One renegotiation attempt only — a resolved negotiation cannot be retried,
    // so the payout/prestige reward cannot be farmed by repeated clicks.
    if (next.legacyEvent?.negotiated) return next;
    const evo = getEvolutionMetrics(next);
    const prestigeLevel = getPrestigeLevel(next.founderProfile);
    const canWin = prestigeLevel >= 2 || (evo.reputation >= 70 && evo.profit > 0);
    const base = next.legacyEvent?.amount ?? 0;
    if (canWin) {
      const bonus = Math.round(base * (prestigeLevel >= 4 ? 0.14 : 0.08));
      next.cash += bonus;
      next.legacyEvent = { ...next.legacyEvent, amount: base + bonus, negotiated: true, negotiationResult: "success" };
      next.founderProfile = addFounderProgress(next.founderProfile, { experience: 16, prestige: 8, legacyPoints: 1 });
    } else {
      // Failure: the buyer's trust drops (felt later in the transition) and
      // integration overhead rises slightly.
      next.founderProfile = addFounderProgress(next.founderProfile, { experience: 5 });
      next.modifiers = { ...next.modifiers, expense: next.modifiers.expense * 1.03 };
      next.legacyEvent = { ...next.legacyEvent, negotiated: true, negotiationResult: "failed", buyerTrustPenalty: 18 };
    }
    return next;
  }
  return dismissLegacyEvent(next);
}

export function chooseStrategicDecision(state, choiceId) {
  const next = cloneState(state);
  const event = next.strategicEvent;
  if (!event || !event.choices.includes(choiceId)) return next;

  applyStrategicChoice(next, event.type, choiceId);
  next.strategicEvent = null;
  next.strategicEventCooldown = STRATEGIC_EVENT_COOLDOWN_SECONDS;
  return next;
}

function applyStrategicChoice(state, eventType, choiceId) {
  const transition = state.acquisitionTransition;
  const integration = state.integration;
  const publicCompany = state.publicCompany;
  const compliance = state.compliance;

  if (eventType === "acquisitionSystems" && transition) {
    if (choiceId === "protectMorale") {
      transition.morale = clamp(0, 100, transition.morale + 14);
      transition.systemsIntegration = clamp(0, 100, transition.systemsIntegration + 4);
      state.cash -= 4500;
    } else if (choiceId === "pushIntegration") {
      transition.systemsIntegration = clamp(0, 100, transition.systemsIntegration + 20);
      transition.morale = clamp(0, 100, transition.morale - 8);
      transition.buyerTrust = clamp(0, 100, transition.buyerTrust + 8);
    } else if (choiceId === "clientAssurance") {
      transition.clientRetention = clamp(0, 100, transition.clientRetention + 14);
      state.reputation += 2;
      state.cash -= 3000;
    }
    return;
  }

  if (integration) {
    const setMorale = (delta) => {
      integration.morale = clamp(0, 100, (integration.morale ?? 70) + delta);
    };
    if (choiceId === "mergeDepartments") {
      // Department Integration (#20): merging a duplicate is efficient and a
      // concrete synergy source, but displaces people (a culture/morale cost).
      integration.progress = clamp(0, 100, integration.progress + 18);
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict + 5);
      integration.duplicatedDepartments = Math.max(0, integration.duplicatedDepartments - 1);
      integration.integratedDepartments = (integration.integratedDepartments ?? 0) + 1;
      integration.synergy = clamp(0, 100, (integration.synergy ?? 0) + 6);
      setMorale(-4);
      state.modifiers.expense *= 0.97;
    } else if (choiceId === "keepBoth") {
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 8);
      integration.restructuringDebt = clamp(0, 100, integration.restructuringDebt + 8);
      setMorale(3);
      state.modifiers.expense *= 1.03;
    } else if (choiceId === "cutRedundancy") {
      integration.restructuringDebt = clamp(0, 100, integration.restructuringDebt - 18);
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict + 14);
      setMorale(-10);
      state.modifiers.expense *= 0.94;
    } else if (choiceId === "jointWorkshops") {
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 14);
      integration.progress = clamp(0, 100, integration.progress + 5);
      setMorale(8);
      state.cash -= 3500;
    } else if (choiceId === "strongRules") {
      integration.progress = clamp(0, 100, integration.progress + 12);
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict + 6);
      setMorale(-5);
    } else if (choiceId === "letTeamsSettle") {
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 5);
      integration.progress = clamp(0, 100, integration.progress - 2);
      setMorale(2);
    } else if (choiceId === "unifiedAccounts") {
      integration.progress = clamp(0, 100, integration.progress + 10);
      state.reputation += 1;
    } else if (choiceId === "splitAccounts") {
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 4);
      state.modifiers.leadInterval *= 1.03;
    } else if (choiceId === "premiumSupport") {
      state.reputation += 3;
      state.cash -= 5000;
    } else if (choiceId === "payoffDebt") {
      // Restructuring decision: clear restructuring debt with cash now.
      integration.restructuringDebt = clamp(0, 100, integration.restructuringDebt - 28);
      integration.progress = clamp(0, 100, integration.progress + 6);
      state.cash -= 8000;
    } else if (choiceId === "phasedRestructure") {
      integration.restructuringDebt = clamp(0, 100, integration.restructuringDebt - 14);
      setMorale(-3);
      state.modifiers.expense *= 0.96;
    } else if (choiceId === "deferRestructure") {
      integration.restructuringDebt = clamp(0, 100, integration.restructuringDebt + 10);
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 4);
      setMorale(4);
    } else if (choiceId === "promoteOne") {
      // Leadership Conflicts (#20): pick one leader — decisively resolves the
      // overlap, but the sidelined faction bristles (resentment → politics).
      integration.progress = clamp(0, 100, integration.progress + 14);
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict + 10);
      integration.leadershipConflict = clamp(0, 100, (integration.leadershipConflict ?? 0) - 22);
      integration.politics = clamp(0, 100, (integration.politics ?? 0) + 8);
      setMorale(-6);
    } else if (choiceId === "coLeadership") {
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 10);
      integration.leadershipConflict = clamp(0, 100, (integration.leadershipConflict ?? 0) - 10);
      integration.politics = clamp(0, 100, (integration.politics ?? 0) - 4);
      integration.progress = clamp(0, 100, integration.progress - 3);
      setMorale(7);
    } else if (choiceId === "externalHire") {
      // A neutral outside leader defuses the overlap and the politics around it.
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict - 6);
      integration.leadershipConflict = clamp(0, 100, (integration.leadershipConflict ?? 0) - 18);
      integration.politics = clamp(0, 100, (integration.politics ?? 0) - 6);
      integration.progress = clamp(0, 100, integration.progress + 8);
      setMorale(-3);
      state.cash -= 6000;
    } else if (choiceId === "mediateFactions") {
      // Corporate Politics (#20): invest in mediation — the strongest, costliest
      // way to defuse factionalism and lift morale.
      state.cash -= 4000;
      integration.politics = clamp(0, 100, (integration.politics ?? 0) - 22);
      integration.leadershipConflict = clamp(0, 100, (integration.leadershipConflict ?? 0) - 6);
      setMorale(6);
    } else if (choiceId === "consolidatePower") {
      // Centralize control: cuts politics and pushes integration, but heavy-handed
      // (morale + culture cost).
      integration.politics = clamp(0, 100, (integration.politics ?? 0) - 16);
      integration.progress = clamp(0, 100, integration.progress + 8);
      integration.cultureConflict = clamp(0, 100, integration.cultureConflict + 10);
      setMorale(-8);
    } else if (choiceId === "openForum") {
      // An all-hands forum: free, modestly calms politics and morale, but slow.
      integration.politics = clamp(0, 100, (integration.politics ?? 0) - 8);
      integration.progress = clamp(0, 100, integration.progress - 2);
      setMorale(4);
    }
    state.founderProfile = addFounderProgress(state.founderProfile, { experience: 5 });
    return;
  }

  if (publicCompany) {
    if (choiceId === "acceptQuarterPlan") {
      // The quarterly review grades five shareholder criteria: revenue target,
      // profit, revenue growth, reputation, and operational health (bottlenecks).
      // The result is proportional to how many were met, not pass/fail.
      const revenueGrowth = state.revenue - (publicCompany.previousQuarterRevenue ?? 0);
      const maxSeverity = Math.max(0, ...state.departments.map((d) => d.bottleneck?.severity ?? 0));
      const criteria = [
        state.revenue >= publicCompany.quarterlyExpectation, // hit the quarterly target
        state.revenue - state.expenses > 0, // profitable
        revenueGrowth >= 0, // revenue growth vs last quarter
        (state.reputation ?? 0) >= 60, // reputation strong enough
        maxSeverity < 0.4, // no severe bottleneck dragging operations
      ];
      const metCount = criteria.filter(Boolean).length;
      const score = metCount - 2.5; // +2.5 (all met) .. -2.5 (none met)
      // Quarterly guidance (#18) scales the reward/penalty: aggressive guidance is
      // high risk/reward, conservative dampens both. Default "balanced" → ×1.
      const swing = GUIDANCE_SWING[publicCompany.guidance ?? "balanced"] ?? 1;
      publicCompany.stockPrice = Math.max(1, publicCompany.stockPrice * (1 + score * 0.05 * swing));
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + score * 6 * swing);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - score * 5 * swing);
      // Hitting (or missing) guidance also moves the board's confidence in the CEO.
      publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + score * 4 * swing);
      publicCompany.lastQuarterScore = metCount;
      publicCompany.previousQuarterRevenue = state.revenue;
      publicCompany.quarterTimer = QUARTER_SECONDS;
    } else if (choiceId === "resetGuidance") {
      publicCompany.quarterlyExpectation = Math.max(9000, Math.round(state.revenue * 0.22));
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence - 6);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 4);
    } else if (choiceId === "shortTermProfit") {
      state.modifiers.expense *= 0.95;
      state.modifiers.taskValue *= 1.04;
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 5);
      state.reputation = Math.max(0, state.reputation - 2);
    } else if (choiceId === "longTermQuality") {
      state.modifiers.expense *= 1.04;
      state.reputation += 3;
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure + 3);
    } else if (choiceId === "issueShares") {
      const raised = Math.round(publicCompany.stockPrice * 1200);
      state.cash += raised;
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 4);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure + 8);
    } else if (choiceId === "preserveControl") {
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 5);
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence - 3);
    } else if (choiceId === "guidanceConservative" || choiceId === "guidanceBalanced" || choiceId === "guidanceAggressive") {
      // Quarterly Guidance (#18): set the stance for the next quarter. The stance
      // scales the target and the size of the review swing. A conservative bar
      // reassures the market short-term but reads as unambitious to the board; an
      // aggressive bar excites investors but raises pressure and the stakes.
      const stance = choiceId === "guidanceConservative" ? "conservative" : choiceId === "guidanceAggressive" ? "aggressive" : "balanced";
      publicCompany.guidance = stance;
      publicCompany.quarterlyExpectation = Math.max(9000, Math.round(state.revenue * GUIDANCE_QUARTER_RATE * GUIDANCE_MULTIPLIER[stance]));
      if (stance === "conservative") {
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 4);
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) - 3);
      } else if (stance === "aggressive") {
        publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 5);
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure + 6);
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + 4);
      } else {
        publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 2);
      }
    } else if (choiceId === "boardBuyback") {
      // Board of Directors (#18): a buyback realigns the board and reassures it.
      state.cash -= Math.round(publicCompany.stockPrice * 800);
      publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + 12);
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 5);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 6);
    } else if (choiceId === "boardGrantSeat") {
      // Cede a board seat: cheap and strongly realigning, but a control concession.
      publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + 20);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 8);
      publicCompany.boardSeatsGranted = (publicCompany.boardSeatsGranted ?? 0) + 1;
      state.reputation = Math.max(0, state.reputation - 2);
    } else if (choiceId === "boardDefendStrategy") {
      // Defend the plan to the board — a gamble on your standing.
      if ((state.reputation ?? 0) >= 60 || publicCompany.shareholderConfidence >= 60) {
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + 10);
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 3);
      } else {
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) - 8);
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure + 5);
        publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence - 3);
      }
    } else if (choiceId === "backProposal") {
      // Shareholder Votes (#18): approve a shareholder proposal (e.g. a dividend).
      state.cash -= Math.round(state.companyType.baseTaskValue * 40);
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 7);
      publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + 5);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 6);
    } else if (choiceId === "negotiateProposal") {
      state.cash -= Math.round(state.companyType.baseTaskValue * 15);
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 3);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 3);
    } else if (choiceId === "rejectProposal") {
      // Put it to a vote: you win on strong confidence, lose on weak.
      if (publicCompany.shareholderConfidence >= 60) {
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 4);
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + 3);
      } else {
        publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence - 5);
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure + 6);
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) - 5);
      }
    } else if (choiceId === "appeaseActivist") {
      // Activist Investors (#18): give in to the demand — costly and a reputation
      // ding, but it relieves pressure and ends the campaign.
      state.cash -= Math.round(state.companyType.baseTaskValue * 30);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 14);
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 6);
      state.reputation = Math.max(0, state.reputation - 3);
      publicCompany.activist = null;
    } else if (choiceId === "fightActivist") {
      // Proxy fight: free, but you win only with a strong board + confidence.
      if ((publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + publicCompany.shareholderConfidence >= 110) {
        publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 8);
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 12);
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) + 6);
      } else {
        publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence - 8);
        publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure + 10);
        publicCompany.boardAlignment = clamp(0, 100, (publicCompany.boardAlignment ?? BOARD_START_ALIGNMENT) - 6);
        publicCompany.boardSeatsGranted = (publicCompany.boardSeatsGranted ?? 0) + 1;
      }
      publicCompany.activist = null;
    } else if (choiceId === "buybackActivist") {
      // Buy back shares to defuse the activist: expensive, but lifts the stock.
      state.cash -= Math.round(publicCompany.stockPrice * 1000);
      publicCompany.stockPrice = Math.max(1, publicCompany.stockPrice * 1.05);
      publicCompany.investorPressure = clamp(15, 95, publicCompany.investorPressure - 16);
      publicCompany.shareholderConfidence = clamp(20, 100, publicCompany.shareholderConfidence + 4);
      publicCompany.activist = null;
    }
    state.founderProfile = addFounderProgress(state.founderProfile, { experience: 6, prestige: 1 });
    return;
  }

  if (compliance) {
    if (choiceId === "bidAggressive" || choiceId === "bidStandard" || choiceId === "bidPremium") {
      // Real contract bidding (#19): submit a bid into a competitive tender. The
      // win is decided against the procurement competition (rival field) from the
      // bid stance + compliance score + reputation — not handed over. Aggressive
      // (undercut) wins more often but pays less and cuts corners (more audit
      // risk); premium pays more and lifts reputation but is harder to win.
      const tender = state.strategicEvent?.tender ?? makeTender(state);
      const winScore = compliance.complianceScore * 0.4 + (state.reputation ?? 0) * 0.4 + GOV_BID_WIN_BONUS[choiceId];
      const threshold = GOV_TENDER_BASE_THRESHOLD + tender.rivals * GOV_TENDER_RIVAL_WEIGHT;
      const won = winScore >= threshold;
      if (won) {
        compliance.nationalContracts += 1;
        compliance.pendingPayment = (compliance.pendingPayment ?? 0) + Math.round(tender.value * GOV_BID_PAYOUT_MULT[choiceId]);
        compliance.paymentTimer = GOV_PAYMENT_DELAY_SECONDS;
        compliance.auditRisk = clamp(5, 90, compliance.auditRisk + GOV_BID_RISK[choiceId]);
        state.reputation += choiceId === "bidPremium" ? 4 : 2;
      } else {
        // Lost the tender to a rival: no contract, a small standing knock.
        compliance.contractsLost = (compliance.contractsLost ?? 0) + 1;
        state.reputation = Math.max(0, state.reputation - 1);
      }
      compliance.lastBid = { stance: choiceId, won, value: tender.value };
    } else if (choiceId === "declineContract") {
      // Pass on the contract: stay lean and lower scrutiny.
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk - 4);
    } else if (choiceId === "pursueCertification") {
      // Compliance event (#19): earn an industry certification — costly, but a big
      // compliance + reputation gain that lowers audit scrutiny.
      state.cash -= Math.round(state.companyType.baseTaskValue * 50);
      compliance.complianceScore = clamp(0, 100, compliance.complianceScore + 18);
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk - 14);
      compliance.publicReputation = clamp(0, 100, compliance.publicReputation + 5);
      state.reputation += 3;
    } else if (choiceId === "skipCertification") {
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk + 6);
    } else if (choiceId === "investigateReport") {
      // Compliance event (#19): a whistleblower report — investigating costs cash
      // and a short-term public hit, but strengthens compliance and lowers risk.
      state.cash -= Math.round(state.companyType.baseTaskValue * 30);
      compliance.complianceScore = clamp(0, 100, compliance.complianceScore + 12);
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk - 12);
      compliance.publicReputation = clamp(0, 100, compliance.publicReputation - 3);
    } else if (choiceId === "downplayReport") {
      // Bury it: cheap now, but riskier and damaging to compliance if audited.
      compliance.complianceScore = clamp(0, 100, compliance.complianceScore - 6);
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk + 14);
    } else if (choiceId === "fullAuditPrep") {
      state.cash -= 6500;
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk - 18);
      compliance.complianceScore = clamp(0, 100, compliance.complianceScore + 8);
      state.reputation += 2;
    } else if (choiceId === "minimalAuditPrep") {
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk + 12);
      compliance.complianceScore = clamp(0, 100, compliance.complianceScore - 4);
    } else if (choiceId === "buyComplianceUpgrade") {
      state.cash -= 9000;
      compliance.complianceScore = clamp(0, 100, compliance.complianceScore + 14);
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk - 10);
    } else if (choiceId === "delayComplianceUpgrade") {
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk + 8);
    } else if (choiceId === "rushDelivery") {
      state.cash += Math.round(state.companyType.baseTaskValue * 16);
      compliance.complianceScore = clamp(0, 100, compliance.complianceScore - 8);
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk + 10);
    } else if (choiceId === "requestExtension") {
      compliance.publicReputation = clamp(0, 100, compliance.publicReputation - 4);
      compliance.auditRisk = clamp(5, 90, compliance.auditRisk - 4);
    }
    state.founderProfile = addFounderProgress(state.founderProfile, { experience: 6, prestige: 1 });
  }
}

export function getMetrics(state) {
  const employees = state.departments.reduce((sum, department) => sum + department.employees, 0);
  const active = state.tasks.filter((task) => task.status !== "completed").length;
  const queueSizes = state.departments.reduce((sizes, department) => {
    sizes[department.id] = department.queue.length;
    return sizes;
  }, {});
  const bottleneck = getBottleneck(state);
  const overloadedDepartments = state.departments.filter((department) => department.bottleneck?.isOverloaded);
  const bottleneckPenalty = getBottleneckPenalty(state);
  const automationEffects = getAutomationEffects(state);
  const automations = getAutomationStatus(state);
  const ownedAutomations = state.ownedAutomations.map((id) => AUTOMATION_BY_ID[id]).filter(Boolean);
  const nextAutomation = automations.find((automation) => automation.unlocked && !automation.owned) ?? null;
  const profit = state.revenue - state.expenses;

  const metrics = {
    employees,
    active,
    queueSizes,
    totalQueued: getTotalQueued(state),
    bottleneck,
    overloadedDepartments,
    bottleneckPenalty,
    revenueMultiplier: getRevenueMultiplier(state),
    automations,
    ownedAutomations,
    automationEffects,
    automationEra: getAutomationEra(state),
    achievements: state.achievements ?? [],
    lastAchievement: state.lastAchievement ?? null,
    nextAutomation,
    hireCosts: state.departments.reduce((costs, department) => {
      costs[department.id] = getHireCost(department, state);
      return costs;
    }, {}),
    revenue: state.revenue,
    expenses: state.expenses,
    profit,
    cash: state.cash,
    completedTasks: state.completedTasks,
    expensePerSecond: getExpensePerSecond(state),
    throughputPerMinute: getThroughputPerMinute(state),
    evolution: getEvolutionState(state),
    founderProfile: {
      ...prepareFounderProfile(state.founderProfile),
      prestigeLevel: getPrestigeLevel(state.founderProfile),
      prestigeUnlocks: getPrestigeUnlocks(state.founderProfile),
    },
    // Founder Career (#21 traits, #22 skill tree): unlocked traits + skill levels
    // and the points available to allocate.
    founderCareer: {
      traits: getUnlockedTraits(state.founderProfile),
      skills: { ...prepareFounderProfile(state.founderProfile).skills },
      points: getFounderSkillPoints(state.founderProfile),
    },
    // Venture Capital (#23): the funding-round view (equity, influence, pressure,
    // expectation vs current revenue) + whether another round can be raised.
    venture: state.venture
      ? {
          round: state.venture.round,
          roundName: state.venture.round > 0 ? VENTURE_ROUND_NAMES[state.venture.round - 1] : null,
          nextRoundName: VENTURE_ROUND_NAMES[state.venture.round] ?? null,
          founderEquity: Math.round(state.venture.founderEquity ?? 100),
          investorInfluence: Math.round(state.venture.investorInfluence ?? 0),
          pressure: Math.round(state.venture.pressure ?? 0),
          expectation: state.venture.expectation ?? 0,
          raisedTotal: state.venture.raisedTotal ?? 0,
          available: isVentureRoundAvailable(state),
          // Whether this company's tier supports investors at all (so the UI can
          // hide the venture panel entirely for Beginner companies).
          capable: companyHasCapability(state.companyType, "investors"),
          raiseAmount: getVentureRaiseAmount(state),
          maxRounds: VENTURE_MAX_ROUNDS,
        }
      : null,
    // Internal Synergies (#25): the active portfolio-synergy bonus the company
    // gets from the founder's concurrently-run companies.
    internalSynergy: getInternalSynergyEffects(state),
  };

  // Player-guidance views (pure, derived from state + the metrics above).
  metrics.advisor = getAdvisorRecommendation(state, metrics);
  metrics.incomeBreakdown = getIncomeBreakdown(state, metrics, metrics.advisor);
  metrics.companyReport = state.companyReport ? { ...state.companyReport, recommendation: metrics.advisor } : null;
  metrics.firstRunChapter = getFirstRunChapter(state, metrics);
  metrics.goal = getGoalView(state);
  metrics.growth = getGrowthStatus(state, metrics);
  metrics.nextUnlock = getNextUnlock(state, metrics);
  metrics.emergency = { used: state.emergencyFundsUsed ?? 0, max: MAX_EMERGENCY_FUNDS };
  metrics.loanAvailable = isLoanAvailable(state);
  metrics.debt = state.debt ?? 0;
  metrics.clients = getClientsView(state);
  metrics.ceoDecision = state.ceoDecision;
  metrics.manager = {
    ...state.manager,
    available: isManagerAvailable(state),
    hireCost: managerHireCost(state),
    salaryPerSecond: state.companyType.baseTaskValue * MANAGER_SALARY_RATE,
  };
  metrics.morale = {
    happiness: Math.round(state.employeeHappiness ?? 85),
    raiseCost: raiseCost(state),
    tier: (state.employeeHappiness ?? 85) >= 75 ? "high" : (state.employeeHappiness ?? 85) >= 50 ? "ok" : "low",
  };
  metrics.culture = { active: state.culture ?? null };
  metrics.specialists = {
    available: state.availableSpecialist ?? null,
    availableCost: state.availableSpecialist ? specialistCost(state, state.availableSpecialist) : 0,
    hired: [...(state.specialHires ?? [])],
  };
  // Market Share (#16): dominance + the gameplay effects it drives.
  const marketEffects = getMarketShareEffects(state);
  metrics.marketShare = {
    share: Math.round(marketEffects.share),
    tier: marketEffects.tier,
    leadPct: Math.round((1 - marketEffects.leadIntervalMultiplier) * 100), // + = faster leads
    valuationPct: Math.round((marketEffects.valuationMultiplier - 1) * 100),
    reputationBonus: Math.round(marketEffects.reputationBonus),
  };
  // Industry Trends (#17): the active climate (null = neutral) for the UI banner.
  metrics.industryTrend = state.industryTrend
    ? {
        id: state.industryTrend.id,
        severity: state.industryTrend.severity,
        remaining: Math.ceil(state.industryTrend.remaining ?? 0),
      }
    : null;
  return metrics;
}

// Client reputation effects: rolling client satisfaction (60..100) drives real
// gameplay rewards — bigger project budgets, more referrals (faster leads), and
// higher buyout offers. Centred so satisfaction ~73 is neutral; a happy client
// base (≈100) is a clear-but-bounded advantage, an unhappy one a penalty.
export function getClientReputationEffects(state) {
  const satisfaction = state.clientSatisfaction ?? 100;
  const norm = clamp(0, 1, (satisfaction - 60) / 40); // 0 at 60, 1 at 100
  return {
    satisfaction,
    budgetMultiplier: 0.85 + norm * 0.3, // 0.85..1.15 — bigger/better projects
    leadIntervalMultiplier: 1.1 - norm * 0.2, // 1.1..0.9 — more referrals (faster leads)
    offerPremium: ((satisfaction - 75) / 25) * 0.1, // ~-6%..+10% on buyout offers
    tier: satisfaction >= 80 ? "happy" : satisfaction >= 65 ? "steady" : "unhappy",
  };
}

// --- Venture Capital (#23) --------------------------------------------------

// Read-time effects of the current venture state: board influence pushes growth
// (a shorter lead interval) and unmet investor expectations raise the burn rate
// (a higher expense), plus the founder's exit share (= equity owned). Neutral
// until the founder raises a round, so it never affects a bootstrapped company.
export function getVentureEffects(state) {
  const venture = state.venture;
  if (!venture || venture.round <= 0) {
    return { leadInterval: 1, expense: 1, exitShare: 1, influence: 0, equity: 100 };
  }
  const influence = venture.investorInfluence ?? 0;
  const pressure = venture.pressure ?? 0;
  return {
    leadInterval: clamp(0.85, 1, 1 - (influence / 100) * 0.12), // growth push: up to −12% interval
    expense: clamp(1, 1.12, 1 + (pressure / 100) * 0.12), // unmet expectations burn: up to +12%
    exitShare: clamp(0, 1, (venture.founderEquity ?? 100) / 100), // founder's cut of an acquisition
    influence,
    equity: venture.founderEquity ?? 100,
  };
}

// A round can be raised while bootstrapped (no destiny path committed), below the
// round cap, and before investors gain controlling influence.
export function isVentureRoundAvailable(state) {
  const venture = state.venture;
  if (!venture || state.destinyPath) return false;
  // Career-tier gate: raising private capital (investors / venture capital) is a
  // scaling mechanic that only exists at Intermediate and up. Beginner companies
  // are bootstrapped only.
  if (!companyHasCapability(state.companyType, "investors")) return false;
  if (venture.round >= VENTURE_MAX_ROUNDS) return false;
  if ((venture.investorInfluence ?? 0) >= VENTURE_INFLUENCE_CAP) return false;
  return true;
}

// The cash a round would raise: scales with the round (later rounds are larger)
// and the company's reputation (a stronger company commands more).
export function getVentureRaiseAmount(state) {
  const round = state.venture?.round ?? 0;
  const reputationFactor = 1 + (state.reputation ?? 0) / 120;
  return Math.round(state.companyType.baseTaskValue * (40 + round * 45) * reputationFactor);
}

// Raise the next funding round: cash now, in exchange for equity (dilution),
// board influence, and a fresh revenue-growth expectation.
export function raiseVentureRound(state) {
  const next = cloneState(state);
  if (!isVentureRoundAvailable(next)) {
    next.eventLog = ["No venture round is available right now.", ...next.eventLog].slice(0, 4);
    return next;
  }
  const venture = next.venture;
  const amount = getVentureRaiseAmount(next);
  const dilution = VENTURE_DILUTION[venture.round] ?? 0.1;
  next.cash += amount;
  venture.raisedTotal = (venture.raisedTotal ?? 0) + amount;
  venture.founderEquity = Math.round((venture.founderEquity ?? 100) * (1 - dilution) * 10) / 10;
  venture.investorInfluence = clamp(0, 100, (venture.investorInfluence ?? 0) + VENTURE_INFLUENCE_PER_ROUND);
  venture.round += 1;
  // Investors expect the company to grow into the new capital.
  venture.expectation = Math.round(Math.max(next.revenue, 1) * 1.6 + amount * 0.5);
  venture.pressure = Math.max(0, (venture.pressure ?? 0) - 10); // fresh capital eases pressure briefly
  venture.checkTimer = VENTURE_CHECK_SECONDS;
  next.eventLog = [`Raised a ${VENTURE_ROUND_NAMES[venture.round - 1] ?? "venture"} round: +${formatCost(amount)}.`, ...next.eventLog].slice(0, 4);
  return next;
}

// Investor Expectations: on a cadence, investors review revenue growth against the
// expectation set at the last raise. Meeting it eases pressure and lifts standing;
// missing it builds pressure (which raises the burn rate via getVentureEffects)
// and dents reputation. Deterministic, so it behaves the same offline.
function updateVenture(state, dt) {
  const venture = state.venture;
  if (!venture || venture.round <= 0) return;
  venture.checkTimer = Math.max(0, (venture.checkTimer ?? VENTURE_CHECK_SECONDS) - dt);
  if (venture.checkTimer > 0) return;
  venture.checkTimer = VENTURE_CHECK_SECONDS;
  if ((state.revenue ?? 0) >= (venture.expectation ?? 0)) {
    venture.pressure = clamp(0, 100, (venture.pressure ?? 0) - 15);
    state.reputation = (state.reputation ?? 0) + 2;
    venture.expectation = Math.round(Math.max(state.revenue, 1) * 1.4); // investors raise the bar
  } else {
    venture.pressure = clamp(0, 100, (venture.pressure ?? 0) + 12);
    state.reputation = Math.max(0, (state.reputation ?? 0) - 2);
  }
}

// --- Internal Synergies (#25) -----------------------------------------------

// When the founder runs several companies at once (Active Multi-Company
// Management, #24), they share executives, employees, resources, and clients.
// `state.portfolioCount` (stamped by App when the roster changes) drives a small,
// bounded read-time bonus that scales with how many companies run concurrently —
// shared clients (richer work + more leads), shared resources (lower costs), and
// shared staff (faster work). Neutral for a single company, so it never affects a
// solo founder or existing saves.
export function getInternalSynergyEffects(state) {
  const count = Math.max(1, state.portfolioCount ?? 1);
  const extra = Math.min(4, count - 1); // each additional company adds synergy, capped at 5 total
  return {
    count,
    taskValue: 1 + extra * 0.03, // shared clients → richer projects
    expense: 1 - extra * 0.025, // shared resources → lower running costs
    leadInterval: 1 - extra * 0.03, // shared clients → more inbound work
    speedMultiplier: 1 + extra * 0.02, // shared staff → faster work
  };
}

// Combined read-time effects from the chosen company culture + signed special
// employees. Multipliers (taskValue/expense/leadInterval/speedMultiplier) and
// additive bonuses (accuracyBonus/satisfactionBonus) are folded into the same
// read points as the other modifiers, so culture/specialists are a clean layer
// that can change without compounding into persistent state.
export function getCompanyEffects(state) {
  const effects = { taskValue: 1, expense: 1, leadInterval: 1, speedMultiplier: 1, accuracyBonus: 0, satisfactionBonus: 0 };
  const apply = (source) => {
    if (!source) return;
    for (const [key, value] of Object.entries(source)) {
      if (key === "accuracyBonus" || key === "satisfactionBonus") effects[key] += value;
      else effects[key] *= value;
    }
  };
  apply(CULTURE_BY_ID[state.culture]?.effects);
  for (const id of state.specialHires ?? []) apply(SPECIALIST_BY_ID[id]?.effects);
  // Founder Traits (#21): permanent, earned passive bonuses that carry across the
  // founder's whole career (neutral for a founder with no milestones yet).
  apply(getFounderTraitEffects(state.founderProfile));
  // Industry Trends (#17): the active climate shifts the same effect keys
  // (leadInterval/taskValue/speedMultiplier/expense/accuracy), so a boom or a
  // downturn is felt across leads, payout, processing, and costs automatically.
  apply(INDUSTRY_TREND_BY_ID[state.industryTrend?.id]?.effects);
  // Merger Synergy (#20): a well-integrated merger boosts payout/speed and trims
  // costs (neutral when there is no integration or synergy is unbuilt).
  const synergy = getSynergyEffects(state);
  effects.taskValue *= synergy.taskValue;
  effects.expense *= synergy.expense;
  effects.speedMultiplier *= synergy.speedMultiplier;
  // Venture Capital (#23): board influence pushes growth (faster leads), and
  // unmet investor expectations raise the burn rate (higher expense). Neutral
  // until the founder raises a round.
  const venture = getVentureEffects(state);
  effects.leadInterval *= venture.leadInterval;
  effects.expense *= venture.expense;
  // Internal Synergies (#25): a portfolio of concurrently-run companies shares
  // executives, staff, resources, and clients (neutral for a single company).
  const internal = getInternalSynergyEffects(state);
  effects.taskValue *= internal.taskValue;
  effects.expense *= internal.expense;
  effects.leadInterval *= internal.leadInterval;
  effects.speedMultiplier *= internal.speedMultiplier;
  return effects;
}

// In-flight client projects + rolling satisfaction, for the Active Clients panel.
function getClientsView(state) {
  const active = [];
  for (const task of state.tasks) {
    if (task.status === "completed" || !task.clientId) continue;
    active.push({
      id: task.id,
      clientId: task.clientId,
      industry: task.industry,
      projectId: task.projectId,
      budget: task.value,
      late: state.elapsed > (task.deadline ?? Infinity),
      rareContract: Boolean(task.rareContract),
    });
    if (active.length >= 6) break;
  }
  const reputation = getClientReputationEffects(state);
  return {
    satisfaction: Math.round(state.clientSatisfaction ?? 100),
    tier: reputation.tier,
    budgetPct: Math.round((reputation.budgetMultiplier - 1) * 100),
    referralPct: Math.round((1 - reputation.leadIntervalMultiplier) * 100),
    offerPct: Math.round(reputation.offerPremium * 100),
    activeCount: state.tasks.filter((task) => task.status !== "completed" && task.clientId).length,
    active,
  };
}

// Derived lifecycle view for the UI and notifications.
export function getEvolutionState(state) {
  const evoMetrics = getEvolutionMetrics(state);
  const progress = getStageProgress(evoMetrics);
  const unlockedPaths = getUnlockedPaths(state, evoMetrics, progress.stageIndex);
  const tier = getCompanyTier(state.companyType);
  return {
    metrics: evoMetrics,
    stageId: progress.stageId,
    stageIndex: progress.stageIndex,
    nextStageId: progress.next,
    requirements: progress.requirements,
    unlockedPaths,
    // Only surface strategic paths whose capability this company's tier grants.
    // A Beginner company therefore shows no strategic paths at all (no sell,
    // merge, IPO, government, board, or holding) — they unlock with the tier.
    paths: STRATEGIC_PATHS.filter((path) => !path.capability || companyHasCapability(state.companyType, path.capability)).map((path) => ({
      id: path.id,
      kind: path.kind,
      unlocked: unlockedPaths.includes(path.id),
      chosen: state.destinyPath === path.id,
    })),
    // Career tier of the active company + whether it offers any strategic paths,
    // so the UI can explain that exits/M&A/IPO unlock at higher tiers.
    tier,
    hasStrategicPaths: STRATEGIC_PATHS.some((path) => !path.capability || companyHasCapability(state.companyType, path.capability)),
    // The founder "graduation" milestone: a Beginner company has no exit, so once
    // it is meaningfully grown the founder can graduate from it to advance their
    // career and unlock the next tier (see graduateCompany).
    canGraduate: canGraduateCompany(state, progress.stageIndex),
    destinyPath: state.destinyPath,
    activeOffer: state.activeOffer,
    reachedStages: state.reachedStages,
    outcome: state.outcome,
    reputation: state.reputation,
    founderProfile: prepareFounderProfile(state.founderProfile),
    legacyEvent: state.legacyEvent,
    publicCompany: state.publicCompany,
    integration: state.integration,
    compliance: state.compliance,
    acquisitionTransition: state.acquisitionTransition,
    strategicEvent: state.strategicEvent,
    portfolio: getPortfolioView(state),
    prestigeUnlocks: getPrestigeUnlocks(state.founderProfile),
  };
}

// Founder Portfolio view (honest MVP). The portfolio is a read-only ledger of the
// founder's companies as legacy assets — it does not switch or concurrently run
// multiple live simulations (see ARCHITECTURE.md "Founder Portfolio"). The asset
// list is derived live from the founder profile each render so valuations and
// roles stay current, rather than reading the snapshot frozen at unlock time.
function getPortfolioView(state) {
  if (!state.portfolio) return null;
  const profile = prepareFounderProfile(state.founderProfile);
  const assets = profile.companies.map((company) => ({ ...company }));
  return {
    ...state.portfolio,
    assets,
    totalValuation: assets.reduce((sum, c) => sum + Math.max(c.valuation ?? 0, c.revenue ?? 0), 0),
  };
}

export function getHireCost(department, state = null) {
  const base = HIRE_BASE_COST + department.employeeCost * HIRE_COST_PER_RATE;
  const legacyDiscount = state ? Math.min(0.25, getLegacyBonusEffects(state.founderProfile).hiringAttractiveness / 100) : 0;
  // Prestige level 3 unlocks elite manager candidates: a hiring-cost discount
  // that stacks with the merger hiring-attractiveness bonus, capped overall.
  const eliteDiscount = state ? getPrestigeUnlockEffects(state.founderProfile).eliteManagerDiscount : 0;
  const totalDiscount = Math.min(0.4, legacyDiscount + eliteDiscount);
  // Founder "Hiring" skill (#22): a further cheaper-hires multiplier (×1 at level 0).
  const skillMult = state ? getFounderSkillEffects(state.founderProfile).hireCostMult : 1;
  return Math.round(base * (1 + department.employees * HIRE_GROWTH) * (1 - totalDiscount) * skillMult);
}

// Aggregates the effects of every owned automation. Speed/accuracy/value/move
// effects are global; capacity is applied only to a tool's target departments
// (or everywhere when a tool has no target). Pass a departmentId to fold the
// targeted capacity bonus and auto-invoice speedup into the result.
export function getAutomationEffects(state, departmentId = null) {
  const owned = state.ownedAutomations.map((id) => AUTOMATION_BY_ID[id]).filter(Boolean);
  const effects = {
    speedMultiplier: 1,
    accuracyBonus: 0,
    valueMultiplier: 1,
    moveSpeedMultiplier: 1,
    capacityBonus: 0,
    autoInvoice: false,
    workflowLines: false,
    fastMovement: false,
    aiTerminals: false,
    toolCount: owned.length,
  };

  for (const automation of owned) {
    effects.speedMultiplier *= automation.speedMultiplier ?? 1;
    effects.accuracyBonus += automation.accuracyBonus ?? 0;
    effects.valueMultiplier *= automation.valueMultiplier ?? 1;
    effects.moveSpeedMultiplier *= automation.moveSpeedMultiplier ?? 1;

    const targetsDepartment = !automation.target || (departmentId && automation.target.includes(departmentId));
    if (targetsDepartment) {
      effects.capacityBonus += automation.capacityBonus ?? 0;
    }

    if (automation.visual === "workflow-lines") effects.workflowLines = true;
    if (automation.visual === "fast-movement") effects.fastMovement = true;
    if (automation.visual === "ai-terminals") effects.aiTerminals = true;
    if (automation.autoInvoice) effects.autoInvoice = true;
  }

  // The tree is deep and effects stack, so clamp the aggregate well above what the
  // original four tools produce — a fully modernized company is strong, never
  // runaway. (Caps are inert for any small toolset, including legacy saves.)
  effects.speedMultiplier = Math.min(effects.speedMultiplier, 2.6);
  effects.valueMultiplier = Math.min(effects.valueMultiplier, 2.4);
  effects.accuracyBonus = Math.min(effects.accuracyBonus, 0.4);
  effects.moveSpeedMultiplier = Math.min(effects.moveSpeedMultiplier, 3.6);

  return effects;
}

// Highest automation era the company has reached (for UI grouping + the AI office
// ambiance). Returns null when only the starter tool is owned, "early"/"growing"
// for back-office tooling, and "ai"/"advanced" once AI tools come online.
export function getAutomationEra(state) {
  let bestIndex = -1;
  let best = null;
  for (const id of state.ownedAutomations ?? []) {
    const automation = AUTOMATION_BY_ID[id];
    if (!automation || automation.starter) continue;
    const index = AUTOMATION_ERA_INDEX[automation.era] ?? 0;
    if (index > bestIndex) {
      bestIndex = index;
      best = automation.era;
    }
  }
  return best;
}

// --- Achievements / celebration milestones (#5) -----------------------------

// Stable ids of every milestone the company currently satisfies, derived purely
// from live state (so it behaves identically online and during offline catch-up).
export function evaluateAchievements(state) {
  const out = [];
  const reached = state.reachedStages ?? [];
  const era = getAutomationEra(state);
  if ((state.revenue ?? 0) > 0 && (state.revenue ?? 0) > (state.expenses ?? 0)) out.push("first-profit");
  if ((state.ownedAutomations?.length ?? 0) >= 2) out.push("first-automation");
  if (reached.includes("small-business")) out.push("small-business");
  if (state.manager?.hired) out.push("first-manager");
  if ((state.venture?.round ?? 0) >= 1) out.push("first-funding");
  if (reached.includes("growing-company")) out.push("growing-company");
  if ((state.revenue ?? 0) >= 1_000_000) out.push("first-million");
  if ((state.marketShare ?? 0) >= 50) out.push("market-leader");
  if (reached.includes("enterprise")) out.push("enterprise");
  if (era === "ai" || era === "advanced") out.push("ai-era");
  if (reached.includes("corporation")) out.push("corporation");
  if ((state.ownedAutomations ?? []).includes("autonomous-departments")) out.push("autonomous");
  return out;
}

// Records newly-satisfied milestones once on `state.achievements` and stamps the
// most recent on `state.lastAchievement` so the UI can pop a single celebration.
function updateAchievements(state) {
  const unlocked = new Set(state.achievements ?? []);
  let newest = null;
  for (const id of evaluateAchievements(state)) {
    if (!unlocked.has(id)) {
      unlocked.add(id);
      newest = id;
    }
  }
  if (newest) {
    // Preserve canonical (data) order so the stored list reads as a growth story.
    state.achievements = ACHIEVEMENT_IDS.filter((id) => unlocked.has(id));
    state.lastAchievement = { id: newest, at: state.elapsed };
  }
}

export function getAutomationStatus(state) {
  // Founder "Automation" skill (#22): a cheaper-tools multiplier (×1 at level 0).
  const costMult = getFounderSkillEffects(state.founderProfile).automationCostMult;
  return AUTOMATIONS.map((automation) => {
    const owned = state.ownedAutomations.includes(automation.id);
    const unlocked = isAutomationUnlocked(state, automation);
    const cost = Math.round(automation.cost * costMult);
    return {
      ...automation,
      cost,
      owned,
      unlocked,
      affordable: state.cash >= cost,
      // Ids of unmet prerequisites; the UI translates these to display names.
      missing: automation.requires.filter((id) => !state.ownedAutomations.includes(id)),
    };
  });
}

function isAutomationUnlocked(state, automation) {
  return automation.requires.every((id) => state.ownedAutomations.includes(id));
}

function enqueueNewTask(state) {
  const prestigeEffects = getPrestigeUnlockEffects(state.founderProfile);
  const rareContract = prestigeEffects.rareContracts && Math.random() < prestigeEffects.rareContractChance;
  enqueueLead(state, { rareContract });
}

// Creates one client Lead and queues it in the first department. Each lead is a
// real client project: a named client (id), industry, project, a budget (the
// client's `budget` multiplier × baseTaskValue), and a delivery deadline used
// for client satisfaction. valueMult/rareContract let callers (e.g. the recovery
// contract) inject higher-value work.
function enqueueLead(state, { rareContract = false, valueMult = 1, clientId = null, projectId = null } = {}) {
  const first = getDepartmentById(state, "sales") ?? state.departments[0];
  const client = clientId ? CLIENTS.find((c) => c.id === clientId) ?? CLIENTS[0] : CLIENTS[Math.floor(Math.random() * CLIENTS.length)];
  const project = projectId ?? PROJECTS[Math.floor(Math.random() * PROJECTS.length)];
  // Client reputation: a happy client base wins bigger/better project budgets.
  const reputationBudget = getClientReputationEffects(state).budgetMultiplier;
  const value = Math.round(state.companyType.baseTaskValue * client.budget * (rareContract ? 1.65 : 1) * valueMult * reputationBudget);
  const task = {
    id: state.nextTaskId,
    label: "Lead",
    kind: "lead",
    value,
    rareContract,
    clientId: client.id,
    industry: client.industry,
    projectId: project,
    bornAt: state.elapsed,
    deadline: state.elapsed + CLIENT_DEADLINE_SECONDS,
    fromDepartmentId: "client",
    targetDepartmentId: first.id,
    status: "queued",
    departmentId: first.id,
    progress: 0,
    seed: Math.random(),
  };

  state.nextTaskId += 1;
  state.tasks.push(task);
  first.queue.push(task.id);
  return task;
}

function moveTaskToNextStage(state, task, department) {
  const flow = getDepartmentFlow(state, department, task);
  if (!flow) {
    completeTask(state, task);
    return;
  }

  if (flow.bugKind && flow.reworkDepartmentId) {
    const rejectChance = Math.max(0.08, 1 - getAccuracy(state, department));
    if (Math.random() < rejectChance) {
      sendTask(state, task, {
        kind: flow.bugKind,
        label: getTaskLabel(flow.bugKind),
        targetDepartmentId: flow.reworkDepartmentId,
        fromDepartmentId: department.id,
      });
      state.eventLog = [`${department.name} rejected work and sent it back for rework.`, ...state.eventLog].slice(0, 4);
      return;
    }
  }

  if (!flow.nextDepartmentId) {
    task.kind = flow.outputKind;
    task.label = "Payment";
    completeTask(state, task);
    return;
  }

  sendTask(state, task, {
    kind: flow.outputKind,
    label: getTaskLabel(flow.outputKind),
    targetDepartmentId: flow.nextDepartmentId,
    fromDepartmentId: department.id,
  });
}

function sendTask(state, task, { kind, label, targetDepartmentId, fromDepartmentId }) {
  task.kind = kind;
  task.label = label;
  task.fromDepartmentId = fromDepartmentId;
  task.targetDepartmentId = targetDepartmentId;
  task.departmentId = null;
  task.status = "moving";
  task.progress = 0;
}

function completeTask(state, task) {
  const effects = getAutomationEffects(state);
  const taskValueModifier = state.modifiers?.taskValue ?? 1;
  const publicFactor = getPublicCompanyValueFactor(state);
  // Client satisfaction: delivered on time → full pay; late delivery (a backed-up
  // pipeline) drops satisfaction and pays a reduced share of the budget (0.7–1.0).
  const late = Math.max(0, state.elapsed - (task.deadline ?? Infinity));
  const satisfaction = clamp(60, 100, 100 - late * 0.6);
  const satisfactionFactor = 0.7 + 0.3 * ((satisfaction - 60) / 40);
  const company = getCompanyEffects(state);
  const payout = Math.round(task.value * effects.valueMultiplier * getRevenueMultiplier(state) * taskValueModifier * publicFactor * satisfactionFactor * company.taskValue);
  task.status = "completed";
  task.progress = 1;
  state.cash += payout;
  state.revenue += payout;
  state.completedTasks += 1;
  state.recentRevenue = [
    ...(state.recentRevenue ?? []).filter((entry) => state.elapsed - entry.time <= 120),
    {
      time: state.elapsed,
      amount: payout,
      clientId: task.clientId ?? null,
      projectId: task.projectId ?? null,
    },
  ].slice(-80);
  // Rolling company-wide client satisfaction (EMA), surfaced in the client panel.
  // Culture/specialists can add a satisfaction bonus (e.g. Customer Obsessed).
  const recorded = clamp(0, 100, satisfaction + company.satisfactionBonus);
  state.clientSatisfaction = (state.clientSatisfaction ?? 100) * 0.9 + recorded * 0.1;
  state.tasks = state.tasks.filter((item) => item.id !== task.id || item.status !== "completed");
}

function getDepartmentFlow(state, department, task) {
  const typedFlow = FLOWS[state.companyType.id];
  if (typedFlow) {
    return typedFlow[department.id];
  }

  const index = state.departments.findIndex((item) => item.id === department.id);
  const nextDepartment = state.departments[index + 1];
  return {
    outputKind: getGenericOutputKind(task, nextDepartment),
    nextDepartmentId: nextDepartment?.id ?? null,
  };
}

function getGenericOutputKind(task, nextDepartment) {
  if (!nextDepartment) return "payment";
  if (nextDepartment.id === "accounting") return "invoice";
  return task.kind === "lead" ? "requirement" : task.kind;
}

function getTaskLabel(kind) {
  return {
    lead: "Lead",
    requirement: "Requirement",
    development_task: "Development Task",
    bug: "Bug",
    support_ticket: "Support Ticket",
    invoice: "Invoice",
    payment: "Payment",
  }[kind] ?? "Task";
}

function getDepartmentById(state, departmentId) {
  return state.departments.find((department) => department.id === departmentId);
}

function getCapacity(state, department) {
  return department.employees + getAutomationEffects(state, department.id).capacityBonus;
}

function getProcessingSeconds(state, department) {
  const effects = getAutomationEffects(state, department.id);
  let speed = department.baseSpeed * effects.speedMultiplier * getCompanyEffects(state).speedMultiplier * getHappinessSpeedFactor(state);
  if (department.id === "accounting" && effects.autoInvoice) {
    speed *= AUTO_INVOICE_SPEEDUP;
  }
  const overloadSlowdown = department.bottleneck?.isOverloaded
    ? 1 + department.bottleneck.severity * 0.42
    : 1;
  const integrationDrag = 1 + getIntegrationDrag(state);
  return (BASE_PROCESS_SECONDS * overloadSlowdown * integrationDrag) / speed;
}

function getAccuracy(state, department) {
  const effects = getAutomationEffects(state, department.id);
  return Math.min(0.99, department.baseAccuracy + effects.accuracyBonus + getCompanyEffects(state).accuracyBonus);
}

function getLeadInterval(state) {
  const pressurePenalty = Math.min(0.6, Math.max(0, getTotalQueued(state) - 18) * 0.015);
  const automationBonus = Math.max(0, getAutomationEffects(state).toolCount - 1) * 0.05;
  const leadModifier = state.modifiers?.leadInterval ?? 1;
  // Intake throttle: a player can slow incoming work to let a queue drain.
  const throttle = state.intakeThrottled ? INTAKE_THROTTLE_FACTOR : 1;
  // Client reputation: happy clients refer more work, shortening the interval.
  const referral = getClientReputationEffects(state).leadIntervalMultiplier;
  // Culture/specialists (e.g. Fast Growth, Rockstar Salesperson) also shift intake.
  const company = getCompanyEffects(state).leadInterval;
  // Market share (#16): a dominant company wins more inbound work (shorter interval).
  const market = getMarketShareEffects(state).leadIntervalMultiplier;
  return Math.max(0.72, (state.companyType.leadInterval + pressurePenalty - automationBonus) * leadModifier * throttle * referral * company * market);
}

function getExpensePerSecond(state) {
  const expenseModifier = state.modifiers?.expense ?? 1;
  const payroll = (state.departments.reduce((sum, department) => sum + department.employees * department.employeeCost, 0) / 20) * expenseModifier * getCompanyEffects(state).expense;
  const managerSalary = state.manager?.hired ? state.companyType.baseTaskValue * MANAGER_SALARY_RATE : 0;
  return payroll + managerSalary;
}

function getThroughputPerMinute(state) {
  const minutes = Math.max(1, state.elapsed / 60);
  return state.completedTasks / minutes;
}

function getTotalQueued(state) {
  return state.departments.reduce((sum, department) => sum + department.queue.length, 0);
}

function getBottleneck(state) {
  return [...state.departments].sort((a, b) => getPressure(state, b) - getPressure(state, a))[0];
}

function getPressure(state, department) {
  const activePressure = getUtilization(state, department);
  const growthPressure = Math.max(0, department.bottleneck?.queueGrowthRate ?? 0) * 7;
  return department.queue.length + activePressure * 2 + growthPressure;
}

function updateBottleneckSnapshots(state) {
  for (const department of state.departments) {
    const last = department.queueHistory[department.queueHistory.length - 1];
    if (!last || state.elapsed - last.time >= 1 || last.size !== department.queue.length) {
      department.queueHistory.push({ time: state.elapsed, size: department.queue.length });
    }

    department.queueHistory = department.queueHistory.filter((entry) => state.elapsed - entry.time <= QUEUE_HISTORY_SECONDS);
    const queueGrowthRate = getQueueGrowthRate(department, state.elapsed);
    const utilization = getUtilization(state, department);
    const queuePressure = Math.max(0, department.queue.length - BOTTLENECK_QUEUE_THRESHOLD) / 10;
    const growthPressure = Math.max(0, queueGrowthRate - BOTTLENECK_GROWTH_THRESHOLD) * 2.5;
    const utilizationPressure = Math.max(0, utilization - BOTTLENECK_UTILIZATION_THRESHOLD) * 2.2;
    const severity = Math.min(1, queuePressure + growthPressure + utilizationPressure);
    const isOverloaded = severity >= 0.18 || (department.queue.length >= BOTTLENECK_QUEUE_THRESHOLD && utilization >= 0.75);

    department.bottleneck = createBottleneckSnapshot({
      queueGrowthRate,
      utilization,
      severity,
      completionSlowdown: isOverloaded ? getCompletionSlowdownFromSeverity(severity) : 0,
      isOverloaded,
    });
  }
}

function createBottleneckSnapshot({ queueGrowthRate, utilization, severity, completionSlowdown, isOverloaded }) {
  return {
    isOverloaded,
    queueGrowthRate,
    utilization,
    severity,
    completionSlowdown,
  };
}

function getQueueGrowthRate(department, elapsed) {
  const first = department.queueHistory[0];
  const last = department.queueHistory[department.queueHistory.length - 1];
  if (!first || !last || last.time === first.time) return 0;
  const seconds = Math.max(1, last.time - first.time);
  return ((last.size - first.size) / seconds) * 60;
}

function getUtilization(state, department) {
  return Math.min(1, department.active.length / Math.max(1, getCapacity(state, department)));
}

function getBottleneckPenalty(state) {
  const maxSeverity = Math.max(0, ...state.departments.map((department) => department.bottleneck?.severity ?? 0));
  return Math.min(0.35, maxSeverity * 0.28);
}

function getRevenueMultiplier(state) {
  return 1 - getBottleneckPenalty(state);
}

// A public company's revenue responds to how the market feels about it: high
// shareholder confidence is a small valuation premium on each payout, low
// confidence a discount. This is what makes running a public company feel
// different from a private one beyond the quarterly review modal.
function getPublicCompanyValueFactor(state) {
  const publicCompany = state.publicCompany;
  if (!publicCompany) return 1;
  const confidence = publicCompany.shareholderConfidence ?? 60;
  return clamp(0.85, 1.15, 1 + ((confidence - 60) / 100) * 0.3);
}

function getCompletionSlowdownFromSeverity(severity) {
  return Math.min(0.42, severity * 0.42);
}

function formatCost(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

// Fractional (0..1) office-floor positions per department, kept on a balanced
// grid so rooms align in even rows and columns. Three vertical levels
// (y 0.19 / 0.49 / 0.79) leave even gaps between rooms and clearance for the
// client inlet (top) and payment endpoint (bottom). The returned {x, y} contract
// is unchanged; lanes and task paths read these same coordinates.
const COLS_2 = [0.28, 0.72];
const COLS_3 = [0.22, 0.5, 0.78];
const ROWS_3 = [0.19, 0.49, 0.79];

function getDepartmentPosition(index, count) {
  const layouts = {
    // 5: two columns over two rows, fifth centered on the bottom row.
    5: [
      [COLS_2[0], ROWS_3[0]],
      [COLS_2[1], ROWS_3[0]],
      [COLS_2[0], ROWS_3[1]],
      [COLS_2[1], ROWS_3[1]],
      [0.5, ROWS_3[2]],
    ],
    // 6: a clean two-by-three grid.
    6: [
      [COLS_2[0], ROWS_3[0]],
      [COLS_2[1], ROWS_3[0]],
      [COLS_2[0], ROWS_3[1]],
      [COLS_2[1], ROWS_3[1]],
      [COLS_2[0], ROWS_3[2]],
      [COLS_2[1], ROWS_3[2]],
    ],
    // 7: symmetric 2-3-2 over three rows.
    7: [
      [COLS_2[0], ROWS_3[0]],
      [COLS_2[1], ROWS_3[0]],
      [COLS_3[0], ROWS_3[1]],
      [COLS_3[1], ROWS_3[1]],
      [COLS_3[2], ROWS_3[1]],
      [COLS_2[0], ROWS_3[2]],
      [COLS_2[1], ROWS_3[2]],
    ],
  };

  const [x, y] = layouts[count]?.[index] ?? [0.5, 0.5];
  return { x, y };
}

function cloneState(state) {
  return {
    ...state,
    departments: state.departments.map((department) => ({
      ...department,
      queue: [...department.queue],
      active: [...department.active],
      staff: department.staff.map((employee) => ({ ...employee })),
      throughputWindow: [...department.throughputWindow],
      queueHistory: department.queueHistory.map((entry) => ({ ...entry })),
      bottleneck: { ...department.bottleneck },
    })),
    tasks: state.tasks.map((task) => ({ ...task })),
    recentRevenue: (state.recentRevenue ?? []).map((entry) => ({ ...entry })),
    ownedAutomations: [...state.ownedAutomations],
    achievements: [...(state.achievements ?? [])],
    lastAchievement: state.lastAchievement ? { ...state.lastAchievement } : null,
    eventLog: [...state.eventLog],
    reachedStages: [...(state.reachedStages ?? ["startup"])],
    activeOffer: state.activeOffer ? { ...state.activeOffer, reasons: [...(state.activeOffer.reasons ?? [])] } : null,
    outcome: state.outcome ? { ...state.outcome } : null,
    legacyEvent: state.legacyEvent ? { ...state.legacyEvent } : null,
    strategicEvent: state.strategicEvent
      ? { ...state.strategicEvent, choices: [...(state.strategicEvent.choices ?? [])], ...(state.strategicEvent.tender ? { tender: { ...state.strategicEvent.tender } } : {}) }
      : null,
    ceoDecision: state.ceoDecision ? { ...state.ceoDecision, choices: [...(state.ceoDecision.choices ?? [])] } : null,
    companyReportBaseline: state.companyReportBaseline ? { ...state.companyReportBaseline, automations: [...(state.companyReportBaseline.automations ?? [])] } : null,
    companyReport: state.companyReport
      ? { ...state.companyReport, improvement: { ...state.companyReport.improvement, vars: { ...(state.companyReport.improvement?.vars ?? {}) } }, risk: { ...state.companyReport.risk, vars: { ...(state.companyReport.risk?.vars ?? {}) } } }
      : null,
    companyReportTimer: state.companyReportTimer ?? COMPANY_REPORT_INTERVAL_SECONDS,
    companyReportSequence: state.companyReportSequence ?? 0,
    lastDynamicEvent: state.lastDynamicEvent ? { ...state.lastDynamicEvent } : null,
    manager: { ...(state.manager ?? { hired: false, autoHire: true, autoRebalance: true, autoAutomate: true, actionTimer: 0 }) },
    culture: state.culture ?? null,
    specialHires: [...(state.specialHires ?? [])],
    availableSpecialist: state.availableSpecialist ?? null,
    specialistCooldown: state.specialistCooldown ?? 0,
    employeeHappiness: state.employeeHappiness ?? 85,
    salaryPressure: state.salaryPressure ?? 0,
    lastCompetitorEvent: state.lastCompetitorEvent ? { ...state.lastCompetitorEvent } : null,
    competitorCooldown: state.competitorCooldown ?? 0,
    marketShare: state.marketShare ?? STARTING_MARKET_SHARE,
    industryTrend: state.industryTrend ? { ...state.industryTrend } : null,
    lastIndustryTrend: state.lastIndustryTrend ? { ...state.lastIndustryTrend } : null,
    industryTrendCooldown: state.industryTrendCooldown ?? 0,
    // Default a fresh venture for saves created before the VC layer existed, so
    // existing companies gain the feature on their next tick.
    venture: state.venture
      ? { ...state.venture }
      : { round: 0, founderEquity: 100, investorInfluence: 0, expectation: 0, raisedTotal: 0, pressure: 0, checkTimer: VENTURE_CHECK_SECONDS },
    strategicEventCooldown: state.strategicEventCooldown ?? STRATEGIC_EVENT_COOLDOWN_SECONDS,
    acquisitionTransition: state.acquisitionTransition ? { ...state.acquisitionTransition } : null,
    founderProfile: prepareFounderProfile(state.founderProfile),
    publicCompany: state.publicCompany
      ? { ...state.publicCompany, activist: state.publicCompany.activist ? { ...state.publicCompany.activist } : null }
      : null,
    integration: state.integration ? { ...state.integration } : null,
    compliance: state.compliance ? { ...state.compliance } : null,
    portfolio: state.portfolio
      ? {
          ...state.portfolio,
          assets: (state.portfolio.assets ?? []).map((asset) => ({ ...asset })),
        }
      : null,
    completedGoals: [...(state.completedGoals ?? [])],
    activeMicroGoal: state.activeMicroGoal ? { ...state.activeMicroGoal } : null,
    microGoalCursor: state.microGoalCursor ?? 0,
    lastMicroGoalId: state.lastMicroGoalId ?? null,
    microGoalCompletions: { ...(state.microGoalCompletions ?? {}) },
    solvedBottlenecks: state.solvedBottlenecks ?? 0,
    resolvedCeoSituations: state.resolvedCeoSituations ?? 0,
    goalRewardSequence: state.goalRewardSequence ?? 0,
    lastGoalReward: state.lastGoalReward ? { ...state.lastGoalReward } : null,
    debt: state.debt ?? 0,
    loansTaken: state.loansTaken ?? 0,
    intakeThrottled: Boolean(state.intakeThrottled),
    modifiers: { ...(state.modifiers ?? { expense: 1, leadInterval: 1, taskValue: 1 }) },
  };
}
