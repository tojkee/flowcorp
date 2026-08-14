// Career Tier progression (data-driven).
//
// FlowCorp is a founder-career simulator. Companies are organised into three
// career tiers, and each tier unlocks an entirely new *level of business
// management* — not just bigger numbers. A tier is a property of a company type
// (`companyType.tier`); a tier grants a cumulative set of stable **capability
// ids**, and every gated mechanic in the simulation reads a capability rather
// than re-deriving thresholds inline. This keeps the progression future-proof:
// adding a company is a data edit (pick a tier), and adding a mechanic gate is a
// one-line capability check.
//
//   Running a business → Growing a business → Owning businesses →
//   Buying businesses → Managing corporations → Managing an investment empire
//
// Beginner   — teaches the fundamentals. NO investors, exits, M&A, IPO, board,
//              government, or multiple companies.
// Intermediate — teaches scaling. Adds investors / venture capital / funding /
//              valuation / loans + the exit options (sell / merge / strategic
//              investment) and major product launches.
// Advanced   — teaches corporate strategy. Adds IPO + board, government
//              contracting, the holding company / multi-company empire, and the
//              investment-fund layer.
//
// This module is pure data + pure helpers. It only depends on the founder
// profile (for unlock pacing) and never mutates state.

import { getPrestigeLevel } from "../core/founderLegacy.js";

// Stable tier ids in career order. The index is the "career rank" used for the
// unlock gate, so ordering here is the single source of truth.
export const TIER_ORDER = ["beginner", "intermediate", "advanced"];

// Capabilities shared by every tier — the fundamentals a brand-new founder can
// always use. These are descriptive (no code gates on them); they document what
// the Beginner tier teaches.
const BASE_CAPABILITIES = [
  "hiring",
  "automation",
  "clients",
  "revenue",
  "expenses",
  "companyGrowth",
  "teamManagement",
  "managers",
  "culture",
  "morale",
];

// Capabilities added when *scaling* (Intermediate). These are the first
// mechanics that were impossible at Beginner. Gate-bearing ids: `investors`,
// `exits`, `productLaunch`. The rest are advertised (shown in the tier blurb /
// reserved for future gates).
const INTERMEDIATE_CAPABILITIES = [
  "investors", // venture capital — gates isVentureRoundAvailable
  "venture",
  "fundingRounds",
  "valuation",
  "loans",
  "partnerships",
  "premiumClients",
  "marketCompetition",
  "brandReputation",
  "productLaunch", // gates the "product" destiny path (major product launches)
  "exits", // gates buyout/merger offer generation + the sell/merge paths
  "sell",
  "merge",
  "strategicInvestment",
];

// Capabilities added for *corporate strategy* (Advanced). Gate-bearing ids:
// `ipo`, `government`, `board`, `holding`, `multiCompany`, `investmentFund`.
const ADVANCED_CAPABILITIES = [
  "board", // gates the "corporation" destiny path (Board of Directors)
  "executiveTeam",
  "shareholders",
  "corporatePolitics",
  "ipo", // gates the "ipo" destiny path + public-company layer
  "quarterlyEarnings",
  "publicReputation",
  "government", // gates the "government" destiny path + compliance layer
  "tenders",
  "audits",
  "compliance",
  "security",
  "politicalPressure",
  "holding", // gates the "holding" destiny path
  "multiCompany", // gates active multi-company management / holding dashboard
  "crossCompanyBonuses",
  "buyCompanies",
  "investmentFund", // invest in / acquire / sell companies (advanced)
  "equityInvesting",
  "passiveIncome",
];

// Cumulative capability sets per tier. Higher tiers inherit everything below.
const TIER_CAPABILITY_LISTS = {
  beginner: BASE_CAPABILITIES,
  intermediate: [...BASE_CAPABILITIES, ...INTERMEDIATE_CAPABILITIES],
  advanced: [...BASE_CAPABILITIES, ...INTERMEDIATE_CAPABILITIES, ...ADVANCED_CAPABILITIES],
};

const TIER_CAPABILITY_SETS = {
  beginner: new Set(TIER_CAPABILITY_LISTS.beginner),
  intermediate: new Set(TIER_CAPABILITY_LISTS.intermediate),
  advanced: new Set(TIER_CAPABILITY_LISTS.advanced),
};

// Tier metadata for the UI. `unlockTierIndex` is the founder career rank a player
// must reach (see getUnlockedTierIndex) before companies in this tier appear in
// company select. Stable string ids are localized at render time (`tier.<id>.*`).
export const CAREER_TIERS = {
  beginner: { id: "beginner", order: 0, unlockTierIndex: 0 },
  intermediate: { id: "intermediate", order: 1, unlockTierIndex: 1 },
  advanced: { id: "advanced", order: 2, unlockTierIndex: 2 },
};

const DEFAULT_TIER = "intermediate";

// Resolve a company type's tier id. Defaults to "intermediate" so a pre-tier
// save (whose stored companyType lacks a `tier`) keeps its prior behaviour
// (exits + investors available; IPO/government/holding gated as before) — every
// pre-existing company is an Intermediate operational company, so this default
// is exactly correct for legacy saves.
export function getCompanyTier(companyType) {
  const tier = companyType?.tier;
  return TIER_CAPABILITY_SETS[tier] ? tier : DEFAULT_TIER;
}

