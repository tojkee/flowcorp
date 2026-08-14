import { DEFAULT_FOUNDER_SKILLS, FOUNDER_SKILLS, FOUNDER_TRAITS, MAX_SKILL_LEVEL, SKILL_STEP } from "../data/founderTraits.js";

const BASE_YEAR = 2019;
const MAX_TIMELINE_ITEMS = 80;

export function createFounderProfile() {
  return {
    id: "founder",
    groupName: "FlowCorp Group",
    founderLevel: 1,
    founderExperience: 0,
    legacyPoints: 0,
    prestige: 0,
    reputation: 0,
    companiesFounded: 0,
    companiesSold: 0,
    mergersCompleted: 0,
    iposAchieved: 0,
    governmentContracts: 0,
    // Companies the founder grew to maturity and graduated from (the Beginner-tier
    // "move on without selling" path). Counts toward unlocking the next tier.
    companiesGraduated: 0,
    totalEmployeesManaged: 0,
    totalRevenueGenerated: 0,
    companies: [],
    timeline: [],
    legacyBonuses: {
      startingReputation: 0,
      investorConfidence: 0,
      complianceScore: 0,
      hiringAttractiveness: 0,
    },
    // Founder Skill Tree (#22): persistent levels the player allocates points to.
    skills: { ...DEFAULT_FOUNDER_SKILLS },
  };
}

export function prepareFounderProfile(profile) {
  const base = createFounderProfile();
  const next = {
    ...base,
    ...(profile ?? {}),
    legacyBonuses: { ...base.legacyBonuses, ...(profile?.legacyBonuses ?? {}) },
    skills: { ...base.skills, ...(profile?.skills ?? {}) },
    companies: (profile?.companies ?? []).map((company) => ({ ...company })),
    timeline: (profile?.timeline ?? []).map((event) => ({ ...event })),
  };
  return recalculateFounderLevel(next);
}

export function recordCompanyFounded(profile, companyType) {
  const next = prepareFounderProfile(profile);
  const existingActive = next.companies.some((company) => company.id === companyType.id && company.status === "active");
  if (existingActive) return next;

  next.companiesFounded += 1;
  const year = getNextTimelineYear(next);
  next.companies = [
    ...next.companies,
    {
      id: companyType.id,
      nameKey: `company.${companyType.id}.name`,
      foundedYear: year,
      status: "active",
      revenue: 0,
      peakEmployees: 0,
      valuation: 0,
    },
  ];
  next.timeline = addTimelineEvent(next.timeline, {
    year,
    type: "founded",
    companyId: companyType.id,
    companyNameKey: `company.${companyType.id}.name`,
  });
  return recalculateFounderLevel(next);
}

export function recordCompanySnapshot(profile, state, extra = {}) {
  const next = prepareFounderProfile(profile);
  const employees = state.departments.reduce((sum, department) => sum + department.employees, 0);
  next.totalEmployeesManaged = Math.max(next.totalEmployeesManaged, employees);
  next.totalRevenueGenerated = Math.max(next.totalRevenueGenerated, Math.round(state.revenue));

  next.companies = next.companies.map((company) => {
    if (company.id !== state.companyType.id || company.status === "archived") return company;
    return {
      ...company,
      ...extra,
      revenue: Math.max(company.revenue ?? 0, Math.round(state.revenue)),
      peakEmployees: Math.max(company.peakEmployees ?? 0, employees),
    };
  });
  return recalculateFounderLevel(next);
}

export function recordAcquisition(profile, state, offer, valuation) {
  const next = recordCompanySnapshot(profile, state, {
    status: "acquired",
    valuation: Math.max(valuation, offer.amount),
    buyerId: offer.buyerId,
  });
  const prestigeGain = Math.max(25, Math.round(offer.amount / 18000) + Math.round((state.reputation ?? 0) / 2));
  next.companiesSold += 1;
  next.founderExperience += 35;
  next.legacyPoints += Math.max(3, Math.round(prestigeGain / 12));
  next.prestige += prestigeGain;
  next.reputation += 8;
  next.legacyBonuses.startingReputation = Math.min(30, next.legacyBonuses.startingReputation + 5);
  next.timeline = addTimelineEvent(next.timeline, {
    year: getNextTimelineYear(next),
    type: "acquired",
    companyId: state.companyType.id,
    companyNameKey: `company.${state.companyType.id}.name`,
    buyerId: offer.buyerId,
    amount: offer.amount,
    prestigeGain,
  });
  return recalculateFounderLevel(next);
}

export function recordMerger(profile, state, offer) {
  const next = recordCompanySnapshot(profile, state, { status: "merged", buyerId: offer.buyerId });
  const prestigeGain = Math.max(16, Math.round(offer.amount / 26000));
  next.mergersCompleted += 1;
  next.founderExperience += 28;
  next.legacyPoints += Math.max(2, Math.round(prestigeGain / 14));
  next.prestige += prestigeGain;
  next.reputation += 5;
  next.legacyBonuses.hiringAttractiveness = Math.min(25, next.legacyBonuses.hiringAttractiveness + 6);
  next.timeline = addTimelineEvent(next.timeline, {
    year: getNextTimelineYear(next),
    type: "merged",
    companyId: state.companyType.id,
    companyNameKey: `company.${state.companyType.id}.name`,
    buyerId: offer.buyerId,
    amount: offer.amount,
    prestigeGain,
  });
  return recalculateFounderLevel(next);
}

