import { tickSimulation, getMetrics } from "./simulation.js";
import { buildCompanyReport, captureCompanyReportSnapshot, COMPANY_REPORT_INTERVAL_SECONDS, isMeaningfulOfflineReport } from "./companyReport.js";

// Offline / background progress. When the player returns, the company is
// advanced by the elapsed wall-clock time using the SAME `tickSimulation`
// business logic (no duplicated rules), stepped in bounded coarse increments so
// a long absence cannot freeze the UI or blow up memory.

export const MAX_OFFLINE_SECONDS = 4 * 3600; // catch-up is capped at 4 hours
const MIN_AWAY_SECONDS = 2; // ignore trivial gaps (tab switches)
const OFFLINE_STEP_SECONDS = 2; // base granularity of a catch-up tick
const MAX_OFFLINE_TICKS = 1500; // hard bound on work done on resume
const TASK_SAFETY_CAP = 800; // stop early if a backlog explodes (perf guard)

// Advance `sim` for the time between `lastActiveAt` and `now`.
// Returns the new sim plus a "while you were away" summary (or null if the gap
// was too small to matter).
export function simulateOffline(sim, lastActiveAt, now) {
  if (!sim) return { sim, summary: null };

  const elapsedSeconds = Math.max(0, (now - (lastActiveAt ?? now)) / 1000);
  if (elapsedSeconds < MIN_AWAY_SECONDS) return { sim, summary: null };

  const cappedSeconds = Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
  const before = captureCompanyReportSnapshot(sim);

  // Bound the number of ticks regardless of how long the player was away.
  const step = Math.max(OFFLINE_STEP_SECONDS, cappedSeconds / MAX_OFFLINE_TICKS);
  let next = sim;
  let remaining = cappedSeconds;
  let ticks = 0;
  let stoppedEarly = false;

  while (remaining > 0 && ticks < MAX_OFFLINE_TICKS) {
    const dt = Math.min(step, remaining);
    next = tickSimulation(next, dt);
    remaining -= dt;
    ticks += 1;
    if (next.tasks.length > TASK_SAFETY_CAP) {
      stoppedEarly = true;
      break;
    }
  }

  const summary = buildSummary(before, next, {
    awaySeconds: cappedSeconds,
    capped: elapsedSeconds > MAX_OFFLINE_SECONDS,
    stoppedEarly,
  });

  if (summary) {
    // The full-period offline report supersedes any periodic report generated
    // inside catch-up, preventing two summaries on resume.
    next.companyReport = null;
    next.companyReportBaseline = captureCompanyReportSnapshot(next);
    next.companyReportTimer = COMPANY_REPORT_INTERVAL_SECONDS;
  }
  return { sim: next, summary };
}

function buildSummary(before, after, meta) {
  const metrics = getMetrics(after);
  const report = buildCompanyReport(before, captureCompanyReportSnapshot(after), { kind: "offline", periodSeconds: meta.awaySeconds });
  if (!isMeaningfulOfflineReport(report)) return null;
  return {
    ...report,
    awaySeconds: Math.round(meta.awaySeconds),
    capped: meta.capped,
    stoppedEarly: meta.stoppedEarly,
    recommendation: metrics.advisor,
  };
}
