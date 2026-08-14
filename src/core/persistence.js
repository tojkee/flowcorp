// Save system. The save is a ROSTER of the companies the founder runs (Active
// Multi-Company Management, #24): each record is a plain, JSON-serializable
// simulation state + the wall-clock `lastActiveAt` used for offline catch-up,
// plus which company is currently active and the shared notification inbox.
//
// Only one company is "live" at a time (the active one ticks); paused companies
// keep their `lastActiveAt` so they advance by real elapsed time when next made
// active. A single live company is just a roster of one — identical in behaviour
// to the original single-company save, so existing v1 saves migrate cleanly.

const SAVE_KEY = "flowcorp.save.v1";
const SAVE_VERSION = 2;

const EMPTY_NOTIFICATIONS = { items: [], lastFired: {}, activeKeys: [] };

function normalizeNotifications(value) {
  return {
    items: Array.isArray(value?.items) ? value.items : [],
    lastFired: value?.lastFired && typeof value.lastFired === "object" ? value.lastFired : {},
    activeKeys: Array.isArray(value?.activeKeys) ? value.activeKeys : [],
  };
}

// roster = { activeId, companies: [{ id, sim, lastActiveAt }], notifications }
export function saveRoster(roster) {
  if (!roster || !Array.isArray(roster.companies) || roster.companies.length === 0) return;
  try {
    const now = Date.now();
    const companies = roster.companies
      .filter((record) => record?.sim)
      .map((record) => ({
        id: record.id ?? record.sim.companyType?.id,
        sim: record.sim,
        // The active company's clock is "now"; paused companies keep their stored
        // timestamp so their catch-up measures the real time they were paused.
        lastActiveAt: record.id === roster.activeId ? now : record.lastActiveAt ?? now,
      }));
    if (!companies.length) return;
    const activeId = companies.some((c) => c.id === roster.activeId) ? roster.activeId : companies[0].id;
    const payload = {
      version: SAVE_VERSION,
      activeId,
      companies,
      notifications: normalizeNotifications(roster.notifications),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable (private mode, quota). Saving is best-effort.
  }
}

export function loadRoster() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return normalizeSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Normalize a stored payload (v2 roster OR legacy v1 single-sim) into a roster.
// Pure (no localStorage), so it is unit-testable. Returns null when there is no
// usable save.
export function normalizeSave(payload) {
  if (!payload || typeof payload !== "object") return null;

  // v2 — a company roster.
  if (Array.isArray(payload.companies) && payload.companies.length) {
    const companies = payload.companies
      .filter((record) => record?.sim)
      .map((record) => ({
        id: record.id ?? record.sim.companyType?.id,
        sim: record.sim,
        lastActiveAt: record.lastActiveAt ?? Date.now(),
      }));
    if (!companies.length) return null;
    const activeId = companies.some((c) => c.id === payload.activeId) ? payload.activeId : companies[0].id;
    return { activeId, companies, notifications: normalizeNotifications(payload.notifications) };
  }

  // v1 (or any legacy single-sim save) — wrap it as a one-company roster.
  if (payload.sim) {
    const id = payload.sim.companyType?.id;
    return {
      activeId: id,
      companies: [{ id, sim: payload.sim, lastActiveAt: payload.lastActiveAt ?? Date.now() }],
      notifications: normalizeNotifications(payload.notifications),
    };
  }

  return null;
}

export function clearGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}

export { EMPTY_NOTIFICATIONS };