export function recordIpo(profile, state, valuation) {
  const next = recordCompanySnapshot(profile, state, { status: "public", valuation });
  const prestigeGain = Math.max(30, Math.round(valuation / 22000));
  next.iposAchieved += 1;
  next.founderExperience += 42;
  next.legacyPoints += Math.max(4, Math.round(prestigeGain / 12));
  next.prestige += prestigeGain;
  next.reputation += 10;
  next.legacyBonuses.investorConfidence = Math.min(35, next.legacyBonuses.investorConfidence + 10);
  next.timeline = addTimelineEvent(next.timeline, {
    year: getNextTimelineYear(next),
    type: "ipo",
    companyId: state.companyType.id,
    companyNameKey: `company.${state.companyType.id}.name`,
    amount: valuation,
    prestigeGain,
  });
  return recalculateFounderLevel(next);
}

export function recordGovernmentContractor(profile, state, valuation) {
  const next = recordCompanySnapshot(profile, state, { status: "government", valuation });
  const prestigeGain = Math.max(22, Math.round(valuation / 30000));
  next.governmentContracts += 1;
  next.founderExperience += 32;
  next.legacyPoints += Math.max(3, Math.round(prestigeGain / 14));
  next.prestige += prestigeGain;
  next.reputation += 7;
  next.legacyBonuses.complianceScore = Math.min(35, next.legacyBonuses.complianceScore + 10);
  next.timeline = addTimelineEvent(next.timeline, {
    year: getNextTimelineYear(next),
    type: "government",
    companyId: state.companyType.id,
    companyNameKey: `company.${state.companyType.id}.name`,
    amount: valuation,
    prestigeGain,
  });
  return recalculateFounderLevel(next);
}

// The founder graduates from a company they grew to maturity (the Beginner-tier
// progression path: a Beginner company cannot be sold, so growing it and moving
// on is how the founder advances). Records the company as graduated, grants
// founder prestige/experience/legacy points, and counts toward the next tier
// unlock. Smaller rewards than an exit (no buyer, no payout) but real career
// progress.
export function recordGraduation(profile, state, valuation) {
  const next = recordCompanySnapshot(profile, state, { status: "graduated", valuation });
  const prestigeGain = Math.max(18, Math.round((state.reputation ?? 0) / 2) + Math.round(valuation / 40000));
  next.companiesGraduated += 1;
  next.founderExperience += 26;
  next.legacyPoints += Math.max(2, Math.round(prestigeGain / 14));
  next.prestige += prestigeGain;
  next.reputation += 4;
  next.timeline = addTimelineEvent(next.timeline, {
    year: getNextTimelineYear(next),
    type: "graduated",
    companyId: state.companyType.id,
    companyNameKey: `company.${state.companyType.id}.name`,
    amount: valuation,
    prestigeGain,
  });
  return recalculateFounderLevel(next);
}

export function getLegacyBonusEffects(profile) {
  const prepared = prepareFounderProfile(profile);
  return {
    startingReputation: prepared.legacyBonuses.startingReputation,
    investorConfidence: prepared.legacyBonuses.investorConfidence,
    complianceScore: prepared.legacyBonuses.complianceScore,
    hiringAttractiveness: prepared.legacyBonuses.hiringAttractiveness,
    startingCashMultiplier: 1 + Math.min(0.35, prepared.legacyPoints * 0.01),
  };
}

export function addFounderProgress(profile, { experience = 0, prestige = 0, legacyPoints = 0, reputation = 0 } = {}) {
  const next = prepareFounderProfile(profile);
  next.founderExperience += experience;
  next.prestige += prestige;
  next.legacyPoints += legacyPoints;
  next.reputation += reputation;
  return recalculateFounderLevel(next);
}

// Founder experience accelerates prestige tier unlocks: it counts toward the
// "effective prestige" that drives the 1..5 level, so playing actively (stage
// milestones, strategic decisions) advances the unlock pacing, not only exits.
export function getEffectivePrestige(profile) {
  const prepared = prepareFounderProfile(profile);
  return (prepared.prestige ?? 0) + (prepared.founderExperience ?? 0) * 0.3;
}

export function getPrestigeLevel(profile) {
  return Math.max(1, Math.min(5, Math.floor(getEffectivePrestige(profile) / 100) + 1));
}

export function getPrestigeUnlocks(profile) {
  const level = getPrestigeLevel(profile);
  return [
    { id: "founder-basics", level: 1, unlocked: level >= 1 },
    { id: "rare-contracts", level: 2, unlocked: level >= 2 },
    { id: "investor-access", level: 3, unlocked: level >= 3 },
    { id: "public-sector-access", level: 4, unlocked: level >= 4 },
    { id: "founder-portfolio", level: 5, unlocked: level >= 5 },
  ];
}

