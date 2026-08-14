// Company Evolution: the long-term lifecycle layer on top of the per-tick
// simulation. A company starts as a startup and grows through lifecycle stages
// driven by operational maturity (not just cash). Once mature, strategic
// destiny paths and acquisition/merger offers unlock.
//
// This module is pure: it only reads a simulation `state` and returns data.
// `simulation.js` owns the (immutable) state mutations and calls into here.

import { getPrestigeLevel } from "./founderLegacy.js";
import { companyHasCapability } from "../data/careerTiers.js";

// Ordered lifecycle stages. A stage is "reached" when every requirement is met;
// requirements gate on derived maturity metrics, so cash alone is never enough.
export const EVOLUTION_STAGES = [
  { id: "startup", requirements: [] },
  {
    id: "small-business",
    requirements: [
      { key: "revenue", target: 4000 },
      { key: "employees", target: 7 },
      { key: "completedTasks", target: 12 },
    ],
  },
  {
    id: "growing-company",
    requirements: [
      { key: "revenue", target: 25000 },
      { key: "employees", target: 11 },
      { key: "reputation", target: 40 },
      { key: "automationLevel", target: 2 },
      { key: "stability", target: 0.45 },
    ],
  },
  {
    id: "enterprise",
    requirements: [
      { key: "revenue", target: 90000 },
      { key: "employees", target: 16 },
      { key: "reputation", target: 62 },
      { key: "automationLevel", target: 3 },
      { key: "stability", target: 0.55 },
      { key: "satisfaction", target: 0.62 },
    ],
  },
  {
    id: "corporation",
    requirements: [
      { key: "revenue", target: 300000 },
      { key: "employees", target: 24 },
      { key: "reputation", target: 78 },
      { key: "automationLevel", target: 4 },
      { key: "marketPresence", target: 75 },
    ],
  },
];

// Strategic destiny paths. `kind: "offer"` paths (sell, merge) are realized by
// accepting an incoming offer; `kind: "commit"` paths are chosen proactively.
// `capability` ties each path to the career tier that unlocks it (see
// data/careerTiers.js): a Beginner company grants none of these capabilities, so
// it sees no strategic paths at all — selling, M&A, IPO, government, and holding
// are late-game rewards the player graduates into.
export const STRATEGIC_PATHS = [
  { id: "sell", minStage: 3, kind: "offer", capability: "exits" },
  { id: "merge", minStage: 2, kind: "offer", capability: "exits" },
  { id: "corporation", minStage: 3, kind: "commit", capability: "board" },
  { id: "ipo", minStage: 3, kind: "commit", capability: "ipo", requires: { reputation: 68, marketPresence: 70 } },
  { id: "government", minStage: 3, kind: "commit", capability: "government", requires: { reputation: 65, stability: 0.55 } },
  { id: "holding", minStage: 4, kind: "commit", capability: "holding", requiresPrestigeLevel: 5 },
  { id: "product", minStage: 3, kind: "commit", capability: "productLaunch", industries: ["it-company", "tech-startup"] },
];

// Modifier effects applied when a commit path is chosen. Defaults are neutral
// (1) so the economy is unchanged until the player commits. Each path is a
// tradeoff: bigger upside, more overhead.
export const PATH_EFFECTS = {
  corporation: { taskValue: 1.2, expense: 1.15 },
  ipo: { taskValue: 1.35, expense: 1.25 },
  government: { taskValue: 1.5, expense: 1.1, leadInterval: 1.5 },
  holding: { taskValue: 1.15, expense: 1.1 },
  product: { taskValue: 1.1, expense: 1.05 },
};

export const BUYER_IDS = ["megacorp", "nimbus", "atlas", "vertex", "northstar"];

const OFFER_COOLDOWN_SECONDS = 90;
export const OFFER_REJECT_COOLDOWN_SECONDS = 150;
const OFFER_MIN_STAGE = 2; // growing-company
const OFFER_ATTRACTIVENESS = 0.45;

