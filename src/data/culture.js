// Company cultures: a strategic choice that grants a bonus and a matching
// weakness via read-time effect multipliers/bonuses (folded into the sim through
// getCompanyEffects in simulation.js). Each culture also unlocks one signature
// "unique" dynamic event (tagged with `culture` in DYNAMIC_EVENTS).
//
// Effect keys: taskValue / expense / leadInterval / speedMultiplier are
// multipliers; accuracyBonus / satisfactionBonus are additive. Cultures are
// id-based so all visible text is localized (`culture.<id>.{name,bonus,weakness}`).

export const CULTURES = [
  // Innovation Driven — better products, higher R&D cost.
  { id: "innovation", effects: { taskValue: 1.12, expense: 1.06 }, event: "breakthrough" },
  // Quality First — fewer defects & higher value, but slower intake.
  { id: "quality", effects: { accuracyBonus: 0.06, taskValue: 1.05, leadInterval: 1.08 }, event: "qualityAward" },
  // Fast Growth — more incoming work, higher burn.
  { id: "fastGrowth", effects: { leadInterval: 0.85, expense: 1.08 }, event: "growthSpurt" },
  // Cost Efficient — leaner payroll, slightly lower project value.
  { id: "costEfficient", effects: { expense: 0.9, taskValue: 0.95 }, event: "efficiencyWin" },
  // Customer Obsessed — happier clients, higher cost.
  { id: "customerObsessed", effects: { satisfactionBonus: 8, expense: 1.05 }, event: "referralWave" },
];

export const CULTURE_BY_ID = Object.fromEntries(CULTURES.map((culture) => [culture.id, culture]));
