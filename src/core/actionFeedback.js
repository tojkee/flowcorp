import { AUTOMATION_BY_ID } from "../data/automations.js";
import { RECOVERY_CONTRACT_LEADS } from "./guidance.js";

// Action feedback is derived from before/after snapshots. It is presentation
// data only: nothing is written to the simulation or persisted in the save.
export function captureFeedbackSnapshot(state, metrics) {
  return {
    elapsed: state.elapsed,
    cash: state.cash,
    revenue: state.revenue,
    completedTasks: state.completedTasks,
    debt: state.debt ?? 0,
    recoveryContractsUsed: state.recoveryContractsUsed ?? 0,
    goalRewardSequence: state.goalRewardSequence ?? 0,
    lastGoalReward: state.lastGoalReward ? { ...state.lastGoalReward } : null,
    ownedAutomations: [...(state.ownedAutomations ?? [])],
    departments: Object.fromEntries(
      state.departments.map((department) => [
        department.id,
        {
          employees: department.employees,
          overloaded: Boolean(department.bottleneck?.isOverloaded),
        },
      ]),
    ),
    bottleneckId: metrics.bottleneck?.id ?? null,
    bottleneckOverloaded: Boolean(metrics.bottleneck?.bottleneck?.isOverloaded),
  };
}

export function getActionFeedback(action, before, after) {
  if (!action || !before || !after) return null;

  if (action.type === "hire") {
    const oldCount = before.departments[action.departmentId]?.employees ?? 0;
    const newCount = after.departments[action.departmentId]?.employees ?? 0;
    if (newCount <= oldCount) return null;
    return {
      id: "hire",
      tone: "good",
      vars: { departmentId: action.departmentId, value: Math.round(((newCount - oldCount) / Math.max(1, oldCount)) * 100) },
    };
  }

  if (action.type === "rebalance") {
    const departmentId = action.departmentId ?? before.bottleneckId;
    const oldCount = before.departments[departmentId]?.employees ?? 0;
    const newCount = after.departments[departmentId]?.employees ?? 0;
    if (!departmentId || newCount <= oldCount) return null;
    return {
      id: "rebalance",
      tone: "good",
      vars: { departmentId, value: Math.round(((newCount - oldCount) / Math.max(1, oldCount)) * 100) },
    };
  }

  if (action.type === "automation") {
    if (before.ownedAutomations.includes(action.automationId) || !after.ownedAutomations.includes(action.automationId)) return null;
    const tool = AUTOMATION_BY_ID[action.automationId];
    return {
      id: "automation",
      tone: "good",
      vars: {
        toolId: action.automationId,
        value: Math.round(((tool?.speedMultiplier ?? 1) - 1) * 100),
        slots: tool?.capacityBonus ?? 0,
      },
    };
  }

  if (action.type === "loan" && after.debt > before.debt && after.cash > before.cash) {
    return { id: "loan", tone: "warning", vars: { amount: after.cash - before.cash } };
  }

  if (action.type === "recoveryContract" && after.recoveryContractsUsed > before.recoveryContractsUsed) {
    return {
      id: "recoveryContract",
      tone: "good",
      vars: { amount: after.cash - before.cash, count: RECOVERY_CONTRACT_LEADS },
    };
  }

  return null;
}

export function getProgressFeedback(before, after) {
  if (!before || !after) return [];
  const feedback = [];

  if (after.goalRewardSequence > before.goalRewardSequence && after.lastGoalReward) {
    feedback.push({
      id: "goalComplete",
      tone: "good",
      vars: {
        amount: after.lastGoalReward.cash,
        reputation: after.lastGoalReward.reputation,
      },
    });
  }

  if (after.completedTasks > before.completedTasks && after.revenue > before.revenue) {
    feedback.push({
      id: "projectPaid",
      tone: "money",
      vars: {
        amount: after.revenue - before.revenue,
        count: after.completedTasks - before.completedTasks,
      },
    });
  }

  if (before.bottleneckId && before.bottleneckOverloaded) {
    const sameDepartment = after.departments[before.bottleneckId];
    if (!sameDepartment?.overloaded) {
      feedback.push({ id: "bottleneckSolved", tone: "good", vars: { departmentId: before.bottleneckId } });
    }
  }

  return feedback;
}