const STAGE_VALUATION_MULTIPLIER = [0.5, 0.8, 1, 1.5, 2.5];

export function getEvolutionMetrics(state) {
  const employees = state.departments.reduce((sum, d) => sum + d.employees, 0);
  const profit = state.revenue - state.expenses;
  const maxSeverity = Math.max(0, ...state.departments.map((d) => d.bottleneck?.severity ?? 0));
  const overloaded = state.departments.filter((d) => d.bottleneck?.isOverloaded).length;
  const automationLevel = state.ownedAutomations.length;
  const avgAccuracy = state.departments.reduce((s, d) => s + (d.baseAccuracy ?? 0.9), 0) / Math.max(1, state.departments.length);

  const stability = clamp01(1 - maxSeverity - overloaded * 0.05);
  const satisfaction = clamp01(avgAccuracy + (automationLevel - 1) * 0.02 - maxSeverity * 0.2);
  const marketPresence = Math.min(100, state.revenue / 4000 + employees * 2 + state.completedTasks * 0.5);

  return {
    totalRevenue: state.revenue,
    revenue: state.revenue,
    profit,
    employees,
    reputation: state.reputation ?? 0,
    automationLevel,
    completedTasks: state.completedTasks,
    stability,
    satisfaction,
    marketPresence,
    cash: state.cash,
  };
}

// Reputation is tracked (an EMA in the tick) toward this target so it is earned
// over time — a clean, busy operation with real throughput builds reputation;
// chaos erodes it. Low volume keeps reputation low even if ops look tidy.
export function getReputationTarget(evo) {
  const base = (evo.satisfaction * 0.55 + evo.stability * 0.3) * 100;
  const automationBonus = (evo.automationLevel - 1) * 5;
  const maturity = Math.min(1, evo.completedTasks / 40);
  return clamp(0, 100, (base + automationBonus) * maturity);
}

function metricValue(evo, key) {
  return evo[key] ?? 0;
}

export function getStageIndex(evo) {
  for (let i = EVOLUTION_STAGES.length - 1; i >= 0; i -= 1) {
    const stage = EVOLUTION_STAGES[i];
    if (stage.requirements.every((req) => metricValue(evo, req.key) >= req.target)) {
      return i;
    }
  }
  return 0;
}

export function getStage(evo) {
  return EVOLUTION_STAGES[getStageIndex(evo)];
}

export function getStageProgress(evo) {
  const index = getStageIndex(evo);
  const next = EVOLUTION_STAGES[index + 1] ?? null;
  if (!next) return { stageId: EVOLUTION_STAGES[index].id, stageIndex: index, next: null, requirements: [] };

  const requirements = next.requirements.map((req) => ({
    key: req.key,
    target: req.target,
    current: metricValue(evo, req.key),
    met: metricValue(evo, req.key) >= req.target,
  }));

  return { stageId: EVOLUTION_STAGES[index].id, stageIndex: index, next: next.id, requirements };
}

export function getUnlockedPaths(state, evo, stageIndex) {
  const prestigeLevel = getFounderPrestigeLevel(state);
  return STRATEGIC_PATHS.filter((path) => {
    // Career-tier gate: the company's tier must grant this path's capability.
    // Beginner companies grant none, so no strategic paths ever unlock for them.
    if (path.capability && !companyHasCapability(state.companyType, path.capability)) return false;
    if (stageIndex < path.minStage) return false;
    if (path.industries && !path.industries.includes(state.companyType.id)) return false;
    if (path.requiresPrestigeLevel && prestigeLevel < path.requiresPrestigeLevel) return false;
    if (path.requires) {
      for (const [key, target] of Object.entries(path.requires)) {
        const adjustedTarget = getPrestigeAdjustedTarget(path.id, key, target, prestigeLevel);
        if (metricValue(evo, key) < adjustedTarget) return false;
      }
    }
    return true;
  }).map((path) => path.id);
}

