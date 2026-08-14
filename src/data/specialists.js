// Special (rare star) employees. Each is a one-time, expensive hire that grants
// a persistent company-wide perk via read-time effect multipliers/bonuses
// (folded in through getCompanyEffects in simulation.js). They become available
// rarely, one at a time, so signing one feels like a memorable moment.
//
// `costMult` × baseTaskValue is the one-time signing cost. Effect keys match the
// culture effects (taskValue / expense / leadInterval / speedMultiplier
// multipliers; accuracyBonus / satisfactionBonus additive). id-based for i18n
// (`specialist.<id>.{name,perk}`).

export const SPECIALISTS = [
  { id: "rockstarSales", costMult: 18, effects: { leadInterval: 0.9, taskValue: 1.05 } },
  { id: "industryVeteran", costMult: 22, effects: { taskValue: 1.04, satisfactionBonus: 6 } },
  { id: "exGoogleEngineer", costMult: 28, effects: { speedMultiplier: 1.12, accuracyBonus: 0.04 } },
  { id: "operationsGenius", costMult: 30, effects: { speedMultiplier: 1.1, expense: 0.95 } },
];

export const SPECIALIST_BY_ID = Object.fromEntries(SPECIALISTS.map((s) => [s.id, s]));
