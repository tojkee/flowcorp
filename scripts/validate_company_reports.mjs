import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { COMPANY_REPORT_INTERVAL_SECONDS, buildCompanyReport, captureCompanyReportSnapshot } from "../src/core/companyReport.js";
import { createSimulation, dismissCompanyReport, getMetrics, tickSimulation } from "../src/core/simulation.js";
import { simulateOffline } from "../src/core/offline.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];

// Regular reports arrive after the short interval and expose every required row.
let state = createSimulation(IT);
assert(state.companyReportTimer === COMPANY_REPORT_INTERVAL_SECONDS, "A new company should start with the full report interval.");
for (let i = 0; i < COMPANY_REPORT_INTERVAL_SECONDS + 2; i += 1) state = tickSimulation(state, 1);
const first = state.companyReport;
assert(first && first.kind === "regular", "A regular report should be generated after the interval.");
for (const key of ["revenue", "profit", "cashChange", "completedProjects", "satisfaction", "bottleneckId", "improvement", "risk"]) {
  assert(Object.hasOwn(first, key), `The report should include ${key}.`);
}
assert(getMetrics(state).companyReport?.recommendation?.id, "Report metrics should attach a current Advisor recommendation.");

// An unread report blocks stacking. Reviewing it restarts a clean cycle.
const firstId = first.id;
for (let i = 0; i < COMPANY_REPORT_INTERVAL_SECONDS * 2; i += 1) state = tickSimulation(state, 1);
assert(state.companyReport.id === firstId, "An unread report should not be replaced by another report.");
state = dismissCompanyReport(state);
assert(state.companyReport === null, "Reviewing should clear the pending report.");
for (let i = 0; i < COMPANY_REPORT_INTERVAL_SECONDS + 1; i += 1) state = tickSimulation(state, 1);
assert(state.companyReport?.sequence === 2, "A new report should arrive one full interval after review.");

// The pure builder ranks an actual improvement and an emerging risk.
const base = createSimulation(IT);
const before = captureCompanyReportSnapshot(base);
const improved = {
  ...base,
  ownedAutomations: [...base.ownedAutomations, "crm"],
  clientSatisfaction: 90,
  cash: base.cash - 700,
};
improved.departments[0] = {
  ...improved.departments[0],
  queue: ["a", "b", "c", "d"],
  bottleneck: { ...improved.departments[0].bottleneck, isOverloaded: true, severity: 0.8 },
};
const ranked = buildCompanyReport(before, captureCompanyReportSnapshot(improved));
assert(ranked.improvement.id === "automation", "A newly installed tool should rank as the best improvement.");
assert(["satisfaction", "bottleneck"].includes(ranked.risk.id), "A material client or bottleneck decline should rank as the new risk.");

// Meaningful offline progress produces the same full report model and clears any
// stale periodic report generated during catch-up.
const offlineStart = createSimulation(IT);
const offlineResult = simulateOffline(offlineStart, 1_000, 181_000);
assert(offlineResult.summary?.kind === "offline", "Meaningful offline progress should produce an offline company report.");
assert(offlineResult.summary.recommendation?.id, "The offline report should recommend a next action.");
assert(offlineResult.sim.companyReport === null, "The offline report should replace a stale periodic report from catch-up.");
assert(offlineResult.sim.companyReportTimer === COMPANY_REPORT_INTERVAL_SECONDS, "Offline reporting should restart the regular cadence.");

// A trivial background gap advances the sim but does not interrupt the player.
const brief = simulateOffline(createSimulation(IT), 1_000, 6_000);
assert(brief.summary === null, "A trivial offline gap should not show a company report.");

console.log(`Company report validation passed (${checks} checks).`);