function getFounderPrestigeLevel(state) {
  // Shared with the founder profile so unlock pacing (prestige + experience)
  // stays consistent between path gating and the prestige unlock list.
  return getPrestigeLevel(state.founderProfile);
}

function getPrestigeAdjustedTarget(pathId, key, target, prestigeLevel) {
  if (pathId === "ipo" && prestigeLevel >= 3 && (key === "reputation" || key === "marketPresence")) {
    return target - 8;
  }
  if (pathId === "government" && prestigeLevel >= 4 && (key === "reputation" || key === "stability")) {
    return key === "stability" ? Math.max(0.4, target - 0.08) : target - 10;
  }
  return target;
}

export function getCompanyValuation(state, evo, stageIndex) {
  const raw =
    evo.totalRevenue * 2 +
    Math.max(0, evo.profit) * 12 +
    evo.reputation * 8000 +
    evo.employees * 15000 +
    evo.automationLevel * 20000;
  return Math.round(raw * (STAGE_VALUATION_MULTIPLIER[stageIndex] ?? 1));
}

function offerAttractiveness(evo) {
  return (
    (evo.reputation / 100) * 0.4 +
    evo.satisfaction * 0.2 +
    evo.stability * 0.2 +
    Math.min(1, Math.max(0, evo.profit) / 20000) * 0.2
  );
}

function pickReasons(evo) {
  const reasons = [];
  if (evo.automationLevel >= 3) reasons.push("automation");
  if (evo.satisfaction >= 0.8) reasons.push("satisfaction");
  if (evo.reputation >= 60) reasons.push("reputation");
  if (evo.marketPresence >= 60) reasons.push("market");
  if (evo.profit > 0) reasons.push("growth");
  return reasons.length ? reasons.slice(0, 3) : ["growth"];
}

// Decide whether a new offer should appear now. Returns an offer object or null.
// Uses the per-task `seed`-style randomness already used elsewhere in the sim.
export function evaluateOfferGeneration(state, evo, stageIndex) {
  // Strategic offers must respect the current company path. Once the company has
  // committed to a destiny (acquired, merged, public, government, holding), the
  // normal acquisition/merger offer stream stops — only that path's own
  // strategic events continue. This guard lives here, not only in the caller, so
  // offers can never regenerate regardless of who calls offer generation.
  if (state.destinyPath) return null;
  // Career-tier gate: buyout/merger offers (selling, M&A) only exist for
  // companies whose tier grants `exits` (Intermediate and up). A Beginner
  // company never receives an offer — exits are unlocked later in the career.
  if (!companyHasCapability(state.companyType, "exits")) return null;
  if (stageIndex < OFFER_MIN_STAGE) return null;
  if (offerAttractiveness(evo) < OFFER_ATTRACTIVENESS) return null;

  const valuation = getCompanyValuation(state, evo, stageIndex);
  const roll = Math.random();
  // Acquisitions need enterprise maturity; mergers appear from growing-company.
  const kind = stageIndex >= 3 && roll < 0.55 ? "acquisition" : "merger";
  const buyerId = BUYER_IDS[Math.floor(Math.random() * BUYER_IDS.length)];
  const variance = 0.95 + Math.random() * 0.35;
  const amount = Math.round((kind === "acquisition" ? valuation * 1.15 : valuation * 0.6) * variance);

  // Acquisition offers are always negotiable; merger negotiation is a prestige
  // level 4 unlock, so a low-prestige founder cannot renegotiate a merger.
  const negotiable = kind === "acquisition" || getPrestigeLevel(state.founderProfile) >= 4;

  return {
    id: `offer_${Math.round(state.elapsed * 1000)}_${buyerId}`,
    kind,
    buyerId,
    amount,
    baseAmount: amount,
    reasons: pickReasons(evo),
    negotiable,
    negotiated: false,
  };
}

export function getOfferCooldownSeconds() {
  return OFFER_COOLDOWN_SECONDS;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(0, 1, value);
}
