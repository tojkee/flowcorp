// Centralized asset registry. The art pack in src/assets is the source of
// truth; rendering code resolves every sprite through this module instead of
// hardcoding file paths. Paths are collected with Vite's import.meta.glob so a
// new file dropped into a folder is picked up automatically.

const employeeFiles = import.meta.glob("./employees/**/*.png", { eager: true, query: "?url", import: "default" });
const departmentFiles = import.meta.glob("./departments/*.png", { eager: true, query: "?url", import: "default" });
const taskFiles = import.meta.glob("./tasks/*.png", { eager: true, query: "?url", import: "default" });
// Only the props the canvas actually draws are imported. A glob over the whole
// folder bundles every file whether or not it reaches the screen, and these are
// ~400 KB each — the office furniture is already painted into the room art, so
// the water cooler (the destination of the idle-walk animation) is the only
// standalone prop in use. Drawing another one = adding its import here.
import waterCoolerUrl from "./office/water_cooler.png?url";

// NOTE: src/assets/ui/ (HUD/action icons) and src/assets/automation/ (technology
// icons) are intentionally NOT imported: the interface renders those as emoji,
// so importing them shipped ~7 MB of images that never appeared on screen. The
// art stays on disk for when a real icon set replaces the emoji.
// Backgrounds ship as JPEG: they are full-bleed, alpha-free, and by far the
// heaviest art in the build (a 2.2 MB PNG each vs ~0.5 MB as JPEG), which is
// the difference between a game that loads on mobile data and one that does
// not. The hand-authored PNG masters stay in the folder as the source of truth —
// they are simply not the files that get bundled.
const backgroundFiles = import.meta.glob("./background/*.jpg", { eager: true, query: "?url", import: "default" });

export const EMPLOYEE_CHARACTERS = ["black_employee", "red_employee", "woman_employee"];

// Animation states each character provides as a standalone frame.
// idle_blink is listed before idle so suffix matching never mistakes one for the other.
export const EMPLOYEE_STATES = ["idle_blink", "idle", "sitting", "walk_up", "walk_down", "walk_left", "walk_right"];

// Department id -> room sprite stem (fallback / safety net).
//
// Every department now has a physical "<id>_room.png" file in
// src/assets/departments/, so getRoomStem() normally resolves via the dedicated
// lookup (step 1 below). Many of those room files are still TEMPORARY
// placeholders — copies of the six original IT-Company rooms (accounting_room,
// analysis_room, development_room, qa_room, sale_room, support_room) saved under
// the new department filenames — and are meant to be replaced with real art
// under the same names. See the "Department Room Assets" section in
// docs/ARCHITECTURE.md for which files are placeholders.
//
// This map remains for two reasons: (a) "sales" genuinely has no "sales_room"
// file — the art ships as "sale_room" — and (b) as a defensive fallback so a
// room never disappears if a sprite file is ever missing.
//
// Resolution order is handled by getRoomStem():
//   1. a dedicated "<id>_room" sprite if one exists (hyphens normalized to
//      underscores, e.g. quality-control -> quality_control_room),
//   2. an explicit fallback from this map,
//   3. DEFAULT_ROOM_STEM, so a department room never resolves to a missing path.
const DEPARTMENT_ROOM_FALLBACKS = {
  // IT Company — art ships "sale_room" (not "sales_room") for Sales.
  sales: "sale_room",
  // Manufacturing Company
  procurement: "analysis_room",
  production: "development_room",
  "quality-control": "qa_room",
  qualityControl: "qa_room",
  warehouse: "support_room",
  // Logistics Company
  dispatch: "analysis_room",
  operations: "development_room",
  tracking: "qa_room",
  // E-Commerce Company
  marketing: "sale_room",
  // Marketing Agency
  strategy: "analysis_room",
  copywriting: "development_room",
  design: "development_room",
  advertising: "sale_room",
  analytics: "analysis_room",
};

// Final safe fallback when a department has neither dedicated art nor an explicit
// mapping above. support_room is a neutral, generic office room.
const DEFAULT_ROOM_STEM = "support_room";

// Company id -> background sprite stem. The art pack ships "e-commerce" for the
// ecommerce-company id; other companies match their id directly. New tiered
// companies reuse an existing office background until dedicated art ships — drop
// a `<company-id>.jpg` into src/assets/background/ to override (no code change).
const BACKGROUND_ALIASES = {
  "ecommerce-company": "e-commerce",
  // Beginner tier
  "coffee-shop": "e-commerce",
  "digital-agency": "marketing-agency",
  // Intermediate tier
  "tech-startup": "it-company",
  "game-studio": "it-company",
  // Advanced tier
  "enterprise-corp": "it-company",
  "holding-company": "marketing-agency",
  "investment-fund": "it-company",
  "government-contractor": "manufacturing",
};

// The stem is the filename without its extension — sprites are PNG, backgrounds
// are JPEG, and callers should not have to know or care which.
function stemOf(path) {
  return path.split("/").pop().replace(/\.[a-z0-9]+$/i, "");
}

function keyByStem(files) {
  const out = {};
  for (const [path, url] of Object.entries(files)) {
    out[stemOf(path)] = url;
  }
  return out;
}

// Character filenames are inconsistent (e.g. red_employee uses an "employee_"
// prefix), so the state is resolved by matching the known suffix rather than a
// fixed prefix.
function buildEmployees() {
  const out = {};
  for (const character of EMPLOYEE_CHARACTERS) out[character] = {};

  for (const [path, url] of Object.entries(employeeFiles)) {
    const parts = path.split("/");
    const character = parts[parts.length - 2];
    const stem = stemOf(path);
    const state = EMPLOYEE_STATES.find((candidate) => stem.endsWith(candidate));
    if (character && state && out[character]) {
      out[character][state] = url;
    }
  }

  return out;
}

export const assetRegistry = {
  employees: buildEmployees(),
  departments: keyByStem(departmentFiles),
  tasks: keyByStem(taskFiles),
  office: { water_cooler: waterCoolerUrl },
  backgrounds: keyByStem(backgroundFiles),
};

// Resolve a department id to an existing room sprite stem. Prefers dedicated
// "<id>_room" art when present, then an explicit fallback, then a safe default —
// so every department always maps to a real loaded sprite.
//
// Department ids may contain hyphens (e.g. "quality-control"), but room sprite
// filenames use underscores ("quality_control_room.png"), so the id is
// normalized (hyphens -> underscores) before the dedicated lookup.
export function getRoomStem(departmentId) {
  const dedicated = `${departmentId.replace(/-/g, "_")}_room`;
  if (assetRegistry.departments[dedicated]) return dedicated;
  return DEPARTMENT_ROOM_FALLBACKS[departmentId] ?? DEFAULT_ROOM_STEM;
}

export function getDepartmentSprite(departmentId) {
  return assetRegistry.departments[getRoomStem(departmentId)] ?? null;
}

export function getTaskSprite(kind) {
  return assetRegistry.tasks[`${kind}_token`] ?? null;
}

export function getEmployeeSprite(characterType, state) {
  const set = assetRegistry.employees[characterType];
  if (!set) return null;
  return set[state] ?? set.idle ?? null;
}

export function getBackgroundSprite(companyId) {
  const stem = BACKGROUND_ALIASES[companyId] ?? companyId;
  return assetRegistry.backgrounds[stem] ?? null;
}

export function getOfficeSprite(name) {
  return assetRegistry.office[name] ?? null;
}
