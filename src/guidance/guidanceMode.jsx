import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Guidance Modes let the game support both casual and advanced playstyles without
// touching the simulation — they only control how much proactive coaching UI is
// shown. A new player learns with Full Guidance; a veteran can switch to Minimal
// or Hardcore. The choice is persisted, like the language setting.
//
//   Full     — the full beginner experience (everything on). Default.
//   Minimal  — only essential direction: current goal, main bottleneck, next unlock.
//   Hardcore — no proactive guidance at all; run the company yourself.
//
// IMPORTANT: even in Hardcore, emergency recovery tools stay reachable when the
// company is genuinely soft-locked, so the game can never become unwinnable.

export const GUIDANCE_MODES = [
  { id: "full" },
  { id: "minimal" },
  { id: "hardcore" },
];

const MODE_IDS = GUIDANCE_MODES.map((mode) => mode.id);
const DEFAULT_MODE = "full";
const STORAGE_KEY = "flowcorp.guidance.v1";

const GuidanceModeContext = createContext(null);

function readStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && MODE_IDS.includes(stored)) return stored;
  } catch {
    // localStorage may be unavailable (private mode / quota); fall back to default.
  }
  return DEFAULT_MODE;
}

// Pure mapping from the active mode (and whether the company is soft-locked) to
// per-element visibility flags. Kept pure so it is trivial to reason about and
// test. Recovery tools are the soft-lock exception: shown whenever Full, or in
// any mode while soft-locked, so recovery is never unreachable.
export function getGuidanceFlags(mode, { softLocked = false } = {}) {
  const full = mode === "full";
  const minimal = mode === "minimal";
  return {
    advisor: full, // CEO Advisor + its one-tap recommended action
    goal: full || minimal, // Goal System UI
    growthAnalysis: full, // Growth-block diagnostics + alternative-solution buttons
    bottleneck: full || minimal, // the "main bottleneck" status alert
    bottleneckDetail: full, // the queue/growth/util + revenue-impact explanation lines
    nextUnlock: full || minimal, // Next Unlock roadmap bar
    incomeExplanation: full, // Income Breakdown "why am I making money" tips
    recovery: full || softLocked, // recovery suggestions (loan / recovery contract)
  };
}

export function GuidanceModeProvider({ children }) {
  const [mode, setMode] = useState(readStoredMode);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignore persistence failures.
    }
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode, modes: GUIDANCE_MODES }), [mode]);

  return <GuidanceModeContext.Provider value={value}>{children}</GuidanceModeContext.Provider>;
}

export function useGuidanceMode() {
  const context = useContext(GuidanceModeContext);
  if (!context) throw new Error("useGuidanceMode must be used within a GuidanceModeProvider");
  return context;
}