// Single source of truth for what each prestige tier actually does in gameplay.
// Higher tiers are cumulative. Consumers (simulation.js, evolution.js) read these
// instead of re-deriving prestige thresholds inline, so the unlocks stay in sync
// with the UI list above.
export function getPrestigeUnlockEffects(profile) {
  const level = getPrestigeLevel(profile);
  return {
    level,
    // Level 1 — founder basics: a small starting reputation + cash head start that
    // grows with each prestige tier reached.
    startingReputationBonus: level * 2,
    startingCashMultiplier: 1 + level * 0.04,
    // Level 2 — rare contracts + improved acquisition offers.
    rareContracts: level >= 2,
    rareContractChance: level >= 2 ? 0.08 : 0,
    acquisitionPremium: level >= 2 ? 0.08 : 0,
    // Level 3 — elite manager candidates (cheaper hiring) + investor access
    // (eased IPO requirements, applied in evolution.js).
    eliteManagers: level >= 3,
    eliteManagerDiscount: level >= 3 ? 0.12 : 0,
    investorAccess: level >= 3,
    // Level 4 — government eligibility boost (eased gov requirements, in
    // evolution.js) + merger negotiation option.
    governmentEligibility: level >= 4,
    mergerNegotiation: level >= 4,
    // Level 5 — holding company / Founder Portfolio path entry.
    holdingUnlock: level >= 5,
  };
}

export function getNextTimelineYear(profile) {
  const maxYear = Math.max(BASE_YEAR - 1, ...profile.timeline.map((event) => event.year ?? BASE_YEAR));
  return maxYear + 1;
}

// --- Founder Traits (#21) ---------------------------------------------------

// Trait ids unlocked by the founder's career milestones (purely derived from the
// persisted career counters, so it is stable and needs no extra save state).
export function getUnlockedTraits(profile) {
  const prepared = prepareFounderProfile(profile);
  return FOUNDER_TRAITS.filter((trait) => (prepared[trait.unlock.stat] ?? 0) >= trait.unlock.min).map((trait) => trait.id);
}

// Aggregated read-time effect bundle from every unlocked trait. Neutral (all 1 /
// 0) for a founder with no milestones, so it never changes a brand-new company.
export function getFounderTraitEffects(profile) {
  const unlocked = new Set(getUnlockedTraits(profile));
  const effects = { taskValue: 1, expense: 1, leadInterval: 1, speedMultiplier: 1, accuracyBonus: 0, satisfactionBonus: 0 };
  for (const trait of FOUNDER_TRAITS) {
    if (!unlocked.has(trait.id)) continue;
    for (const [key, value] of Object.entries(trait.effects)) {
      if (key === "accuracyBonus" || key === "satisfactionBonus") effects[key] += value;
      else effects[key] *= value;
    }
  }
  return effects;
}

// --- Founder Skill Tree (#22) -----------------------------------------------

// One skill point is earned per founder level above 1; spent points are the sum
// of all skill levels. Derived, so points stay consistent without a separate
// counter to keep in sync.
export function getFounderSkillPoints(profile) {
  const prepared = prepareFounderProfile(profile);
  const earned = Math.max(0, (prepared.founderLevel ?? 1) - 1);
  const spent = FOUNDER_SKILLS.reduce((sum, skill) => sum + (prepared.skills?.[skill.id] ?? 0), 0);
  return { earned, spent, available: Math.max(0, earned - spent) };
}

// Read-time / action-time multipliers from the allocated skill levels. All
// neutral (×1) until the player spends points, so the tree is inert by default.
export function getFounderSkillEffects(profile) {
  const prepared = prepareFounderProfile(profile);
  const level = (id) => prepared.skills?.[id] ?? 0;
  return {
    hireCostMult: 1 - SKILL_STEP * level("hiring"),
    startingCashMult: 1 + SKILL_STEP * level("fundraising"),
    automationCostMult: 1 - SKILL_STEP * level("automation"),
    offerMult: 1 + SKILL_STEP * level("negotiation"),
  };
}

// Spend one available point to level a skill (bounded by MAX_SKILL_LEVEL). A
// no-op when the skill is unknown, maxed, or no points are available.
export function applySkillUpgrade(profile, skillId) {
  const prepared = prepareFounderProfile(profile);
  if (!FOUNDER_SKILLS.some((skill) => skill.id === skillId)) return prepared;
  if (getFounderSkillPoints(prepared).available <= 0) return prepared;
  const current = prepared.skills?.[skillId] ?? 0;
  if (current >= MAX_SKILL_LEVEL) return prepared;
  prepared.skills = { ...prepared.skills, [skillId]: current + 1 };
  return prepared;
}

function recalculateFounderLevel(profile) {
  const level = Math.max(1, Math.floor(((profile.prestige ?? 0) + (profile.founderExperience ?? 0) * 0.35) / 100) + 1);
  return { ...profile, founderLevel: level };
}

function addTimelineEvent(timeline, event) {
  return [...timeline, event].slice(-MAX_TIMELINE_ITEMS);
}
