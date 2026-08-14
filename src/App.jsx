import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMPANY_TYPES } from "./data/companyTypes.js";
import {
  TIER_ORDER,
  companyHasCapability,
  getCompanyDifficulty,
  getCompanyTier,
  getCompanyUnlockProgress,
  isCompanyUnlocked,
} from "./data/careerTiers.js";
import { CULTURES } from "./data/culture.js";
import { CEO_CHOICE_BY_ID } from "./data/ceoSituations.js";
import {
  acceptOffer,
  appointExecutive,
  buyAutomation,
  chooseAcquisitionPath,
  chooseCeoDecision,
  chooseCulture,
  chooseDestiny,
  chooseStrategicDecision,
  createSimulation,
  dismissCompanyReport,
  dismissLegacyEvent,
  getMetrics,
  giveRaise,
  graduateCompany,
  hireForDepartment,
  hireManager,
  hireSpecialist,
  negotiateOffer,
  raiseVentureRound,
  rebalanceEmployees,
  rejectOffer,
  STARTING_CASH,
  takeFounderLoan,
  takeRecoveryContract,
  tickSimulation,
  toggleIntakeThrottle,
  toggleManagerPolicy,
  upgradeFounderSkill,
} from "./core/simulation.js";
import { FOUNDER_SKILLS, FOUNDER_TRAITS, MAX_SKILL_LEVEL } from "./data/founderTraits.js";
import { isShowcase, showcaseUnlockAll, showcaseFounderProfile, SHOWCASE_BONUS_CASH, SHOWCASE_TIME_SCALE } from "./showcase.js";
import { ACHIEVEMENT_BY_ID } from "./data/achievements.js";
import { OfficeCanvas } from "./rendering/OfficeCanvas.jsx";
import { useI18n } from "./i18n/index.jsx";
import { getGuidanceFlags, GUIDANCE_MODES, useGuidanceMode } from "./guidance/guidanceMode.jsx";
import { clearGame, EMPTY_NOTIFICATIONS, loadRoster, saveRoster } from "./core/persistence.js";
import { MAX_OFFLINE_SECONDS, simulateOffline } from "./core/offline.js";
import { evaluateNotifications, INBOX_LIMIT, isSystemSeverity } from "./core/notifications.js";
import { getLegacyBonusEffects, getPrestigeLevel, prepareFounderProfile } from "./core/founderLegacy.js";
import { captureFeedbackSnapshot, getActionFeedback, getProgressFeedback } from "./core/actionFeedback.js";

const AUTOSAVE_MS = 5000;

function getNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

// First-run onboarding is shown once per player and remembered in localStorage
// (wrapped in try/catch so private mode / quota failures degrade gracefully).
const ONBOARDING_KEY = "flowcorp.onboarded.v1";
const MINI_CHAPTER_KEY = "flowcorp.firstRunChapter.dismissed.v1";

function isOnboardingPending() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(ONBOARDING_KEY) !== "1";
  } catch {
    return false;
  }
}

function markOnboardingSeen() {
  try {
    localStorage?.setItem(ONBOARDING_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

function isMiniChapterDismissed() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MINI_CHAPTER_KEY) === "1";
  } catch {
    return false;
  }
}

