// Validates the save-roster normalization + migration that backs Active
// Multi-Company Management (#24). Deterministic Node script (normalizeSave is
// pure — no localStorage). Run: npm run validate:save
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import { appointExecutive, createSimulation, getCompanyEffects, getInternalSynergyEffects, getMetrics } from "../src/core/simulation.js";
import { normalizeSave } from "../src/core/persistence.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const itSim = createSimulation(COMPANY_TYPES[0]);
const mfgSim = createSimulation(COMPANY_TYPES[3]);

// No / empty save → null.
assert(normalizeSave(null) === null, "No payload normalizes to null.");
assert(normalizeSave({}) === null, "An empty payload normalizes to null.");
assert(normalizeSave({ version: 2, companies: [] }) === null, "A roster with no companies normalizes to null.");

// --- v1 migration (legacy single-sim save) → one-company roster ---------------
const v1 = { version: 1, lastActiveAt: 123, sim: itSim, notifications: { items: [{ id: "x" }], lastFired: {} } };
const fromV1 = normalizeSave(v1);
assert(fromV1 && fromV1.companies.length === 1, "A v1 single-sim save migrates to a one-company roster.");
assert(fromV1.activeId === itSim.companyType.id, "Migration sets the active company to the saved sim.");
assert(fromV1.companies[0].sim === itSim && fromV1.companies[0].lastActiveAt === 123, "Migration preserves the sim and its timestamp.");
assert(fromV1.notifications.items.length === 1, "Migration preserves the notification inbox.");

// --- v2 roster ----------------------------------------------------------------
const v2 = {
  version: 2,
  activeId: mfgSim.companyType.id,
  companies: [
    { id: itSim.companyType.id, sim: itSim, lastActiveAt: 10 },
    { id: mfgSim.companyType.id, sim: mfgSim, lastActiveAt: 20 },
  ],
  notifications: { items: [], lastFired: {} },
};
const fromV2 = normalizeSave(v2);
assert(fromV2.companies.length === 2, "A v2 roster keeps all companies.");
assert(fromV2.activeId === mfgSim.companyType.id, "A v2 roster keeps the active company.");
assert(fromV2.companies.find((c) => c.id === itSim.companyType.id).lastActiveAt === 10, "Per-company timestamps are preserved (for catch-up).");

// A roster whose activeId is missing falls back to the first company (robustness).
const badActive = normalizeSave({ version: 2, activeId: "ghost-co", companies: [{ id: itSim.companyType.id, sim: itSim, lastActiveAt: 1 }] });
assert(badActive.activeId === itSim.companyType.id, "An unknown activeId falls back to the first company.");

// Records without a sim are dropped; a derived id is filled from the sim.
const sparse = normalizeSave({ version: 2, companies: [{ id: null, sim: itSim, lastActiveAt: 5 }, { lastActiveAt: 9 }] });
assert(sparse.companies.length === 1 && sparse.companies[0].id === itSim.companyType.id, "Sim-less records are dropped; missing ids are derived from the sim.");

// --- Internal Synergies (#25) -------------------------------------------------
// A solo founder gets no synergy; a portfolio of concurrently-run companies does.
const solo = createSimulation(COMPANY_TYPES[0]);
const soloFx = getInternalSynergyEffects(solo);
assert(soloFx.count === 1 && soloFx.taskValue === 1 && soloFx.expense === 1 && soloFx.leadInterval === 1, "A single company has no internal synergy.");

const portfolio = { ...createSimulation(COMPANY_TYPES[0]), portfolioCount: 3 };
const portfolioFx = getInternalSynergyEffects(portfolio);
assert(portfolioFx.count === 3, "portfolioCount drives the synergy count.");
assert(portfolioFx.taskValue > 1 && portfolioFx.expense < 1 && portfolioFx.leadInterval < 1 && portfolioFx.speedMultiplier > 1, "Running several companies shares clients/resources/staff (richer work, lower costs, more leads, faster).");
// Synergy flows into the company effect hub and grows with the roster.
assert(getCompanyEffects(portfolio).taskValue > getCompanyEffects(solo).taskValue, "Internal synergy raises getCompanyEffects for a portfolio vs a solo company.");
const bigger = getInternalSynergyEffects({ ...solo, portfolioCount: 5 });
assert(bigger.taskValue > portfolioFx.taskValue, "More concurrent companies → more synergy (until the cap).");
// Synergy is bounded (does not run away with a huge roster).
const huge = getInternalSynergyEffects({ ...solo, portfolioCount: 50 });
assert(huge.taskValue === bigger.taskValue, "Synergy is capped, not unbounded.");
// Metrics expose the internal-synergy view.
assert(getMetrics(portfolio).internalSynergy.count === 3, "Metrics expose the internal-synergy view.");

// --- Holding executives (#26) -------------------------------------------------
// Appointing an executive installs + fully enables the auto-managing Operations
// Manager, bypassing the manual-first Small-Business gate (an early-stage startup
// could not hire a manager itself, but an empire founder can appoint one).
const startup = createSimulation(COMPANY_TYPES[0]); // fresh — not yet Small Business
assert(!startup.manager?.hired, "A fresh company has no executive.");
const run = appointExecutive(startup);
assert(run.manager?.hired === true, "Appointing an executive installs the manager despite the Small-Business gate.");
assert(run.manager.autoHire && run.manager.autoRebalance && run.manager.autoAutomate, "An appointed executive runs all auto policies.");
assert(run.cash < startup.cash, "Appointing an executive costs the hire fee.");
assert(appointExecutive(run).manager === run.manager || appointExecutive(run).manager.hired, "Appointing twice is a no-op (already has an executive).");

console.log(`Multi-company persistence + internal synergies + executives validation passed (${checks} checks).`);
