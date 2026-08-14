// Data-driven CEO Inbox situations. Effects intentionally map to simulation
// levers that already exist; simulation.js owns the generic effect interpreter.
export const CEO_SITUATIONS = [
  {
    id: "clientComplaint",
    icon: "📨",
    weight: 4,
    when: { maxSatisfaction: 79 },
    choices: [
      { id: "compensateClient", tone: "good", effects: { cashUnits: -4, satisfaction: 12, reputation: 1 } },
      { id: "apologizeClient", tone: "good", effects: { satisfaction: 5 } },
      { id: "ignoreComplaint", tone: "warning", effects: { satisfaction: -8, reputation: -2 } },
    ],
  },
  {
    id: "managerRecommendation",
    icon: "📋",
    weight: 3,
    when: { overloaded: true },
    choices: [
      { id: "followManager", tone: "good", effects: { cashUnits: -2, leadIntervalMult: 0.98, reputation: 1 } },
      { id: "declineManager", tone: "neutral", effects: {} },
    ],
  },
  {
    id: "employeeRequest",
    icon: "🧑‍💼",
    weight: 2,
    choices: [
      { id: "approveRaise", tone: "good", effects: { cashUnits: -5, expenseMult: 1.04, leadIntervalMult: 0.98, reputation: 2, morale: 8 } },
      { id: "offerPerks", tone: "good", effects: { cashUnits: -2, reputation: 1, morale: 4 } },
      { id: "denyRequest", tone: "warning", effects: { reputation: -2, taskValueMult: 0.99, morale: -6 } },
    ],
  },
  {
    id: "investorQuestion",
    icon: "💼",
    weight: 2,
    when: { minCompletedTasks: 1 },
    choices: [
      { id: "investGrowth", tone: "good", effects: { taskValueMult: 1.03, expenseMult: 1.03 } },
      { id: "focusProfit", tone: "warning", effects: { expenseMult: 0.97, reputation: -1 } },
      { id: "reassureInvestors", tone: "good", effects: { reputation: 1 } },
    ],
  },
  {
    id: "archiveTape",
    code: "B1-U-03",
    channel: "media",
    icon: "📼",
    weight: 2,
    when: { minCompletedTasks: 2 },
    choices: [
      { id: "containArchiveLeak", tone: "good", effects: { cashUnits: -4, reputation: 2, satisfaction: 4, dynamicEventCooldown: 25 } },
      { id: "callArchiveClient", tone: "good", effects: { cashUnits: -1, reputation: 1, satisfaction: 2 } },
      { id: "publishArchiveFirst", tone: "warning", effects: { reputation: 4, satisfaction: -8, dynamicEventCooldown: -35 } },
    ],
  },
  {
    id: "midnightLaunch",
    code: "O2-C-11",
    channel: "operations",
    icon: "🚀",
    weight: 2,
    when: { minQueued: 4 },
    choices: [
      { id: "shipTonight", tone: "warning", effects: { taskValueMult: 1.03, morale: -8, salaryPressure: 4, dynamicEventCooldown: -25 } },
      { id: "delayLaunch", tone: "warning", effects: { satisfaction: -4, leadIntervalMult: 1.02, morale: 3 } },
      { id: "cutLaunchScope", tone: "neutral", effects: { cashUnits: -2, taskValueMult: 0.99, morale: 3, dynamicEventCooldown: 10 } },
    ],
  },
  {
    id: "keyResignation",
    code: "P1-H-07",
    channel: "people",
    icon: "🪪",
    weight: 2,
    when: { minEmployees: 7 },
    choices: [
      { id: "counterKeyEmployee", tone: "good", effects: { cashUnits: -6, expenseMult: 1.02, morale: 10 } },
      { id: "promoteDeputy", tone: "good", effects: { cashUnits: -2, reputation: 1, morale: 5 } },
      { id: "acceptResignation", tone: "warning", effects: { removeEmployees: 1, morale: -10, leadIntervalMult: 1.03, dynamicEventCooldown: -20 } },
    ],
  },
  {
    id: "invoiceDispute",
    code: "F3-A-02",
    channel: "finance",
    icon: "🧾",
    weight: 2,
    when: { minCompletedTasks: 4 },
    choices: [
      { id: "refundInvoice", tone: "good", effects: { cashUnits: -5, satisfaction: 10, reputation: 1 } },
      { id: "sendAuditTrail", tone: "good", effects: { cashUnits: -1, satisfaction: 2, reputation: 2, dynamicEventCooldown: 15 } },
      { id: "collectInvoiceNow", tone: "warning", effects: { cashUnits: 3, satisfaction: -10, reputation: -2 } },
    ],
  },
  {
    id: "viralDemand",
    code: "M2-G-09",
    channel: "market",
    icon: "📈",
    weight: 2,
    when: { minReputation: 8 },
    choices: [
      { id: "acceptViralDemand", tone: "warning", effects: { leadBurst: 3, leadValueMult: 1.3, reputation: 3, morale: -6 } },
      { id: "premiumViralDemand", tone: "good", effects: { leadBurst: 1, rareLeads: true, leadValueMult: 2, taskValueMult: 1.02, reputation: 2 } },
      { id: "waitlistViralDemand", tone: "good", effects: { leadIntervalMult: 1.03, satisfaction: 3, morale: 2 } },
    ],
  },
];

export const CEO_SITUATION_BY_ID = Object.fromEntries(CEO_SITUATIONS.map((situation) => [situation.id, situation]));
export const CEO_CHOICE_BY_ID = Object.fromEntries(
  CEO_SITUATIONS.flatMap((situation) => situation.choices.map((choice) => [choice.id, { ...choice, situationId: situation.id }])),
);

export function isCeoSituationEligible(situation, state) {
  const when = situation.when ?? {};
  const satisfaction = state.clientSatisfaction ?? 100;
  const employees = state.departments.reduce((sum, department) => sum + department.employees, 0);
  const queued = state.departments.reduce((sum, department) => sum + department.queue.length, 0);
  const overloaded = state.departments.some((department) => department.bottleneck?.isOverloaded);
  if (when.maxSatisfaction != null && satisfaction > when.maxSatisfaction) return false;
  if (when.minCompletedTasks != null && state.completedTasks < when.minCompletedTasks) return false;
  if (when.minEmployees != null && employees < when.minEmployees) return false;
  if (when.minQueued != null && queued < when.minQueued) return false;
  if (when.minReputation != null && state.reputation < when.minReputation) return false;
  if (when.overloaded != null && overloaded !== when.overloaded) return false;
  return true;
}
