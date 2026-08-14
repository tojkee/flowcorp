// Showcase / recording mode — OPT-IN and OFF BY DEFAULT.
//
// Enables a fast, feature-rich run for capturing a gameplay trailer WITHOUT
// permanently changing the game. It is activated only by an explicit signal:
//   • URL flag   ?showcase=1   (fast demo: time-scale + starting-cash boost)
//   • URL flag   ?showcase=max (also unlocks every tier/company up front)
//   • localStorage "flowcorp.showcase" = "1" | "max"
//
// When no flag is present every export below is a no-op / identity, so normal
// play is byte-for-byte unchanged and saves are unaffected. Nothing here is
// persisted into the save: the boosted founder profile is only used to seed a
// new company while recording, and the time-scale lives in the render loop.

function readMode() {
  if (typeof window === "undefined") return "off";
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("showcase")) {
      const v = (params.get("showcase") || "1").toLowerCase();
      if (v === "max" || v === "unlock") return "max";
      if (v === "0" || v === "false" || v === "off") return "off";
      return "on";
    }
    const stored = window.localStorage.getItem("flowcorp.showcase");
    if (stored === "max") return "max";
    if (stored === "1" || stored === "true") return "on";
  } catch {
    // Inaccessible search/localStorage (e.g. SSR) → mode stays off.
  }
  return "off";
}

// Resolved once at module load — a recording session uses a single flag.
const MODE = readMode();

// True for any showcase mode (fast demo or full-unlock).
export function isShowcase() {
  return MODE !== "off";
}

// True only for ?showcase=max — also unlock every tier/company so advanced
// companies (Enterprise / Holding / Investment Fund / Government) and their
// late-game mechanics can be demoed directly.
export function showcaseUnlockAll() {
  return MODE === "max";
}

// Real-time multiplier applied to the render-loop dt so the whole living
// simulation — revenue, hiring effects, reports, CEO inbox, dynamic events,
// lifecycle stages, achievements — advances fast enough to fill a 4–5 min reel.
export const SHOWCASE_TIME_SCALE = 6;

// Extra starting cash so the office immediately fills with hires and automation
// (no early waiting on camera).
export const SHOWCASE_BONUS_CASH = 250_000;

// Seed a founder profile for a recording run. In the default fast demo the
// profile is untouched (so the player still SEES locked companies and earns the
// real graduation/unlock moments on camera). In ?showcase=max it is boosted to
// the business-empire tier so every company is unlocked.
export function showcaseFounderProfile(base) {
  if (!showcaseUnlockAll()) return base;
  return {
    ...(base ?? {}),
    prestige: Math.max(base?.prestige ?? 0, 600),
    founderExperience: Math.max(base?.founderExperience ?? 0, 400),
    companiesSold: Math.max(base?.companiesSold ?? 0, 3),
    legacyPoints: Math.max(base?.legacyPoints ?? 0, 30),
  };
}
