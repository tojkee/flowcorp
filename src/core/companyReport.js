export const COMPANY_REPORT_INTERVAL_SECONDS = 90;
export const MIN_OFFLINE_REPORT_SECONDS = 30;

export function captureCompanyReportSnapshot(state) {
  const bottleneck = [...state.departments].sort(
    (a, b) => (b.bottleneck?.severity ?? 0) - (a.bottleneck?.severity ?? 0),
  )[0] ?? null;
  return {
    revenue: state.revenue,
    expenses: state.expenses,
    cash: state.cash,
    completedProjects: state.completedTasks,
    satisfaction: Math.round(state.clientSatisfaction ?? 100),
    morale: Math.round(state.employeeHappiness ?? 85),
    employees: state.departments.reduce((sum, department) => sum + department.employees, 0),
    totalQueued: state.departments.reduce((sum, department) => sum + department.queue.length, 0),
    automations: [...(state.ownedAutomations ?? [])],
    stageId: state.reachedStages?.[state.reachedStages.length - 1] ?? "startup",
    bottleneckId: bottleneck && (bottleneck.queue.length > 0 || bottleneck.bottleneck?.isOverloaded) ? bottleneck.id : null,
    bottleneckQueue: bottleneck?.queue.length ?? 0,
    bottleneckSeverity: bottleneck?.bottleneck?.severity ?? 0,
    bottleneckOverloaded: Boolean(bottleneck?.bottleneck?.isOverloaded),
    dynamicEventId: state.lastDynamicEvent?.id ?? null,
    dynamicEventType: state.lastDynamicEvent?.type ?? null,
    dynamicEventSeverity: state.lastDynamicEvent?.severity ?? null,
  };
}

export function buildCompanyReport(before, after, { kind = "regular", periodSeconds = COMPANY_REPORT_INTERVAL_SECONDS } = {}) {
  const revenue = Math.max(0, after.revenue - before.revenue);
  const expenses = Math.max(0, after.expenses - before.expenses);
  const completedProjects = Math.max(0, after.completedProjects - before.completedProjects);
  return {
    kind,
    periodSeconds: Math.round(periodSeconds),
    revenue,
    profit: revenue - expenses,
    cashChange: after.cash - before.cash,
    completedProjects,
    satisfaction: after.satisfaction,
    bottleneckId: after.bottleneckId,
    bottleneckQueue: after.bottleneckQueue,
    improvement: getBestImprovement(before, after, { revenue, completedProjects }),
    risk: getNewRisk(before, after, { profit: revenue - expenses }),
  };
}

export function isMeaningfulOfflineReport(report) {
  return report.periodSeconds >= MIN_OFFLINE_REPORT_SECONDS
    && (report.completedProjects > 0 || report.revenue > 0 || Math.abs(report.cashChange) >= 100 || report.risk.id !== "none");
}

function getBestImprovement(before, after, delta) {
  const newAutomation = after.automations.find((id) => !before.automations.includes(id));
  if (after.stageId !== before.stageId) return { id: "stage", vars: { stageId: after.stageId } };
  if (newAutomation) return { id: "automation", vars: { toolId: newAutomation } };
  if (after.employees > before.employees) return { id: "hiring", vars: { count: after.employees - before.employees } };
  if (after.satisfaction >= before.satisfaction + 2) return { id: "satisfaction", vars: { value: after.satisfaction - before.satisfaction } };
  if (before.totalQueued >= after.totalQueued + 2) return { id: "queueReduced", vars: { count: before.totalQueued - after.totalQueued } };
  if (delta.completedProjects > 0) return { id: "projects", vars: { count: delta.completedProjects } };
  if (delta.revenue > 0) return { id: "revenue", vars: { amount: delta.revenue } };
  return { id: "steady", vars: {} };
}

function getNewRisk(before, after, delta) {
  if (after.cash < 0) return { id: "cashNegative", vars: {} };
  if (after.dynamicEventId && after.dynamicEventId !== before.dynamicEventId && after.dynamicEventSeverity === "bad") {
    return { id: "dynamicEvent", vars: { eventType: after.dynamicEventType } };
  }
  if (after.satisfaction <= before.satisfaction - 3) return { id: "satisfaction", vars: { value: before.satisfaction - after.satisfaction } };
  if (after.bottleneckOverloaded && (!before.bottleneckOverloaded || after.bottleneckSeverity > before.bottleneckSeverity + 0.08)) {
    return { id: "bottleneck", vars: { departmentId: after.bottleneckId } };
  }
  if (after.totalQueued >= before.totalQueued + 3) return { id: "queueGrowth", vars: { count: after.totalQueued - before.totalQueued } };
  if (after.morale < 50 || after.morale <= before.morale - 6) return { id: "morale", vars: { value: after.morale } };
  if (delta.profit < 0) return { id: "loss", vars: { amount: Math.abs(delta.profit) } };
  if (after.cash <= before.cash - 500) return { id: "cashDrop", vars: { amount: before.cash - after.cash } };
  return { id: "none", vars: {} };
}