function markMiniChapterDismissed() {
  try {
    localStorage?.setItem(MINI_CHAPTER_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

// Load the saved roster and reconcile offline progress once, synchronously, so
// the player resumes straight into their active company with no flash of the
// start screen. Background (paused) companies keep their stored timestamps and
// are caught up only when switched to (see switchCompany).
const FRESH_BOOT = { company: null, sim: null, notifications: EMPTY_NOTIFICATIONS, summary: null, background: [] };

function bootFromSave() {
  // The whole consume-save path is guarded: `normalizeSave`/`loadRoster` already
  // reject invalid JSON and malformed shapes, but a structurally-valid-but-broken
  // `sim` (e.g. a partial/old-schema record) would otherwise throw inside
  // `simulateOffline`/`getMetrics` during the initial render and blank-screen the
  // app on every reload. On any failure we fall back to a fresh start (company
  // select) so a corrupted save degrades gracefully instead of crashing.
  try {
    const roster = loadRoster();
    if (!roster) return FRESH_BOOT;
    const activeRecord = roster.companies.find((c) => c.id === roster.activeId) ?? roster.companies[0];
    if (!activeRecord?.sim?.departments) return FRESH_BOOT;
    const { sim, summary } = simulateOffline(activeRecord.sim, activeRecord.lastActiveAt, Date.now());
    const notifications = collectNotifications(roster.notifications ?? EMPTY_NOTIFICATIONS, sim, summary);
    const background = roster.companies
      .filter((c) => c.id !== activeRecord.id && c?.sim?.departments)
      .map((c) => ({ id: c.id, sim: c.sim, lastActiveAt: c.lastActiveAt }));
    return { company: sim.companyType, sim, notifications, summary, background };
  } catch {
    return FRESH_BOOT;
  }
}

function collectNotifications(current, sim, offlineSummary = null, now = Date.now()) {
  const base = current ?? EMPTY_NOTIFICATIONS;
  const { newItems, lastFired, activeKeys } = evaluateNotifications(
    sim,
    getMetrics(sim),
    now,
    base.lastFired,
    base.activeKeys,
    { offlineSummary },
  );
  return {
    items: newItems.length ? [...newItems, ...(base.items ?? [])].slice(0, INBOX_LIMIT) : (base.items ?? []),
    lastFired,
    activeKeys,
  };
}

export function App() {
  const { t } = useI18n();
  const [boot] = useState(bootFromSave);
  const [selectedCompany, setSelectedCompany] = useState(boot.company);
  const [simulation, setSimulation] = useState(boot.sim);
  const [founderProfile, setFounderProfile] = useState(boot.sim?.founderProfile ?? null);
  const [notifications, setNotifications] = useState(boot.notifications);
  const [awaySummary, setAwaySummary] = useState(boot.summary);
  const [permission, setPermission] = useState(getNotificationPermission);
  // Active Multi-Company Management (#24): the founder's other (paused) companies.
  // The active company is `simulation`; these advance via offline catch-up when
  // switched to. Empty for a single-company founder (the common case).
  const [background, setBackground] = useState(boot.background ?? []);

  // Latest values for use inside event listeners without re-subscribing.
  const simRef = useRef(simulation);
  const notifRef = useRef(notifications);
  const permRef = useRef(permission);
  const tRef = useRef(t);
  const backgroundRef = useRef(background);
  const lastHiddenAtRef = useRef(null);
  simRef.current = simulation;
  notifRef.current = notifications;
  permRef.current = permission;
  tRef.current = t;
  backgroundRef.current = background;

  const hasGame = Boolean(simulation);

  // Persist the whole roster: the active company (clock = now) plus the paused
  // background companies, and the shared inbox. A single-company founder saves a
  // one-company roster — identical in effect to the original single save.
  const persistRoster = useCallback(() => {
    if (!simRef.current) return;
    saveRoster({
      activeId: simRef.current.companyType.id,
      companies: [
        { id: simRef.current.companyType.id, sim: simRef.current, lastActiveAt: Date.now() },
        ...backgroundRef.current,
      ],
      notifications: notifRef.current,
    });
  }, []);

  // Generate notifications from the current state, dedupe via cooldowns, append
  // to the inbox, and optionally raise a browser notification when backgrounded.
  const runNotificationCheck = useCallback((sim, offlineSummary = null) => {
    if (!sim) return;
    const now = Date.now();
    const beforeIds = new Set(notifRef.current.items.map((item) => item.id));
    const next = collectNotifications(notifRef.current, sim, offlineSummary, now);
    const newItems = next.items.filter((item) => !beforeIds.has(item.id));
    notifRef.current = next;
    setNotifications(next);

    if (newItems.length && permRef.current === "granted" && typeof document !== "undefined" && document.hidden) {
      fireBrowserNotifications(newItems, tRef.current);
    }
  }, []);

  // Save + background reconciliation lifecycle. Runs whenever a game is active.
  useEffect(() => {
    if (!hasGame) return undefined;

    const save = () => persistRoster();

    const reconcile = () => {
      const hiddenAt = lastHiddenAtRef.current;
      lastHiddenAtRef.current = null;
      if (!hiddenAt || !simRef.current) return;
      const { sim, summary } = simulateOffline(simRef.current, hiddenAt, Date.now());
      if (sim !== simRef.current) {
        simRef.current = sim;
        setSimulation(sim);
      }
      if (summary) setAwaySummary(summary);
      runNotificationCheck(sim, summary);
    };

    const onVisibility = () => {
      if (document.hidden) {
        lastHiddenAtRef.current = Date.now();
        save();
      } else {
        reconcile();
      }
    };

    const interval = setInterval(() => {
      // While hidden the live loop (rAF) is paused, so the sim is frozen. Skip
      // saving so lastActiveAt keeps the moment we were hidden — that gap is what
      // offline catch-up replays on resume.
      if (document.hidden) return;
      save();
      runNotificationCheck(simRef.current);
    }, AUTOSAVE_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    window.addEventListener("blur", save);
    window.addEventListener("focus", reconcile);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("blur", save);
      window.removeEventListener("focus", reconcile);
      // Note: no save() here — re-stamping lastActiveAt on a transient unmount
      // (e.g. React StrictMode remount) would erase the offline gap. Saving is
      // handled by the interval, visibilitychange, blur and pagehide.
    };
  }, [hasGame, runNotificationCheck]);

  const startCompany = useCallback((companyType) => {
    // Showcase mode seeds a boosted profile (?showcase=max) and extra starting
    // cash so a recording run is fast and feature-rich; no-op in normal play.
    const sim = createSimulation(companyType, showcaseFounderProfile(founderProfile));
    if (isShowcase()) sim.cash += SHOWCASE_BONUS_CASH;
    simRef.current = sim;
    backgroundRef.current = [];
    notifRef.current = EMPTY_NOTIFICATIONS;
    setSelectedCompany(companyType);
    setSimulation(sim);
    setFounderProfile(sim.founderProfile);
    setNotifications(EMPTY_NOTIFICATIONS);
    setBackground([]);
    setAwaySummary(null);
    saveRoster({ activeId: sim.companyType.id, companies: [{ id: sim.companyType.id, sim, lastActiveAt: Date.now() }], notifications: EMPTY_NOTIFICATIONS });
  }, [founderProfile]);

  const restart = useCallback(() => {
    clearGame();
    simRef.current = null;
    backgroundRef.current = [];
    setSelectedCompany(null);
    setSimulation(null);
    setFounderProfile(null);
    setNotifications(EMPTY_NOTIFICATIONS);
    setBackground([]);
    setAwaySummary(null);
  }, []);

  // Switch the live company (#24). Snapshot the current active into the background,
  // catch the target up for the real time it was paused (reusing offline replay),
  // carry the shared founder profile forward, and make it active.
  const switchCompany = useCallback((targetId) => {
    const current = simRef.current;
    if (!current || current.companyType.id === targetId) return;
    const target = backgroundRef.current.find((c) => c.id === targetId);
    if (!target) return;
    const now = Date.now();
    const sharedProfile = prepareFounderProfile(current.founderProfile);
    const leaving = { id: current.companyType.id, sim: current, lastActiveAt: now };
    const { sim: caught } = simulateOffline(target.sim, target.lastActiveAt, now);
    const newBackground = [leaving, ...backgroundRef.current.filter((c) => c.id !== targetId)];
    // Stamp the live roster size so internal synergies (#25) reflect the portfolio.
    const activated = { ...caught, founderProfile: sharedProfile, portfolioCount: 1 + newBackground.length };

    simRef.current = activated;
    backgroundRef.current = newBackground;
    setSimulation(activated);
    setBackground(newBackground);
    setSelectedCompany(activated.companyType);
    setFounderProfile(sharedProfile);
    setAwaySummary(null);
    persistRoster();
  }, [persistRoster]);

  // Found an additional company that runs alongside the others (#24, gated to the
  // prestige-5 "business empire" tier). The current company is paused into the
  // background; the new one starts live, inheriting the shared founder profile.
  const foundAdditionalCompany = useCallback((companyType) => {
    const current = simRef.current;
    if (!current) return;
    const now = Date.now();
    const sharedProfile = prepareFounderProfile(current.founderProfile);
    const baseSim = createSimulation(companyType, sharedProfile);
    const leaving = { id: current.companyType.id, sim: current, lastActiveAt: now };
    const newBackground = [leaving, ...backgroundRef.current.filter((c) => c.id !== companyType.id && c.id !== baseSim.companyType.id)];
    const sim = { ...baseSim, portfolioCount: 1 + newBackground.length };

    simRef.current = sim;
    backgroundRef.current = newBackground;
    notifRef.current = EMPTY_NOTIFICATIONS;
    setSimulation(sim);
    setBackground(newBackground);
    setSelectedCompany(companyType);
    setFounderProfile(sim.founderProfile);
    setNotifications(EMPTY_NOTIFICATIONS);
    setAwaySummary(null);
    persistRoster();
  }, [persistRoster]);

  // Capital allocation (Holding Company, #26): move cash from the active company
  // into a subsidiary — fund a struggling one from a cash-rich one. Transfers a
  // bounded quarter of the active company's cash.
  const allocateCapital = useCallback((targetId) => {
    const current = simRef.current;
    if (!current) return;
    const target = backgroundRef.current.find((c) => c.id === targetId);
    if (!target) return;
    const amount = Math.max(0, Math.round(current.cash * 0.25));
    if (amount <= 0) return;
    const updatedActive = { ...current, cash: current.cash - amount };
    const newBackground = backgroundRef.current.map((c) =>
      c.id === targetId ? { ...c, sim: { ...c.sim, cash: c.sim.cash + amount } } : c,
    );
    simRef.current = updatedActive;
    backgroundRef.current = newBackground;
    setSimulation(updatedActive);
    setBackground(newBackground);
    persistRoster();
  }, [persistRoster]);

  // Appoint an executive (Holding Company, #26): install the auto-managing
  // Operations Manager on a company — the active one, or a paused subsidiary so
  // it runs itself (and keeps performing during catch-up) while you focus elsewhere.
  const appointExec = useCallback((targetId) => {
    const current = simRef.current;
    if (!current) return;
    if (current.companyType.id === targetId) {
      const updated = appointExecutive(current);
      simRef.current = updated;
      setSimulation(updated);
      persistRoster();
      return;
    }
    const newBackground = backgroundRef.current.map((c) =>
      c.id === targetId ? { ...c, sim: appointExecutive(c.sim) } : c,
    );
    backgroundRef.current = newBackground;
    setBackground(newBackground);
    persistRoster();
  }, [persistRoster]);

  const enableNotifications = useCallback(() => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((result) => setPermission(result));
  }, []);

  // The Inbox is now a tab; mark items read when the player views it.
  const markInboxRead = useCallback(() => {
    setNotifications((prev) =>
      prev.items.some((item) => !item.read)
        ? { ...prev, items: prev.items.map((item) => ({ ...item, read: true })) }
        : prev,
    );
  }, []);

  const onAcceptOffer = useCallback(() => setSimulation((state) => acceptOffer(state)), []);
  const onRejectOffer = useCallback(() => setSimulation((state) => rejectOffer(state)), []);
  const onNegotiateOffer = useCallback(() => setSimulation((state) => negotiateOffer(state)), []);
  const onChooseDestiny = useCallback((pathId) => setSimulation((state) => chooseDestiny(state, pathId)), []);
  const onGraduate = useCallback(() => setSimulation((state) => graduateCompany(state)), []);
  const onStrategicDecision = useCallback((choiceId) => setSimulation((state) => chooseStrategicDecision(state, choiceId)), []);
  const onCeoDecision = useCallback((choiceId) => setSimulation((state) => chooseCeoDecision(state, choiceId)), []);
  const onAcquisitionChoice = useCallback((choiceId) => setSimulation((state) => chooseAcquisitionPath(state, choiceId)), []);
  const onDismissLegacy = useCallback(() => setSimulation((state) => dismissLegacyEvent(state)), []);
  const onStartNextCompany = useCallback(() => {
    const profile = prepareFounderProfile(simRef.current?.founderProfile);
    // If the founder runs other companies concurrently (#24), leaving this one
    // activates a remaining one rather than wiping the roster; otherwise this is
    // the serial-entrepreneur path back to company select.
    const remaining = backgroundRef.current;
    if (remaining.length > 0) {
      const now = Date.now();
      const [next, ...rest] = remaining;
      const { sim: caught } = simulateOffline(next.sim, next.lastActiveAt, now);
      const activated = { ...caught, founderProfile: profile, portfolioCount: 1 + rest.length };
      simRef.current = activated;
      backgroundRef.current = rest;
      notifRef.current = EMPTY_NOTIFICATIONS;
      setSimulation(activated);
      setBackground(rest);
      setSelectedCompany(activated.companyType);
      setFounderProfile(profile);
      setNotifications(EMPTY_NOTIFICATIONS);
      setAwaySummary(null);
      persistRoster();
      return;
    }
    clearGame();
    simRef.current = null;
    backgroundRef.current = [];
    setFounderProfile(profile);
    setSelectedCompany(null);
    setSimulation(null);
    setNotifications(EMPTY_NOTIFICATIONS);
    setBackground([]);
    setAwaySummary(null);
  }, [persistRoster]);

  if (!selectedCompany || !simulation) {
    return <CompanySelect founderProfile={founderProfile} onSelect={startCompany} />;
  }

  const unreadCount = notifications.items.filter((item) => !item.read).length;

  // Active Multi-Company Management (#24) + Holding Company (#26): the roster +
  // the prestige-5 gate. The holding dashboard only appears at the "business
  // empire" tier. Each company exposes its cash/revenue for the dashboard.
  const rosterIds = [simulation.companyType.id, ...background.map((c) => c.id)];
  const rosterCompanies = [
    { id: simulation.companyType.id, cash: simulation.cash, revenue: simulation.revenue, active: true, executive: Boolean(simulation.manager?.hired) },
    ...background.map((c) => ({ id: c.id, cash: c.sim.cash, revenue: c.sim.revenue, active: false, executive: Boolean(c.sim.manager?.hired) })),
  ];
  const companyRoster = {
    activeId: simulation.companyType.id,
    companyIds: rosterIds,
    companies: rosterCompanies,
    totalCash: rosterCompanies.reduce((sum, c) => sum + c.cash, 0),
    totalRevenue: rosterCompanies.reduce((sum, c) => sum + c.revenue, 0),
    // Active multi-company management is the Advanced-tier (Holding Company /
    // Investment Fund) capstone: it needs the prestige-5 "business empire" tier
    // AND an active company whose tier grants `multiCompany`. A founder running a
    // Beginner/Intermediate company never sees the holding dashboard.
    canManageMultiple:
      getPrestigeLevel(founderProfile ?? simulation.founderProfile) >= 5 &&
      companyHasCapability(simulation.companyType, "multiCompany"),
    // Subsidiaries can only be founded from company types the founder has unlocked.
    availableTypeIds: COMPANY_TYPES.filter(
      (ct) => !rosterIds.includes(ct.id) && isCompanyUnlocked(ct, founderProfile ?? simulation.founderProfile),
    ).map((ct) => ct.id),
  };
  const onFoundCompany = (typeId) => {
    const companyType = COMPANY_TYPES.find((ct) => ct.id === typeId);
    if (companyType) foundAdditionalCompany(companyType);
  };

  return (
    <>
      {isShowcase() ? <div className="showcase-badge" aria-hidden="true">SHOWCASE ·{SHOWCASE_TIME_SCALE}×</div> : null}
      <GameScreen
        state={simulation}
        notifications={notifications}
        unreadCount={unreadCount}
        permission={permission}
        roster={companyRoster}
        onSwitchCompany={switchCompany}
        onFoundCompany={onFoundCompany}
        onAllocateCapital={allocateCapital}
        onAppointExecutive={appointExec}
        onEnableNotifications={enableNotifications}
        onInboxViewed={markInboxRead}
        onDismissCompanyReport={() => setSimulation((state) => dismissCompanyReport(state))}
        onHire={(departmentId) => setSimulation((state) => hireForDepartment(state, departmentId))}
        onAutomate={(automationId) => setSimulation((state) => buyAutomation(state, automationId))}
        onRebalance={() => setSimulation((state) => rebalanceEmployees(state))}
        onChooseDestiny={onChooseDestiny}
        onGraduate={onGraduate}
        onStrategicDecision={onStrategicDecision}
        onCeoDecision={onCeoDecision}
        onHireManager={() => setSimulation((state) => hireManager(state))}
        onToggleManagerPolicy={(policy) => setSimulation((state) => toggleManagerPolicy(state, policy))}
        onChooseCulture={(id) => setSimulation((state) => chooseCulture(state, id))}
        onHireSpecialist={(id) => setSimulation((state) => hireSpecialist(state, id))}
        onGiveRaise={() => setSimulation((state) => giveRaise(state))}
        onUpgradeSkill={(id) => setSimulation((state) => upgradeFounderSkill(state, id))}
        onRaiseVenture={() => setSimulation((state) => raiseVentureRound(state))}
        onTakeLoan={() => setSimulation((state) => takeFounderLoan(state))}
        onRecoveryContract={() => setSimulation((state) => takeRecoveryContract(state))}
        onToggleIntake={() => setSimulation((state) => toggleIntakeThrottle(state))}
        onRestart={restart}
        onTick={setSimulation}
      />
      {awaySummary ? <AwaySummary summary={awaySummary} onDismiss={() => setAwaySummary(null)} /> : null}
      <OfferModal
        offer={simulation.outcome || simulation.legacyEvent ? null : simulation.activeOffer}
        onAccept={onAcceptOffer}
        onReject={onRejectOffer}
        onNegotiate={onNegotiateOffer}
      />
      {simulation.legacyEvent ? (
        <LegacyEventOverlay
          event={simulation.legacyEvent}
          founderProfile={simulation.founderProfile}
          onChoice={onAcquisitionChoice}
          onContinue={onDismissLegacy}
          onStartNewCompany={onStartNextCompany}
        />
      ) : null}
    </>
  );
}

function fireBrowserNotifications(items, t) {
  for (const item of items) {
    if (!isSystemSeverity(item.severity)) continue;
    try {
      new Notification(t(item.titleKey, notificationVars(t, item)), { body: t(item.bodyKey, notificationVars(t, item)), tag: item.key });
    } catch {
      // Notification construction can throw on some platforms; ignore.
    }
  }
}

const REQ_ICONS = { ventures: "🏆", prestige: "⭐" };

// Compact, visual company card. Unlocked → icon + name + tier + difficulty + PLAY.
// Locked → icon + name + 🔒 + a progress bar / % / binding requirement chip + VIEW
// (which opens the detail sheet). No long descriptions on the card itself.
function CompanyCard({ company, profile, onSelect, onView }) {
  const { t } = useI18n();
  const tierId = getCompanyTier(company);
  const diff = getCompanyDifficulty(company);
  const name = t(`company.${company.id}.name`);
  const stars = "⭐".repeat(diff);
  const meta = (
    <span className="cc-meta">
      <span className={`tier-badge tier-${tierId}`}>{t(`tier.${tierId}.name`)}</span>
      <span className="cc-diff" aria-label={t("careerTier.difficulty", { n: diff })}>{stars}</span>
    </span>
  );

  if (isCompanyUnlocked(company, profile) || showcaseUnlockAll()) {
    return (
      <button className="company-card" onClick={() => onSelect(company)}>
        <span className="cc-icon" aria-hidden="true">{company.icon}</span>
        <span className="cc-body">
          <strong className="cc-name">{name}</strong>
          {meta}
        </span>
        <span className="cc-cta">{t("careerTier.play")}</span>
      </button>
    );
  }

  const progress = getCompanyUnlockProgress(company, profile);
  const binding = progress.parts.reduce(
    (best, p) => (best && best.target && best.current / best.target <= p.current / p.target ? best : p),
    progress.parts[0] ?? null,
  );
  return (
    <div className="company-card is-locked">
      <span className="cc-icon" aria-hidden="true">{company.icon}</span>
      <span className="cc-body">
        <strong className="cc-name">🔒 {name}</strong>
        {meta}
        <span className="cc-bar" aria-hidden="true"><i style={{ width: `${progress.pct}%` }} /></span>
        <span className="cc-req">
          <span className="cc-pct">{progress.pct}%</span>
          {binding ? <span className="cc-chip">{REQ_ICONS[binding.id] ?? "•"} {binding.current}/{binding.target}</span> : null}
        </span>
      </span>
      <button className="cc-cta ghost" onClick={() => onView(company)}>{t("careerTier.view")}</button>
    </div>
  );
}

// Bottom-sheet detail panel for a locked company: larger artwork, a short
// description, the unlock requirements (as compact rows, no prose), a reward
// preview (what the tier unlocks), and the progress bar.
function LockedCompanyDetail({ company, profile, onClose }) {
  const { t } = useI18n();
  const tierId = getCompanyTier(company);
  const diff = getCompanyDifficulty(company);
  const progress = getCompanyUnlockProgress(company, profile);
  return (
    <div className="automation-overlay" role="dialog" aria-label={t(`company.${company.id}.name`)} onClick={onClose}>
      <div className="automation-sheet company-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="automation-head">
          <strong>{t("careerTier.locked")}</strong>
          <button className="icon-button" onClick={onClose} aria-label={t("careerTier.detailClose")}>✕</button>
        </header>
        <div className="cd-hero">
          <span className="cd-icon" aria-hidden="true">{company.icon}</span>
          <div className="cd-hero-text">
            <strong>{t(`company.${company.id}.name`)}</strong>
            <span className="cc-meta">
              <span className={`tier-badge tier-${tierId}`}>{t(`tier.${tierId}.name`)}</span>
              <span className="cc-diff">{"⭐".repeat(diff)}</span>
            </span>
          </div>
        </div>
        <p className="cd-desc">{t(`company.${company.id}.tagline`)}</p>
        <section className="cd-section">
          <h5>{t("careerTier.requirements")}</h5>
          <ul className="cd-reqs">
            {progress.parts.map((p) => (
              <li key={p.id}>
                <span>{REQ_ICONS[p.id] ?? "•"} {t(`careerTier.req.${p.id}`)}</span>
                <b className={p.current >= p.target ? "good" : ""}>{p.current} / {p.target}</b>
              </li>
            ))}
          </ul>
          <div className="cc-bar" aria-hidden="true"><i style={{ width: `${progress.pct}%` }} /></div>
        </section>
        <section className="cd-section">
          <h5>{t("careerTier.unlocks")}</h5>
          <p className="cd-reward">{t(`careerTier.reward.${tierId}`)}</p>
        </section>
        <button className="offer-accept" onClick={onClose}>{t("careerTier.detailClose")}</button>
      </div>
    </div>
  );
}

function CompanySelect({ founderProfile, onSelect }) {
  const { t } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const [detail, setDetail] = useState(null);
  const profile = founderProfile ? prepareFounderProfile(founderProfile) : null;

  return (
    <main className="app-shell setup-screen">
      <section className="brand-panel">
        <div className="brand-row">
          <p className="eyebrow">{t("app.eyebrow")}</p>
          <button className="icon-button" onClick={() => setShowSettings(true)}>
            {t("hud.settings")}
          </button>
        </div>
        <h1>{t("app.title")}</h1>
      </section>

      {profile && profile.companiesFounded > 0 ? (
        <FounderSummary profile={profile} compact />
      ) : null}

      {TIER_ORDER.map((tierId) => {
        const tierCompanies = COMPANY_TYPES.filter((company) => getCompanyTier(company) === tierId);
        if (tierCompanies.length === 0) return null;
        return (
          <section className="company-tier-group" key={tierId} aria-label={t(`tier.${tierId}.name`)}>
            <header className="company-tier-head">
              <span className={`tier-badge tier-${tierId}`}>{t(`tier.${tierId}.name`)}</span>
            </header>
            <div className="company-list">
              {tierCompanies.map((company) => (
                <CompanyCard key={company.id} company={company} profile={profile} onSelect={onSelect} onView={setDetail} />
              ))}
            </div>
          </section>
        );
      })}

      {detail ? <LockedCompanyDetail company={detail} profile={profile} onClose={() => setDetail(null)} /> : null}
      {showSettings ? <SettingsPanel onClose={() => setShowSettings(false)} /> : null}
    </main>
  );
}

// The five focused screens reachable from the bottom navigation. Order matters:
// it defines left↔right swipe order and the nav button order.
const TABS = ["company", "inbox", "growth", "finance", "founder"];
const TAB_ICONS = { company: "🏢", inbox: "📬", growth: "📈", finance: "💰", founder: "👤" };

function GameScreen({ state, notifications, unreadCount, permission, roster, onSwitchCompany, onFoundCompany, onAllocateCapital, onAppointExecutive, onEnableNotifications, onInboxViewed, onDismissCompanyReport, onHire, onAutomate, onRebalance, onChooseDestiny, onGraduate, onStrategicDecision, onCeoDecision, onHireManager, onToggleManagerPolicy, onChooseCulture, onHireSpecialist, onGiveRaise, onUpgradeSkill, onRaiseVenture, onTakeLoan, onRecoveryContract, onToggleIntake, onRestart, onTick }) {
  const { t, language } = useI18n();
  const { mode: guidanceMode } = useGuidanceMode();
  const lastFrameRef = useRef(performance.now());
  const metrics = useMemo(() => getMetrics(state), [state]);
  // Guidance Modes: which coaching UI is shown. The soft-lock exception keeps
  // recovery tools reachable in every mode so the game is never unwinnable.
  const guidance = useMemo(
    () => getGuidanceFlags(guidanceMode, { softLocked: Boolean(metrics.growth?.recovery?.softlock) }),
    [guidanceMode, metrics.growth?.recovery?.softlock],
  );
  const [tab, setTab] = useState("company");
  const [showAutomation, setShowAutomation] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(isOnboardingPending);
  const [showMiniChapter, setShowMiniChapter] = useState(() => !isMiniChapterDismissed());
  const [actionFeedback, setActionFeedback] = useState(null);
  const feedbackTimerRef = useRef(null);
  const feedbackVisibleRef = useRef(false);
  const deferredFeedbackRef = useRef(null);
  const feedbackSequenceRef = useRef(0);
  const previousFeedbackSnapshotRef = useRef(captureFeedbackSnapshot(state, metrics));
  const pendingFeedbackActionRef = useRef(null);
  const lastPaymentFeedbackAtRef = useRef(-Infinity);

  const showActionFeedback = useCallback((item) => {
    if (!item) return;
    window.clearTimeout(feedbackTimerRef.current);
    feedbackVisibleRef.current = true;
    feedbackSequenceRef.current += 1;
    setActionFeedback({ ...item, sequence: feedbackSequenceRef.current });
    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackVisibleRef.current = false;
      setActionFeedback(null);
    }, 3400);
  }, []);

  const runFeedbackAction = useCallback(
    (action, run) => {
      pendingFeedbackActionRef.current = {
        action,
        before: captureFeedbackSnapshot(state, metrics),
      };
      run();
    },
    [state, metrics],
  );

  const feedbackHire = useCallback(
    (departmentId) => runFeedbackAction({ type: "hire", departmentId }, () => onHire(departmentId)),
    [onHire, runFeedbackAction],
  );
  const feedbackAutomate = useCallback(
    (automationId) => runFeedbackAction({ type: "automation", automationId }, () => onAutomate(automationId)),
    [onAutomate, runFeedbackAction],
  );
  const feedbackRebalance = useCallback(
    () => runFeedbackAction({ type: "rebalance", departmentId: metrics.bottleneck?.id }, onRebalance),
    [metrics.bottleneck?.id, onRebalance, runFeedbackAction],
  );
  const feedbackLoan = useCallback(
    () => runFeedbackAction({ type: "loan" }, onTakeLoan),
    [onTakeLoan, runFeedbackAction],
  );
  const feedbackRecoveryContract = useCallback(
    () => runFeedbackAction({ type: "recoveryContract" }, onRecoveryContract),
    [onRecoveryContract, runFeedbackAction],
  );
  const feedbackCeoDecision = useCallback(
    (choiceId) => {
      const choice = CEO_CHOICE_BY_ID[choiceId];
      onCeoDecision(choiceId);
      if (choice) showActionFeedback({ messageKey: `ceoChoice.${choiceId}.desc`, tone: choice.tone ?? "good" });
    },
    [onCeoDecision, showActionFeedback],
  );

  useEffect(() => {
    const after = captureFeedbackSnapshot(state, metrics);
    const pending = pendingFeedbackActionRef.current;
    let nextFeedback = pending ? getActionFeedback(pending.action, pending.before, after) : null;
    pendingFeedbackActionRef.current = null;

    const progress = getProgressFeedback(previousFeedbackSnapshotRef.current, after);
    const goalFeedback = progress.find((item) => item.id === "goalComplete");
    const bottleneckFeedback = progress.find((item) => item.id === "bottleneckSolved");
    const paymentFeedback = progress.find((item) => item.id === "projectPaid");
    if (feedbackVisibleRef.current && !nextFeedback) {
      if (goalFeedback || bottleneckFeedback) deferredFeedbackRef.current = goalFeedback ?? bottleneckFeedback;
    } else if (!nextFeedback) {
      nextFeedback = deferredFeedbackRef.current ?? goalFeedback ?? bottleneckFeedback;
      deferredFeedbackRef.current = null;
      if (!nextFeedback && paymentFeedback && after.elapsed - lastPaymentFeedbackAtRef.current >= 8) {
        nextFeedback = paymentFeedback;
        lastPaymentFeedbackAtRef.current = after.elapsed;
      }
    }

    previousFeedbackSnapshotRef.current = after;
    showActionFeedback(nextFeedback);
  }, [state, metrics, showActionFeedback]);

  useEffect(() => () => window.clearTimeout(feedbackTimerRef.current), []);

  // Maps a CEO Advisor recommendation to the matching action so the player can
  // act in one tap (reducing clicks between understanding and action).
  const onAdvisorAction = useCallback(
    (action) => {
      if (!action) return;
      if (action.type === "hire" && action.departmentId) feedbackHire(action.departmentId);
      else if (action.type === "rebalance") feedbackRebalance();
      else if (action.type === "automation") setShowAutomation(true);
      else if (action.type === "evolution") setTab("growth");
      else if (action.type === "throttle") onToggleIntake();
      else if (action.type === "loan") feedbackLoan();
    },
    [feedbackHire, feedbackLoan, feedbackRebalance, onToggleIntake],
  );

  const dismissOnboarding = useCallback(() => {
    markOnboardingSeen();
    setShowOnboarding(false);
  }, []);

  const dismissMiniChapter = useCallback(() => {
    markMiniChapterDismissed();
    setShowMiniChapter(false);
  }, []);

  // Opening the Inbox tab clears the unread badge.
  useEffect(() => {
    if (tab === "inbox") onInboxViewed();
  }, [tab, onInboxViewed]);

  // Celebration moments (#5): when a new achievement unlocks, pop confetti + a
  // popup once. The ref starts at the loaded value so reopening a save never
  // re-celebrates a past milestone; only ids new since mount trigger.
  const [celebration, setCelebration] = useState(null);
  const celebrationId = metrics.lastAchievement?.id ?? null;
  const celebratedRef = useRef(celebrationId);
  useEffect(() => {
    if (!celebrationId || celebrationId === celebratedRef.current) return;
    celebratedRef.current = celebrationId;
    setCelebration(celebrationId);
    const tid = window.setTimeout(() => setCelebration(null), 5200);
    return () => window.clearTimeout(tid);
  }, [celebrationId]);

  useEffect(() => {
    let frameId;

    function frame(now) {
      // Real per-frame dt, capped, then optionally fast-forwarded for the opt-in
      // showcase/recording mode (identity ×1 in normal play).
      const dt = Math.min(0.08, (now - lastFrameRef.current) / 1000) * (isShowcase() ? SHOWCASE_TIME_SCALE : 1);
      lastFrameRef.current = now;
      onTick((current) => tickSimulation(current, dt));
      frameId = requestAnimationFrame(frame);
    }

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [onTick]);

  // Optional horizontal swipe between tabs. Conservative on purpose: a swipe is
  // ignored when it starts inside a horizontally scrollable region (the office
  // canvas, the department chip strip) so it never fights those gestures, and it
  // requires a clearly horizontal, long-enough drag. The bottom nav stays the
  // primary navigation; swipe is convenience only.
  const touchRef = useRef(null);
  const onTouchStart = useCallback((event) => {
    if (event.touches.length !== 1) {
      touchRef.current = null;
      return;
    }
    const blocked = event.target.closest?.("[data-no-swipe]");
    const touch = event.touches[0];
    touchRef.current = blocked ? null : { x: touch.clientX, y: touch.clientY };
  }, []);
  const onTouchEnd = useCallback((event) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    setTab((current) => {
      const index = TABS.indexOf(current);
      const next = dx < 0 ? index + 1 : index - 1;
      return next >= 0 && next < TABS.length ? TABS[next] : current;
    });
  }, []);

  // A pending CEO decision or strategic-layer event is a waiting decision the
  // Inbox surfaces — show it on the nav even when there are no unread items.
  const pendingDecision = Boolean(metrics.ceoDecision)
    || Boolean(metrics.evolution.strategicEvent)
    || Boolean(metrics.evolution.activeOffer)
    || Boolean(metrics.companyReport);

  return (
    <main className="app-shell game-screen">
      <TopHud
        state={state}
        metrics={metrics}
        onRestart={onRestart}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="tab-content" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === "company" ? (
          <CompanyTab
            state={state}
            metrics={metrics}
            guidance={guidance}
            onHire={feedbackHire}
            onRebalance={feedbackRebalance}
            onAutomate={feedbackAutomate}
            onAdvisorAction={onAdvisorAction}
            onTakeLoan={feedbackLoan}
            onRecoveryContract={feedbackRecoveryContract}
            onOpenAutomation={() => setShowAutomation(true)}
            showMiniChapter={showMiniChapter}
            onDismissMiniChapter={dismissMiniChapter}
          />
        ) : null}
        {tab === "inbox" ? (
          <InboxTab
            decision={metrics.ceoDecision}
            onCeoDecision={feedbackCeoDecision}
            report={metrics.companyReport}
            onReportAction={onAdvisorAction}
            onDismissReport={onDismissCompanyReport}
            notifications={notifications}
            permission={permission}
            onEnable={onEnableNotifications}
          />
        ) : null}
        {tab === "growth" ? (
          <GrowthTab
            metrics={metrics}
            guidance={guidance}
            onChooseDestiny={onChooseDestiny}
            onGraduate={onGraduate}
            onStrategicDecision={onStrategicDecision}
            onHireManager={onHireManager}
            onToggleManagerPolicy={onToggleManagerPolicy}
            onChooseCulture={onChooseCulture}
            onHireSpecialist={onHireSpecialist}
            onGiveRaise={onGiveRaise}
          />
        ) : null}
        {tab === "finance" ? (
          <FinanceTab metrics={metrics} guidance={guidance} onTakeLoan={feedbackLoan} onRecoveryContract={feedbackRecoveryContract} onRaiseVenture={onRaiseVenture} />
        ) : null}
        {tab === "founder" ? <FounderTab metrics={metrics} onUpgradeSkill={onUpgradeSkill} roster={roster} onSwitchCompany={onSwitchCompany} onFoundCompany={onFoundCompany} onAllocateCapital={onAllocateCapital} onAppointExecutive={onAppointExecutive} /> : null}
      </div>
      <BottomNav tab={tab} onSelect={setTab} unreadCount={unreadCount} pendingDecision={pendingDecision} />
      <ActionFeedbackToast feedback={actionFeedback} />
      {celebration ? <CelebrationOverlay achievementId={celebration} onDone={() => setCelebration(null)} /> : null}
      {showAutomation ? (
        <AutomationPanel metrics={metrics} onAutomate={feedbackAutomate} onClose={() => setShowAutomation(false)} />
      ) : null}
      {showSettings ? <SettingsPanel onClose={() => setShowSettings(false)} /> : null}
      {showOnboarding ? <OnboardingOverlay onClose={dismissOnboarding} /> : null}
    </main>
  );
}

