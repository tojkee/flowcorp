// Automation-era progression + achievements/celebration regression suite.
// Verifies the expanded AI-automation tree (#7/#8) and the celebration milestones
// (#5). Deterministic + dependency-free, like the other validate_* scripts.
// Run: npm run validate:automation

import { AUTOMATIONS, AUTOMATION_BY_ID, AUTOMATION_ERAS, STARTER_AUTOMATION_IDS } from "../src/data/automations.js";
import { ACHIEVEMENTS, ACHIEVEMENT_IDS } from "../src/data/achievements.js";
import { COMPANY_TYPES_BY_ID } from "../src/data/companyTypes.js";
import {
  createSimulation,
  evaluateAchievements,
  getAutomationEffects,
  getAutomationEra,
  getMetrics,
  tickSimulation,
} from "../src/core/simulation.js";
import en from "../src/locales/en.json" with { type: "json" };
import ru from "../src/locales/ru.json" with { type: "json" };

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}
function section(title) {
  console.log(`\n• ${title}`);
}
const IT = COMPANY_TYPES_BY_ID["it-company"];

// =========================================================================
// 1. Automation tree integrity (requires resolvable, acyclic, era-tagged)
// =========================================================================
section("1. Automation tree integrity");
{
  assert(STARTER_AUTOMATION_IDS.length >= 1, "there is at least one starter tool");
  const starter = AUTOMATION_BY_ID[STARTER_AUTOMATION_IDS[0]];
  assert(starter.cost === 0 && starter.requires.length === 0, "the starter tool is free with no prerequisites");

  for (const tool of AUTOMATIONS) {
    assert(AUTOMATION_ERAS.includes(tool.era), `${tool.id} has a valid era`);
    assert(tool.cost >= 0, `${tool.id} has a non-negative cost`);
    assert(!tool.requires.includes(tool.id), `${tool.id} does not require itself`);
    for (const req of tool.requires) {
      assert(AUTOMATION_BY_ID[req], `${tool.id} requires an existing tool (${req})`);
    }
  }

  // Every tool must be buildable from the starter set (no orphan/cyclic deps):
  // repeatedly "own" anything whose prerequisites are owned until fixpoint.
  const owned = new Set(STARTER_AUTOMATION_IDS);
  let changed = true;
  while (changed) {
    changed = false;
    for (const tool of AUTOMATIONS) {
      if (owned.has(tool.id)) continue;
      if (tool.requires.every((r) => owned.has(r))) {
        owned.add(tool.id);
        changed = true;
      }
    }
  }
  assert(owned.size === AUTOMATIONS.length, "every tool is reachable from the starter (no cycles / orphans)");
  assert(AUTOMATIONS.length >= 15, `the tree is a deep progression (${AUTOMATIONS.length} tools)`);
}

// =========================================================================
// 2. Era coverage + progression
// =========================================================================
section("2. Era coverage + progression");
{
  for (const era of AUTOMATION_ERAS) {
    assert(AUTOMATIONS.some((t) => t.era === era), `era '${era}' has at least one tool`);
  }
  assert(AUTOMATIONS.some((t) => t.era === "ai" && /^ai-/.test(t.id)), "the AI era includes AI tools");
  assert(AUTOMATIONS.some((t) => t.era === "advanced"), "there is an advanced (autonomous) era");

  const s = createSimulation(IT);
  assert(getAutomationEra(s) === null, "a starter-only company has no era yet");
  s.ownedAutomations = ["spreadsheet", "crm"];
  assert(getAutomationEra(s) === "early", "back-office tools read as the early era");
  s.ownedAutomations = ["spreadsheet", "crm", "task-tracker", "erp", "ai-support"];
  assert(getAutomationEra(s) === "ai", "owning an AI tool advances to the AI era");
  s.ownedAutomations = AUTOMATIONS.map((t) => t.id);
  assert(getAutomationEra(s) === "advanced", "owning autonomous tools reaches the advanced era");
}

