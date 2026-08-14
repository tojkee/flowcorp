// Founder Career progression (#21 Founder Traits, #22 Founder Skill Tree).
// Both layers live on the persistent founder profile, so they carry across
// companies and shape every future company the founder starts.
//
// Traits are EARNED, not chosen: each unlocks once a career milestone is reached
// (founding multiple companies, selling, merging, going public). An unlocked
// trait is a permanent, passive read-time bonus folded into getCompanyEffects —
// the same effect keys as company culture/specialists. Milestone-based unlocks
// keep traits inert for a brand-new founder (and in tests), so they only ever
// reward an actual track record.
//
// Effect keys: taskValue / expense / leadInterval / speedMultiplier are
// multipliers; accuracyBonus / satisfactionBonus are additive.

export const FOUNDER_TRAITS = [
  // A serial founder sees bigger opportunities → richer projects.
  { id: "visionary", unlock: { stat: "companiesFounded", min: 2 }, effects: { taskValue: 1.06 } },
  // Having integrated a merger, the founder runs a tighter operation.
  { id: "operator", unlock: { stat: "mergersCompleted", min: 1 }, effects: { speedMultiplier: 1.06, expense: 0.97 } },
  // A completed acquisition proves deal-making → more inbound work.
  { id: "salesExpert", unlock: { stat: "companiesSold", min: 1 }, effects: { leadInterval: 0.92 } },
  // Having taken a company public, the founder squeezes more from every dollar.
  { id: "financialGenius", unlock: { stat: "iposAchieved", min: 1 }, effects: { expense: 0.94 } },
];

// The skill tree is a CHOICE: the founder earns one skill point per founder level
// (above level 1) and spends them across four skills. Each level is a small,
// bounded, permanent advantage. Unspent points do nothing, so the tree is inert
// until the player invests — a real allocation decision, not a passive modifier.
export const FOUNDER_SKILLS = [
  { id: "hiring" }, // cheaper hires
  { id: "fundraising" }, // more starting cash for future companies
  { id: "automation" }, // cheaper automation tools
  { id: "negotiation" }, // higher buyout offers
];

export const MAX_SKILL_LEVEL = 3;
export const SKILL_STEP = 0.05; // each level is a 5% swing on its lever

export const DEFAULT_FOUNDER_SKILLS = { hiring: 0, fundraising: 0, automation: 0, negotiation: 0 };
