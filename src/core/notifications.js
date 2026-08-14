// Notification rules. Data-driven, like the rest of the simulation: each rule
// inspects the current sim + metrics and, when it matches, produces an inbox
// item. Per-key cooldowns prevent spam and deduplicate repeated alerts so the
// company only asks for attention when something meaningful happens.

export const LOW_CASH_THRESHOLD = 400;
export const QUEUE_OVERLOAD_THRESHOLD = 12;
export const SEVERE_BOTTLENECK_SEVERITY = 0.5;
export const CLIENT_RISK_THRESHOLD = 75;
export const MAJOR_CONTRACT_DEADLINE_SECONDS = 30;
export const INBOX_LIMIT = 40;
// Rules that already dedupe by a unique key (a stage id, offer id, decision id,
// or event id) should fire exactly once per key, not repeat on every check while
// the condition lingers. A very long cooldown makes the per-key dedupe do the
// work while a genuinely new key (new id) still fires immediately.
export const FIRE_ONCE_MS = 24 * 60 * 60 * 1000;

// severity drives color and whether a system (browser) notification may fire.
export const NOTIFICATION_RULES = [
  {
    id: "cashNegative",
    severity: "critical",
    priority: 100,
    cooldownMs: 120000,
    evaluate: (sim, metrics) => (metrics.cash < 0 ? {} : null),
  },
  {
    id: "cashLow",
    severity: "warning",
    priority: 55,
    cooldownMs: 120000,
    evaluate: (sim, metrics) => (metrics.cash >= 0 && metrics.cash < LOW_CASH_THRESHOLD ? {} : null),
  },
  {
    id: "severeBottleneck",
    severity: "critical",
    priority: 80,
    cooldownMs: 90000,
    evaluate: (sim, metrics) => {
      const b = metrics.bottleneck;
      if (b?.bottleneck?.isOverloaded && b.bottleneck.severity >= SEVERE_BOTTLENECK_SEVERITY) {
        return { key: `severeBottleneck:${b.id}`, vars: { departmentId: b.id } };
      }
      return null;
    },
  },
  {
    id: "queueOverloaded",
    severity: "warning",
    priority: 45,
    cooldownMs: 90000,
    evaluate: (sim) => {
      const dept = sim.departments.find((d) => d.queue.length >= QUEUE_OVERLOAD_THRESHOLD);
      if (dept) return { key: `queueOverloaded:${dept.id}`, vars: { departmentId: dept.id, count: dept.queue.length } };
      return null;
    },
  },
  {
    id: "automationAvailable",
    severity: "info",
    priority: 20,
    cooldownMs: 300000,
    evaluate: (sim, metrics) => {
      const next = metrics.nextAutomation;
      if (next && next.affordable) return { key: `automationAvailable:${next.id}`, vars: { toolId: next.id } };
      return null;
    },
  },
  {
    id: "performanceDropping",
    severity: "warning",
    priority: 50,
    cooldownMs: 180000,
    evaluate: (sim, metrics) => (metrics.revenue > 0 && metrics.profit < 0 ? {} : null),
  },
  {
    id: "stageAdvanced",
    severity: "info",
    priority: 35,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim, metrics) => {
      const evolution = metrics.evolution;
      if (!evolution || evolution.stageIndex <= 0) return null;
      // Dedupe by stage id, so this fires once per lifecycle stage reached.
      return { key: `stage:${evolution.stageId}`, vars: { stageId: evolution.stageId } };
    },
  },
  {
    id: "acquisitionOffer",
    severity: "critical",
    priority: 120,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim, metrics) => {
      const offer = metrics.evolution?.activeOffer;
      if (offer && offer.kind === "acquisition") return { key: `offer:${offer.id}`, vars: { buyerId: offer.buyerId, amount: offer.amount } };
      return null;
    },
  },
  {
    id: "mergerOffer",
    severity: "warning",
    priority: 110,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim, metrics) => {
      const offer = metrics.evolution?.activeOffer;
      if (offer && offer.kind === "merger") return { key: `offer:${offer.id}`, vars: { buyerId: offer.buyerId, amount: offer.amount } };
      return null;
    },
  },
  {
    id: "pathsUnlocked",
    severity: "info",
    priority: 30,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim, metrics) => {
      const unlocked = metrics.evolution?.unlockedPaths ?? [];
      const strategic = unlocked.some((id) => id !== "merge");
      return strategic ? { key: "pathsUnlocked" } : null;
    },
  },
  // Client at risk: client satisfaction is slipping (late deliveries).
  {
    id: "clientAtRisk",
    severity: "warning",
    priority: 58,
    cooldownMs: 120000,
    evaluate: (sim, metrics) => (metrics.clients && metrics.clients.satisfaction < CLIENT_RISK_THRESHOLD ? {} : null),
  },
  // A client-facing CEO decision has an immediate relationship consequence.
  {
    id: "clientDecisionWaiting",
    severity: "warning",
    priority: 105,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      const decision = sim.ceoDecision;
      if (!decision || !["clientComplaint", "archiveTape", "invoiceDispute"].includes(decision.type)) return null;
      return { key: `ceo:${decision.id}` };
    },
  },
  // Narrative CEO cards carry explicit risk and should outrank routine updates.
  {
    id: "riskyCeoSituation",
    severity: "warning",
    priority: 108,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      const decision = sim.ceoDecision;
      if (!decision?.narrative || ["archiveTape", "invoiceDispute"].includes(decision.type)) return null;
      return { key: `ceo:${decision.id}` };
    },
  },
  // A high-value project close to its deadline is actionable before it becomes late.
  {
    id: "majorContractDeadline",
    severity: "critical",
    priority: 115,
    cooldownMs: 120000,
    evaluate: (sim) => {
      const candidates = sim.tasks
        .filter((task) => {
          const remaining = (task.deadline ?? Infinity) - sim.elapsed;
          return task.status !== "completed"
            && task.clientId
            && (task.rareContract || task.value >= sim.companyType.baseTaskValue * 1.5)
            && remaining > 0
            && remaining <= MAJOR_CONTRACT_DEADLINE_SECONDS;
        })
        .sort((a, b) => a.deadline - b.deadline || b.value - a.value);
      const task = candidates[0];
      if (!task) return null;
      return {
        key: "majorContractDeadline",
        vars: {
          clientId: task.clientId,
          projectId: task.projectId,
          seconds: Math.max(1, Math.ceil(task.deadline - sim.elapsed)),
        },
      };
    },
  },
  // Important decision available: a non-narrative CEO or strategic-layer decision.
  {
    id: "decisionWaiting",
    severity: "info",
    priority: 90,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      if (sim.ceoDecision && !sim.ceoDecision.narrative && !["clientComplaint"].includes(sim.ceoDecision.type)) {
        return { key: `ceo:${sim.ceoDecision.id}` };
      }
      if (sim.strategicEvent) return { key: `strategic:${sim.strategicEvent.id}` };
      return null;
    },
  },
  {
    id: "companyReportReady",
    severity: "info",
    priority: 65,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => (sim.companyReport ? { key: `report:${sim.companyReport.id}` } : null),
  },
  {
    id: "offlineProgressReady",
    severity: "info",
    priority: 70,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim, metrics, context) => {
      const summary = context?.offlineSummary;
      if (!summary) return null;
      return {
        key: `offline:${Math.round(sim.elapsed)}:${summary.awaySeconds}`,
        vars: {
          revenue: Math.round(summary.revenue ?? 0),
          projects: summary.completedProjects ?? 0,
        },
      };
    },
  },
  // Dynamic world events (employee issue, outage, viral success, press, trends).
  // Split by tone so the notification severity matches the event.
  {
    id: "dynamicEventGood",
    severity: "info",
    priority: 25,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      const event = sim.lastDynamicEvent;
      if (event && event.severity === "good") return { key: `dyn:${event.id}`, vars: { eventType: event.type } };
      return null;
    },
  },
  {
    id: "dynamicEventBad",
    severity: "warning",
    priority: 48,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      const event = sim.lastDynamicEvent;
      if (!event || event.severity !== "bad") return null;
      // Some events happened to a specific person (an employee quitting) — pass
      // them along so the inbox can name who it was.
      const person = event.person;
      return {
        key: `dyn:${event.id}`,
        vars: person
          ? { eventType: event.type, employee: person.employee, departmentId: person.departmentId }
          : { eventType: event.type },
      };
    },
  },
  // A rare special (star) employee is available to sign (contract opportunity).
  {
    id: "specialistAvailable",
    severity: "info",
    priority: 75,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      if (sim.availableSpecialist) return { key: `specialist:${sim.availableSpecialist}`, vars: { specialistId: sim.availableSpecialist } };
      return null;
    },
  },
  // Competitor news — the market reacts around the player (world feels alive).
  {
    id: "competitorEvent",
    severity: "info",
    priority: 26,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      const event = sim.lastCompetitorEvent;
      if (event) return { key: `competitor:${event.id}`, vars: { competitorId: event.competitorId, compType: event.type } };
      return null;
    },
  },
  // Industry trend — the industry-wide climate shifted (AI boom, recession, …).
  {
    id: "industryTrend",
    severity: "info",
    priority: 27,
    cooldownMs: FIRE_ONCE_MS,
    evaluate: (sim) => {
      const event = sim.lastIndustryTrend;
      if (event) return { key: `trend:${event.id}`, vars: { trendId: event.trendId } };
      return null;
    },
  },
];