export function getTierOrder(tierId) {
  return CAREER_TIERS[tierId]?.order ?? CAREER_TIERS[DEFAULT_TIER].order;
}

// The full (cumulative) capability id list for a tier — used by tier blurbs.
export function getTierCapabilities(tierId) {
  return TIER_CAPABILITY_LISTS[tierId] ?? TIER_CAPABILITY_LISTS[DEFAULT_TIER];
}

// The single gate every mechanic reads: does this company's tier grant `cap`?
export function companyHasCapability(companyType, cap) {
  const set = TIER_CAPABILITY_SETS[getCompanyTier(companyType)];
  return set ? set.has(cap) : false;
}

// Number of companies the founder has "completed" by any means — sold, merged,
// taken public, turned into a government contractor, or graduated. This is the
// progression currency for unlocking the next tier of companies: the brief's
// loop is "complete a company → gain prestige → unlock better companies", and a
// Beginner company (which cannot be sold) completes via graduation.
export function getVenturesCompleted(profile) {
  if (!profile) return 0;
  return (
    (profile.companiesSold ?? 0) +
    (profile.mergersCompleted ?? 0) +
    (profile.iposAchieved ?? 0) +
    (profile.governmentContracts ?? 0) +
    (profile.companiesGraduated ?? 0)
  );
}

// The highest career rank (tier index) the founder has unlocked. Two routes
// reach each tier so the progression is always reachable:
//   • completing companies (the intended "graduate / exit then move up" loop), or
//   • accumulated prestige level (a veteran founder).
// Beginner is always available (rank 0). Intermediate unlocks after the first
// completed company OR prestige level 2; Advanced after two completed companies
// OR prestige level 4.
export function getUnlockedTierIndex(profile) {
  const ventures = getVenturesCompleted(profile);
  const prestigeLevel = getPrestigeLevel(profile ?? {});
  if (ventures >= 2 || prestigeLevel >= 4) return 2;
  if (ventures >= 1 || prestigeLevel >= 2) return 1;
  return 0;
}

// Whether a company type is unlocked for the founder in company select. A
// company is unlocked when the founder's career rank reaches the company tier's
// rank AND any per-company prestige override is met (the empire-grade Holding
// Company / Investment Fund require the prestige-5 "business empire" tier).
export function isCompanyUnlocked(companyType, profile) {
  const tierId = getCompanyTier(companyType);
  if (getUnlockedTierIndex(profile) < getTierOrder(tierId)) return false;
  if (companyType?.unlockPrestige && getPrestigeLevel(profile ?? {}) < companyType.unlockPrestige) return false;
  return true;
}

// The localization-ready requirement hint for a locked company (so company
// select can say *why* it is locked and what unlocks it). Returns a stable id +
// vars resolved by the UI, or null when the company is already unlocked.
export function getCompanyUnlockHint(companyType, profile) {
  if (isCompanyUnlocked(companyType, profile)) return null;
  const tierId = getCompanyTier(companyType);
  if (companyType?.unlockPrestige && getPrestigeLevel(profile ?? {}) < companyType.unlockPrestige) {
    return { id: "prestige", vars: { level: companyType.unlockPrestige } };
  }
  const needed = getTierOrder(tierId); // 1 = intermediate, 2 = advanced
  return { id: "ventures", vars: { count: needed, tier: tierId } };
}

// Difficulty rating (1–3 "stars") derived purely from tier order, for the compact
// company card. Beginner = 1, Intermediate = 2, Advanced = 3.
export function getCompanyDifficulty(companyType) {
  return getTierOrder(getCompanyTier(companyType)) + 1;
}

// Unlock progress for a locked company card / detail panel — a visual %, plus the
// individual requirement parts (current / target) so the card can show a compact
// "🏆 0/1" chip and the detail panel can list every requirement without prose.
// `pct` is the binding (least-complete) requirement's ratio, so the bar reflects
// the real gate. Returns { pct: 100, parts: [] } for an already-unlocked company.
export function getCompanyUnlockProgress(companyType, profile) {
  if (isCompanyUnlocked(companyType, profile)) return { pct: 100, parts: [] };
  const ventures = getVenturesCompleted(profile);
  const prestigeLevel = getPrestigeLevel(profile ?? {});
  const parts = [];
  const ventureTarget = getTierOrder(getCompanyTier(companyType)); // 1 = intermediate, 2 = advanced
  if (ventureTarget > 0) {
    parts.push({ id: "ventures", current: Math.min(ventures, ventureTarget), target: ventureTarget });
  }
  if (companyType?.unlockPrestige) {
    parts.push({ id: "prestige", current: Math.min(prestigeLevel, companyType.unlockPrestige), target: companyType.unlockPrestige });
  }
  const ratio = parts.length ? Math.min(...parts.map((p) => (p.target ? p.current / p.target : 1))) : 0;
  return { pct: Math.round(ratio * 100), parts };
}