const CONFETTI_COLORS = ["#58d86b", "#4bb4ff", "#f5a623", "#ff654f", "#b48aff", "#42d7d4"];

// Celebration overlay (#5): a burst of confetti + an achievement popup. Confetti
// is deterministic (index-derived, no Math.random) so it is pure render output.
function CelebrationOverlay({ achievementId, onDone }) {
  const { t } = useI18n();
  const icon = ACHIEVEMENT_BY_ID[achievementId]?.icon ?? "🎉";
  const confetti = Array.from({ length: 28 }, (_, i) => (
    <span
      key={i}
      className="celebration-confetti"
      style={{
        left: `${(i * 37) % 100}%`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        animationDuration: `${2.4 + (i % 5) * 0.4}s`,
        animationDelay: `${(i % 7) * 0.12}s`,
      }}
    />
  ));
  return (
    <div className="celebration" role="status" aria-live="polite" onClick={onDone}>
      {confetti}
      <div className="achievement-pop">
        <span className="ap-icon" aria-hidden="true">{icon}</span>
        <div className="ap-text">
          <span className="ap-eyebrow">{t("achievement.unlocked")}</span>
          <span className="ap-title">{t(`achievement.${achievementId}.title`)}</span>
          <span className="ap-desc">{t(`achievement.${achievementId}.desc`)}</span>
        </div>
      </div>
    </div>
  );
}

function ActionFeedbackToast({ feedback }) {
  const { t } = useI18n();
  if (!feedback) return null;
  const vars = { ...feedback.vars };
  if (vars.departmentId) vars.department = t(`department.${vars.departmentId}`);
  if (vars.toolId) vars.tool = t(`automationTools.${vars.toolId}.name`);
  if (typeof vars.amount === "number") vars.amount = formatMoney(vars.amount);

  const message = feedback.messageKey ? t(feedback.messageKey, vars) : t(`feedback.${feedback.id}`, vars);
  return (
    <div key={feedback.sequence} className={`action-feedback tone-${feedback.tone}`} role="status" aria-live="polite">
      <span className="action-feedback-mark" aria-hidden="true">{feedback.tone === "money" ? "$" : "✓"}</span>
      <span>{message}</span>
      <i aria-hidden="true" />
    </div>
  );
}