// Returns the inbox items that should be added now and the updated cooldown map.
export function evaluateNotifications(sim, metrics, now, lastFired, previousActiveKeys = [], context = {}) {
  const fired = { ...(lastFired ?? {}) };
  const previouslyActive = new Set(previousActiveKeys ?? []);
  const activeKeys = new Set();
  const candidates = [];
  let activePriorityFloor = -Infinity;

  for (const [index, rule] of NOTIFICATION_RULES.entries()) {
    const match = rule.evaluate(sim, metrics, context);
    if (!match) continue;

    const key = match.key ?? rule.id;
    activeKeys.add(key);
    if (previouslyActive.has(key)) {
      activePriorityFloor = Math.max(activePriorityFloor, rule.priority);
      continue;
    }
    const last = fired[key] ?? 0;
    if (now - last < rule.cooldownMs) continue;

    candidates.push({ rule, match, key, index });
  }

  // One evaluation produces one strong reason to return. Other simultaneously
  // active conditions are latched, so they cannot cascade on later save ticks.
  candidates.sort((a, b) => b.rule.priority - a.rule.priority || a.index - b.index);
  const winner = candidates.find((candidate) => candidate.rule.priority > activePriorityFloor);
  const newItems = [];
  if (winner) {
    fired[winner.key] = now;
    newItems.push({
      id: `${winner.key}@${now}`,
      ruleId: winner.rule.id,
      key: winner.key,
      severity: winner.rule.severity,
      titleKey: `notify.${winner.rule.id}.title`,
      bodyKey: `notify.${winner.rule.id}.body`,
      vars: winner.match.vars ?? {},
      time: now,
      read: false,
    });
  }

  return { newItems, lastFired: fired, activeKeys: [...activeKeys] };
}

// Browser system notifications may fire only for these severities.
export function isSystemSeverity(severity) {
  return severity === "critical" || severity === "warning";
}