// =========================================================================
// 3. Stacking effects are bounded (deep tree never goes runaway)
// =========================================================================
section("3. Effects are bounded");
{
  const s = createSimulation(IT);
  s.ownedAutomations = AUTOMATIONS.map((t) => t.id);
  const e = getAutomationEffects(s);
  assert(e.speedMultiplier <= 2.6 + 1e-9, "aggregate speed is capped");
  assert(e.valueMultiplier <= 2.4 + 1e-9, "aggregate value is capped");
  assert(e.accuracyBonus <= 0.4 + 1e-9, "aggregate accuracy is capped");
  assert(e.moveSpeedMultiplier <= 3.6 + 1e-9, "aggregate movement is capped");
  assert(e.aiTerminals === true, "AI tools turn on the AI office ambiance flag");
  // The original four-tool baseline is unchanged by the caps (caps sit above it).
  const base = createSimulation(IT);
  base.ownedAutomations = ["spreadsheet", "crm", "task-tracker", "accounting-system"];
  const be = getAutomationEffects(base);
  assert(be.speedMultiplier > 1.3 && be.speedMultiplier < 1.4, "legacy four-tool speed is unchanged by caps");
  assert(be.aiTerminals === false, "non-AI toolset does not trigger AI ambiance");
}

// =========================================================================
// 4. Localization coverage for every tool + era + achievement
// =========================================================================
section("4. Localization coverage (en + ru)");
{
  const get = (o, p) => p.split(".").reduce((a, k) => (a ? a[k] : undefined), o);
  for (const tool of AUTOMATIONS) {
    for (const [lang, o] of [["en", en], ["ru", ru]]) {
      for (const field of ["name", "desc", "office"]) {
        assert(get(o, `automationTools.${tool.id}.${field}`), `${lang} has automationTools.${tool.id}.${field}`);
      }
    }
  }
  for (const era of AUTOMATION_ERAS) {
    assert(get(en, `automationPanel.era.${era}`) && get(ru, `automationPanel.era.${era}`), `era label '${era}' localized`);
  }
  for (const id of ACHIEVEMENT_IDS) {
    for (const [lang, o] of [["en", en], ["ru", ru]]) {
      assert(get(o, `achievement.${id}.title`) && get(o, `achievement.${id}.desc`), `${lang} has achievement.${id}`);
    }
  }
  assert(en.achievement.unlocked && ru.achievement.unlocked, "the 'Achievement unlocked' label is localized");
}

// =========================================================================
// 5. Achievements fire once, record in order, and surface to the UI
// =========================================================================
section("5. Achievements + celebration");
{
  assert(ACHIEVEMENTS.length === ACHIEVEMENT_IDS.length && ACHIEVEMENT_IDS.length >= 10, "the achievement set is populated");

  let s = createSimulation(IT);
  assert(s.achievements.length === 0 && s.lastAchievement === null, "a fresh company has no achievements");

  // Make first-profit + first-automation true, then tick once.
  s.revenue = 6000;
  s.expenses = 1000;
  s.ownedAutomations = ["spreadsheet", "crm"];
  s = tickSimulation(s, 0.1);
  assert(s.achievements.includes("first-profit"), "turning a profit unlocks first-profit");
  assert(s.achievements.includes("first-automation"), "buying a tool unlocks first-automation");
  assert(s.lastAchievement && s.achievements.includes(s.lastAchievement.id), "lastAchievement points at a real unlock (drives the celebration)");

  // Idempotent: ticking again with no new milestone does not re-fire.
  const before = s.lastAchievement.id;
  const countBefore = s.achievements.length;
  s = tickSimulation(s, 0.1);
  assert(s.achievements.length === countBefore, "achievements are not duplicated on later ticks");
  assert(s.lastAchievement.id === before, "lastAchievement is not re-stamped without a new unlock");

  // Stored order follows the canonical data order (a growth story).
  const order = s.achievements.map((id) => ACHIEVEMENT_IDS.indexOf(id));
  assert(order.every((v, i) => i === 0 || v > order[i - 1]), "stored achievements keep canonical order");

  // Metrics surface the achievement state for the overlay.
  const metrics = getMetrics(s);
  assert(Array.isArray(metrics.achievements) && metrics.lastAchievement, "metrics expose achievements + lastAchievement");

  // evaluateAchievements only returns known ids.
  s.ownedAutomations = AUTOMATIONS.map((t) => t.id);
  assert(evaluateAchievements(s).every((id) => ACHIEVEMENT_IDS.includes(id)), "evaluateAchievements only yields defined ids");
}

console.log(`\nAutomation + achievements validation passed (${checks} checks).`);