// Persistent bottom navigation — five thumb-reachable tabs, always visible, with
// a clear active state and an unread/decision badge on the Inbox.
function BottomNav({ tab, onSelect, unreadCount, pendingDecision }) {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav" aria-label={t("nav.label")}>
      {TABS.map((id) => {
        const showBadge = id === "inbox" && (unreadCount > 0 || pendingDecision);
        return (
          <button
            key={id}
            className={`nav-tab ${tab === id ? "is-active" : ""}`}
            onClick={() => onSelect(id)}
            aria-current={tab === id ? "page" : undefined}
          >
            <span className="nav-icon" aria-hidden="true">
              {TAB_ICONS[id]}
              {showBadge ? (
                <span className="nav-badge">{unreadCount > 9 ? "9+" : unreadCount > 0 ? unreadCount : ""}</span>
              ) : null}
            </span>
            <span className="nav-label">{t(`nav.${id}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}

// 🏢 Company — the primary gameplay screen: office floor, employees/hiring,
// department + automation status, the current bottleneck, the active goal, and
// the critical "what to do next / why am I stuck" alerts. Nothing else.
function CompanyTab({ state, metrics, guidance, onHire, onRebalance, onAutomate, onAdvisorAction, onTakeLoan, onRecoveryContract, onOpenAutomation, showMiniChapter, onDismissMiniChapter }) {
  const { t, language } = useI18n();
  const chapterVisible = showMiniChapter && Boolean(metrics.firstRunChapter);
  return (
    <div className="tab-screen">
      {chapterVisible ? (
        <FirstRunChapter chapter={metrics.firstRunChapter} onAction={onAdvisorAction} onDismiss={onDismissMiniChapter} />
      ) : null}
      {!chapterVisible && guidance.advisor ? <AdvisorPanel advisor={metrics.advisor} effect={metrics.incomeBreakdown?.actionEffect} onAction={onAdvisorAction} /> : null}
      {!chapterVisible ? (
        <GrowthBlockPanel
          growth={metrics.growth}
          analysis={guidance.growthAnalysis}
          allowRecovery={guidance.recovery}
          onAction={onAdvisorAction}
          onTakeLoan={onTakeLoan}
          onRecoveryContract={onRecoveryContract}
        />
      ) : null}
      <MoneyFlowGlance data={metrics.incomeBreakdown} />
      {guidance.goal ? <GoalBar goal={metrics.goal} /> : null}
      <StatusStrip metrics={metrics} showBottleneck={guidance.bottleneck} explain={guidance.bottleneckDetail} />
      <section className="office-wrap" data-no-swipe>
        <OfficeCanvas state={state} t={t} language={language} />
        {metrics.automationEra === "ai" || metrics.automationEra === "advanced" ? (
          <div className={`office-ai-ambiance era-${metrics.automationEra}`} aria-hidden="true">
            <span className="ai-ambiance-badge" title={t(`automationPanel.era.${metrics.automationEra}`)}>🤖</span>
          </div>
        ) : null}
      </section>
      <DepartmentPanel
        departments={state.departments}
        bottleneckId={metrics.bottleneck?.id}
        hireCosts={metrics.hireCosts}
        cash={metrics.cash}
        onHire={onHire}
      />
      <ClientsPanel clients={metrics.clients} />
      <ActionDock
        metrics={metrics}
        onAutomate={onAutomate}
        onRebalance={onRebalance}
        onOpenAutomation={onOpenAutomation}
      />
    </div>
  );
}

// 📬 Inbox — the central decision + event surface: the pending everyday CEO
// decision (if any) sits above the notification feed of company events.
function InboxTab({ decision, onCeoDecision, report, onReportAction, onDismissReport, notifications, permission, onEnable }) {
  const { t } = useI18n();
  return (
    <div className="tab-screen">
      <h2 className="screen-title">{t("nav.inbox")}</h2>
      <CompanyReportCard report={report} onAction={onReportAction} onDismiss={onDismissReport} />
      <CeoInboxCard decision={decision} onDecision={onCeoDecision} />
      <InboxList notifications={notifications} permission={permission} onEnable={onEnable} />
    </div>
  );
}

// 📈 Growth — "how do I grow?": the roadmap (next unlock + lifecycle/strategic
// paths) and the management levers that drive progression (operations manager,
// morale, culture, special hires).
function GrowthTab({ metrics, guidance, onChooseDestiny, onGraduate, onStrategicDecision, onHireManager, onToggleManagerPolicy, onChooseCulture, onHireSpecialist, onGiveRaise }) {
  const { t } = useI18n();
  return (
    <div className="tab-screen">
      <h2 className="screen-title">{t("nav.growth")}</h2>
      {guidance.nextUnlock ? <NextUnlockBar unlock={metrics.nextUnlock} /> : null}
      <MarketPanel market={metrics.marketShare} trend={metrics.industryTrend} />
      <EvolutionView evolution={metrics.evolution} onChoose={onChooseDestiny} onGraduate={onGraduate} onDecision={onStrategicDecision} />
      <ManagerPanel manager={metrics.manager} cash={metrics.cash} onHire={onHireManager} onTogglePolicy={onToggleManagerPolicy} />
      <MoralePanel morale={metrics.morale} cash={metrics.cash} onGiveRaise={onGiveRaise} />
      <CulturePanel culture={metrics.culture} onChoose={onChooseCulture} />
      <TalentPanel specialists={metrics.specialists} cash={metrics.cash} onHire={onHireSpecialist} />
    </div>
  );
}

// 💰 Finance — "why am I making money?": the full revenue/expense/profit picture,
// the income breakdown, cash flow, and debt/recovery — kept off the other screens.
function FinanceTab({ metrics, guidance, onTakeLoan, onRecoveryContract, onRaiseVenture }) {
  const { t } = useI18n();
  // Recovery actions follow the guidance mode's soft-lock rule: always shown in
  // Full, otherwise only when the company is genuinely soft-locked.
  const showLoan = guidance.recovery && metrics.loanAvailable;
  const showRecovery = guidance.recovery && metrics.growth?.recovery?.recoveryAvailable;
  return (
    <div className="tab-screen">
      <h2 className="screen-title">{t("nav.finance")}</h2>
      <section className="finance-metrics">
        <Metric icon="💰" label={t("finance.cash")} value={formatMoney(metrics.cash)} tone={metrics.cash >= 0 ? "good" : "bad"} />
        <Metric icon="📈" label={t("hud.profit")} value={formatMoney(metrics.profit)} tone={metrics.profit >= 0 ? "good" : "bad"} />
        <Metric icon="💸" label={t("hud.expenses")} value={formatMoney(metrics.expenses)} tone="bad" />
        <Metric icon="📊" label={t("hud.revenue")} value={formatMoney(metrics.revenue)} tone="good" />
      </section>
      <details className="collapsible money-story-wrap">
        <summary>{t("moneyFlow.title")}</summary>
        <MoneyStory data={metrics.incomeBreakdown} bare />
      </details>
      {guidance.incomeExplanation ? <IncomeBreakdown data={metrics.incomeBreakdown} open /> : null}
      <section className="finance-flow">
        <h4>{t("finance.cashFlow")}</h4>
        <div className="finance-rows">
          <div className="finance-row"><span>{t("finance.expensePerSec")}</span><b className="bad">-{formatMoney(metrics.expensePerSecond)}{t("finance.perSec")}</b></div>
          <div className="finance-row"><span>{t("finance.throughput")}</span><b>{metrics.throughputPerMinute.toFixed(1)}{t("stat.perMinute")}</b></div>
          <div className="finance-row"><span>{t("actions.completed")}</span><b>{metrics.completedTasks}</b></div>
        </div>
      </section>
      <section className="finance-flow">
        <h4>{t("finance.financing")}</h4>
        <div className="finance-rows">
          <div className="finance-row">
            <span>{t("finance.debt")}</span>
            <b className={metrics.debt > 0 ? "bad" : ""}>{metrics.debt > 0 ? `-${formatMoney(metrics.debt)}` : formatMoney(0)}</b>
          </div>
        </div>
        {showLoan || showRecovery ? (
          <div className="finance-actions">
            {showRecovery ? (
              <button className="gb-loan gb-recovery-contract" onClick={onRecoveryContract}>
                {t("recovery.recoveryContract")}
              </button>
            ) : null}
            {showLoan ? (
              <button className="gb-loan" onClick={onTakeLoan}>
                {t("recovery.founderLoan", { amount: formatMoney(metrics.growth?.recovery?.loanAmount ?? 0) })}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="finance-note">{t("finance.noFinancing")}</p>
        )}
      </section>
      <VenturePanel venture={metrics.venture} onRaise={onRaiseVenture} />
    </div>
  );
}

// Venture Capital (#23): raise private funding rounds for cash now, in exchange
// for equity (dilution), board influence, and growth expectations. Lives on the
// Finance screen; hidden once the company commits to a destiny path.
function VenturePanel({ venture, onRaise }) {
  const { t } = useI18n();
  if (!venture) return null;
  const raised = venture.round > 0;
  // Nothing meaningful to show on a bootstrapped company that can't raise.
  if (!raised && !venture.available) return null;
  return (
    <section className="finance-flow venture-panel">
      <h4>{t("finance.venture")}</h4>
      {raised ? (
        <>
          <div className="finance-rows">
            <div className="finance-row"><span>{t("venture.stage")}</span><b>{t(`venture.round.${venture.roundName}`)}</b></div>
            <div className="finance-row"><span>{t("venture.equity")}</span><b className={venture.founderEquity < 60 ? "bad" : "good"}>{venture.founderEquity}%</b></div>
            <div className="finance-row"><span>{t("venture.influence")}</span><b>{venture.investorInfluence}%</b></div>
            <div className="finance-row"><span>{t("venture.pressure")}</span><b className={venture.pressure > 50 ? "bad" : ""}>{venture.pressure}%</b></div>
            <div className="finance-row"><span>{t("venture.expectation")}</span><b>{formatMoney(venture.expectation)}</b></div>
          </div>
          <p className="finance-note">{t("venture.dilutionNote", { equity: venture.founderEquity })}</p>
        </>
      ) : (
        <p className="finance-note">{t("venture.pitch")}</p>
      )}
      {venture.available ? (
        <div className="finance-actions">
          <button className="gb-loan venture-raise" onClick={onRaise}>
            {t("venture.raise", { round: t(`venture.round.${venture.nextRoundName}`), amount: formatMoney(venture.raiseAmount) })}
          </button>
        </div>
      ) : raised ? (
        <p className="finance-note">{t("venture.maxed")}</p>
      ) : null}
    </section>
  );
}

// 👤 Founder — "my entrepreneurial career": founder profile, prestige unlocks,
// permanent legacy bonuses, the company-history timeline, and the portfolio.
function FounderTab({ metrics, onUpgradeSkill, roster, onSwitchCompany, onFoundCompany, onAllocateCapital, onAppointExecutive }) {
  const { t } = useI18n();
  return (
    <div className="tab-screen">
      <h2 className="screen-title">{t("nav.founder")}</h2>
      <FounderLegacyView profile={metrics.founderProfile} />
      {roster?.canManageMultiple ? (
        <HoldingPanel
          roster={roster}
          synergy={metrics.internalSynergy}
          onSwitch={onSwitchCompany}
          onFound={onFoundCompany}
          onAllocate={onAllocateCapital}
          onAppointExecutive={onAppointExecutive}
        />
      ) : null}
      <FounderTraitsPanel unlocked={metrics.founderCareer.traits} />
      <FounderSkillsPanel career={metrics.founderCareer} onUpgrade={onUpgradeSkill} />
      {metrics.evolution.portfolio ? <PortfolioSection portfolio={metrics.evolution.portfolio} /> : null}
    </div>
  );
}

// Holding Company dashboard (#24 multi-company + #25 synergies + #26 holding).
// Unlocks at the prestige-5 "business empire" tier. Lists the founder's
// subsidiaries (one live at a time; the others pause and catch up on real elapsed
// time when switched to), the portfolio totals + the internal-synergy bonus the
// shared executives/staff/resources/clients provide, capital allocation between
// companies, and founding (acquiring) new subsidiaries.
function HoldingPanel({ roster, synergy, onSwitch, onFound, onAllocate, onAppointExecutive }) {
  const { t } = useI18n();
  const synergyActive = (synergy?.count ?? 1) > 1;
  return (
    <section className="legacy-section">
      <h4>{t("holding.title")}</h4>
      <p className="founder-hint">{t("holding.note")}</p>

      <div className="legacy-grid">
        <LegacyMetric label={t("holding.companies")} value={roster.companies.length} />
        <LegacyMetric label={t("holding.totalCash")} value={formatMoney(roster.totalCash)} />
        <LegacyMetric label={t("holding.totalRevenue")} value={formatMoney(roster.totalRevenue)} />
        <LegacyMetric label={t("holding.synergy")} value={synergyActive ? t("holding.synergyOn", { value: Math.round((synergy.taskValue - 1) * 100) }) : t("holding.synergyNone")} />
      </div>

      <div className="empire-list">
        {roster.companies.map((company) => {
          const isActive = company.active;
          return (
            <article key={company.id} className={`empire-item ${isActive ? "is-active" : ""}`}>
              <div className="empire-info">
                <b>{t(`company.${company.id}.name`)}</b>
                <small>
                  {isActive ? t("empire.live") : t("empire.paused")} · {formatMoney(company.cash)}
                  {company.executive ? ` · ${t("holding.execAppointed")}` : ""}
                </small>
              </div>
              <div className="empire-actions">
                {!company.executive ? (
                  <button className="empire-exec" onClick={() => onAppointExecutive(company.id)}>{t("holding.appointExec")}</button>
                ) : null}
                {isActive ? (
                  <span className="empire-tag">{t("empire.active")}</span>
                ) : (
                  <>
                    <button className="empire-allocate" onClick={() => onAllocate(company.id)}>{t("holding.allocate")}</button>
                    <button className="empire-switch" onClick={() => onSwitch(company.id)}>{t("empire.switch")}</button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {roster.availableTypeIds.length ? (
        <div className="empire-found">
          <h5>{t("holding.acquireTitle")}</h5>
          <div className="empire-found-list">
            {roster.availableTypeIds.map((id) => (
              <button key={id} className="empire-found-btn" onClick={() => onFound(id)}>
                + {t(`company.${id}.name`)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Founder Traits (#21): permanent, earned bonuses that carry across the founder's
// career. Shown as a list with unlocked perks and locked-until hints.
function FounderTraitsPanel({ unlocked }) {
  const { t } = useI18n();
  const unlockedSet = new Set(unlocked);
  return (
    <section className="legacy-section">
      <h4>{t("founder.traitsTitle")}</h4>
      <p className="founder-hint">{t("founder.traitsNote")}</p>
      <div className="trait-list">
        {FOUNDER_TRAITS.map((trait) => {
          const isUnlocked = unlockedSet.has(trait.id);
          return (
            <article key={trait.id} className={`trait-item ${isUnlocked ? "is-unlocked" : "is-locked"}`}>
              <div className="trait-head">
                <b>{t(`founderTrait.${trait.id}.name`)}</b>
                <span className={`trait-tag ${isUnlocked ? "" : "is-locked"}`}>
                  {isUnlocked ? t("founder.unlocked") : t("founder.locked")}
                </span>
              </div>
              <span className="trait-perk">{t(`founderTrait.${trait.id}.perk`)}</span>
              {!isUnlocked ? <small className="trait-unlock">{t(`founderTrait.${trait.id}.unlock`)}</small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Founder Skill Tree (#22): the player spends earned points to permanently level
// skills. Each skill shows its level (dots), perk, and an upgrade button.
function FounderSkillsPanel({ career, onUpgrade }) {
  const { t } = useI18n();
  const available = career.points.available;
  return (
    <section className="legacy-section">
      <div className="skills-head">
        <h4>{t("founder.skillsTitle")}</h4>
        <span className={`skill-points ${available > 0 ? "has-points" : ""}`}>{t("founder.skillPoints", { n: available })}</span>
      </div>
      <p className="founder-hint">{t("founder.skillsNote")}</p>
      <div className="skill-list">
        {FOUNDER_SKILLS.map((skill) => {
          const level = career.skills[skill.id] ?? 0;
          const maxed = level >= MAX_SKILL_LEVEL;
          return (
            <article key={skill.id} className="skill-item">
              <div className="skill-info">
                <b>{t(`founderSkill.${skill.id}.name`)}</b>
                <span className="skill-dots" aria-label={t("founder.skillLevel", { level, max: MAX_SKILL_LEVEL })}>
                  {Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => (
                    <i key={i} className={i < level ? "is-on" : ""} aria-hidden="true" />
                  ))}
                </span>
                <small>{t(`founderSkill.${skill.id}.perk`)}</small>
              </div>
              <button
                className="skill-upgrade"
                onClick={() => onUpgrade(skill.id)}
                disabled={maxed || available <= 0}
              >
                {maxed ? t("founder.maxed") : t("founder.upgrade")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// First-run mini-chapter: non-blocking, gameplay-driven coaching for the first
// loop. It uses the same action contract as the CEO Advisor.
function FirstRunChapter({ chapter, onAction, onDismiss }) {
  const { t } = useI18n();
  if (!chapter) return null;
  const vars = { ...chapter.vars };
  if (vars.department) vars.department = t(`department.${vars.department}`);
  if (vars.tool) vars.tool = t(`automationTools.${vars.tool}.name`);
  if (vars.stage) vars.stage = t(`stage.${vars.stage}.name`);
  if (typeof vars.amount === "number") vars.amount = formatMoney(vars.amount);
  if (typeof vars.cost === "number") vars.cost = formatMoney(vars.cost);
  const action = chapter.action ?? { type: "none" };
  const actionVars = action.departmentId ? { department: t(`department.${action.departmentId}`) } : {};
  const pct = Math.round((chapter.step / chapter.total) * 100);

  return (
    <section className={`chapter-card tone-${chapter.tone}`}>
      <header className="chapter-head">
        <div>
          <b>{t("chapter.title")}</b>
          <span>{t("chapter.progress", { step: chapter.step, total: chapter.total })}</span>
        </div>
        <button className="chapter-skip" onClick={onDismiss}>{t("chapter.skip")}</button>
      </header>
      <div className="chapter-meter" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
      <p>{t(`chapter.${chapter.id}`, vars)}</p>
      {action.type !== "none" ? (
        <button className="chapter-action" onClick={() => onAction(action)}>
          {t(`advisor.action.${action.type}`, actionVars)}
        </button>
      ) : null}
    </section>
  );
}

// CEO Advisor: the single highest-priority "what should I do next?" message,
// with a one-tap action button when the recommendation is actionable.
function AdvisorPanel({ advisor, effect, onAction }) {
  const { t } = useI18n();
  if (!advisor) return null;
  const vars = { ...advisor.vars };
  if (vars.department) vars.department = t(`department.${vars.department}`);
  if (vars.tool) vars.tool = t(`automationTools.${vars.tool}.name`);
  if (vars.stage) vars.stage = t(`stage.${vars.stage}.name`);
  const action = advisor.action ?? { type: "none" };
  const actionVars = action.departmentId ? { department: t(`department.${action.departmentId}`) } : {};

  return (
    <section className={`advisor-panel tone-${advisor.tone}`}>
      <span className="advisor-icon" aria-hidden="true">🧭</span>
      <div className="advisor-body">
        <b>{t("advisor.title")}</b>
        <p>{t(`advisor.${advisor.id}`, vars)}</p>
        {effect ? <p className="advisor-effect">{formatActionEffect(t, effect)}</p> : null}
      </div>
      {action.type !== "none" ? (
        <button className="advisor-action" onClick={() => onAction(action)}>
          {t(`advisor.action.${action.type}`, actionVars)}
        </button>
      ) : null}
    </section>
  );
}

// Compact Company-tab money glance: the source and current constraint only.
// Detailed trend/source/leak analysis stays on Finance.
function MoneyFlowGlance({ data }) {
  const { t } = useI18n();
  if (!data) return null;
  const impact = data.bottleneckImpact;
  return (
    <section className="money-glance">
      <div>
        <span>{t("moneyFlow.sourceLabel")}</span>
        <b>{t("moneyFlow.paidProjects")}</b>
        <strong>+{formatMoney(data.trend.current)}{t("income.perMin")}</strong>
      </div>
      <div className={impact ? "is-warning" : "is-healthy"}>
        <span>{t("moneyFlow.fixFirst")}</span>
        {impact ? (
          <b>{t("moneyFlow.companyBottleneck", {
            department: t(`department.${impact.departmentId}`),
            percent: impact.percent,
          })}</b>
        ) : (
          <b>{t("moneyFlow.flowHealthy")}</b>
        )}
      </div>
    </section>
  );
}

// Finance owns the deeper explanation: trend, top payer, largest leak,
// bottleneck cost, and the expected effect of the current recommendation.
function MoneyStory({ data, bare = false }) {
  const { t } = useI18n();
  if (!data) return null;
  const trend = data.trend;
  const source = data.topSource;
  const leak = data.biggestLeak;
  const impact = data.bottleneckImpact;
  return (
    <section className="money-story">
      {bare ? null : <h4>{t("moneyFlow.title")}</h4>}
      <div className={`money-trend tone-${trend.direction}`}>
        <b>{t(`moneyFlow.trend.${trend.direction}`, {
          current: formatMoney(trend.current),
          previous: formatMoney(trend.previous),
        })}</b>
        <span>{t(`moneyFlow.reason.${trend.reason}`)}</span>
      </div>
      <dl className="money-story-list">
        <div>
          <dt>{t("moneyFlow.topSource")}</dt>
          <dd>{source ? (
            <>
              <span>{t(`client.${source.clientId}`)} · {t(`project.${source.projectId}`)}</span>
              <b className="good">+{formatMoney(source.amount)}</b>
            </>
          ) : <span>{t("moneyFlow.noPaidProjects")}</span>}</dd>
        </div>
        <div>
          <dt>{t("moneyFlow.biggestLeak")}</dt>
          <dd>{leak ? (
            <>
              <span>{formatMoneyLeak(t, leak)}</span>
              <b className="bad">-{formatMoney(leak.amount)}{t("income.perMin")}</b>
            </>
          ) : <span>{t("moneyFlow.noLeak")}</span>}</dd>
        </div>
        <div>
          <dt>{t("moneyFlow.bottleneckImpact")}</dt>
          <dd>{impact ? (
            <>
              <span>{t("moneyFlow.bottleneckDetail", { department: t(`department.${impact.departmentId}`), percent: impact.percent })}</span>
              <b className="bad">-{formatMoney(impact.amount)}{t("income.perMin")}</b>
            </>
          ) : <span>{t("moneyFlow.noBottleneckCost")}</span>}</dd>
        </div>
        <div>
          <dt>{t("moneyFlow.recommendedEffect")}</dt>
          <dd>{data.actionEffect ? <span>{formatActionEffect(t, data.actionEffect)}</span> : <span>{t("moneyFlow.noActionEffect")}</span>}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatMoneyLeak(t, leak) {
  if (leak.id === "bottleneck") {
    return t("moneyFlow.leak.bottleneck", { department: t(`department.${leak.departmentId}`) });
  }
  return t(`moneyFlow.leak.${leak.id}`);
}

function formatActionEffect(t, effect) {
  const action = effect.actionType === "hire"
    ? t("advisor.action.hire", { department: t(`department.${effect.departmentId}`) })
    : effect.actionType === "rebalance"
      ? t("advisor.action.rebalance")
      : t("advisor.action.automation");
  return t(`moneyFlow.effect.${effect.metric}`, { action, percent: effect.percent });
}

// "Why am I stuck?" diagnostics: appears when growth is blocked. Shows the
// reason, the ranked constraints, 2–3 alternative solutions (with estimated
// effect and a recommendation), and an economic-recovery option when relevant.
// "Why am I stuck?" diagnostics. `analysis` (the reason, ranked blockers, and
// alternative-solution buttons) is proactive guidance, gated by mode. The
// recovery tools (loan / recovery contract) are the soft-lock exception: when
// `allowRecovery` is set they appear even with analysis hidden, so emergency
// recovery is always reachable and the game can never become unwinnable.
function GrowthBlockPanel({ growth, analysis = true, allowRecovery = true, onAction, onTakeLoan, onRecoveryContract }) {
  const { t } = useI18n();
  if (!growth || !growth.blocked) return null;
  const reasonVars = growth.departmentId ? { department: t(`department.${growth.departmentId}`) } : {};
  const needsCash = growth.recovery?.softlock || growth.reasonId === "cashLow";
  const showLoan = allowRecovery && growth.recovery?.loanAvailable && needsCash;
  const showRecovery = allowRecovery && growth.recovery?.recoveryAvailable && needsCash;
  // Nothing to show if analysis is hidden and there is no recovery to offer.
  if (!analysis && !showLoan && !showRecovery) return null;

  return (
    <section className="growth-block">
      {analysis ? (
        <header className="gb-head">
          <span className="gb-icon" aria-hidden="true">⚠</span>
          <div>
            <b>{t("growth.title")}</b>
            {growth.reasonId ? <p>{t(`growth.reason.${growth.reasonId}`, reasonVars)}</p> : null}
          </div>
        </header>
      ) : null}

      {analysis && growth.blockers.length ? (
        <div className="gb-section">
          <h5>{t("growth.limitedBy")}</h5>
          <ol className="gb-blockers">
            {growth.blockers.map((blocker) => (
              <li key={blocker.id}>
                <span>
                  {blocker.departmentId
                    ? t(`growth.blocker.${blocker.id}`, { department: t(`department.${blocker.departmentId}`) })
                    : t(`growth.blocker.${blocker.id}`)}
                </span>
                <b>-{blocker.impactPct}%</b>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {analysis && growth.solutions.length ? (
        <div className="gb-section">
          <h5>{t("growth.solutions")}</h5>
          <div className="gb-solutions">
            {growth.solutions.map((solution) => (
              <button
                key={solution.id}
                className={`gb-solution ${solution.recommended ? "is-recommended" : ""}`}
                onClick={() => onAction(solution.action)}
                disabled={!solution.free && !solution.affordable}
              >
                <span className="gb-sol-main">
                  {t(`solution.${solution.id}`, solution.toolId ? { tool: t(`automationTools.${solution.toolId}.name`) } : {})}
                  {solution.recommended ? <em className="gb-rec">{t("growth.recommended")}</em> : null}
                  {solution.id === "reduceWorkload" && solution.active ? <em className="gb-rec gb-on">{t("growth.active")}</em> : null}
                </span>
                <span className="gb-sol-meta">
                  {solution.estimatePct != null ? <i>{t("growth.approx", { value: solution.estimatePct })}</i> : null}
                  <b>{solution.free ? t("growth.free") : formatMoney(solution.cost)}</b>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showLoan || showRecovery ? (
        <div className="gb-recovery">
          {showRecovery ? (
            <button className="gb-loan gb-recovery-contract" onClick={onRecoveryContract}>
              {t("recovery.recoveryContract")}
            </button>
          ) : null}
          {showLoan ? (
            <button className="gb-loan" onClick={onTakeLoan}>
              {t("recovery.founderLoan", { amount: formatMoney(growth.recovery.loanAmount) })}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// Always-visible near-term target: the next lifecycle stage, its binding
// requirement, and what reaching it unlocks.
function NextUnlockBar({ unlock }) {
  const { t } = useI18n();
  if (!unlock) return null;
  const req = unlock.requirement;
  return (
    <section className="next-unlock">
      <div className="nu-text">
        <b>{t("unlock.title")}</b>
        <span>{t(`stage.${unlock.stageId}.name`)}</span>
      </div>
      {req ? (
        <span className="nu-req">
          {t(`evolution.metric.${req.key}`)} {formatMetric(req.key, req.current)} / {formatMetric(req.key, req.target)}
        </span>
      ) : null}
      <span className="nu-reward">{t(`unlock.reward.${unlock.stageId}`)}</span>
    </section>
  );
}

// One compact current objective: the starter chain flows directly into a
// rotating micro-goal deck, so this surface never grows into a task list.
function GoalBar({ goal }) {
  const { t } = useI18n();
  if (!goal) {
    return (
      <section className="goal-bar is-complete">
        <div className="goal-text">
          <b>{t("goal.title")}</b>
          <span>{t("goal.allDone")}</span>
        </div>
      </section>
    );
  }
  const isMoney = goal.format === "money";
  const isDuration = goal.format === "duration";
  const targetLabel = isMoney ? formatMoney(goal.target) : isDuration ? t("goal.seconds", { value: Math.ceil(goal.target) }) : goal.target;
  const currentLabel = isMoney ? formatMoney(goal.current) : isDuration ? t("goal.seconds", { value: Math.floor(goal.current) }) : goal.current;
  const pct = Math.round(Math.max(0, Math.min(1, goal.ratio)) * 100);

  return (
    <section className="goal-bar">
      <div className="goal-text">
        <b>{t(goal.kind === "micro" ? "goal.microTitle" : "goal.title")}</b>
        <span>{t(`goal.${goal.id}`, { target: targetLabel })}</span>
      </div>
      <div className="goal-meter" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
      <div className="goal-meta">
        <span>{currentLabel} / {targetLabel}</span>
        <strong>
          {goal.cashReward > 0 ? t("goal.reward", { amount: formatMoney(goal.cashReward) }) : t("goal.rewardOnlyRep")}
          {goal.reputationReward > 0 ? <span className="goal-rep">{t("goal.rewardRep", { value: goal.reputationReward })}</span> : null}
        </strong>
      </div>
    </section>
  );
}

// Income Breakdown: answers "why am I making money / why not more". net is the
// real income - expenses; the losses list is diagnostic.
function IncomeBreakdown({ data, open = false }) {
  const { t } = useI18n();
  if (!data) return null;
  // Collapsible (native <details>): the net/min stays visible in the summary so
  // the player sees the key number at a glance; details expand on tap. Collapsed
  // by default elsewhere; expanded on the Finance screen (open) where detail is
  // the point.
  return (
    <details className="income-breakdown collapsible" open={open}>
      <summary>
        <span className="collapsible-title">{t("income.title")}</span>
        <strong className={data.net >= 0 ? "good" : "bad"}>
          {data.net >= 0 ? "+" : ""}{formatMoney(data.net)}{t("income.perMin")}
        </strong>
        <span className="collapsible-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="income-rows">
        <div className="income-row"><span>{t("income.gross")}</span><b className="good">+{formatMoney(data.grossIncome)}</b></div>
        <div className="income-row"><span>{t("income.expenses")}</span><b className="bad">-{formatMoney(data.expenses)}</b></div>
      </div>
      {data.contributors.length ? (
        <div className="income-section">
          <h5>{t("income.contributors")}</h5>
          <ul>
            {data.contributors.slice(0, 4).map((entry) => (
              <li key={entry.departmentId}>
                <span>{t(`department.${entry.departmentId}`)}</span>
                <b className="good">+{formatMoney(entry.amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.losses.length ? (
        <div className="income-section">
          <h5>{t("income.losses")}</h5>
          <ul>
            {data.losses.map((loss) => (
              <li key={loss.id}>
                <span>
                  {loss.departmentId
                    ? t(`income.loss.${loss.id}`, { department: t(`department.${loss.departmentId}`) })
                    : t(`income.loss.${loss.id}`)}
                </span>
                <b className="bad">-{formatMoney(loss.amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

// Active Clients: in-flight client projects (name, project, industry, budget,
// on-track/late) plus rolling client satisfaction. Collapsible to save space.
function ClientsPanel({ clients }) {
  const { t } = useI18n();
  if (!clients) return null;
  const sat = clients.satisfaction;
  const satTone = sat >= 80 ? "good" : sat >= 65 ? "" : "bad";
  return (
    <details className="clients-panel collapsible">
      <summary>
        <span className="collapsible-title">{t("clients.title")}</span>
        <strong className={satTone}>{t("clients.satisfaction", { value: sat })}</strong>
        <span className="collapsible-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="collapsible-body">
        <p className={`clients-effect tier-${clients.tier}`}>{t(`clients.effect.${clients.tier}`)}</p>
        <div className="clients-effects">
          <span>{t("clients.fxBudget", { value: formatSigned(clients.budgetPct) })}</span>
          <span>{t("clients.fxReferral", { value: formatSigned(clients.referralPct) })}</span>
          <span>{t("clients.fxOffer", { value: formatSigned(clients.offerPct) })}</span>
        </div>
        {clients.active.length ? (
          <ul className="clients-list">
            {clients.active.map((client) => (
              <li key={client.id} className={`client-item ${client.late ? "is-late" : ""}`}>
                <div className="client-main">
                  <b>
                    {t(`client.${client.clientId}`)}
                    {client.rareContract ? <em className="client-rare" aria-hidden="true">★</em> : null}
                  </b>
                  <span>{t(`project.${client.projectId}`)} · {t(`clientIndustry.${client.industry}`)}</span>
                </div>
                <div className="client-meta">
                  <b className="good">{formatMoney(client.budget)}</b>
                  <span className={client.late ? "bad" : ""}>{client.late ? t("clients.late") : t("clients.onTrack")}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="…" title={t("clients.emptyTitle")} body={t("clients.empty")} compact />
        )}
        {clients.activeCount > clients.active.length ? (
          <p className="clients-more">{t("clients.more", { n: clients.activeCount - clients.active.length })}</p>
        ) : null}
      </div>
    </details>
  );
}

// Operations Manager: hire to automate routine ops (auto-hire / auto-rebalance /
// auto-automate), then toggle which policies run — the player sets strategy and
// delegates the busywork. Unlocks at the Small Business stage.
function ManagerPanel({ manager, cash, onHire, onTogglePolicy }) {
  const { t } = useI18n();
  if (!manager) return null;
  const policies = ["autoHire", "autoRebalance", "autoAutomate"];

  if (!manager.hired) {
    if (!manager.available) return null; // hidden until unlocked, to avoid early clutter
    return (
      <section className="manager-panel">
        <div className="manager-head">
          <span className="manager-icon" aria-hidden="true">🧑‍✈️</span>
          <div>
            <b>{t("manager.title")}</b>
            <small>{t("manager.pitch")}</small>
          </div>
        </div>
        <button className="manager-hire" onClick={onHire} disabled={cash < manager.hireCost}>
          {t("manager.hire", { cost: formatMoney(manager.hireCost) })}
        </button>
      </section>
    );
  }

  return (
    <details className="manager-panel collapsible">
      <summary>
        <span className="collapsible-title">{t("manager.title")}</span>
        <strong>{t("manager.salary", { value: formatMoney(manager.salaryPerSecond) })}</strong>
        <span className="collapsible-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="collapsible-body">
        <p className="manager-note">{t("manager.policiesNote")}</p>
        <div className="manager-policies">
          {policies.map((policy) => (
            <button
              key={policy}
              className={`manager-policy ${manager[policy] ? "is-on" : ""}`}
              onClick={() => onTogglePolicy(policy)}
              aria-pressed={manager[policy]}
            >
              <b>{t(`manager.policy.${policy}`)}</b>
              <span>{manager[policy] ? t("manager.on") : t("manager.off")}</span>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

// Market position (#16) + industry climate (#17). Market share is the company's
// slice of its industry — it speeds inbound work, raises buyout valuations, and
// lifts reputation. The active industry trend is an industry-wide climate (AI
// boom, recession, …) that temporarily shifts the whole economy.
function MarketPanel({ market, trend }) {
  const { t } = useI18n();
  if (!market) return null;
  return (
    <section className="market-panel">
      <div className="market-head">
        <div className="market-text">
          <b>{t("marketShare.title")}</b>
          <span className={`market-value tier-${market.tier}`}>
            {t("marketShare.share", { value: market.share })} · {t(`marketShare.tier.${market.tier}`)}
          </span>
        </div>
      </div>
      <div className="market-meter" aria-hidden="true"><div className={`tier-${market.tier}`} style={{ width: `${market.share}%` }} /></div>
      <div className="market-effects">
        <span>{t("marketShare.fxLeads", { value: formatSigned(market.leadPct) })}</span>
        <span>{t("marketShare.fxValuation", { value: formatSigned(market.valuationPct) })}</span>
        <span>{t("marketShare.fxReputation", { value: formatSigned(market.reputationBonus) })}</span>
      </div>
      <div className={`industry-trend ${trend ? `sev-${trend.severity}` : "is-neutral"}`}>
        <b>{t("industryTrend.title")}</b>
        {trend ? (
          <>
            <strong>{t(`industryTrend.${trend.id}.name`)}</strong>
            <p>{t(`industryTrend.${trend.id}.body`)}</p>
            <small>{t("industryTrend.ends", { sec: trend.remaining })}</small>
          </>
        ) : (
          <span className="industry-neutral">{t("industryTrend.none")}</span>
        )}
      </div>
    </section>
  );
}

// Team morale: employee happiness drives motivation (speed) and retention
// (attrition). The player counters burnout / salary expectations with raises.
function MoralePanel({ morale, cash, onGiveRaise }) {
  const { t } = useI18n();
  if (!morale) return null;
  return (
    <section className="morale-panel">
      <div className="morale-row">
        <div className="morale-text">
          <b>{t("morale.title")}</b>
          <span className={`morale-value tier-${morale.tier}`}>{t("morale.happy", { value: morale.happiness })}</span>
        </div>
        <button className="morale-raise" onClick={onGiveRaise} disabled={cash < morale.raiseCost}>
          {t("morale.raise", { cost: formatMoney(morale.raiseCost) })}
        </button>
      </div>
      <div className="morale-meter" aria-hidden="true"><div className={`tier-${morale.tier}`} style={{ width: `${morale.happiness}%` }} /></div>
    </section>
  );
}

// Company Culture: choose a culture for a persistent bonus + matching weakness.
// A strategic, re-pickable commitment shown as a collapsible list.
function CulturePanel({ culture, onChoose }) {
  const { t } = useI18n();
  const active = culture?.active ?? null;
  return (
    <details className="culture-panel collapsible">
      <summary>
        <span className="collapsible-title">{t("culture.title")}</span>
        <strong>{active ? t(`culture.${active}.name`) : t("culture.none")}</strong>
        <span className="collapsible-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="collapsible-body">
        <p className="culture-note">{t("culture.note")}</p>
        <div className="culture-options">
          {CULTURES.map((c) => (
            <button
              key={c.id}
              className={`culture-option ${active === c.id ? "is-active" : ""}`}
              onClick={() => onChoose(c.id)}
              aria-pressed={active === c.id}
            >
              <b>{t(`culture.${c.id}.name`)}</b>
              <span className="culture-bonus">▲ {t(`culture.${c.id}.bonus`)}</span>
              <span className="culture-weak">▼ {t(`culture.${c.id}.weakness`)}</span>
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

// Special Employees: a rare star talent is offered one at a time; signing one
// grants a persistent perk. Hidden until a hire is available or some are signed.
function TalentPanel({ specialists, cash, onHire }) {
  const { t } = useI18n();
  if (!specialists) return null;
  const available = specialists.available;
  const hired = specialists.hired ?? [];
  if (!available && hired.length === 0) return null;

  return (
    <section className="talent-panel">
      {available ? (
        <div className="talent-offer">
          <div className="talent-head">
            <span className="talent-icon" aria-hidden="true">⭐</span>
            <div>
              <span className="talent-from">{t("talent.available")}</span>
              <b>{t(`specialist.${available}.name`)}</b>
            </div>
          </div>
          <p className="talent-perk">{t(`specialist.${available}.perk`)}</p>
          <button className="talent-hire" onClick={() => onHire(available)} disabled={cash < specialists.availableCost}>
            {t("talent.sign", { cost: formatMoney(specialists.availableCost) })}
          </button>
        </div>
      ) : null}
      {hired.length ? (
        <div className="talent-roster">
          <h5>{t("talent.roster")}</h5>
          <ul>
            {hired.map((id) => (
              <li key={id}>
                <b>{t(`specialist.${id}.name`)}</b>
                <span>{t(`specialist.${id}.perk`)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// Concise first-run onboarding: five short steps, not a long tutorial.
function OnboardingOverlay({ onClose }) {
  const { t } = useI18n();
  const steps = [1, 2, 3, 4, 5];
  return (
    <div className="automation-overlay" role="dialog" aria-label={t("onboarding.title")}>
      <div className="automation-sheet onboarding-sheet">
        <header className="automation-head">
          <strong>{t("onboarding.title")}</strong>
        </header>
        <p className="onboarding-intro">{t("onboarding.intro")}</p>
        <ol className="onboarding-steps">
          {steps.map((n) => (
            <li key={n}>
              <span className="onb-num">{n}</span>
              <span>{t(`onboarding.step${n}`)}</span>
            </li>
          ))}
        </ol>
        <button className="offer-accept" onClick={onClose}>{t("onboarding.gotIt")}</button>
      </div>
    </div>
  );
}

// Slim, persistent header: company identity + stage, a glanceable Cash + Net
// Profit chip (the only money shown globally — the full picture lives in the
// Finance tab), and settings/reset. Navigation lives in the bottom nav.
function TopHud({ state, metrics, onRestart, onOpenSettings }) {
  const { t } = useI18n();
  return (
    <header className="top-hud">
      <div className="hud-top">
        <div className="title-block">
          <strong>{t(`company.${state.companyType.id}.name`)}</strong>
          <em className="hud-stage">{t(`stage.${metrics.evolution.stageId}.name`)}</em>
        </div>
        <div className="hud-money">
          <span className="money-chip">
            <small>{t("finance.cash")}</small>
            <b className={metrics.cash >= 0 ? "good" : "bad"}>{formatMoney(metrics.cash)}</b>
          </span>
          <span className="money-chip">
            <small>{t("hud.profit")}</small>
            <b className={metrics.profit >= 0 ? "good" : "bad"}>{formatMoney(metrics.profit)}</b>
          </span>
        </div>
        <div className="hud-buttons">
          <button className="icon-button" onClick={onOpenSettings} aria-label={t("hud.settings")}>
            {t("hud.settings")}
          </button>
          <button className="icon-button" onClick={onRestart} aria-label={t("hud.reset")}>
            {t("hud.reset")}
          </button>
        </div>
      </div>
    </header>
  );
}

// The Company-screen status strip. The bottleneck alert is guidance (gated by
// mode): Full + Minimal show which department is the main bottleneck, and Full
// also shows the queue/growth/util + revenue-impact explanation lines. The
// automation status is plain info and always shown.
function StatusStrip({ metrics, showBottleneck = true, explain = true }) {
  const { t } = useI18n();
  const bottleneck = metrics.bottleneck;
  const bottleneckState = bottleneck?.bottleneck;
  const isOverloaded = bottleneckState?.isOverloaded;

  return (
    <section className="status-strip">
      {showBottleneck ? (
        <div className={`bottleneck-alert ${isOverloaded ? "is-critical" : "is-stable"}`}>
          <span className="alert-mark" aria-hidden="true">{isOverloaded ? "!" : "✓"}</span>
          <span>
            <b>
              {isOverloaded ? t("status.bottleneck") : t("status.flowWatch")}
              {isOverloaded ? <em className="bottleneck-badge">{t("status.mainBottleneck")}</em> : null}
            </b>
            <strong>{bottleneck ? t(`department.${bottleneck.id}`) : t("status.none")}</strong>
            {explain ? (
              <>
                <small>
                  {t("stat.queue")} {bottleneck?.queue.length ?? 0} | {t("stat.growthLong")} {formatRate(bottleneckState?.queueGrowthRate ?? 0)}{t("stat.perMinute")}
                </small>
                <small>
                  {t("stat.utilLong")} {formatPercent(bottleneckState?.utilization ?? 0)} | {t("hud.revenue")} -{formatPercent(metrics.bottleneckPenalty)}
                </small>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className="automation-strip">
        <b>{t("status.automation")}</b>
        <strong>{metrics.ownedAutomations.map((tool) => t(`automationTools.${tool.id}.name`)).join(" + ")}</strong>
        <small>{describeOfficeEffects(t, metrics.automationEffects)}</small>
      </div>
    </section>
  );
}

function describeOfficeEffects(t, effects) {
  const active = [];
  if (effects.workflowLines) active.push(t("effects.workflowLines"));
  if (effects.fastMovement) active.push(t("effects.fastRouting"));
  if (effects.autoInvoice) active.push(t("effects.autoInvoices"));
  return active.length ? active.join(" | ") : t("effects.manual");
}

function DepartmentPanel({ departments, bottleneckId, hireCosts, cash, onHire }) {
  const { t } = useI18n();
  return (
    <section className="department-panel">
      {departments.map((department) => {
        const cost = hireCosts[department.id] ?? 0;
        const name = t(`department.${department.id}`);
        return (
          <article
            className={`department-chip ${department.bottleneck?.isOverloaded ? "is-hot" : ""} ${department.id === bottleneckId ? "is-primary" : ""}`}
            key={department.id}
            style={{ "--dept": department.color }}
          >
            <b>{name}</b>
            <span>{t("stat.queue")} {department.queue.length}</span>
            <span>{t("stat.employees")} {department.employees}</span>
            <span>{t("stat.util")} {formatPercent(department.bottleneck?.utilization ?? 0)}</span>
            <span>{t("stat.growth")} {formatRate(department.bottleneck?.queueGrowthRate ?? 0)}{t("stat.perMinute")}</span>
            <span>{t("stat.throughput")} {department.throughputWindow?.length ?? 0}{t("stat.perMinute")}</span>
            <button
              className="hire-button"
              onClick={() => onHire(department.id)}
              disabled={cash < cost}
              aria-label={`${t("actions.hire")} ${name} ${formatMoney(cost)}`}
            >
              + {t("actions.hire")} {formatMoney(cost)}
            </button>
          </article>
        );
      })}
    </section>
  );
}

function ActionDock({ metrics, onAutomate, onRebalance, onOpenAutomation }) {
  const { t } = useI18n();
  const owned = metrics.ownedAutomations.length;
  const total = metrics.automations.length;
  const next = metrics.nextAutomation;

  return (
    <nav className="action-dock">
      <button onClick={onOpenAutomation}>
        <span className="action-icon">^</span>
        <b>{t("actions.automation")}</b>
        <small>{t("actions.tools", { owned, total })}</small>
      </button>
      <button onClick={() => next && onAutomate(next.id)} disabled={!next || !next.affordable}>
        <span className="action-icon">+</span>
        <b>{next ? t(`automationTools.${next.id}.name`) : t("actions.allTools")}</b>
        <small>{next ? formatMoney(next.cost) : t("actions.owned")}</small>
      </button>
      <button onClick={onRebalance}>
        <span className="action-icon">=</span>
        <b>{t("actions.rebalance")}</b>
        <small>{t("actions.capacity")}</small>
      </button>
      <div className="finance-tile">
        <b>{metrics.completedTasks}</b>
        <small>{t("actions.completed")}</small>
        <span>{t("actions.perMin", { value: metrics.throughputPerMinute.toFixed(1) })}</span>
      </div>
    </nav>
  );
}

const AUTOMATION_ERA_LABELS = ["early", "growing", "ai", "advanced"];

function AutomationPanel({ metrics, onAutomate, onClose }) {
  const { t } = useI18n();
  // Group the tree by modernization era (Early → Growing → AI Era → Advanced),
  // ordering tools within an era by cost so the progression reads top-to-bottom.
  const eras = AUTOMATION_ERA_LABELS.filter((era) => metrics.automations.some((tool) => tool.era === era));

  return (
    <div className="automation-overlay" role="dialog" aria-label={t("automationPanel.title")}>
      <div className="automation-sheet">
        <header className="automation-head">
          <div>
            <strong>{t("automationPanel.title")}</strong>
            <small>{describeOfficeEffects(t, metrics.automationEffects)}</small>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t("automationPanel.close")}>
            {t("automationPanel.close")}
          </button>
        </header>

        <div className="automation-tiers">
          {eras.map((era) => (
            <section className={`automation-tier automation-era-${era}`} key={era}>
              <h4>{t(`automationPanel.era.${era}`)}</h4>
              <div className="automation-cards">
                {metrics.automations
                  .filter((tool) => tool.era === era)
                  .sort((a, b) => a.cost - b.cost)
                  .map((tool) => (
                    <AutomationCard key={tool.id} tool={tool} cash={metrics.cash} onAutomate={onAutomate} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function AutomationCard({ tool, cash, onAutomate }) {
  const { t } = useI18n();
  const status = tool.owned ? "owned" : tool.unlocked ? "unlocked" : "locked";
  const canBuy = !tool.owned && tool.unlocked && cash >= tool.cost;
  const missing = tool.missing.map((id) => t(`automationTools.${id}.name`));

  return (
    <article className={`automation-card is-${status}`}>
      <header>
        <strong>{t(`automationTools.${tool.id}.name`)}</strong>
        {tool.owned ? <span className="tag tag-owned">{t("automationPanel.installed")}</span> : null}
        {!tool.owned && !tool.unlocked ? <span className="tag tag-locked">{t("automationPanel.locked")}</span> : null}
      </header>
      <p className="automation-desc">{t(`automationTools.${tool.id}.desc`)}</p>
      <p className="automation-office">{t(`automationTools.${tool.id}.office`)}</p>
      <ul className="automation-effects">
        {tool.speedMultiplier > 1 ? <li>{t("automationPanel.effectTime", { value: formatPercent(1 - 1 / tool.speedMultiplier) })}</li> : null}
        {tool.accuracyBonus > 0 ? <li>{t("automationPanel.effectErrors", { value: formatPercent(tool.accuracyBonus) })}</li> : null}
        {tool.capacityBonus > 0 ? <li>{t("automationPanel.effectCapacity", { value: tool.capacityBonus })}</li> : null}
        {tool.moveSpeedMultiplier > 1 ? <li>{t("automationPanel.effectMovement", { value: tool.moveSpeedMultiplier.toFixed(1) })}</li> : null}
        {tool.valueMultiplier > 1 ? <li>{t("automationPanel.effectValue", { value: formatPercent(tool.valueMultiplier - 1) })}</li> : null}
      </ul>
      {tool.owned ? (
        <button className="automation-buy" disabled>
          {t("automationPanel.installed")}
        </button>
      ) : tool.unlocked ? (
        <button className="automation-buy" onClick={() => onAutomate(tool.id)} disabled={!canBuy}>
          {t("automationPanel.buy", { cost: formatMoney(tool.cost) })}
        </button>
      ) : (
        <button className="automation-buy" disabled>
          {t("automationPanel.needs", { requirements: missing.join(" + ") })}
        </button>
      )}
    </article>
  );
}

function SettingsPanel({ onClose }) {
  const { t, language, setLanguage, languages } = useI18n();
  const { mode: guidanceMode, setMode: setGuidanceMode, modes: guidanceModes } = useGuidanceMode();
  const [showPhilosophy, setShowPhilosophy] = useState(false);

  return (
    <>
      <div className="automation-overlay" role="dialog" aria-label={t("settings.title")}>
        <div className="automation-sheet settings-sheet">
          <header className="automation-head">
            <strong>{t("settings.title")}</strong>
            <button className="icon-button" onClick={onClose} aria-label={t("settings.close")}>
              {t("settings.close")}
            </button>
          </header>

          <div className="settings-group">
            <h4>{t("settings.gameplay")}</h4>
            <div className="guidance-options" role="radiogroup" aria-label={t("guidance.title")}>
              <p className="guidance-label">{t("guidance.title")}</p>
              {guidanceModes.map((option) => (
                <button
                  key={option.id}
                  className={`guidance-option ${option.id === guidanceMode ? "is-active" : ""}`}
                  onClick={() => setGuidanceMode(option.id)}
                  role="radio"
                  aria-checked={option.id === guidanceMode}
                >
                  <span className="guidance-radio" aria-hidden="true" />
                  <span className="guidance-text">
                    <b>{t(`guidance.mode.${option.id}`)}</b>
                    <small>{t(`guidance.desc.${option.id}`)}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <h4>{t("settings.language")}</h4>
            <div className="language-options">
              {languages.map((option) => (
                <button
                  key={option.code}
                  className={`language-option ${option.code === language ? "is-active" : ""}`}
                  onClick={() => setLanguage(option.code)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <h4>{t("settings.about")}</h4>
            <button className="settings-link" onClick={() => setShowPhilosophy(true)}>
              {t("philosophy.open")}
            </button>
          </div>
        </div>
      </div>
      {showPhilosophy ? <PhilosophyPanel onClose={() => setShowPhilosophy(false)} /> : null}
    </>
  );
}

// Communicates the long-term product philosophy and acts as a decision-making
// principle for future development — not marketing copy.
function PhilosophyPanel({ onClose }) {
  const { t } = useI18n();
  const [showNote, setShowNote] = useState(false);

  return (
    <div className="automation-overlay philosophy-overlay" role="dialog" aria-label={t("philosophy.title")}>
      <div className="automation-sheet philosophy-sheet">
        <header className="automation-head">
          <strong>{t("philosophy.title")}</strong>
          <button className="icon-button" onClick={onClose} aria-label={t("philosophy.close")}>
            {t("philosophy.close")}
          </button>
        </header>

        <p className="philosophy-principle">{t("philosophy.principle")}</p>

        <button
          className="founder-toggle"
          onClick={() => setShowNote((value) => !value)}
          aria-expanded={showNote}
        >
          <span>{t("philosophy.founderNote")}</span>
          <span className="founder-caret" aria-hidden="true">{showNote ? "−" : "+"}</span>
        </button>

        {showNote ? (
          <div className="founder-note">
            <p className="philosophy-lead">{t("philosophy.gameFirst")}</p>
            <p>{t("philosophy.body1")}</p>
            <p>{t("philosophy.body2")}</p>
            <p className="philosophy-chain">{t("philosophy.chain")}</p>
            <h5>{t("philosophy.principleTitle")}</h5>
            <p>{t("philosophy.principleEngaging")}</p>
            <p>{t("philosophy.principleDashboard")}</p>
            <p className="philosophy-closing">{t("philosophy.principleClosing")}</p>
          </div>
        ) : null}

        <footer className="philosophy-footer">
          <b>{t("philosophy.footerTitle")}</b>
          <span>{t("philosophy.footer")}</span>
        </footer>
      </div>
    </div>
  );
}

// Inline notification feed rendered on the Inbox tab (formerly a modal): the
// browser-notification permission control plus the localized event list.
function InboxList({ notifications, permission, onEnable }) {
  const { t } = useI18n();
  const items = notifications.items;

  return (
    <div className="inbox-view">
      {permission === "granted" ? (
        <p className="inbox-status is-on">{t("inbox.enabled")}</p>
      ) : permission === "denied" ? (
        <p className="inbox-status">{t("inbox.blocked")}</p>
      ) : permission === "unsupported" ? null : (
        <button className="inbox-enable" onClick={onEnable}>
          {t("inbox.enable")}
        </button>
      )}

      {items.length === 0 ? (
        <EmptyState icon="✓" title={t("inbox.emptyTitle")} body={t("inbox.empty")} />
      ) : (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.id} className={`inbox-item sev-${item.severity}`}>
              <div className="inbox-item-head">
                <strong>{t(item.titleKey, notificationVars(t, item))}</strong>
                <small>{formatAgo(t, item.time)}</small>
              </div>
              <p>{t(item.bodyKey, notificationVars(t, item))}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AwaySummary({ summary, onDismiss }) {
  const { t } = useI18n();
  return (
    <div className="automation-overlay" role="dialog" aria-label={t("away.title")}>
      <div className="automation-sheet away-sheet">
        <header className="automation-head">
          <strong>{t("away.title")}</strong>
        </header>
        <p className="away-duration">{t("away.duration", { duration: formatDuration(t, summary.awaySeconds) })}</p>

        <CompanyReportContent report={summary} />
        {summary.capped ? <p className="away-note">{t("away.capped", { hours: Math.round(MAX_OFFLINE_SECONDS / 3600) })}</p> : null}

        <button className="automation-buy" onClick={onDismiss}>
          {t("away.continue")}
        </button>
      </div>
    </div>
  );
}

function CompanyReportCard({ report, onAction, onDismiss }) {
  const { t } = useI18n();
  if (!report) return null;
  const action = report.recommendation?.action ?? { type: "none" };
  const actionVars = action.departmentId ? { department: t(`department.${action.departmentId}`) } : {};
  const runAction = () => {
    onAction(action);
    onDismiss();
  };
  return (
    <section className="company-report">
      <header className="report-head">
        <div>
          <b>{t("report.title")}</b>
          <span>{t("report.period", { duration: formatDuration(t, report.periodSeconds) })}</span>
        </div>
        <button onClick={onDismiss}>{t("report.reviewed")}</button>
      </header>
      <CompanyReportContent report={report} />
      {action.type !== "none" ? (
        <button className="report-action" onClick={runAction}>
          {t(`advisor.action.${action.type}`, actionVars)}
        </button>
      ) : null}
    </section>
  );
}

function CompanyReportContent({ report }) {
  const { t } = useI18n();
  const cashChange = `${report.cashChange > 0 ? "+" : ""}${formatMoney(report.cashChange)}`;
  const recommendation = report.recommendation;
  const recommendationVars = localizeAdvisorVars(t, recommendation?.vars ?? {});
  return (
    <div className="report-content">
      <div className="report-grid">
        <ReportMetric label={t("report.revenue")} value={formatMoney(report.revenue)} tone="good" />
        <ReportMetric label={t("report.profit")} value={formatMoney(report.profit)} tone={report.profit >= 0 ? "good" : "bad"} />
        <ReportMetric label={t("report.cashChange")} value={cashChange} tone={report.cashChange >= 0 ? "good" : "bad"} />
        <ReportMetric label={t("report.projects")} value={report.completedProjects} />
        <ReportMetric label={t("report.satisfaction")} value={`${report.satisfaction}%`} />
      </div>
      <div className="report-lines">
        <ReportLine label={t("report.bottleneck")} tone={report.bottleneckId ? "warning" : "good"}>
          {report.bottleneckId
            ? t("report.bottleneckValue", { department: t(`department.${report.bottleneckId}`), count: report.bottleneckQueue })
            : t("report.noBottleneck")}
        </ReportLine>
        <ReportLine label={t("report.improvementLabel")} tone="good">
          {formatReportItem(t, "improvement", report.improvement)}
        </ReportLine>
        <ReportLine label={t("report.riskLabel")} tone={report.risk?.id === "none" ? "good" : "warning"}>
          {formatReportItem(t, "risk", report.risk)}
        </ReportLine>
        <ReportLine label={t("report.nextAction")} tone="next">
          {recommendation ? t(`advisor.${recommendation.id}`, recommendationVars) : t("report.keepGoing")}
        </ReportLine>
      </div>
    </div>
  );
}

function ReportMetric({ label, value, tone = "neutral" }) {
  return (
    <div className={`report-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportLine({ label, tone, children }) {
  return (
    <div className={`report-line ${tone}`}>
      <b>{label}</b>
      <span>{children}</span>
    </div>
  );
}

function formatReportItem(t, group, item) {
  if (!item) return t(`report.${group}.none`);
  const vars = { ...(item.vars ?? {}) };
  if (vars.departmentId) vars.department = t(`department.${vars.departmentId}`);
  if (vars.toolId) vars.tool = t(`automationTools.${vars.toolId}.name`);
  if (vars.stageId) vars.stage = t(`stage.${vars.stageId}.name`);
  if (vars.eventType) vars.event = t(`dynamicEvent.${vars.eventType}.name`);
  if (typeof vars.amount === "number") vars.amount = formatMoney(vars.amount);
  return t(`report.${group}.${item.id}`, vars);
}

function localizeAdvisorVars(t, source) {
  const vars = { ...source };
  if (vars.department) vars.department = t(`department.${vars.department}`);
  if (vars.tool) vars.tool = t(`automationTools.${vars.tool}.name`);
  if (vars.stage) vars.stage = t(`stage.${vars.stage}.name`);
  return vars;
}

function FounderSummary({ profile, compact = false }) {
  const { t } = useI18n();
  return (
    <section className={`founder-summary ${compact ? "is-compact" : ""}`}>
      <div>
        <span>{t("legacy.profile")}</span>
        <strong>{t("legacy.level", { level: profile.founderLevel })}</strong>
      </div>
      <div>
        <span>{t("legacy.prestige")}</span>
        <strong>{Math.round(profile.prestige)}</strong>
      </div>
      <div>
        <span>{t("legacy.legacyPoints")}</span>
        <strong>{profile.legacyPoints}</strong>
      </div>
    </section>
  );
}

// Inline founder-career view rendered on the Founder tab (formerly a modal):
// profile summary, career records, permanent legacy bonuses, prestige unlocks,
// and the company-history timeline.
function FounderLegacyView({ profile }) {
  const { t } = useI18n();
  const prepared = prepareFounderProfile(profile);
  const unlocks = profile.prestigeUnlocks ?? [];
  // Starting-cash advantage a new company inherits from legacy points, shown as
  // currency (the underlying effect is a multiplier on STARTING_CASH).
  const startingCashBonus = Math.round(STARTING_CASH * (getLegacyBonusEffects(prepared).startingCashMultiplier - 1));

  return (
    <div className="legacy-view">
        <FounderSummary profile={prepared} />

        <section className="legacy-section">
          <h4>{t("legacy.career")}</h4>
          <div className="legacy-grid">
            <LegacyMetric label={t("legacy.founderExperience")} value={Math.round(prepared.founderExperience ?? 0)} />
            <LegacyMetric label={t("legacy.companiesFounded")} value={prepared.companiesFounded} />
            <LegacyMetric label={t("legacy.companiesSold")} value={prepared.companiesSold} />
            <LegacyMetric label={t("legacy.mergers")} value={prepared.mergersCompleted} />
            <LegacyMetric label={t("legacy.ipos")} value={prepared.iposAchieved} />
            <LegacyMetric label={t("legacy.totalEmployees")} value={prepared.totalEmployeesManaged} />
            <LegacyMetric label={t("legacy.totalRevenue")} value={formatMoney(prepared.totalRevenueGenerated)} />
          </div>
        </section>

        <section className="legacy-section">
          <h4>{t("legacy.bonuses")}</h4>
          <div className="bonus-list">
            <LegacyMetric label={t("legacy.bonus.startingReputation")} value={t("legacy.bonus.points", { value: prepared.legacyBonuses.startingReputation })} />
            <LegacyMetric label={t("legacy.bonus.startingCash")} value={t("legacy.bonus.cash", { value: formatMoney(startingCashBonus) })} />
            <LegacyMetric label={t("legacy.bonus.investorConfidence")} value={t("legacy.bonus.points", { value: prepared.legacyBonuses.investorConfidence })} />
            <LegacyMetric label={t("legacy.bonus.complianceScore")} value={t("legacy.bonus.points", { value: prepared.legacyBonuses.complianceScore })} />
            <LegacyMetric label={t("legacy.bonus.hiringAttractiveness")} value={t("legacy.bonus.percent", { value: prepared.legacyBonuses.hiringAttractiveness })} />
          </div>
        </section>

        <section className="legacy-section">
          <h4>{t("legacy.unlocks")}</h4>
          <div className="evolution-paths">
            {unlocks.map((unlock) => (
              <article key={unlock.id} className={`evolution-path ${unlock.unlocked ? "is-chosen" : "is-locked"}`}>
                <strong>{t(`prestigeUnlock.${unlock.id}.name`)}</strong>
                <p>{t(`prestigeUnlock.${unlock.id}.desc`)}</p>
                <span className={`path-tag ${unlock.unlocked ? "" : "is-locked"}`}>
                  {unlock.unlocked ? t("legacy.unlocked") : t("legacy.unlockLevel", { level: unlock.level })}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="legacy-section">
          <h4>{t("legacy.timeline")}</h4>
          <CompanyTimeline timeline={prepared.timeline} />
        </section>
    </div>
  );
}

function LegacyMetric({ label, value }) {
  return (
    <div className="legacy-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CompanyTimeline({ timeline }) {
  const { t } = useI18n();
  if (!timeline.length) {
    return <EmptyState icon="◇" title={t("legacy.emptyTimelineTitle")} body={t("legacy.emptyTimeline")} compact />;
  }
  return (
    <ol className="timeline-list">
      {timeline.map((event, index) => (
        <li key={`${event.type}-${event.year}-${index}`}>
          <time>{event.year}</time>
          <span>{formatTimelineEvent(t, event)}</span>
        </li>
      ))}
    </ol>
  );
}

function EmptyState({ icon, title, body, compact = false }) {
  return (
    <div className={`empty-state ${compact ? "is-compact" : ""}`}>
      <span className="empty-state-icon" aria-hidden="true">{icon}</span>
      <div>
        <b>{title}</b>
        <span>{body}</span>
      </div>
    </div>
  );
}

function formatTimelineEvent(t, event) {
  const company = t(event.companyNameKey ?? `company.${event.companyId}.name`);
  const buyer = event.buyerId ? t(`buyer.${event.buyerId}`) : "";
  const amount = event.amount ? formatMoney(event.amount) : "";
  return t(`legacy.event.${event.type}`, { company, buyer, amount });
}

// Translate stored notification var ids (departmentId, toolId, stageId, buyerId)
// into display strings so the inbox re-localizes when the language changes.
function notificationVars(t, item) {
  const vars = { ...item.vars };
  if (item.vars.departmentId) vars.department = t(`department.${item.vars.departmentId}`);
  if (item.vars.toolId) vars.tool = t(`automationTools.${item.vars.toolId}.name`);
  if (item.vars.stageId) vars.stage = t(`stage.${item.vars.stageId}.name`);
  if (item.vars.buyerId) vars.buyer = t(`buyer.${item.vars.buyerId}`);
  if (item.vars.amount !== undefined) vars.amount = formatMoney(item.vars.amount);
  if (item.vars.eventType) {
    vars.event = t(`dynamicEvent.${item.vars.eventType}.name`);
    vars.detail = t(`dynamicEvent.${item.vars.eventType}.body`);
  }
  if (item.vars.specialistId) vars.specialist = t(`specialist.${item.vars.specialistId}.name`);
  if (item.vars.clientId) vars.client = t(`client.${item.vars.clientId}`);
  if (item.vars.projectId) vars.project = t(`project.${item.vars.projectId}`);
  if (item.vars.revenue !== undefined) vars.revenue = formatMoney(item.vars.revenue);
  if (item.vars.competitorId) vars.competitor = t(`competitor.${item.vars.competitorId}`);
  if (item.vars.compType) vars.detail = t(`competitorEvent.${item.vars.compType}`);
  if (item.vars.trendId) {
    vars.trend = t(`industryTrend.${item.vars.trendId}.name`);
    vars.detail = t(`industryTrend.${item.vars.trendId}.body`);
  }
  return vars;
}

// Inline progression view rendered on the Growth tab (formerly a modal): current
// lifecycle stage, requirements for the next stage, the strategic paths, any
// committed operating layer (public/integration/compliance/transition), and the
// pending strategic decision. The Founder Portfolio moved to the Founder tab.
function EvolutionView({ evolution, onChoose, onGraduate, onDecision }) {
  const { t } = useI18n();

  return (
    <div className="evolution-view">
      <section className="evolution-section">
        <h4>{t("evolution.title")}</h4>
        <p className="evolution-current">{t("evolution.currentStage")}: {t(`stage.${evolution.stageId}.name`)}</p>
        <p className="evolution-stage-desc">{t(`stage.${evolution.stageId}.desc`)}</p>
      </section>

      {evolution.nextStageId ? (
          <section className="evolution-section">
            <h4>{t("evolution.nextStage")}: {t(`stage.${evolution.nextStageId}.name`)}</h4>
            <ul className="evolution-reqs">
              {evolution.requirements.map((req) => (
                <li key={req.key} className={req.met ? "is-met" : ""}>
                  <span>{t(`evolution.metric.${req.key}`)}</span>
                  <b>{formatMetric(req.key, req.current)} / {formatMetric(req.key, req.target)}</b>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="evolution-max">{t("evolution.maxStage")}</p>
        )}

        <section className="evolution-section career-tier-section">
          <h4>{t("careerTier.title")}</h4>
          <p className="career-tier-name">
            <span className={`tier-badge tier-${evolution.tier}`}>{t(`tier.${evolution.tier}.name`)}</span>
            <span>{t(`tier.${evolution.tier}.summary`)}</span>
          </p>
          {!evolution.hasStrategicPaths ? (
            <p className="career-tier-locked founder-hint">{t("careerTier.beginnerLocked")}</p>
          ) : null}
          {evolution.canGraduate ? (
            <div className="career-graduate">
              <p>{t("careerTier.graduateReady")}</p>
              <button className="path-choose" onClick={onGraduate}>{t("careerTier.graduate")}</button>
            </div>
          ) : null}
        </section>

        {evolution.paths.length > 0 || evolution.destinyPath ? (
          <section className="evolution-section">
            <h4>{t("evolution.paths")}</h4>
            {evolution.destinyPath ? (
              <p className="evolution-active-path">
                {t("evolution.activePath")}: {t(`path.${evolution.destinyPath}.name`)}
              </p>
            ) : null}
            <div className="evolution-paths">
              {evolution.paths.map((path) => (
                <article key={path.id} className={`evolution-path ${path.unlocked ? "" : "is-locked"} ${path.chosen ? "is-chosen" : ""}`}>
                  <strong>{t(`path.${path.id}.name`)}</strong>
                  <p>{t(`path.${path.id}.desc`)}</p>
                  {path.chosen ? (
                    <span className="path-tag">{t("evolution.activePath")}</span>
                  ) : !path.unlocked ? (
                    <span className="path-tag is-locked">{t("evolution.locked")}</span>
                  ) : path.kind === "offer" ? (
                    <span className="path-tag">{t("evolution.viaOffer")}</span>
                  ) : (
                    <button
                      className="path-choose"
                      onClick={() => onChoose(path.id)}
                      disabled={Boolean(evolution.destinyPath)}
                    >
                      {t("evolution.choosePath")}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {evolution.publicCompany || evolution.integration || evolution.compliance ? (
          <section className="evolution-section">
            <h4>{t("evolution.operatingLayer")}</h4>
            <div className="legacy-grid">
              {evolution.publicCompany ? (
                <>
                  <LegacyMetric label={t("public.stockPrice")} value={formatMoney(evolution.publicCompany.stockPrice)} />
                  <LegacyMetric label={t("public.shareholders")} value={formatPercent(evolution.publicCompany.shareholderConfidence / 100)} />
                  <LegacyMetric label={t("public.board")} value={formatPercent((evolution.publicCompany.boardAlignment ?? 60) / 100)} />
                  <LegacyMetric label={t("public.guidanceLabel")} value={t(`public.guidance.${evolution.publicCompany.guidance ?? "balanced"}`)} />
                  <LegacyMetric label={t("public.quarterly")} value={formatMoney(evolution.publicCompany.quarterlyExpectation)} />
                  <LegacyMetric label={t("public.pressure")} value={formatPercent(evolution.publicCompany.investorPressure / 100)} />
                </>
              ) : null}
              {evolution.integration ? (
                <>
                  <LegacyMetric label={t("integration.synergy")} value={formatPercent((evolution.integration.synergy ?? 0) / 100)} />
                  <LegacyMetric label={t("integration.culture")} value={formatPercent(evolution.integration.cultureConflict / 100)} />
                  <LegacyMetric label={t("integration.politics")} value={formatPercent((evolution.integration.politics ?? 0) / 100)} />
                  <LegacyMetric label={t("integration.leadership")} value={formatPercent((evolution.integration.leadershipConflict ?? 0) / 100)} />
                  <LegacyMetric label={t("integration.morale")} value={formatPercent((evolution.integration.morale ?? 70) / 100)} />
                  <LegacyMetric label={t("integration.duplicated")} value={evolution.integration.duplicatedDepartments} />
                  <LegacyMetric label={t("integration.restructuring")} value={formatPercent(evolution.integration.restructuringDebt / 100)} />
                  <LegacyMetric label={t("integration.progress")} value={formatPercent(evolution.integration.progress / 100)} />
                </>
              ) : null}
              {evolution.compliance ? (
                <>
                  <LegacyMetric label={t("government.contracts")} value={evolution.compliance.nationalContracts} />
                  <LegacyMetric label={t("government.auditRisk")} value={formatPercent(evolution.compliance.auditRisk / 100)} />
                  <LegacyMetric label={t("government.compliance")} value={formatPercent(evolution.compliance.complianceScore / 100)} />
                  <LegacyMetric label={t("government.publicRep")} value={Math.round(evolution.compliance.publicReputation)} />
                  <LegacyMetric label={t("government.pendingPayment")} value={formatMoney(evolution.compliance.pendingPayment ?? 0)} />
                </>
              ) : null}
            </div>
            {evolution.publicCompany?.activist ? (
              <p className="activist-banner">⚠ {t(`public.activist.${evolution.publicCompany.activist.demandId}`)}</p>
            ) : null}
          </section>
        ) : null}

        {evolution.acquisitionTransition ? (
          <section className="evolution-section">
            <h4>{t("acquisitionTransition.title")}</h4>
            <div className="legacy-grid">
              <LegacyMetric label={t("acquisitionTransition.days")} value={Math.ceil(evolution.acquisitionTransition.daysRemaining)} />
              <LegacyMetric label={t("acquisitionTransition.morale")} value={formatPercent(evolution.acquisitionTransition.morale / 100)} />
              <LegacyMetric label={t("acquisitionTransition.buyerTrust")} value={formatPercent(evolution.acquisitionTransition.buyerTrust / 100)} />
              <LegacyMetric label={t("acquisitionTransition.clientRetention")} value={formatPercent(evolution.acquisitionTransition.clientRetention / 100)} />
              <LegacyMetric label={t("acquisitionTransition.systemsIntegration")} value={formatPercent(evolution.acquisitionTransition.systemsIntegration / 100)} />
            </div>
          </section>
        ) : null}

        {evolution.strategicEvent ? (
          <StrategicEventCard event={evolution.strategicEvent} onDecision={onDecision} />
        ) : null}
    </div>
  );
}

// Honest-MVP Founder Portfolio: a read-only ledger of the founder's companies as
// legacy assets (name, role, valuation), with the active company marked. It does
// not switch between or concurrently run multiple live companies — that remains
// future work, stated in portfolio.mvpNote.
function PortfolioSection({ portfolio }) {
  const { t } = useI18n();
  const assets = portfolio.assets ?? [];
  return (
    <section className="evolution-section">
      <h4>{t("portfolio.title")}</h4>
      <p className="evolution-stage-desc">{t("portfolio.mvpNote")}</p>
      <div className="legacy-grid">
        <LegacyMetric label={t("portfolio.count")} value={assets.length} />
        <LegacyMetric label={t("portfolio.totalValuation")} value={formatMoney(portfolio.totalValuation ?? 0)} />
      </div>
      <ul className="portfolio-list">
        {assets.map((asset) => {
          const isActive = asset.status === "active" && asset.id === portfolio.activeCompanyId;
          return (
            <li key={`${asset.id}-${asset.foundedYear}`} className={`portfolio-item ${isActive ? "is-active" : ""}`}>
              <span className="portfolio-name">{t(`company.${asset.id}.name`)}</span>
              <span className="portfolio-role">
                {t(`portfolio.role.${asset.status ?? "active"}`)}
                {isActive ? ` · ${t("portfolio.activeTag")}` : ""}
              </span>
              <span className="portfolio-val">{formatMoney(Math.max(asset.valuation ?? 0, asset.revenue ?? 0))}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StrategicEventCard({ event, onDecision }) {
  const { t } = useI18n();
  return (
    <section className="evolution-section strategic-event">
      <h4>{t("strategicEvent.title")}</h4>
      <article className="evolution-path is-chosen">
        <strong>{t(`strategicEvent.${event.type}.title`)}</strong>
        <p>{t(`strategicEvent.${event.type}.body`)}</p>
        {event.tender ? (
          <p className="tender-info">
            {t("government.tenderValue", { value: formatMoney(event.tender.value) })}
            {" · "}
            {t("government.competitors", { count: event.tender.rivals })}
            {" · "}
            {t(`government.competition.${event.tender.competition}`)}
          </p>
        ) : null}
        <div className="offer-actions">
          {event.choices.map((choiceId) => (
            <button className="offer-negotiate" key={choiceId} onClick={() => onDecision(choiceId)}>
              <b>{t(`strategicChoice.${choiceId}.label`)}</b>
              <small>{t(`strategicChoice.${choiceId}.desc`)}</small>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

// CEO Inbox: a single everyday decision message (sender, subject, body) with
// choice buttons — makes running the company feel like CEO decision-making.
function CeoInboxCard({ decision, onDecision }) {
  const { t } = useI18n();
  if (!decision) return null;
  const root = decision.narrative ? `ceoSituation.${decision.type}` : `ceoInbox.${decision.type}`;
  // Compact card: sender + subject + a channel/decision badge are always visible;
  // the long story, context, and per-choice consequences live behind "Details".
  return (
    <section className={`ceo-inbox ${decision.narrative ? "is-situation" : ""}`}>
      <header className="ceo-head">
        <span className="ceo-icon" aria-hidden="true">{decision.icon ?? "📩"}</span>
        <div className="ceo-head-text">
          <span className="ceo-from">{t(`${root}.sender`)}</span>
          <b>{t(`${root}.subject`)}</b>
        </div>
        <span className="ceo-badge">
          {decision.narrative ? t(`ceoChannel.${decision.channel}`) : t("ceoInbox.decisionBadge")}
        </span>
      </header>
      <details className="ceo-details">
        <summary>{t("ceoInbox.details")}</summary>
        <p className="ceo-body">{t(`${root}.body`)}</p>
        {decision.narrative ? <p className="ceo-context">{t(`${root}.context`)}</p> : null}
        <ul className="ceo-choice-notes">
          {decision.choices.map((choiceId) => (
            <li key={choiceId}>
              <b>{t(`ceoChoice.${choiceId}.label`)}</b> — {t(`ceoChoice.${choiceId}.desc`)}
            </li>
          ))}
        </ul>
      </details>
      <div className="offer-actions ceo-actions">
        {decision.choices.map((choiceId) => (
          <button className="offer-negotiate ceo-choice" key={choiceId} onClick={() => onDecision(choiceId)}>
            {t(`ceoChoice.${choiceId}.label`)}
          </button>
        ))}
      </div>
    </section>
  );
}

function OfferModal({ offer, onAccept, onReject, onNegotiate }) {
  const { t } = useI18n();
  if (!offer) return null;
  const buyer = t(`buyer.${offer.buyerId}`);

  return (
    <div className="automation-overlay offer-overlay" role="dialog" aria-label={t(`offer.${offer.kind}.title`)}>
      <div className="automation-sheet offer-sheet">
        <header className="automation-head">
          <strong>{t(`offer.${offer.kind}.title`)}</strong>
        </header>

        <p className="offer-amount">{formatMoney(offer.amount)}</p>
        <p className="offer-body">{t(`offer.${offer.kind}.body`, { buyer, amount: formatMoney(offer.amount) })}</p>

        <div className="offer-reasons">
          <h5>{t("offer.reasonTitle")}</h5>
          <ul>
            {offer.reasons.map((reason) => (
              <li key={reason}>{t(`offer.reason.${reason}`)}</li>
            ))}
          </ul>
        </div>

        <div className="offer-actions">
          <button className="offer-accept" onClick={onAccept}>{t("offer.accept")}</button>
          <button
            className="offer-negotiate"
            onClick={onNegotiate}
            disabled={offer.negotiated || offer.negotiable === false}
          >
            {t("offer.negotiate")}
          </button>
          <button className="offer-reject" onClick={onReject}>{t("offer.reject")}</button>
        </div>
        {offer.negotiable === false ? (
          <p className="offer-note">{t("offer.negotiateLocked")}</p>
        ) : null}
      </div>
    </div>
  );
}

function LegacyEventOverlay({ event, founderProfile, onChoice, onContinue, onStartNewCompany }) {
  const { t } = useI18n();
  const profile = prepareFounderProfile(founderProfile);
  const buyer = event.buyerId ? t(`buyer.${event.buyerId}`) : "";
  const hasAmount = typeof event.amount === "number" && event.amount > 0;
  return (
    <div className="automation-overlay outcome-overlay" role="dialog" aria-label={t(`legacyOutcome.${event.type}.title`)}>
      <div className="automation-sheet outcome-sheet">
        <header className="automation-head">
          <strong>{t(`legacyOutcome.${event.type}.title`)}</strong>
        </header>
        {hasAmount ? <p className="outcome-amount">{formatMoney(event.amount)}</p> : null}
        <p className="outcome-body">{t(`legacyOutcome.${event.type}.body`, { buyer, amount: formatMoney(event.amount ?? 0) })}</p>
        <FounderSummary profile={profile} />
        {event.type === "acquisition" ? (
          <>
            <div className="offer-actions">
              <button className="offer-accept" onClick={onStartNewCompany}>{t("legacyOutcome.newCompany")}</button>
              <button className="offer-negotiate" onClick={() => onChoice("transition")}>{t("legacyOutcome.transition")}</button>
              <button
                className="offer-negotiate"
                onClick={() => onChoice("negotiateTerms")}
                disabled={Boolean(event.negotiated)}
              >
                {t("legacyOutcome.negotiateTerms")}
              </button>
            </div>
            {event.negotiationResult ? (
              <p className="offer-note">{t(`legacyOutcome.negotiate.${event.negotiationResult}`)}</p>
            ) : null}
          </>
        ) : (
          <div className="offer-actions">
            <button className="offer-accept" onClick={onContinue}>{t("legacyOutcome.continue")}</button>
            <button className="offer-negotiate" onClick={onStartNewCompany}>{t("legacyOutcome.newCompany")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Formats an evolution metric value for display by metric key.
function formatMetric(key, value) {
  if (key === "revenue") return formatMoney(value);
  if (key === "stability" || key === "satisfaction") return formatPercent(value);
  if (key === "reputation" || key === "marketPresence") return Math.round(value);
  return Math.round(value);
}

function formatDuration(t, seconds) {
  if (seconds < 60) return t("duration.lessMinute");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (hours > 0) return t("duration.hm", { h: hours, m: minutes });
  return remainingSeconds > 0 ? t("duration.ms", { m: minutes, s: remainingSeconds }) : t("duration.m", { m: minutes });
}

function formatAgo(t, time) {
  const seconds = Math.max(0, (Date.now() - time) / 1000);
  if (seconds < 60) return t("inbox.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("inbox.minutesAgo", { n: minutes });
  return t("inbox.hoursAgo", { n: Math.floor(minutes / 60) });
}

function Metric({ label, value, tone, icon }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{icon ? <span className="metric-icon" aria-hidden="true">{icon} </span> : null}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatMoney(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function formatRate(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

// Signed integer with an explicit + for non-negatives (e.g. "+15", "-6", "0").
function formatSigned(value) {
  return `${value > 0 ? "+" : ""}${value}`;
}
