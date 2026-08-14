# FlowCorp Architecture

FlowCorp is currently a mobile-first React/Vite prototype for a pixel-art business process automation tycoon. The implementation favors a small data-driven simulation over hardcoded company-specific rules.

## Core Product Requirement: Living, Idle Company

FlowCorp behaves like a tamagotchi-style idle company simulator: the company keeps operating over time, even when the app/tab is backgrounded or closed, and only asks for attention when something important needs a decision. The player is the CEO who builds systems and resolves problems, not a micromanager. This is realized by three cooperating systems — **persistence** (save the company), **offline progress** (advance it for the time the player was away), and **notifications** (surface only meaningful events) — all described under "Persistence, Offline Progress & Notifications".

## Technical Stack

- React 19 renders the mobile UI and owns user actions.
- Vite provides local development and production builds.
- Canvas renders the live office floor, task lanes, desks, queues, and moving task documents.
- Plain JavaScript modules are used for rapid iteration. TypeScript can be introduced once the simulation contracts stabilize.

## Folder Structure

All game assets live under `src/assets/`. There is no root-level `assets/` folder; `src/assets/` is the single source of truth and the only place imports resolve. The art is hand-authored production pixel art (no longer generated) — assets are never regenerated or overwritten by tooling.

```text
src/
  App.jsx                    Main screen flow, company selection, slim HUD, bottom-nav tabs (Company/Inbox/Growth/Finance/Founder), actions, settings
  core/
    simulation.js            Pure simulation state creation, ticking, actions, metrics, flows
    founderLegacy.js         Persistent founder profile, career timeline, prestige, legacy bonuses
    guidance.js              Player guidance: CEO Advisor, income breakdown, goals, safety net (pure)
    actionFeedback.js         Pure before/after action and progress feedback derivation
    companyReport.js          Pure recurring/offline report snapshots, deltas, improvement and risk ranking
    persistence.js           Save/load the company roster in localStorage (v2 roster schema + v1 migration)
    offline.js               Offline catch-up: replays elapsed time + "while you were away" summary
    notifications.js         Data-driven notification rules + cooldown/dedupe evaluator
  data/
    automations.js           Automation tree across four modernization eras (early→growing→AI→advanced)
    achievements.js          Celebration milestone ids + icons (#5); detection lives in simulation.js
    careerTiers.js           Career tier definitions + cumulative capability gating (beginner/intermediate/advanced)
    companyTypes.js          Data-driven company definitions (13 business types tagged by career tier, with emoji icons)
    clients.js               Client roster (id-based: name/industry/budget) for the client system
    culture.js               Company cultures (id-based: effects + signature event)
    specialists.js           Special (rare star) employees (id-based: effects + cost)
    competitors.js           Competitor roster + rival event types
    industryTrends.js        Industry-trend climate roster (AI boom, recession, …): effects + drift + valuation
    ceoSituations.js         Data-driven CEO Inbox situations, choices, eligibility, and effect declarations
  rendering/
    OfficeCanvas.jsx         Canvas office, background, employee animation, workflow visualization
  i18n/
    index.jsx                LanguageProvider, useI18n hook, t() translator, persistence
  guidance/
    guidanceMode.jsx         GuidanceModeProvider/useGuidanceMode + getGuidanceFlags (Full/Minimal/Hardcore), persisted
  locales/
    en.json                  English strings (default + fallback)
    ru.json                  Russian strings
  assets/
    assetRegistry.js         Centralized sprite registry (paths resolved via import.meta.glob)
    background/              Per-company office backgrounds (it-company, marketing-agency, e-commerce, manufacturing, logistics); new tiered companies reuse one via BACKGROUND_ALIASES until dedicated art ships
    employees/
      black_employee/        idle, idle_blink, sitting, walk_up/down/left/right
      red_employee/          same states, files prefixed employee_*
      woman_employee/        same states
    departments/             accounting/analysis/development/qa/sale/support _room.png
    tasks/                   lead, requirement, development_task, bug, support_ticket, invoice, payment tokens
    office/                  desk, computer, chair, meeting_table, server_rack, office_plant, water_cooler
    ui/                      HUD/action icons
    automation/              Technology icons
    palette/                 FlowCorp palette swatch PNG
    reference/               Selected visual direction reference
docs/
  ARCHITECTURE.md
  ROADMAP.md
asset_manifest.json          Catalog of every asset (path, category, dimensions)
scripts/
  build_manifest.mjs         Read-only scanner that rebuilds asset_manifest.json (never writes images)
  check_locale_parity.mjs    Verifies en/ru locale key parity
  validate_gameplay.mjs      Gameplay requirements checklist (prestige, exits, merger/IPO/gov, inheritance)
  validate_clients.mjs       Client system + recovery contract regression suite
  validate_ceo_inbox.mjs     CEO Inbox and narrative situation-card regression suite
  validate_events.mjs        Dynamic events + notification-expansion regression suite
  validate_managers.mjs      Operations Manager automation regression suite
  validate_culture_talent.mjs  Company culture + special-employee regression suite
  validate_morale_competitors.mjs  Employee happiness/retention + competitor regression suite
  validate_market.mjs          Market share + industry-trend regression suite
  validate_ipo.mjs             Expanded IPO governance regression suite (board, guidance, votes, activists)
  validate_government.mjs      Expanded government regression suite (contract bidding, competition, audits, compliance events)
  validate_merger.mjs          Expanded merger regression suite (department integration, leadership, corporate politics, synergy)
  validate_founder_career.mjs  Founder traits + skill-tree regression suite (milestone-unlocked traits, point allocation, skill effects)
  validate_career_tiers.mjs    Career tier regression suite (beginner restrictions, intermediate/advanced capabilities, unlock gating, graduation)
  validate_venture.mjs         Venture-capital regression suite (raise, dilution, investor expectations, board influence)
  validate_persistence.mjs     Save-roster normalization + v1→v2 migration suite (multi-company)
  validate_founder_legacy_phase2.mjs   Deep regression suite for the founder-legacy & strategic layers
  validate_guidance.mjs      Onboarding / anti-stuck regression suite (advisor, goals, growth-block, recovery)
  validate_company_reports.mjs  Recurring and offline company-report regression suite
  validate_return_hooks.mjs    Important return-reason priority, dedupe, and condition-latch regression suite
  validate_money_flow.mjs      Payment history, revenue trend/source, leak, bottleneck cost, and action-effect regression suite
```

Each character folder ships single-frame sprites (one image per state), not multi-frame strips. Note the file-naming is not uniform: `red_employee/` files use an `employee_` prefix, and the Sales room is `sale_room.png`. The asset registry hides these quirks from rendering code.

## Major Systems

### Company Types

Company types are configured in `src/data/companyTypes.js`. Each company defines a **career `tier`** (see **Career Tier Progression**), departments, task naming, starting employees, base task value, lead generation interval, and an optional `unlockPrestige` override. There are thirteen data-driven business types, grouped by tier:

- **Beginner** — **Coffee Shop** (Counter, Supplies, Kitchen, Service, Till), **Digital Agency** (Sales, Design, Development, Marketing, Accounting).
- **Intermediate** — **IT Company**, **Marketing Agency**, **E-Commerce Company**, **Manufacturing Company**, **Logistics Company** (the five original operational pipelines), plus **Tech Startup** (Sales, Product, Engineering, QA, Growth, Finance) and **Game Studio** (Game Design, Development, QA, Marketing, Community, Accounting).
- **Advanced** — **Enterprise Corporation** (Enterprise Sales, Strategy, Operations, Analytics, Account Mgmt, Finance), **Holding Company** (Corporate Strategy, Operations, Analytics, Shared Services, Treasury), **Investment Fund** (Deal Sourcing, Due Diligence, Portfolio Ops, Analytics, Fund Accounting), **Government Contractor** (Bids & Tenders, Procurement, Delivery, Compliance, Finance).

The original five companies (indices 0–4) keep their ids/order so saves and validators reference them positionally; new companies are appended. All new companies **reuse existing department ids** (sales, analysis, development, qa, support, accounting, strategy, design, marketing, analytics, procurement, production, quality-control, operations), so they resolve to existing room art, fallback task routing, and `department.<id>` localization with **no new assets required**. `COMPANY_TYPES_BY_ID` maps id → company type for save back-compat and validator/UI lookups.

All company types use the same simulation architecture. Different business types are expressed through data: department order, labels, colors, speed, accuracy, employee cost, balancing values, the per-company background asset, and the career tier that decides which mechanics are available.

### Career Tier Progression

FlowCorp is a **founder-career** game: the player does not simply unlock "harder companies" — each company **tier** unlocks an *entirely new level of business management*. The career arc is *running a business → growing a business → owning businesses → buying businesses → managing corporations → managing an investment empire*. Every tier introduces mechanics that were **impossible** in the previous one.

`src/data/careerTiers.js` is the single, data-driven source of truth. It is pure (depends only on the founder profile for unlock pacing) and exposes the whole system as **capabilities** — stable string ids that gated mechanics read instead of re-deriving thresholds inline. This keeps the design future-proof: adding a company is a data edit (pick a `tier`), and adding a gated mechanic is a one-line `companyHasCapability(...)` check.

#### Tiers & capabilities (cumulative)

Each tier grants a **cumulative** capability set — Advanced includes everything Intermediate grants, which includes everything Beginner grants.

| Tier | Teaches | Adds (gate-bearing capabilities in bold) |
| --- | --- | --- |
| **Beginner** | the fundamentals | hiring, automation, clients, revenue/expenses, company growth, team management, culture, morale (no exits, no investors) |
| **Intermediate** | scaling | **`investors`** (venture capital / funding rounds / valuation / loans), **`exits`** (sell / merge), **`productLaunch`** (major product launches), premium clients, market competition, brand reputation |
| **Advanced** | corporate strategy | **`ipo`** + **`board`** (shareholders, quarterly earnings, public reputation), **`government`** (tenders, audits, compliance), **`holding`** + **`multiCompany`** (own/transfer-between/buy companies), **`investmentFund`** (equity investing, passive income) |

The gates, all reading `companyHasCapability(state.companyType, cap)`:

- **Buyout / merger offers** — `evaluateOfferGeneration` returns `null` unless the tier grants `exits`. A Beginner company never receives an offer.
- **Strategic destiny paths** — each entry in `STRATEGIC_PATHS` carries a `capability`; `getUnlockedPaths` filters by it, and `getEvolutionState` only *surfaces* tier-allowed paths. A Beginner company shows **no strategic paths at all** (no sell, merge, IPO, government, board, or holding).
- **Venture capital** — `isVentureRoundAvailable` requires `investors`; the metrics `venture.capable` flag hides the venture panel for Beginner companies.
- **Active multi-company management** — the holding dashboard requires the prestige-5 "business empire" tier **and** an active company whose tier grants `multiCompany`.

So M&A, selling, IPO, and acquiring **do not exist in Beginner companies** — they are late-game rewards the founder graduates into, by design. When they finally unlock, the player has "graduated from running a business to owning businesses."

#### Company unlock philosophy

Companies unlock as the founder's career advances (shown in company select, locked companies greyed with a requirement hint). The unlock is data-driven (`isCompanyUnlocked`, `getUnlockedTierIndex`, `getCompanyUnlockHint`):

- **Beginner** — always available (career rank 0).
- **Intermediate** — unlocked after the founder **completes one company** (sold / merged / IPO'd / became a contractor / **graduated**) *or* reaches prestige level 2.
- **Advanced** — unlocked after **completing two companies** *or* reaching prestige level 4. The empire-grade **Holding Company** and **Investment Fund** additionally require the prestige-5 tier (`unlockPrestige: 5`).

"Completed companies" (`getVenturesCompleted`) is the progression currency for the brief's loop *complete a company → gain prestige → unlock better companies*. Two routes always exist to each tier (completed companies **or** prestige), so the progression is never a dead end.

#### Founder graduation (the Beginner progression path)

A Beginner company has **no exit** (it cannot be sold or merged), so it needs another way for the founder to move on. **Graduation** is that path, and it is available to every tier:

- `canGraduateCompany` is true once the company reaches the `growing-company` stage (index ≥ `GRADUATE_MIN_STAGE = 2`) and has not committed to a destiny / has no live offer or legacy event. The Evolution view surfaces a **Graduate & move on** button (with a career-tier note explaining what unlocks next).
- `graduateCompany` records the company in founder history as `graduated` (`recordGraduation`: `companiesGraduated` +1, founder prestige/experience/legacy points scaled to its valuation — smaller than a real exit, since there is no buyer or payout), commits `destinyPath = "graduated"` (so offers stop and it cannot be farmed), and raises a `legacyEvent` of type `graduation`.
- The graduation reuses the **existing legacy-transition overlay**: its "Found next company" continuation returns to company select with the founder profile intact — where the next tier of companies is now unlocked. So the natural loop is *grow a Coffee Shop → graduate → unlock the Intermediate tier → found a Tech Startup → grow it → sell it → unlock the Advanced tier → …*

#### Where the tier mechanics live

The advanced-tier mechanics are realized by the **existing strategic operating layers**, now gated to the company tier that thematically owns them:

- **Enterprise Corporation → IPO progression.** The `ipo` path opens the public-company layer (board alignment, quarterly guidance, shareholder votes, activist investors, stock price, shareholder confidence). See **Expanded IPO Governance**.
- **Government Contractor → public-sector progression.** The `government` path opens the compliance layer (competitive tenders, audits, certifications, delayed payments). See **Expanded Government Gameplay**.
- **Holding Company → multi-company empire.** The `holding` path plus the prestige-5 roster lets the founder run several companies, switch the live one, allocate capital, appoint executives, and acquire subsidiaries. See **Active Multi-Company Management** and the **Holding Company dashboard**.
- **Investment Fund → investment progression.** Modeled today as an Advanced operational company on the holding/portfolio rails (deal-flow pipeline + portfolio ledger + capital allocation). A distinct equity-portfolio / passive-income economy is future work (see **Tradeoffs**).

This is a **bounded, honest MVP** of the brief: the tier *gating*, *unlock progression*, *graduation loop*, and *capability model* are fully data-driven and enforced, while the advanced layers reuse the existing operating systems rather than each shipping a brand-new secondary economy.

### Founder Legacy

FlowCorp is now a founder-career simulator layered on top of the single-company simulation. A company can be sold, merged, taken public, or turned into a government contractor without ending the game. These events create founder legacy milestones and unlock new operating layers instead of showing a game-over screen.

`src/core/founderLegacy.js` owns the persistent founder profile. It tracks companies founded, companies sold, mergers completed, IPOs achieved, government contractor milestones, peak employees managed, total revenue generated, prestige, founder experience, founder level, legacy points, a company history timeline, and permanent legacy bonuses. The profile is stored inside the simulation state as `state.founderProfile`, so it is saved by the existing persistence layer and survives between companies.

Legacy timeline years start at 2019 and advance by one year per recorded milestone. Timeline events store stable ids (`companyId`, `buyerId`, event `type`) so the UI can localize them at render time.

Legacy bonuses are intentionally small permanent advantages:

- Acquisition exit: +5 starting reputation bonus for future companies.
- IPO: +10 investor confidence bonus for future public companies.
- Government contractor: +10 compliance score bonus for future government-contract companies.
- Merger: +6 hiring attractiveness bonus, applied as a future hiring-cost discount capped by the simulation.
- Legacy points also add a small starting cash multiplier for new companies.

The Founder Legacy panel shows each bonus in the unit that matches how it is actually applied, so the display is never misleading (all labels and unit suffixes are localized under `legacy.bonus.*`):

- **Flat point boosts** → `+N pts`: starting reputation, investor confidence, and compliance score are absolute additions to 0–100 scores.
- **Rate bonuses** → `+N%`: hiring attractiveness is applied as a percentage hiring-cost discount (`value / 100`).
- **Cash bonuses** → currency (`+$N`): the legacy-points starting-cash advantage is shown as the actual cash a new company inherits — `STARTING_CASH × (startingCashMultiplier − 1)` (`STARTING_CASH` is exported from `simulation.js` for this), not as the raw multiplier.

Prestige is a real unlock system with gameplay teeth, not only a stored score. `getPrestigeLevel()` derives levels 1-5, `getPrestigeUnlocks()` exposes the unlock list for the UI, and `getPrestigeUnlockEffects()` is the single source of truth for what each tier actually does. Every consumer (`createSimulation`, `enqueueNewTask`, `getHireCost`, `negotiateOffer`, offer generation) reads these effects instead of re-deriving prestige thresholds inline, so the unlocks stay in sync with the displayed list:

- **Level 1 — founder basics:** every new company starts with bonus reputation (`startingReputationBonus`) and a starting-cash multiplier (`startingCashMultiplier`) that both grow with each prestige tier. These stack on top of the legacy-point/legacy-bonus head start.
- **Level 2 — rare contracts + improved offers:** higher-value "rare contract" leads can appear (`rareContractChance`), and incoming acquisition offers gain an `acquisitionPremium` (+8%).
- **Level 3 — investor access:** elite manager candidates apply a hiring-cost discount (`eliteManagerDiscount`, stacked with the merger hiring-attractiveness bonus and capped), and IPO reputation/market-presence requirements ease.
- **Level 4 — public sector access:** government contractor reputation/stability requirements ease, and merger offers become negotiable (`mergerNegotiation`); below level 4 a merger offer's `negotiable` flag is false and the Negotiate button is disabled with a localized hint.
- **Level 5 — Founder Portfolio:** the holding / portfolio path unlocks.

Founder level **and** prestige tier are both derived from an *effective prestige* = `prestige + founderExperience * 0.3` (`getEffectivePrestige`). This means founder experience contributes to unlock pacing, not only the cosmetic level: experience earned from lifecycle stage milestones, exits, mergers, IPOs, government contracts, and strategic decisions advances the player toward the next prestige unlock through actual play, not only exit events. `evolution.js` imports `getPrestigeLevel` so path gating uses the same effective-prestige tier as the unlock list.

The in-game HUD has a **Legacy** entry point that opens the Founder Legacy panel. The panel shows founder level, prestige, legacy points, career records, permanent bonuses, and the company-history timeline. The company-select screen also shows a compact founder summary when the player is founding another company after a milestone.

#### Founder Career: Traits & Skill Tree

Two persistent founder-career layers shape every future company. They live on `founderProfile` (so the existing save persists them) and are surfaced on the **Founder** tab. Their data is in `src/data/founderTraits.js`; their derivation/effects live in `founderLegacy.js`. Both are designed to be **inert for a brand-new founder** (no traits, no spent skill points), so a first company plays exactly as before — they only ever *add* upside once earned.

- **Founder Traits (#21)** — permanent, **earned** strengths (Visionary, Operator, Sales Expert, Financial Genius). Each unlocks from a career milestone counter (`getUnlockedTraits`): founding 2 companies, completing a merger, selling a company, taking one public. An unlocked trait is a passive read-time bonus (`getFounderTraitEffects`) folded into `getCompanyEffects` using the same effect keys as company culture/specialists (e.g. Visionary +6% project value, Sales Expert −8% lead interval, Operator faster + cheaper, Financial Genius −6% costs). Unlocks are derived purely from the persisted career counters, so no extra save state is needed. Traits are display-listed (unlocked vs locked-with-hint) in `FounderTraitsPanel`.
- **Founder Skill Tree (#22)** — a **chosen** progression across four skills (Hiring, Fundraising, Automation, Negotiation). The founder earns **one skill point per founder level above 1** (`getFounderSkillPoints`: earned = `founderLevel − 1`, spent = sum of skill levels, both derived) and spends them (`upgradeFounderSkill` → `applySkillUpgrade`, bounded by `MAX_SKILL_LEVEL`). Each level is a small, bounded, permanent advantage (`getFounderSkillEffects`, `SKILL_STEP` = 5%/level): Hiring discounts `getHireCost`, Fundraising raises a new company's starting cash in `createSimulation`, Automation discounts tool costs in `getAutomationStatus`/`buyAutomation`, and Negotiation raises generated buyout offers in `updateEvolution`. All multipliers are ×1 until a point is spent, so the tree is genuinely inert until the player invests — a real allocation decision, not a passive modifier. Rendered by `FounderSkillsPanel` (levels, available points, upgrade buttons). `getMetrics` exposes `founderCareer` (`{ traits, skills, points }`).

#### Venture Capital (#23)

Before committing to a destiny path, a company can raise **private funding rounds** — a real fundraising loop with the classic VC tension (cash now vs. control and a smaller exit later). State lives on `state.venture` (`{ round, founderEquity, investorInfluence, expectation, raisedTotal, pressure, checkTimer }`, founderEquity starting at 100). The four features:

- **Raise Capital** — `raiseVentureRound` injects cash scaled by the round and reputation (`getVentureRaiseAmount`), advancing through Seed → Series A/B/C (`VENTURE_MAX_ROUNDS`). `isVentureRoundAvailable` gates raising: only when the company's **tier grants `investors`** (Intermediate and up — see **Career Tier Progression**; Beginner companies are bootstrapped only and the venture panel is hidden), while bootstrapped (no `destinyPath`), below the round cap, and below the `VENTURE_INFLUENCE_CAP` (past which investors control the company).
- **Dilution** — each round sells a fraction of remaining founder equity (`VENTURE_DILUTION`), lowering `founderEquity`. `getVentureEffects(state).exitShare` (= equity / 100) scales the founder's **acquisition cash-out** in `acceptOffer`: a bootstrapped founder keeps 100% of an acquisition, a heavily-funded one keeps far less — so raising trades a bigger eventual exit for operating cash today. (The headline valuation and founder prestige from the exit are undiluted; only the founder's cash proceeds shrink.)
- **Investor Expectations** — each raise sets a revenue-growth `expectation`. `updateVenture` reviews it on a cadence (`VENTURE_CHECK_SECONDS`): meeting it eases `pressure` and lifts reputation (and raises the bar); missing it builds pressure and dents reputation. It is deterministic, so it behaves identically during offline catch-up.
- **Board Influence** — each round adds `investorInfluence`. Through `getVentureEffects` (folded into `getCompanyEffects`), influence shortens the lead interval (investors pushing growth, up to −12%) while investor `pressure` raises the burn rate (expense, up to +12%) — so VC money accelerates growth but at a higher, pressured cost. All venture effects are neutral until the first round, so a bootstrapped company is unaffected.

The layer is surfaced by `VenturePanel` on the **Finance** screen (stage, founder equity, investor influence, pressure, revenue target, and a Raise button); `getMetrics` exposes the `venture` view. It is hidden once a destiny path is committed. This is a compact funding loop, not a full cap-table / term-sheet simulator.

### Strategic Outcomes and Career Continuation

These strategic outcomes are **career-tier-gated** (see **Career Tier Progression**): acquisition/merger require the `exits` capability (Intermediate+), IPO requires `ipo`, government requires `government`, and holding requires `holding` (all Advanced). A Beginner company has none of them; its only progression is **graduation** (see **Founder graduation**).

Company evolution outcomes no longer end the game:

- **Acquisition** (`acceptOffer` on an acquisition offer): pays the acquisition amount, records the company as acquired in founder history, grants prestige/legacy points/reputation and the starting reputation bonus, then shows a legacy transition overlay with three real continuation choices:
  - **Found next company** — clears the active company (it stays in founder history) and returns to company select; the next `createSimulation` inherits the same `founderProfile` and its prestige/legacy bonuses.
  - **Stay as transition CEO** — creates `acquisitionTransition` objectives: morale, **buyer trust**, client retention, systems integration, and remaining transition time (all surfaced in the Evolution panel). Transition decisions trade cash, morale, retention, and integration speed; the transition completes successfully when morale and client retention hold, granting extra founder progress.
  - **Negotiate better terms** — a **one-time** attempt (guarded by `legacyEvent.negotiated`, so the payout/prestige reward cannot be farmed by repeated clicks). Success (gated on prestige level ≥ 2, or high reputation + profit) raises the payout, cash, and founder progress. Failure raises integration overhead and records a `buyerTrustPenalty` on the event, which lowers the *starting buyer trust* if the player then chooses the transition path — so a botched negotiation is felt later through faster client churn. The overlay disables the button and shows a localized success/failure note after the attempt.

  Regenerating new acquisition/merger offers after accepting is blocked by `destinyPath`.
- **Merger** (`acceptOffer` on a merger offer): keeps the merged company running, records the merger, grants founder progress and hiring-attractiveness bonus, and unlocks an `integration` operating layer with culture conflict, staff **morale**, duplicated departments, restructuring debt, integration progress, and the expanded fields below. Integration health feeds the live sim: unresolved culture conflict, low morale, corporate politics, and leadership conflict add a processing-time **drag** (`getIntegrationDrag`) that throttles throughput — but a *well-run* integration earns a **synergy bonus** that flips the merger from net cost to net gain. So merger decisions affect operations, not just abstract numbers.

  **Expanded Merger Gameplay (#20).** The integration layer is a real two-org-becoming-one loop, not just a decaying penalty. Six merger decisions rotate while the integration needs attention (`integrationNeedsAttention`: duplicate departments remain, or politics/leadership tension is still elevated):
  - **Department Integration** — `duplicatedDepartments` are merged one at a time (via the `mergeDepartments` decision or as `progress` completes in `updateIntegration`); each completed integration increments `integratedDepartments` and adds **synergy** — a concrete, permanent payoff for consolidating.
  - **Leadership Conflicts** — `leadershipConflict` (0–100) is tension between the two orgs' overlapping leaders. It eases slowly and is resolved faster by the `leadershipOverlap` decision: **promote one** (decisive — cuts leadership conflict but breeds resentment → more politics), **co-leadership** (calms conflict + politics, slower), or an **external hire** (a neutral leader defuses both, for cash).
  - **Corporate Politics** — `politics` (0–100) is factionalism that drifts toward the friction between the orgs (`(cultureConflict + leadershipConflict) / 2`), so unresolved conflict *breeds* politics. High politics adds throughput drag and suppresses synergy. The `corporatePolitics` decision defuses it: **mediate** (cash — strongest cut + morale), **consolidate power** (heavy-handed — cuts politics but costs morale/culture), or an **open forum** (free, modest, slow).
  - **Synergy Bonuses** — `synergy` (0–100) is the merger upside, earned over time (`updateIntegration` eases it toward a target from `integratedDepartments`, low culture/politics/leadership conflict, high morale, and low restructuring debt). `getSynergyEffects` turns it into a read-time bonus folded into `getCompanyEffects` — up to **+18% payout, −12% running costs, +12% processing speed**. It is zero until earned, so a chaotic merger feels the drag first and a well-integrated one is rewarded.

  This is still an MVP operating layer; it does not remodel the department graph into a true combined-company org chart (the duplicate/integrated counts are abstract).
- **IPO** (`chooseDestiny("ipo")`): keeps the company running and unlocks `publicCompany` state: stock price, shareholder confidence, quarterly expectations, previous quarter revenue, quarter timer, analyst reputation, investor pressure, **board alignment**, the **guidance** stance, **board seats granted**, and any active **activist** campaign. The **quarterly review** (`acceptQuarterPlan`) grades five shareholder criteria — revenue target, profit, revenue growth, reputation, and operational health (bottleneck severity) — and moves stock price, shareholder confidence, and investor pressure proportionally to how many were met (`lastQuarterScore`), instead of a binary pass/fail. Beyond the review, the public company is **governed**, a recurring decision loop (see **Expanded IPO Governance** below): the Board of Directors, Quarterly Guidance, Shareholder Votes, and Activist Investors. A public company also *feels* different in the live economy: shareholder confidence applies a small per-payout premium or discount (`getPublicCompanyValueFactor`), so managing the market affects revenue. IPOs add founder prestige, legacy points, and investor confidence bonus. This is a playable public-company pressure loop, not a full stock-market simulation.

  **Expanded IPO Governance (#18).** The public-company layer is a real governance loop, not a single passive metric. `updatePublicCompany` advances it each tick and `updateStrategicEventGeneration` surfaces one decision at a time (priority: end-of-quarter review → active activist → misaligned board → a rotating governance event), all using existing levers (cash, reputation, stock price, shareholder confidence, investor pressure) plus the bounded `boardAlignment`:
  - **Board of Directors** — `boardAlignment` (0–100) is the board's confidence in the CEO. It drifts from market performance (confidence + profit momentum); a misaligned board (`< 40`) adds investor pressure, a strongly aligned one (`> 70`) relieves it, and when it falls below `BOARD_MEETING_ALIGNMENT_THRESHOLD` the board calls an **`ipoBoardMeeting`** — a vote of confidence resolved by a cash **buyback** (realigns + reassures), **granting a board seat** (cheap and strongly realigning, but a tracked control concession in `boardSeatsGranted`), or **defending the strategy** (free, but only wins the board over from a position of strength).
  - **Quarterly Guidance** — the **`ipoGuidance`** decision sets a stance (conservative / balanced / aggressive) that scales both the next quarterly target (`GUIDANCE_MULTIPLIER`) and the size of the quarterly-review reward/penalty swing (`GUIDANCE_SWING`). Aggressive guidance excites investors and amplifies the review but raises pressure and the stakes; conservative lowers the bar but reads as unambitious to the board.
  - **Shareholder Votes** — the **`ipoShareholderVote`** decision tables a shareholder proposal: **back it** (a cash dividend that lifts confidence and the board), **negotiate** (a modest concession), or **put it to a vote** (free, but you only win — pressure down — from strong confidence; weak confidence loses the vote and costs confidence/alignment).
  - **Activist Investors** — sustained high investor pressure (`> ACTIVIST_PRESSURE_THRESHOLD`) plus weak confidence (`< ACTIVIST_CONFIDENCE_THRESHOLD`) summons an activist with a demand (`activist.demandId`), which applies ongoing pressure until resolved by **`ipoActivist`**: **settle** (pay the demand — relieves pressure, dents reputation), **fight the proxy battle** (free, but you only win from a strong board + confidence; losing forces a board-seat concession), or **buy them out** (an expensive buyback that defuses them and lifts the stock). So activists are a *consequence* of poor market management, not random noise.
- **Government contractor** (`chooseDestiny("government")`): keeps the company running and unlocks `compliance` state: national contracts, audit risk, compliance score, public reputation, a delayed contract payment (`pendingPayment` + `paymentTimer`), audit accumulation (`auditPressure`, `lastAudit`), and the expanded bidding/audit-history fields (`contractsLost`, `lastBid`, `auditsRun`/`auditsPassed`/`auditsFined`, `lastFine`). It is a stable-but-bureaucratic operating layer with a real risk/payment loop (see **Expanded Government Gameplay** below):
  - **Delayed payments:** won contracts deposit into `pendingPayment` and land in cash/revenue after `GOV_PAYMENT_DELAY_SECONDS`. A weak compliance score (< 60) has part of the payment withheld — the penalty/delayed-payment mechanic.
  - **Audits fire automatically** in `updateCompliance`: `auditPressure` grows faster the higher the audit risk, and when it crosses `AUDIT_PRESSURE_THRESHOLD` an audit runs. A compliance score ≥ `AUDIT_PASS_SCORE` passes cleanly (small reputation gain, risk drops); below it the company is **fined** (cash + reputation hit). This is deterministic (no per-tick randomness), so it behaves identically online and during offline catch-up, and it makes audit risk + compliance score genuine checks rather than decorative numbers.

  It adds founder prestige, legacy points, and compliance bonus.

  **Expanded Government Gameplay (#19).** The contractor layer is a real contracting loop, not a hand-out. `updateStrategicEventGeneration` rotates six government decisions for a contractor (contract tender, audit notice, compliance upgrade, certification, whistleblower, deadline pressure):
  - **Real Contract Bidding + Procurement Competition** — a `govContractOffer` carries a **tender** (`{ value, rivals, competition }`, built by `makeTender`, deterministic from elapsed time) shown in the decision card. The player bids with a **stance** — **aggressive** (undercut: best odds, thinner payout, more audit risk), **standard**, or **premium** (bid on quality: bigger payout + reputation, harder to win) — or declines. The win is decided **deterministically** against the rival field: `complianceScore·0.4 + reputation·0.4 + stance-bonus ≥ GOV_TENDER_BASE_THRESHOLD + rivals·GOV_TENDER_RIVAL_WEIGHT`. Winning adds a national contract and a stance-scaled delayed payment; losing records `contractsLost` and a small standing knock. So contracts are *won against competitors*, not awarded — bid stance, compliance, and reputation all matter, and a crowded tender is genuinely harder. `lastBid` records the outcome.
  - **Audits** — the automatic audit loop is deepened: the fine now **scales with the contract book** (`1 + nationalContracts·0.1` exposure), and `auditsRun`/`auditsPassed`/`auditsFined`/`lastFine` track the history. The audit-prep and deadline-pressure events still let the player trade cash/reputation to manage audit risk ahead of the next audit.
  - **Compliance Events** — two new event types make compliance an active choice: **`govCertification`** (pursue an accredited certification — costly, but a large compliance + reputation gain that lowers audit risk; or skip it and accept more scrutiny) and **`govWhistleblower`** (investigate an internal report — costs cash + a short-term public hit but strengthens compliance and cuts risk; or downplay it cheaply at higher audit risk and weaker compliance).

  It remains a compact compliance/procurement layer — bidding, audits, and certifications are modelled as bounded decisions and metrics, not a full procurement or contract-execution simulator.
- **Founder Portfolio / serial entrepreneurship**: after a successful milestone, the player can found another company. The previous company remains in founder history and the new simulation starts with the same `founderProfile`. At prestige level 5 the `holding` path commits to the **Founder Portfolio** — deliberately scoped as an **honest MVP (Option A)**, not full holding-company management. It is a **read-only ledger** of the founder's companies as legacy assets: the Evolution panel lists each company with its localized name, role (Operating / Acquired / Merged / Public / National contractor / Archived from its lifecycle `status`), and valuation, plus a portfolio summary (company count and total valuation), and marks the company that is operating now. The asset list is derived **live** from `founderProfile.companies` each render (via `getPortfolioView`), so valuations and roles stay current rather than reflecting a snapshot frozen at unlock time. The path id stays `holding` internally, but **all player-facing text says "Founder Portfolio"**.

#### Active Multi-Company Management (#24)

Once the founder reaches the **prestige-5 "business empire" tier** (`getPrestigeLevel(founderProfile) >= 5`), the read-only portfolio becomes an actively-managed **company roster**: the founder can run several companies at once and **switch the live company**, and found additional companies that run alongside the others. This is the bounded realization of the formerly-deferred "Option B" — it is **orchestration only; the simulation core is unchanged**, and a single-company founder is completely unaffected (the common case keeps the original single-company behaviour byte-for-byte).

The honest constraint: **one company is "live" (ticking) at a time**. The active company is the App's `simulation`; the others are paused snapshots held in a `background` roster. Switching reuses the existing offline machinery — the leaving company is snapshotted with `lastActiveAt = now`, and the incoming company is advanced with `simulateOffline` for the **real elapsed time it was paused**, so over wall-clock time every company progresses; it is just computed lazily on switch rather than every frame (which keeps the frame rate stable regardless of roster size). The **founder profile is shared**: it is carried forward from the leaving company onto the incoming one on every switch, so career progress (prestige, experience, per-company snapshots keyed by company type) stays consistent across the roster. The roster is keyed by company type (one live company per type). `App.jsx` owns this (`switchCompany`, `foundAdditionalCompany`, `allocateCapital`). Notifications are a single shared founder inbox. Full *simultaneous* per-frame simulation of every company is still out of scope (the lazy catch-up model is the deliberate, performant MVP).

**Internal Synergies (#25).** Running several companies at once shares executives, employees, resources, and clients across them. `App.jsx` stamps `state.portfolioCount` (the live roster size) onto a company when it becomes active, and `getInternalSynergyEffects(state)` turns it into a small, bounded read-time bonus folded into `getCompanyEffects` — richer projects (`taskValue`), lower running costs (`expense`), more inbound work (`leadInterval`), and faster processing (`speedMultiplier`), scaling with each additional company and capped at five. It is exactly neutral for a single company (and for any pre-roster save), so a solo founder is unaffected. The bonus represents the shared executives/resources that a fuller per-subsidiary executive system would model — that depth is future work.

**Holding Company dashboard (#26).** The `HoldingPanel` on the Founder tab is the empire view, covering all four holding pillars:
- **Subsidiaries** — the roster, each with its cash, live/paused state, and executive status.
- **Capital allocation** — `allocateCapital` moves a bounded quarter of the active company's cash into a chosen subsidiary (funding a weak company from a strong one is a real cross-company decision).
- **Executives** — `appointExecutive(state)` installs + fully enables the auto-managing Operations Manager on a company (the active one, or a paused subsidiary), **bypassing the manual-first Small-Business gate** that applies when a player hires their own manager. Because the manager runs in `updateManagers` — including during offline catch-up — an executive-run subsidiary keeps performing on its own while it is paused, which is the point of delegating across a portfolio; the executive draws the usual manager salary (a real ongoing cost). `App.appointExec(companyId)` applies it to the active sim or the targeted background record.
- **Acquisitions** — founding a company of an un-held type adds it as a new subsidiary.

It is a compact holding-company MVP — capital flows, delegated executives, and a shared-resource synergy over the roster — not a full capital-markets / org-chart simulator.

**Offer generation respects the company path and career tier.** Strategic acquisition/merger offers (the `activeOffer` modal) are produced by `evaluateOfferGeneration` in `evolution.js`, which returns `null` whenever the company's tier lacks the `exits` capability (so a Beginner company never receives an offer) **or** whenever `state.destinyPath` is set. Both guards live inside offer generation itself, not only in the caller, so offers can never appear for a Beginner company and can never regenerate once any company has committed to a destiny: an acquired/merged/public/government/holding company stops receiving normal buy-out offers and instead only sees the strategic events of its committed path (integration events for mergers, quarterly/investor events for public companies, audit/compliance/deadline events for government contractors). The kind of offer (`acquisition` vs `merger`) and its negotiability (merger negotiation requires prestige level 4) are also decided here from the current state.

The Evolution panel is the UI for post-milestone operating layers. When `publicCompany`, `integration`, `compliance`, `acquisitionTransition`, `portfolio`, or `strategicEvent` exists, it shows the relevant metrics and decisions under the strategic layer UI.

### Player Guidance & Onboarding

The first minutes of play are an onboarding/clarity problem, not a balancing one: a new player must always know (1) where money comes from, (2) what is limiting growth, (3) what to do next, and (4) what goal to pursue — and must never get permanently stuck. `src/core/guidance.js` is a **pure** module (reads `state` + the derived `metrics`, returns plain data) that powers the cooperating systems below. Pure *views* and goal-transition helpers (advisor, income breakdown, goal, growth status, next unlock, micro-goal assignment/progress) are consumed by `getMetrics` or `updateGuidance`; *mutations* (goal rewards, persisted goal counters, emergency funding, loan repayment) happen in the tick so they persist and also apply during offline catch-up. Player-triggered recovery actions (`takeFounderLoan`, `toggleIntakeThrottle`) live in `simulation.js` like other actions. Guidance state includes `completedGoals`, `activeMicroGoal`, `microGoalCursor`, `lastMicroGoalId`, `microGoalCompletions`, `solvedBottlenecks`, `resolvedCeoSituations`, `goalRewardSequence`, `lastGoalReward`, `emergencyFundsUsed`, `emergencyFundCooldown`, `debt`, `loansTaken`, and `intakeThrottled`.

- **CEO Advisor** (`getAdvisorRecommendation`): returns the single **highest-priority** recommendation as `{ id, tone, vars, action }`. A strict priority order — cash crisis → overloaded bottleneck (hire, or rebalance if cash-tight) → low cash → very-early "watch the flow" → affordable automation is the better next buy → tight (not yet overloaded) department → healthy/grow-toward-next-stage. `vars` carry stable ids (`department`, `tool`, `stage`) the UI localizes. `action.type` (`hire`/`rebalance`/`automation`/`evolution`/`none`) maps to a one-tap button in the `AdvisorPanel` so the player acts without hunting (Recommended Action Buttons). Messages are short and update every tick.
- **Income Breakdown + Money Story** (`getIncomeBreakdown`): answers "where does money come from, why did it change, and what should I fix?" in `$/min`. `net = grossIncome − expenses` remains the real forward-looking arithmetic; `contributors` attribute supporting throughput across departments and `losses` quantify bottleneck revenue loss plus payroll wasted on idle capacity. A bounded history of actual paid projects (`state.recentRevenue`) adds adjacent 60-second revenue windows, a rising/falling/steady reason, the top-paying client/project pair, the largest current money leak, exact bottleneck payout reduction, and the expected effect of the current Advisor action. These are pure derived views; they do not alter economy math.
- **Goal System** (`GOALS`, `MICRO_GOALS`, `getGoalView`, `createNextMicroGoal`, `advanceMicroGoal`, `checkGoalCompletion`): the ordered onboarding chain remains `firstHire` → `serveClients` → `unlockAutomation` → `reachSmallBusiness` → `growRevenue`, teaching hiring, paid work, automation, and company stages. After that chain, a deterministic rotating micro-goal deck always supplies one short target: complete three new projects, hold client satisfaction at 85+ for 20 seconds, clear an active bottleneck, restore positive cumulative profit, or resolve a waiting CEO situation. Every assigned goal captures a baseline, situational goals enter the candidate pool only when actionable, the previous goal is avoided when another candidate exists, and the three-project goal is the universal fallback. Small rewards (150–350 cash and 1–3 reputation) remain useful without dominating the economy. The tick grants rewards once, records completion counters, assigns the next target immediately, and increments `goalRewardSequence`; the existing transient action-feedback toast announces the reward. `GoalBar` remains the only persistent goal UI and shows one localized objective, responsive progress, and reward, preventing task-list overload.
- **Bottleneck Highlighting**: the worst department is emphasized in several places — a **"Main bottleneck"** badge + impact `−X% revenue` in the status strip, the canvas warning marker/pulse, the `is-primary`/`is-hot` department chip, and the Advisor's recommended hire action. The limiting department is obvious within seconds.
- **Growth-Block Diagnostics + Alternative Solutions** (`getGrowthStatus`, `getBottleneckSolutions`): answers "why am I stuck?". When growth is blocked (overloaded bottleneck, low cash, or a soft-lock) the `GrowthBlockPanel` shows the reason, a ranked **Growth Analysis** of the biggest constraints with `−X%` impact (`blockers`: bottleneck / low cash / idle capacity), and **2–3 alternative solutions** so the player never assumes "hire" is the only fix. Each solution carries an estimated `~%` throughput effect and a cost, exactly one is flagged **Recommended** (highest-estimate affordable purchase, else a free option), and the options include: hire, buy the next automation, **reduce incoming workload** (free `intakeThrottled` toggle that slows leads so a queue can drain), and **wait & accumulate cash**. This is also where the Advisor "explains tradeoffs" (e.g. hire ~33% vs automation ~45%).
- **Next Unlock** (`getNextUnlock`): the `NextUnlockBar` always shows the next lifecycle stage, its single **binding** (least-complete) requirement, and a reward describing what reaching it unlocks — so there is always a meaningful near-term target distinct from the cash-reward Goal.
- **Economic Recovery / Soft-Lock Prevention**: the game is never permanently unwinnable. `isSoftLocked` flags "no affordable meaningful action and losing money". Three recovery layers exist: (a) the automatic **Early-Game Safety Net** (`isEmergencyEligible` + tick) — a bounded emergency grant (`EMERGENCY_GRANT`, up to `MAX_EMERGENCY_FUNDS`, cooldowned) that fires only while still early (before `growing-company`) when cash drops below `EMERGENCY_CASH_THRESHOLD`; (b) the player-triggered **Founder Loan** (`takeFounderLoan`, surfaced in the Growth-Block panel when cash-low / soft-locked) — `FOUNDER_LOAN_AMOUNT` cash now, repaid with interest (`FOUNDER_LOAN_INTEREST`) over time at `FOUNDER_LOAN_REPAY_PER_SEC` (counted as expense for transparency), one outstanding at a time up to `MAX_LOANS`; and (c) the player-triggered **Recovery Contract** (`takeRecoveryContract`, also surfaced in the Growth-Block panel when cash-low / soft-locked) — a small upfront advance (`RECOVERY_CONTRACT_ADVANCE`) plus `RECOVERY_CONTRACT_LEADS` high-value client projects injected into the pipeline (`RECOVERY_CONTRACT_VALUE_MULT`), bounded by `MAX_RECOVERY_CONTRACTS` and a cooldown. Unlike the loan (debt) or grant (free cash), it restores momentum with *paying work*. Recovery helps but does not remove consequences (the loan's debt is a real drag; recovery work still has to be delivered).
- **First-Run Mini-Chapter** (`getFirstRunChapter` + `FirstRunChapter`): a compact, non-blocking Company-tab chapter that teaches the first 2–3 minute loop through live simulation milestones instead of a manual. It derives a single current chapter step from real state and metrics: watch the first client work enter, identify the first bottleneck, hire in that bottleneck, watch the queue stabilize, see the first paid project, open the first automation step, then move to the Growth tab. It reuses the same action contract as the CEO Advisor (`hire`, `automation`, `evolution`, or no action), so the player always has one clear next action without introducing a separate tutorial system or mutating simulation state from the UI. While the mini-chapter card is visible, the Company tab suppresses the separate CEO Advisor and Growth-Block coaching panels to avoid competing recommendations; the goal bar, status strip, office, department chips, clients, and action dock remain visible and playable. The card is skippable and the dismissal is remembered in `localStorage` (`flowcorp.firstRunChapter.dismissed.v1`); if ignored, it naturally disappears once the starter loop is complete.
- **Onboarding Flow**: a concise five-step first-run overlay (`OnboardingOverlay`) — watch the flow → find the bottleneck → hire → automate → grow — shown once per player and remembered in `localStorage` (`flowcorp.onboarded.v1`). It is intentionally short, not a long tutorial; the mini-chapter carries the actual in-game follow-through after the overlay is dismissed.
- **Action Feedback** (`core/actionFeedback.js` + `ActionFeedbackToast`): important actions produce one immediate, short, localized result message without adding a permanent panel or inbox noise. The UI captures pure before/after snapshots around hiring, staff rebalancing, automation purchases, founder loans, and recovery contracts, and only displays feedback when the simulation confirms the action succeeded. The same snapshot comparison detects paid-project completion and the transition from an overloaded department to a cleared bottleneck. Messages explain the concrete effect (department capacity change, automation speed/capacity, cash/debt, or paid revenue); paid-project messages are rate-limited to once per eight simulation seconds at high throughput. The single mobile toast replaces itself, sits above the bottom navigation, announces through `aria-live`, wraps long English/Russian text, and dismisses after 3.4 seconds. Feedback is transient React presentation state and is never persisted in the save.

#### Guidance Modes

All of the above guidance is **opt-out**: guidance should help, never feel mandatory. A new player wants coaching; a veteran wants freedom. A **Guidance Mode** setting controls how much proactive guidance UI is shown, **without changing the simulation at all** — it is pure presentation, so casual and advanced playstyles share the exact same game. The mode lives in `src/guidance/guidanceMode.jsx` (`GuidanceModeProvider` / `useGuidanceMode`, wrapping `App` next to `LanguageProvider`) and is persisted to `localStorage` under `flowcorp.guidance.v1` (defaults to Full). `getGuidanceFlags(mode, { softLocked })` is a pure function returning per-element visibility flags that `GameScreen` computes once and threads into the Company / Growth / Finance tabs.

| Element | Full (default) | Minimal | Hardcore |
| --- | --- | --- | --- |
| CEO Advisor + recommended action (`AdvisorPanel`) | ✅ | — | — |
| Goal System (`GoalBar`) | ✅ | ✅ | — |
| Main bottleneck alert (`StatusStrip`) | ✅ | ✅ (name only) | — |
| Bottleneck explanation (queue/growth/util + revenue impact) | ✅ | — | — |
| Growth Analysis + alternative-solution buttons (`GrowthBlockPanel`) | ✅ | — | — |
| Next Unlock (`NextUnlockBar`) | ✅ | ✅ | — |
| Income Explanation (`IncomeBreakdown` tips) | ✅ | — | — |
| Recovery suggestions (founder loan / recovery contract) | ✅ | only if soft-locked | only if soft-locked |

- **Full Guidance (default)** — the current beginner experience; the game actively teaches. Remains the default for new users.
- **Minimal Guidance** — only essential direction: current goal, the main bottleneck (which department, without the impact explanation), and next unlock. The game stops coaching every decision (no advisor, recommended-action buttons, growth analysis, or income tips).
- **Hardcore** — no proactive guidance at all. The player sees only the company, employees, departments, finance, inbox, and founder systems, and must figure out growth themselves.

**Hardcore soft-lock exception.** The simulation's soft-lock prevention is *never* disabled by the mode. The automatic Early-Game Safety Net always runs (it lives in the tick, not the UI), and the player-triggered recovery tools (founder loan, recovery contract) stay reachable in **every** mode whenever the company is genuinely soft-locked (`metrics.growth.recovery.softlock`) — surfaced both in the `GrowthBlockPanel` (recovery-only, with the analysis hidden) and the Finance screen. So a guidance mode can hide hints, but it can never make the game permanently unwinnable. The Guidance Mode selector lives in Settings under a **Gameplay** group (localized under `settings.gameplay` and `guidance.*`).

### Client System

Work is not anonymous: every Lead is a **real client project**. `src/data/clients.js` holds an id-based client roster — each client has an `industry` and a `budget` multiplier (the roster averages ~1.0 so the economy stays balanced) — plus a list of project ids. Client names, industries, and project names are localized (`client.<id>`, `clientIndustry.<industry>`, `project.<id>`). When `enqueueLead` creates a Lead it assigns a random client + project, sets the task's `value` to `baseTaskValue × client.budget × (rare? 1.65) × valueMult`, and stamps a delivery `deadline` (`bornAt + CLIENT_DEADLINE_SECONDS`).

On completion, **client satisfaction** scales the payout: on-time delivery pays the full budget; a late delivery (a backed-up, bottlenecked pipeline) drops satisfaction toward a 60 floor and pays a reduced share (0.7–1.0×), and the rolling company-wide `clientSatisfaction` (an EMA) falls — so the client layer reinforces the bottleneck lesson with a felt consequence. The deadline window is generous, so a healthy company always delivers on time.

**Client reputation effects** (`getClientReputationEffects`) make that satisfaction *matter* — it feeds three real gameplay rewards (centred so ~73 is neutral, bounded so it never dominates):

- **Bigger / better projects** — `budgetMultiplier` (0.85–1.15×) scales every new lead's budget (`enqueueLead`). A happy client base wins larger contracts.
- **More referrals** — `leadIntervalMultiplier` (1.1–0.9×) shortens the lead interval (`getLeadInterval`), so satisfied clients refer work faster.
- **Higher acquisition offers** — `offerPremium` (≈−6%…+10%) is applied to generated buyout offer amounts in `updateEvolution`, on top of the prestige premium, so a satisfied client base raises the company's buyout valuation.

`getMetrics` exposes a `clients` view (in-flight projects with client/industry/project/budget and an on-track/late flag, the satisfaction score, the reputation `tier`, and the current effect percentages) rendered by the collapsible **Active Clients** panel, which states the effect plainly (e.g. "Happy clients win bigger projects, more referrals, and higher buyout offers" + `Projects +15% · Referrals +10% · Offers +10%`). This is an MVP client *flavor + budget + deadline + reputation* layer attached to the existing task flow, not a full client-relationship or bidding system.

### CEO Inbox & Situation Cards

To make running the company feel like CEO decision-making, the Inbox surfaces short message-style choices during normal play, distinct from passive notifications and post-milestone strategic events. `src/data/ceoSituations.js` is the source of truth: each situation declares a stable id, weight, optional eligibility conditions, icon, 2–3 choices, and each choice's existing-lever effects. `updateCeoInbox` filters eligible situations and uses a deterministic weighted rotation, surfaces **one** pending decision at a time on `CEO_INBOX_COOLDOWN_SECONDS`, and yields to offers, legacy events, strategic events, or an already-pending CEO decision so the player is never flooded.

The registry retains the four everyday messages (Client Complaint, Manager Recommendation, Employee Request, Investor Question) and adds five dramatic narrative cards:

- **B1-U-03 · Archive Tape · Media** — contain a client-media leak, call the client, or publish first.
- **O2-C-11 · Midnight Launch · Operations** — ship an unstable release, delay, or cut scope.
- **P1-H-07 · The Envelope · People** — counter a key employee's rival offer, promote a deputy, or accept the resignation.
- **F3-A-02 · Red Invoice · Finance** — refund, prove the invoice, or collect immediately.
- **M2-G-09 · The Spike · Market** — accept viral demand, take only premium work, or open a waitlist.

`state.ceoDecision` still holds the pending decision and remains backward-compatible with old saves. Narrative decisions add `{ code, channel, icon, narrative: true }` beside the existing `{ id, type, choices }`; no second queue or decision model is introduced. `chooseCeoDecision` looks up the selected choice in `CEO_CHOICE_BY_ID`, applies it through one generic interpreter, clears the slot, and restarts the cooldown. Declarative effects reuse cash, reputation, client satisfaction, employee happiness, salary pressure, headcount, the `expense`/`leadInterval`/`taskValue` modifiers, real lead injection (queue pressure), compliance risk when present, and dynamic-event cooldown (future-event timing). There is no new economy.

`CeoInboxCard` renders narrative cards compactly with code/channel metadata, sender, dramatic message, a short context line, and vertically stacked choice buttons. Every button states its business consequence before selection. After selection, the existing transient `ActionFeedbackToast` repeats that consequence, so the result remains visible even though the pending card clears. Everyday messages use the same component without narrative metadata. Acquisition offers and government audits remain their own decision flows.

### Daily / Weekly Company Report

The report is a short-horizon progression hook using a "company day/week" metaphor rather than real calendar boundaries. `src/core/companyReport.js` owns the pure snapshot/delta model, while `simulation.js` owns the persisted cadence. A regular report is generated every `COMPANY_REPORT_INTERVAL_SECONDS` (90 seconds of simulated play). Only one can be pending: while an unread report exists, the timer pauses and no reports stack; reviewing it clears the card and the next full interval begins. This keeps the summary recurring but non-noisy.

Each report compares a baseline snapshot with the current company and includes:

- revenue earned, period profit, cash change, completed projects, and ending client satisfaction;
- the largest active bottleneck and its queue;
- one ranked **best improvement** (stage advance, automation, hiring, satisfaction recovery, queue reduction, delivered projects, or revenue);
- one ranked **new risk** (negative cash, bad event, satisfaction decline, worsening bottleneck, queue growth, low morale, loss, or cash drop), with an explicit all-clear fallback;
- the current CEO Advisor recommendation as the recommended next action.

Regular reports are non-blocking `CompanyReportCard` items at the top of the **Inbox**. They give the Inbox nav a pending dot, wrap all rows for narrow phones, and offer both **Reviewed** and the Advisor's existing one-tap action when actionable. The report card uses the same stable ids as the rest of the game and does not add a second recommendation system.

Meaningful offline progress uses the same report schema. `simulateOffline` captures the full before/after period and shows the existing **While you were away** sheet as an offline company report, including improvement, risk, bottleneck, and recommended action. A gap must be at least `MIN_OFFLINE_REPORT_SECONDS` (30 seconds) and contain meaningful movement (projects, revenue, a material cash change, or a risk) before it interrupts the player. The full-period offline report supersedes any 90-second report generated inside catch-up, clears that stale pending card, and restarts the regular cadence. Trivial background switches still advance the simulation but show no overlay.

### Dynamic Events

To create reasons to return, world events happen **to** the company on a cooldown (`updateDynamicEvents`, `DYNAMIC_EVENT_COOLDOWN_SECONDS`) — good and bad, applied automatically (no decision card) and surfaced via the notification inbox. Unlike the CEO Inbox (player choices), these are events the player reacts to afterward. `DYNAMIC_EVENTS` (exported from `simulation.js` for testing) is a weighted, data-driven list with an `apply(state)` mutation and a `severity`:

- **Employee Quit** (bad) — removes one employee from the least-pressured department (capacity loss; re-hire needed).
- **Major Client Complaint** (bad) — client satisfaction drops sharply.
- **Server Outage** (bad) — an incident cost in cash plus a small satisfaction hit.
- **Viral Success** (good) — injects high-value client leads and raises reputation.
- **Negative Press** (bad) — reputation and satisfaction drop.
- **Industry Boom** (good) / **Industry Downturn** (bad) — a demand surge (extra leads + reputation) or a reputation dip.

Each fire records `state.lastDynamicEvent = { id, type, severity, at }`; the `dynamicEventGood` / `dynamicEventBad` notification rules detect it (deduped by event id, fired once) and the inbox shows the localized event via `vars.eventType`. Generation is skipped while a heavier decision (offer / legacy event) is pending so an auto-event never lands on a modal moment. All effects use existing levers (headcount, cash, reputation, client satisfaction, lead injection) — no new economy.

### Operations Manager

To reduce micromanagement as the company grows, the player can hire an **Operations Manager** that automates routine operations, freeing the player to focus on strategy. It unlocks at the **Small Business** stage (`isManagerAvailable`), costs an upfront fee (`managerHireCost` = `baseTaskValue × MANAGER_HIRE_COST_MULT`) and a recurring salary (`baseTaskValue × MANAGER_SALARY_RATE`, added to `getExpensePerSecond` so it shows in expenses / income breakdown). `state.manager` holds `{ hired, autoHire, autoRebalance, autoAutomate, actionTimer }`.

`updateManagers` runs each tick but acts on a cadence (`MANAGER_ACTION_INTERVAL`), performing at most one routine action per interval and never spending below `MANAGER_CASH_BUFFER` so it cannot bankrupt the company. Enabled policies, in priority order:

- **Auto-automate** — buys the next affordable unlocked automation tool.
- **Auto-hire** — hires into an overloaded bottleneck when cash allows.
- **Auto-rebalance** — moves idle capacity to the bottleneck (free), keeping queues healthy.

Queue management is the emergent result of these three. `hireManager` / `toggleManagerPolicy` are the actions; `getMetrics` exposes the manager view (`available`, `hireCost`, `salaryPerSecond`, policy flags) rendered by `ManagerPanel` — a hire button before purchase, then a collapsible with the salary and per-policy on/off toggles. This is a single company-wide manager (an honest MVP); per-department managers with individual scopes are future work.

### Company Culture & Special Employees

Two strategic-flavor systems share one read-time **effect layer**: `getCompanyEffects(state)` aggregates the chosen culture's and signed specialists' effects into multipliers (`taskValue` / `expense` / `leadInterval` / `speedMultiplier`) and additive bonuses (`accuracyBonus` / `satisfactionBonus`), folded into the same read points as the other modifiers (`completeTask` payout + satisfaction, `getProcessingSeconds`, `getAccuracy`, `getLeadInterval`, `getExpensePerSecond`). Because effects are applied at read time, culture/specialists can change without compounding into persistent state.

- **Company Culture** (`src/data/culture.js`, `chooseCulture`): a strategic, re-pickable choice of one of five cultures (Innovation Driven, Quality First, Fast Growth, Cost Efficient, Customer Obsessed). Each grants a **bonus and a matching weakness** (e.g. Fast Growth: faster intake but higher burn; Cost Efficient: leaner payroll but lower project value), and unlocks one **signature dynamic event** — each culture tags a positive event (`breakthrough`, `qualityAward`, …) that enters the dynamic-event pool only while that culture is active. `CulturePanel` lists the cultures with their bonus/weakness; `metrics.culture.active` is the current id.
- **Special Employees** (`src/data/specialists.js`, `hireSpecialist`): rare star hires (Rockstar Salesperson, Industry Veteran, Ex-Google Engineer, Operations Genius). Once the company is established (Small Business), `updateSpecialists` surfaces **one** un-signed specialist at a time on a long cooldown (`SPECIALIST_COOLDOWN_SECONDS`) as `state.availableSpecialist`, raising a `specialistAvailable` notification. Signing one (`specialistCost` = `baseTaskValue × costMult`, one-time) adds it to `state.specialHires` for a persistent perk and starts the cooldown to the next. `TalentPanel` shows the current offer (sign button) and the signed roster; it's hidden until something is offered or signed.

### Employee Happiness & Retention

`state.employeeHappiness` (0–100, EMA) models morale. `updateHappiness` drifts it toward a target lowered by **burnout** (overloaded departments) and growing **salary expectations** (`salaryPressure`, accumulating over time). Morale has real teeth: a motivation factor (`getHappinessSpeedFactor`, 0.9–1.05×) scales processing speed in `getProcessingSeconds`, and **retention** is tied in — when morale is low (< 50) the `employeeQuit` dynamic event is weighted 3× more likely, so unhappy teams lose people. The player counters this with **`giveRaise`** (raises/promotions): a cash cost scaling with headcount (`raiseCost`) that lifts morale (`RAISE_HAPPINESS_BOOST`) and resets salary expectations. `getMetrics` exposes a `morale` view (happiness, raiseCost, tier) rendered by `MoralePanel` (a meter + "Give raises" button). This is a compact company-wide morale layer, not per-employee simulation.

### Competitor Companies

A lightweight rival event stream makes the market feel alive. `src/data/competitors.js` holds a named competitor roster and the rival event types. `updateCompetitors` fires one event on a cooldown (`COMPETITOR_COOLDOWN_SECONDS`): a competitor **launched a product** or **poached talent** (mild reputation / satisfaction pressure on the player) or **was acquired** (you stand out — a small reputation gain). It records `state.lastCompetitorEvent = { id, type, competitorId, severity, at }`; the `competitorEvent` notification rule surfaces it (deduped by event id), localized via `vars.competitorId` (→ `competitor.<id>`) and `vars.compType` (→ `competitorEvent.<type>`). This is a flavor/pressure layer delivered through the inbox — competitors are not yet simulated as full companies (future work).

### Market Share

`state.marketShare` (0–100) is the company's slice of its industry — the player **competes for industry dominance**. It is not a static number: each tick `updateMarketShare` drifts it (EMA) toward a target set by the company's **strength** — reputation, recent throughput, and lifecycle stage — against a constant **competitive headwind** (`MARKET_COMPETITIVE_PRESSURE`, the rivals' pull) and the active industry trend's `marketShareDrift`. So dominance must be *earned* by running a strong operation and *defended* against the market. A startup begins around `STARTING_MARKET_SHARE` (≈5%).

Share has three real gameplay effects (`getMarketShareEffects`, centred so ~25% — a credible challenger — is neutral, and bounded so it never dominates):

- **Lead generation** — `leadIntervalMultiplier` (0.85–1.1×) folds into `getLeadInterval`, so a market leader wins more inbound work and a niche player less.
- **Valuation** — `valuationMultiplier` (0.9–1.35×) scales generated buyout-offer amounts in `updateEvolution` (on top of the prestige and client-reputation premiums), so dominance raises the company's worth.
- **Reputation** — `reputationBonus` (up to +10) is added to the reputation EMA target, so a market leader carries standing (a bounded feedback loop, since the share target itself reads reputation).

`getMetrics` exposes a `marketShare` view (share, `tier` = leader/challenger/niche, and the effect percentages) rendered by the `MarketPanel` on the Growth tab. The drift is deterministic given state, so it behaves identically online and during offline catch-up.

### Industry Trends

`src/data/industryTrends.js` holds an industry-wide **climate** that periodically shifts and applies broad, temporary economic effects to the whole company — good and bad. `updateIndustryTrend` runs one trend at a time for `INDUSTRY_TREND_DURATION_SECONDS`, then reverts to neutral for `INDUSTRY_TREND_COOLDOWN_SECONDS` before picking the next on a weighted roll (same pattern as dynamic events). The four trends:

- **AI Boom** (good) — a demand surge: faster leads, richer project budgets, faster work; the market expands (share + valuation up).
- **Recession** (bad) — slower leads, thinner budgets, depressed valuations; share erodes.
- **Supply Chain Crisis** (bad) — operations seize up: slower processing and higher costs.
- **New Regulations** (bad) — compliance overhead: higher running costs and tighter margins.

Each trend's `effects` reuse the **same read-time effect keys** as company culture/specialists (`leadInterval` / `taskValue` / `speedMultiplier` / `expense` / `accuracyBonus`), so they are folded into `getCompanyEffects` and felt automatically across lead generation, payout, processing speed, expenses, and accuracy — no new read points. `marketShareDrift` nudges the Market Share target and `valuationMultiplier` scales buyout valuations while the trend is active. The active trend is stored as `state.industryTrend = { id, severity, remaining }`; activation records `state.lastIndustryTrend = { id, trendId, severity, at }`, which the `industryTrend` notification rule surfaces (deduped by instance id) localized via `vars.trendId` (→ `industryTrend.<id>.{name,body}`). `getMetrics` exposes an `industryTrend` view (id, severity, remaining seconds) shown alongside Market Share in the `MarketPanel`. This is an ambient world-climate layer, not a full macroeconomic model.

### Task Flow

Clients generate Lead tasks that enter the first department and move through a typed, per-company workflow defined in the `FLOWS` map in `simulation.js`. Each flow entry maps a department to the token kind it produces and the next department; a department with `bugKind` + `reworkDepartmentId` can reject work and route it back for rework. Companies without a typed flow fall back to sequential routing.

```text
IT Company:      Lead -> Sales -> Analysis -> Development -> QA -> Accounting -> Payment   (QA reject -> Development)
Manufacturing:   Lead -> Sales -> Procurement -> Production -> Quality Control -> Warehouse -> Accounting -> Payment   (QC reject -> Production)
Logistics:       Lead -> Sales -> Dispatch -> Operations -> Tracking -> Support -> Accounting -> Payment
```

The Manufacturing and Logistics token streams reuse the seven existing task-token sprites (e.g. production/dispatch orders render as the task-card token, the final Accounting stage emits the invoice then payment tokens).

Tasks enter department queues, are processed by available employees, move visibly between departments, and transform into the next task token type as work advances.

Task lifecycle:

```text
queued -> processing -> moving -> queued in next department -> completed
```

A department with a rework branch (IT QA, Manufacturing Quality Control) can reject work: it becomes a Bug task routed back to the rework department. Approved work eventually becomes an Invoice for Accounting, then a Payment token that generates revenue.

### Departments

Each department contains:

- Employees
- Queue
- Active processing slots
- Base speed
- Base accuracy
- Employee cost
- Visual position and color
- Queue history
- Bottleneck snapshot

Processing capacity is currently one active task per employee.

### Bottleneck System

Departments track queue size over a rolling 24-second history. Each simulation tick calculates:

- `queueGrowthRate`: queue size delta per minute.
- `utilization`: active processing slots divided by employee capacity.
- `severity`: combined pressure from queue size, queue growth, and utilization.
- `completionSlowdown`: processing-time penalty applied to overloaded departments.

A department becomes overloaded when severity crosses the MVP threshold, or when a meaningful queue exists while utilization is high. The highest-pressure department is the primary bottleneck used by hiring/rebalancing and the HUD.

Gameplay impact:

- Overloaded departments increase their own processing time.
- The worst bottleneck applies a revenue multiplier penalty to completed Payment tasks.
- The HUD shows the current revenue penalty so the player can connect poor flow to lower profit.

Visual indicators:

- High-contrast filled warning triangle in the bottleneck dashboard and a green check when flow is stable; the solid shapes remain legible at portrait/mobile sizes.
- Red pulse around the department room.
- Queue counter, utilization, growth rate, and throughput in the room stats.
- Critical bottleneck panel in the HUD.
- Hot department chips in the horizontal department status strip.

### Employees and Hiring

Employees are department-level capacity, not individually micromanaged units. More employees in a department raise its concurrent processing slots (throughput) and its recurring payroll (expenses).

Hiring is per department. Each department chip exposes a `+ Hire` button with its own price. Hire cost scales with the department's `employeeCost` and its current headcount, so a department gets more expensive to grow:

```text
hireCost = round((HIRE_BASE_COST + employeeCost * HIRE_COST_PER_RATE) * (1 + employees * HIRE_GROWTH))
```

`hireForDepartment(state, departmentId)` adds one employee to the chosen department. `hireForBottleneck(state)` is a convenience that targets the current bottleneck and is used by the quick action. Rebalancing still moves one employee from the least-pressured department to the bottleneck.

#### Employee Entities and Character Variety

Each department keeps both a gameplay `employees` count (used for all capacity/payroll math) and a parallel `staff` array of persistent employee entities used for rendering:

```js
{ id, departmentId, characterType }
```

`characterType` is one of `black_employee`, `red_employee`, `woman_employee` (`EMPLOYEE_CHARACTER_TYPES` in `simulation.js`) and is assigned at random when the employee is created. It is **visual variety only and never affects gameplay**. The character is fixed for the employee's lifetime: hiring creates a new entity with a random character, and rebalancing moves the *same* entity between departments (only its `departmentId` changes), so identity and appearance are preserved. `cloneState` deep-copies the staff arrays each tick.

### Automation

Automation lives in `src/data/automations.js` and is modelled as a **prerequisite-gated tree of owned tools** organised into four **modernization eras**, not a single linear upgrade index. The company owns a *set* of tools (`state.ownedAutomations`); effects from every owned tool stack. Buying across the eras is the game's main "modernize the company" progression (#7) — the player stops automating single tasks and starts automating whole departments, and their role evolves Manager → CEO → Chairman.

```text
Early    — Spreadsheet (starter), Shared Drive, CRM, Task Tracker        (manual tooling)
Growing  — Accounting System, ERP Platform, Business Intelligence, OCR   (back-office systems)
AI Era   — AI Support, AI Sales, AI QA, AI Marketing, AI Business Analyst (AI assistants per function)
Advanced — AI Operations Manager, AI CFO, AI Strategy Advisor,
           Autonomous Departments                                        (autonomous AI / AI executives)
```

Each tool carries an `era` (`AUTOMATION_ERAS` = `["early","growing","ai","advanced"]`); `AUTOMATION_ERA_INDEX` orders them. A tool can only be bought when every id in its `requires` array is already owned and the player can afford its one-time cost; the chains link the eras (AI tools require Growing-era systems, Advanced tools require AI tools). `getAutomationStatus(state)` reports each tool's `owned` / `unlocked` / `affordable` / `missing` state for the UI tree, and `getAutomationEra(state)` returns the highest era the company has reached (null for starter-only) for UI grouping and the AI office ambiance. The tree is **future-proof and data-driven**: adding a tool — including new AI agents/executives — is a single data entry plus its `automationTools.<id>.{name,desc,office}` strings; no code path hardcodes tool ids. The original four tools keep their ids/costs/effects so saves and validators are unaffected; new tools were appended.

#### Effects

`getAutomationEffects(state, departmentId?)` aggregates the owned tools into a single effect bundle. Global effects always apply; capacity is targeted.

- `speedMultiplier` (product) — **reduces processing time** for every department.
- `accuracyBonus` (sum) — **reduces error/rework rates** (lowers the QA bug-rejection chance).
- `valueMultiplier` (product) — increases payout per completed task.
- `moveSpeedMultiplier` (product) — speeds task movement between departments (Task Tracker).
- `capacityBonus` (sum, targeted) — **increases department capacity** by adding parallel processing slots, but only for a tool's `target` departments (or everywhere when a tool has no target).
- Boolean visual flags (`workflowLines`, `fastMovement`, `autoInvoice`, `aiTerminals`) drive the office overlays / ambiance.

Because the tree is deep and effects stack, `getAutomationEffects` **clamps the aggregate** well above what the original four tools produce — a fully modernized company is strong but never runaway: `speedMultiplier ≤ 2.6`, `valueMultiplier ≤ 2.4`, `accuracyBonus ≤ 0.4`, `moveSpeedMultiplier ≤ 3.6`. The caps are inert for any small toolset (including legacy saves), so per-tool effects stay intentionally small. Per-tool effects are tuned low for the same reason.

The Accounting System additionally applies an `AUTO_INVOICE_SPEEDUP` factor to the Accounting department's processing speed, so invoices clear automatically.

#### Office Visualization

Automation visibly changes workflow behavior on the canvas so the player can see what each purchase does:

- **CRM — workflow lines.** Without a CRM the office only shows faint dashed manual handoff paths. Installing the CRM turns them into solid, bright, connected workflow lanes between departments.
- **Task Tracker — fast movement.** Tokens move faster (via `moveSpeedMultiplier`) and the lanes gain animated white flow dashes that stream in the direction of work.
- **Accounting System — auto invoices.** An `AUTO INVOICE` generator badge appears on the Accounting room and emits a stream of invoice pulses toward the payment endpoint while Accounting clears its queue automatically.
- **AI Era — office ambiance (#8).** Once any AI-era tool is owned (`automationEffects.aiTerminals` / `metrics.automationEra` ∈ {`ai`,`advanced`}), the office "goes futuristic": a CSS ambiance layer (`.office-ai-ambiance`) renders a subtle scanline/glow tint over the canvas (a calmer green tint at the `advanced` era) plus a pulsing 🤖 badge. This is deliberately a **CSS overlay above the canvas**, not a renderer change — the hand-authored sprite floor is untouched, so it degrades cleanly and respects `prefers-reduced-motion`. Swapping in real futuristic/robot sprites is the future-art upgrade (see **Game-Feel Roadmap**).

### Game Feel: Achievements & Celebration (#5)

Major milestones get a cinematic moment instead of a silent number change. `src/data/achievements.js` is a data list of stable milestone ids + emoji icons + display order; the detection is pure and lives in `simulation.js` (`evaluateAchievements(state)` derives which milestones the company currently satisfies — first profit, first automation/manager/funding, the lifecycle stages, first million, market leader, AI era, autonomous departments). `updateAchievements` runs each tick (and during offline catch-up, since it is deterministic), records newly-satisfied ids **once** on `state.achievements` (kept in canonical order so the list reads as a growth story), and stamps the most recent on `state.lastAchievement`. Both persist in the save and are exposed via `metrics`.

`App.jsx` watches `metrics.lastAchievement.id`; when a *new* id appears after mount it pops a `CelebrationOverlay` — index-derived (deterministic, no `Math.random`) **confetti** plus an **achievement popup** (icon + localized title/desc) for ~5s, then auto-dismisses (tap to dismiss early). A ref seeded from the loaded save prevents re-celebrating past milestones on reload. Strings live under `achievement.<id>.{title,desc}` (+ `achievement.unlocked`) in both locales; the overlay is presentation-only and never mutates simulation state. Sound and camera moves are out of scope for this web prototype (no audio assets) — confetti + popup + the AI ambiance are the cinematic feedback today.

Completed tasks generate revenue. Employees create recurring expenses. Automation has one-time investment costs. Profit is tracked as:

```text
Revenue - Expenses
```

Cash is spendable money and can go negative in the prototype.

Each completion also appends `{ time, amount, clientId, projectId }` to `state.recentRevenue`, pruned to the last 120 simulated seconds and capped at 80 entries. This history is explanatory only: Finance compares the current and previous 60-second windows and aggregates the current window by client/project to identify the real top earning source. It never feeds back into payout, cash, profit, progression, reports, or offline simulation rules.

### Rendering

The office renderer (`OfficeCanvas.jsx`) draws a living operations floor on a `390 x 510` canvas. It includes:

- A per-company background asset (see Background System)
- Furnished, themed department rooms (drawn from the hand-authored room art, aspect-preserved)
- Diverse, animated employees inside each room (see Employee Animation)
- A shared water cooler in the hallway
- Workflow lanes (manual dashed vs. automated solid; animated when Task Tracker is owned)
- Moving and queued task-token sprites
- Per-department stats (queue, utilization, growth, throughput)
- Bottleneck highlight and warning marker
- Payment endpoint with revenue feedback

All sprites are resolved through `assetRegistry.js`; the renderer never hardcodes file paths. Because the production art is detailed pixel art rendered small, the canvas draws with `imageSmoothingEnabled = true`.

To keep the frame rate stable when a department builds a large backlog (common after offline catch-up), the renderer draws at most `MAX_QUEUE_TOKENS` queued tokens per department and resolves tasks through an id→task map. The true queue size is always shown in the room/department stats, so this is a purely visual bound with no effect on the simulation.

#### Employee Animation

Employees are drawn per `staff` entity using their `characterType` sprite set. The animation state is selected automatically from simulation state, with no per-employee state stored in the simulation:

- **Working** — employees filling a department's active processing slots (`index < active.length`) are drawn `sitting` at a desk slot (the sitting sprite includes the workstation).
- **Idle** — remaining employees stand and periodically blink (`idle` ↔ `idle_blink`).
- **Walking** — idle employees occasionally walk to the water cooler and back, using the directional `walk_up/down/left/right` sprite that matches their movement vector. Wandering employees are drawn last so they pass over rooms (the "hallway" effect).

Each employee's timing is derived deterministically from a hash of its `id` plus the wall clock, so motion is varied but stable per employee. `DEPARTMENT_LIVELINESS` scales how often a department's employees leave their desks, giving departments distinct personality (Sales lively, Development mostly seated). Combined with the existing task traffic (QA bug tokens, Accounting invoice/payment pulses), each department reads differently.

#### Background System

Each company type renders its own office background from `src/assets/background/`. The renderer resolves the image via `getBackgroundSprite(companyId)` (which maps `ecommerce-company` → `e-commerce`; other companies match their id) and draws it first, scaled to **cover** the canvas (center-cropped), with a light dark overlay so foreground elements stay readable. There are no generated or hardcoded background colors — backgrounds are asset-only, with a single flat fill used only while the image is still loading. The canvas element scales responsively on mobile via CSS (`width: 100%`), so the background scales with it.

### Navigation & Screen Architecture

FlowCorp is a **game that feels like a mobile app, not a dashboard you scroll**. Instead of one ever-growing vertical page, the in-game UI is a set of focused screens reached through a **persistent bottom navigation bar**. This is purely information architecture — no gameplay systems are added or removed by it; existing systems are reorganized so each screen answers one question and the player taps between them rather than scrolling past everything.

All of this lives in `App.jsx`. `GameScreen` owns the active `tab` (`TABS = ["company", "inbox", "growth", "finance", "founder"]`, default `company`) and renders exactly one tab view at a time inside a single `.tab-content` region, plus the slim persistent header and the bottom nav. The order of `TABS` is the single source of truth for both nav-button order and swipe direction.

#### Bottom Navigation

`BottomNav` renders one button per tab — an emoji icon + a localized label (`nav.<id>`) — and is the priority navigation. It is `position: fixed` at the bottom, centered within the `min(100vw, 430px)` app-shell, always visible, thumb-reachable, and respects the iOS home-indicator safe area (`env(safe-area-inset-bottom)`). The active tab has a clear state (top accent border + lit background + `aria-current="page"`). The **Inbox** button shows a badge when there are unread notifications, a pending decision (CEO Inbox or strategic layer), **or an unread company report**, so "something needs you" is visible from any screen. `.tab-content` carries bottom padding equal to the nav height so the last panel is never hidden behind it.

#### Screen Responsibilities

Every existing panel is assigned to exactly one screen; nothing is duplicated except the Cash/Profit glance (header) and the bottleneck (Company), which are intentionally always-visible.

- **🏢 Company** (`CompanyTab`) — the primary gameplay screen, kept focused: the office canvas, per-department employees/hiring chips, the department + automation **status strip** (bottleneck), the **current goal**, **active clients**, the automation/rebalance **action dock**, and the **critical alerts** (CEO Advisor "what to do next", and the Growth-Block "why am I stuck" panel which only appears when growth is blocked). A compact responsive `MoneyFlowGlance` states that money comes from completed client projects, shows actual payments in the current minute, and names the first revenue constraint; it uses two columns where space permits and stacks on the narrowest phones. The Advisor adds one short expected-effect line when its action is measurable. Detailed analysis stays off this screen.
- **📬 Inbox** (`InboxTab`) — the central progress, decision, and event surface. A pending **Company Report** (`CompanyReportCard`) sits first, followed by the pending **CEO decision** (`CeoInboxCard`) and the localized **notification feed** (`InboxList`) with browser-notification permission control. Switching to this tab marks event notifications read; reports keep the nav dot until explicitly reviewed. Forced major decisions remain their own modal flows but also surface here as notifications.
- **📈 Growth** (`GrowthTab`) — "how do I grow?": the **Next Unlock** roadmap bar, the inline **Evolution view** (`EvolutionView`, formerly a modal — current lifecycle stage, next-stage requirements, strategic paths, any committed operating layer for public/integration/compliance/transition, and the pending strategic decision), and the management levers that drive progression — **Operations Manager**, **Morale**, **Culture**, and **Special Employees**.
- **💰 Finance** (`FinanceTab`) — "why am I making money?": Revenue / Expenses / Profit / Cash metrics, the `MoneyStory` (actual revenue trend and reason, top-paying client/project, biggest leak, bottleneck cost, recommended-action effect), the **Income Breakdown** (expanded by default here), a **cash-flow** block (payroll-per-second, throughput, completed tasks), and a **financing** block (outstanding debt + the Founder Loan / Recovery Contract actions when cash is low). Keeping the full money picture here is what lets the Company screen stay focused.
- **👤 Founder** (`FounderTab`) — "my entrepreneurial career": the inline **Founder Legacy view** (`FounderLegacyView`, formerly a modal — profile summary, career records, permanent legacy bonuses, prestige unlocks, company-history timeline) and the **Founder Portfolio** ledger (`PortfolioSection`, shown when the holding path is unlocked).

#### Swipe Navigation (optional convenience)

Horizontal swipe between adjacent tabs is supported but **secondary** to the bottom nav. `.tab-content` carries `onTouchStart`/`onTouchEnd` handlers that step the tab index left/right. The implementation is deliberately conservative so it never fights other gestures or misfires: a swipe is ignored if it starts inside an element marked `data-no-swipe` (the office canvas and the horizontally scrolling department chip strip), if it is multi-touch, or unless it is a clearly horizontal drag past a distance threshold (`|dx| ≥ 60px` and `|dx| ≥ 1.6 × |dy|`). The bottom nav remains fully functional independent of swipe.

#### Modal / Drawer Usage

Full-page navigation is reserved for the five tabs. Small actions and details stay **in context** instead of opening a new page:

- **Bottom-sheet overlays** (`position: fixed`, `.automation-overlay`/`.automation-sheet`) are used only for things that genuinely interrupt or are too large for a tab: the **Automation** tool tree, **Settings**, first-run **Onboarding**, the meaningful-offline **Company Report** (the evolved "while you were away" summary), the **locked-company detail panel** (tapping VIEW on a locked company card — see **Compact, Visual UI**), and forced major-decision flows (**Offer modal**, **Legacy event** overlay).
- **In-place collapsibles** (native `<details>`/`<summary>`, `.collapsible`) keep secondary detail one tap away without leaving the screen — Income Breakdown, Active Clients, Manager, Culture.
- Panels that used to be their own full-screen overlays (Evolution, Founder Legacy, Inbox) are now **inline views** living on their owning tab, so reading them no longer covers the whole app.

#### Mobile UX & Responsive Layout

The game is portrait-first. The whole app lives in a centered `.app-shell` capped at `min(100vw, 430px)`. Key responsive rules (`styles.css`):

- **Focused screens, not one long scroll.** Each tab renders only its own panels, so the page is short. Any remaining vertical scroll happens within the active `.tab-content`; `body { overflow-x: hidden }` prevents horizontal page scroll, and `.app-shell` uses `overflow-x: clip` (not `overflow: hidden`) so the shell is **not** a vertical scroll container — this is what lets `position: sticky` work. The department chip strip scrolls horizontally inside its own `overflow-x: auto` row rather than widening the page.
- **Slim sticky header + glanceable money.** `.top-hud` is `position: sticky; top: 0` and now carries only company identity (name + lifecycle stage), compact **Cash + Net Profit** chips (color-coded — the only money shown outside the Finance tab, so economic status is glanceable without re-creating a dashboard), and Settings/Reset. The HUD is localization-responsive: the title, money chips, and buttons share a wrapping flex row, the control row can wrap as a unit while each control label stays on one line, and at narrow mobile widths the company identity takes its own row so longer Russian company/stage labels never overlap the money or controls. Inbox/Growth/Founder are reached through the bottom nav rather than header buttons.
- **Reduced clutter / collapsible panels.** Reference-only panels use a native `<details>`/`<summary>` collapsible (`.collapsible`); the Income Breakdown is collapsed by default on the Company-adjacent surfaces (and expanded on Finance) with its net `$/min` shown in the summary, so detail is one tap away instead of always occupying the screen.
- **Localization-safe text layout.** Reusable UI rows are designed for English and Russian text lengths: cards, settings/options, finance rows, goal/recovery blocks, CEO/strategic decision buttons, client rows, portfolio rows, evolution requirements, automation cards, and collapsible summaries use `minmax(0, 1fr)`, wrapping flex rows, `overflow-wrap: anywhere`, and taller containers instead of clipping or truncation. Metric labels/values wrap within their cards, and repeated button groups grow vertically inside their parent.
- **Touch targets.** Tappable controls meet a comfortable minimum: `.icon-button` is normally ≥44px (only slightly tighter on the narrowest breakpoint), `.nav-tab` ≥56px, `.hire-button` and solution/advisor buttons ≥40px. The HUD button row uses `flex-wrap` so controls never overflow on narrow phones.
- **Portrait breakpoints.** `≤400px`: side margins tighten, the status strip stacks to one column, the top HUD gives company identity a full row, and the action dock reflows from four tall tiles to a 2×2 grid. `≤360px`: nav-label / money-chip text shrinks slightly so all five tabs stay readable.
- **Single-line navigation & chip labels.** Bottom-nav labels (`.nav-label`), short action `.icon-button` labels (Settings/Reset/Close), and the HUD money-chip labels (`.money-chip small`/`b`) all use `white-space: nowrap` so they never break mid-word — e.g. the Russian **"Настройки"** previously wrapped to two lines (Настройк/и) on the company-select header, tab labels like **"Основатель"** could break awkwardly, and the uppercase money labels **"НАЛИЧНЫЕ"/"ПРИБЫЛЬ"** wrapped inside the chip (the chip's flex basis was widened and its padding tightened so the word fits on one line instead). Nav labels carry an `overflow: hidden; text-overflow: ellipsis` last-resort guard so a label can never wrap or push the fixed-width nav into horizontal overflow; on the company-select header the eyebrow text takes the flexible space (`flex: 1 1 auto`) while the Settings button keeps its full width (`flex: 0 0 auto`). All Russian labels fit on one line down to 360px.
- **Mobile game-feel states.** `styles.css` provides one interaction contract for all buttons: touch-highlight suppression, fast press translation/scale, hover only on precise pointers, visible keyboard focus, and muted/saturation-reduced disabled controls. Selected language, guidance, and navigation controls share a clear inset active state; open collapsibles receive a subtle active surface. These are presentation-only states and do not alter action availability or simulation rules.
- **Compact event motion.** Important cards (company reports and CEO situations) enter with one short 260ms lift/fade, nav badges pop once when mounted, and goal/market meters ease between values. Existing bottleneck and action-feedback motion remains the main live feedback. `prefers-reduced-motion: reduce` disables the new animations and transitions alongside the existing toast animation.

#### Compact, Visual UI (reduced text density)

FlowCorp should read like a **mobile game, not a dashboard**. The guiding rule: a player understands most state through **icons, numbers, progress bars, badges, colors, short labels, and compact cards** — long prose appears *only when the player asks for it*. Concretely:

- **Text-density rule.** On normal screens, aim for **at most 1–2 short lines of text per visible card**. Anything longer moves into an in-place collapsible (`<details>`), a bottom sheet, or a tap-to-view panel. New copy is written compact (icon + short label + signed number, e.g. `✅ {department} · +{value}% capacity`, `😊 Bigger projects · more referrals · higher offers`) rather than as full sentences. Russian copy is authored **short and natural** (not a literal translation of the English) so cards stay the same height on a ~360px phone.
- **Visual-first information.** Status is shown with emoji/icons + numbers + meters instead of explanatory sentences: tier **badges** (`.tier-badge`), difficulty **stars**, progress **bars** (`.cc-bar`), requirement **chips** (`.cc-chip`), and color-coded money. Repeated word-labels are replaced by icons where the meaning is unambiguous (e.g. the Finance stat cards carry 💰/📈/💸/📊).
- **Company cards (`CompanyCard`).** Company select renders a compact, visual card per company instead of a paragraph. An **unlocked** card shows only: the company **emoji** (`companyType.icon`, data in `companyTypes.js`), name, a tier badge, a difficulty rating (1–3 ⭐ from tier order via `getCompanyDifficulty`), and a single **PLAY** action (the whole card). A **locked** card shows the emoji, `🔒` name, tier/difficulty, an unlock **progress bar + %**, a single binding **requirement chip** (e.g. `🏆 0/1` companies or `⭐ 1/5` prestige, from `getCompanyUnlockProgress`), and a **VIEW** action. No taglines or long descriptions appear on cards. Tiers are grouped under a slim header (badge only — the orientation sentence was removed from the header to cut text).
- **Locked-company detail panel (`LockedCompanyDetail`).** Tapping **VIEW** opens a bottom sheet with the larger emoji, name, tier/difficulty, a 2–3 sentence-max description (the company tagline), the unlock **requirements** as compact `current / target` rows, a **reward preview** of what the tier unlocks (`careerTier.reward.<tier>`, e.g. *Investors · Funding · Sell or merge* / *IPO · Board · Government · Holding*), and the progress bar. This is the *only* place the longer description lives.
- **Compact CEO Inbox (`CeoInboxCard`).** The default state shows just the sender icon, sender, subject, and a single channel/decision **badge**, plus label-only action buttons. The dramatic story, context, and each choice's consequence are hidden behind an in-card **"Details"** (`<details>`); selecting a choice still echoes its consequence through the existing `ActionFeedbackToast`.
- **Compact Finance.** The Finance tab leads with four icon **stat cards** (💰 Cash · 📈 Profit · 💸 Costs · 📊 Revenue); the full `MoneyStory` narrative is wrapped in a collapsed `<details>` (tap-to-view) and the Income Breakdown stays collapsible, so the money picture is glanceable first and explained on demand.
- **Compact notifications.** Inbox notifications stay to an icon + short title + one short line (`notify.<id>.{title,body}`), authored to fit a 360px phone in both languages.
- **Russian mobile layout requirements.** Russian must be **first-class**: every shortened string has a short Russian counterpart that does not overflow, overlap, or make cards taller on mobile. Locale parity is enforced by `npm run validate:locales`. The compact rules above (`minmax(0,1fr)`, wrapping flex rows, `overflow-wrap: anywhere`, flex `gap` for spacing between adjacent inline labels) keep Russian readable without clipping.

This subsection is the standing rule for *new* UI: prefer a badge/number/bar/icon over a sentence, and put the sentence one tap away.
- **Empty-state anatomy.** Inbox, Active Clients, and Founder Timeline use the shared `EmptyState` component: a small status symbol, localized title, and one-line explanation in a dashed compact panel. Empty states explain the quiet state without adding actions, cards, or dashboard clutter.
- **Russian density.** Because Cyrillic labels are longer and visually denser, `:lang(ru)` removes decorative letter spacing and unnecessary uppercase treatment from compact navigation/action/goal labels, adds line height to decision/report copy, and keeps bottom-nav labels at a readable 9px minimum on the narrowest portrait breakpoint. Containers continue to grow and wrap rather than truncate.

This structure is the concrete realization of the product philosophy (see **About / Philosophy Screen**): *don't build a dashboard disguised as a game.* New systems are added by giving them a home on the right screen (or a collapsible/sheet within it), never by extending the bottom of a single page.

## Asset Pipeline

The art pack in `src/assets/` is hand-authored production pixel art and is the single source of truth. There is no generator and assets are never overwritten by tooling. The only script is `scripts/build_manifest.mjs` (run with `npm run manifest`), a read-only scanner that rebuilds `asset_manifest.json` to match the files on disk.

Art direction: pixel art, top-down, "modern tech company" — clean outlines, transparent backgrounds, consistent lighting, mobile-first readability.

### Categories

- `src/assets/employees/<character>/`: three characters (`black_employee`, `red_employee`, `woman_employee`), each with single-frame sprites for `idle`, `idle_blink`, `sitting`, and `walk_up/down/left/right`.
- `src/assets/departments/`: six hand-authored furnished top-down rooms — `accounting_room`, `analysis_room`, `development_room`, `qa_room`, `sale_room`, `support_room` — plus 13 temporary placeholder rooms (copies under new department filenames) so every department id resolves to a physical asset. See **Department Room Assets** for the placeholder list and which still need real art.
- `src/assets/tasks/`: seven distinct task tokens — lead, requirement, development_task, bug, support_ticket, invoice, payment.
- `src/assets/office/`: desk, computer, chair, meeting_table, server_rack, office_plant, water_cooler.
- `src/assets/background/`: one office background per company type (`it-company`, `marketing-agency`, `e-commerce`, `manufacturing`, `logistics`).
- `src/assets/ui/` and `src/assets/automation/`: HUD and technology icons.
- `src/assets/palette/`: palette swatch.

### Asset Registry

`src/assets/assetRegistry.js` is the centralized registry. It collects every PNG with `import.meta.glob` and exposes structured lookups so rendering code is decoupled from the real (and slightly inconsistent) filenames:

- `assetRegistry.employees[character][state]`, with `getEmployeeSprite(character, state)`.
- `assetRegistry.departments` plus `getRoomStem(id)` / `getDepartmentSprite(id)` — resolves any department id to an existing room sprite via a fallback map (see **Department Room Assets** below).
- `assetRegistry.tasks` plus `getTaskSprite(kind)` (maps a task kind → `{kind}_token`).
- `assetRegistry.backgrounds` plus `getBackgroundSprite(companyId)` (maps `ecommerce-company` → `e-commerce`).
- `assetRegistry.office` / `assetRegistry.ui` plus `getOfficeSprite` / `getUiSprite`.

Employee state is matched by filename **suffix**, so the `red_employee/` `employee_*` prefix resolves to the same state keys as the other characters. `asset_manifest.json` remains the catalog of path, category, and dimensions for every asset.

### Department Room Assets

Each department room is drawn from a `*_room.png` sprite in `src/assets/departments/`. **Every department id now has a physical room file**, so no department renders an empty box.

**Naming convention:** `<department_id>_room.png`. Two normalization rules apply, handled centrally in `getRoomStem` (`assetRegistry.js`):

- Hyphens in ids become underscores: `quality-control` → `quality_control_room.png`.
- `sales` is the one historical exception — the original art ships as `sale_room.png` (not `sales_room.png`), so `sales` keeps an explicit fallback to `sale_room`.

`getRoomStem(departmentId)` resolves in this order: (1) a dedicated `<normalized-id>_room` sprite if present, (2) an explicit fallback from `DEPARTMENT_ROOM_FALLBACKS`, (3) `DEFAULT_ROOM_STEM` (`support_room`) as a final safety net. `OfficeCanvas.jsx` only calls `getRoomStem` and looks up the preloaded sprite — it never hardcodes paths. All room files are discovered by `import.meta.glob("./departments/*.png")`.

**Real (hand-authored) room art — 6 files:**

```text
accounting_room.png  analysis_room.png  development_room.png
qa_room.png          sale_room.png      support_room.png
```

**Temporary placeholder rooms — 13 files.** These are byte-for-byte **copies** of the real rooms above, saved under the new department filenames so every department resolves to its own physical asset. They are intentional stand-ins and **must be replaced with dedicated art under the same filename** later (dropping a new PNG over the placeholder is all that's needed — no code change). The copy source for each:

| Placeholder file | Copied from | Used by |
| --- | --- | --- |
| `procurement_room.png` | `analysis_room.png` | Manufacturing, E-Commerce |
| `production_room.png` | `development_room.png` | Manufacturing |
| `quality_control_room.png` | `qa_room.png` | Manufacturing (`quality-control`) |
| `warehouse_room.png` | `support_room.png` | Manufacturing, E-Commerce |
| `dispatch_room.png` | `analysis_room.png` | Logistics |
| `operations_room.png` | `development_room.png` | Logistics |
| `tracking_room.png` | `qa_room.png` | Logistics |
| `marketing_room.png` | `sale_room.png` | E-Commerce |
| `strategy_room.png` | `analysis_room.png` | Marketing Agency |
| `copywriting_room.png` | `development_room.png` | Marketing Agency |
| `design_room.png` | `development_room.png` | Marketing Agency |
| `advertising_room.png` | `sale_room.png` | Marketing Agency |
| `analytics_room.png` | `analysis_room.png` | Marketing Agency |

Because the placeholders are identical to their sources, the Vite build deduplicates them by content hash (multiple stems can point at one emitted file); this is expected and harmless. Replacing a placeholder with distinct art produces its own hashed output automatically.

`DEPARTMENT_ROOM_FALLBACKS` is retained as the `sales` special-case plus a defensive net in case a sprite file is ever missing; with the placeholder files in place, every department now resolves via the dedicated lookup (step 1) to its own `<id>_room.png`.

## Localization

FlowCorp ships an in-app localization system so there is no hardcoded visible text. Strings live in `src/locales/` (`en.json`, `ru.json`) as nested key trees, and `src/i18n/index.jsx` provides the runtime. (The simulation's `state.eventLog` holds short English debug strings, but it is an internal history buffer and is **not** rendered in the UI, so it is intentionally not localized; the only on-canvas literal is the non-translatable `"!"` bottleneck mark.)

- `LanguageProvider` wraps the app (in `main.jsx`) and holds the active language.
- `useI18n()` returns `{ t, language, setLanguage, languages }`.
- `t(key, vars)` resolves a dotted key (e.g. `hud.revenue`, `company.manufacturing.name`), interpolates `{var}` placeholders, falls back to English when a key is missing in the active language, and returns the key itself as a last resort.
- The selected language is persisted to `localStorage` (`flowcorp.language`) and restored on load. English is the default.

Supported languages are **English (default)** and **Russian**. Every visible string is translated: company names and taglines, department names, the **bottom-navigation labels (`nav.*`)**, the **Finance screen (`finance.*`)**, the HUD, status/bottleneck panel, action dock, automation panel and tool names/descriptions, settings, statistics, and the on-canvas labels (department names, PAYMENT endpoint, AUTO INVOICE badge, stat abbreviations). The `OfficeCanvas` receives `t` and `language` as props so canvas text re-renders on a language switch.

Translation keys are keyed by stable ids: `company.<companyId>.{name,tagline}`, `department.<departmentId>`, and `automationTools.<toolId>.{name,desc,office}`. Adding a company, department, or automation tool means adding its id-keyed strings to both locale files. The **language switcher** and the **Guidance Mode** selector (`settings.gameplay`, `guidance.{title,mode.*,desc.*}`) both live in the Settings panel, reachable from both the company-select screen and the in-game HUD.

The offline/report/notification systems are fully localized too: `inbox.*`, `away.*`, `report.*`, `duration.*`, and `notify.<ruleId>.{title,body}`. Reports store stable department, automation, stage, event, improvement, risk, and Advisor ids; both regular and offline reports re-localize at render time. Notification items likewise store stable ids in `vars`, including client/project ids for deadline alerts and specialist ids for talent alerts.

Player-guidance text is localized under `advisor.*` (including `advisor.action.*`), `goal.*`, `income.*` (including `income.loss.*`), `moneyFlow.*`, `growth.*` (including `growth.reason.*` / `growth.blocker.*`), `solution.*`, `recovery.*`, `unlock.*` (including `unlock.reward.<stageId>`), `onboarding.*`, `feedback.*`, and `status.mainBottleneck`. Money-flow data stores stable client, project, department, tool, action, trend, and leak ids and re-localizes at render time. The transient action-feedback data stores stable department/tool ids and resolves them at render time, so an active result re-localizes if the player switches language. The client system is localized under `clients.*` (panel labels and `emptyTitle`), `client.<id>` (client names), `clientIndustry.<industry>`, and `project.<id>`. Inbox and Founder Timeline empty-state titles live at `inbox.emptyTitle` and `legacy.emptyTimelineTitle`; their explanatory body strings retain the existing `empty` keys. Everyday CEO Inbox messages are localized under `ceoInbox.<type>.{sender,subject,body}`; narrative cards use `ceoSituation.<id>.{sender,subject,body,context}` plus `ceoChannel.*`; all choices use `ceoChoice.<choiceId>.{label,desc}`. Cards store only stable ids and metadata, so they re-localize at render time. Dynamic events are localized under `dynamicEvent.<type>.{name,body}` (surfaced through `notify.dynamicEvent{Good,Bad}` + the new `notify.{clientAtRisk,decisionWaiting}`). The Operations Manager is localized under `manager.*` (including `manager.policy.<policy>`). Company culture is localized under `culture.*` (including `culture.<id>.{name,bonus,weakness}`), and special employees under `talent.*` + `specialist.<id>.{name,perk}` (with `notify.specialistAvailable` and the culture signature events under `dynamicEvent.<type>.{name,body}`). Employee morale is under `morale.*`; competitors under `competitor.<id>` + `competitorEvent.<type>` (with `notify.competitorEvent`). Market share is under `marketShare.*` (including `marketShare.tier.<tier>`), and industry trends under `industryTrend.*` (including `industryTrend.<id>.{name,body}`, with `notify.industryTrend`); the trend notification stores the stable `trendId` in `vars` and `App.jsx#notificationVars` resolves it at render time. The Advisor/Income/Goal UIs store stable ids in `vars` (`department`, `tool`, `stage`) and translate them at render time, so the guidance re-localizes on a language switch.

Founder legacy and strategic outcome text is localized under `legacy.*`, `prestigeUnlock.*`, `legacyOutcome.*` (including `legacyOutcome.graduation.*`), `public.*`, `integration.*`, `government.*`, `acquisitionTransition.*`, `portfolio.*`, `strategicEvent.*`, `strategicChoice.*`, and `path.*` (including `path.graduated.*`). Timeline items store event ids and stable company/buyer ids; `App.jsx` formats them through `legacy.event.<type>` (including `legacy.event.graduated`) so company history re-localizes on language switch.

The career-tier system is localized under `tier.<id>.{name,summary}` (the three tiers) and `careerTier.*` — the Career-Tier panel title, the Beginner-locked note, the graduation prompt/button, the company-card/detail labels (`play`, `view`, `locked`, `difficulty`, `requirements`, `unlocks`, `detailClose`, `req.{ventures,prestige}`, `reward.{beginner,intermediate,advanced}`), and the `careerTier.lock.{ventures,prestige,generic}` hints. Company select groups companies by tier and renders compact visual `CompanyCard`s (icon + name + tier + difficulty + a single PLAY/VIEW action); a locked card shows a progress bar + requirement chip, and VIEW opens the `LockedCompanyDetail` bottom sheet (see **Compact, Visual UI**). New company icons are data (`companyType.icon`); names/taglines live under the existing `company.<id>.{name,tagline}` keys (the tagline now appears only in the detail sheet). All new companies reuse existing `department.<id>` keys, so no new department strings were added.

### About / Philosophy Screen

The Settings panel has an **About** group with a link that opens the `PhilosophyPanel` overlay (`App.jsx`). It is not marketing copy — it states the product philosophy and serves as a decision-making principle for future development:

> Don't build a dashboard disguised as a game. Build a game that can eventually become a business operating system.

The screen shows that principle prominently, a collapsible **Founder's Note** (the "game first, business second" rationale, the engagement → understanding → better decisions chain, and the core "engaging feature belongs / boring-dashboard feature is reconsidered" rule), and a small version footer (`FlowCorp Vision: a company simulator today, a business operating system tomorrow`). Every string lives under the `philosophy.*` keys (plus `settings.about`) in both locale files; multi-line strings use `\n` rendered with `white-space: pre-line`. It reuses the existing `.automation-overlay` / `.automation-sheet` overlay pattern, is mobile-first, and is purely informational — it never affects gameplay or simulation state.

## Persistence, Offline Progress & Notifications

These three systems make the company feel alive between sessions. They are layered on top of the existing simulation and reuse its logic — no business rules are duplicated.

### Save System

`core/persistence.js` stores the game as one JSON record in `localStorage` under `flowcorp.save.v1`. Since Active Multi-Company Management (#24), the save is a **roster** (schema `version: 2`):

```js
{ version, activeId, companies: [{ id, sim, lastActiveAt }], notifications }
```

Each `companies[]` record is a company the founder runs: `id` is the company-type id, `sim` is that company's live simulation state, and `lastActiveAt` is its wall-clock anchor for offline catch-up. `activeId` marks which company is currently live; on save, the active company's `lastActiveAt` is stamped to `now` while paused companies keep theirs (so each advances by the real time it was paused when next made active). `notifications` is the single shared founder inbox (`{ items, lastFired, activeKeys }`): `lastFired` stores cooldown timestamps and `activeKeys` stores the current-condition latch used to prevent repeats while an alert remains unresolved. Old saves without `activeKeys` normalize through the empty-array fallback. A single-company founder simply has a one-company roster — behaviourally identical to the original single save.

Each `sim` is the live simulation state (a plain, JSON-serializable object): cash, revenue, expenses, bounded `recentRevenue`, `ownedAutomations`, achievements (`achievements`, `lastAchievement`), departments (with `staff`, `queue`, `active`, `completed`, `throughputWindow`, `queueHistory`, `bottleneck`), `tasks`, founder legacy state (`founderProfile`, `legacyEvent`), player-guidance state (`completedGoals`, `activeMicroGoal`, `microGoalCursor`, `lastMicroGoalId`, `microGoalCompletions`, `solvedBottlenecks`, `resolvedCeoSituations`, `goalRewardSequence`, `lastGoalReward`, `emergencyFundsUsed`, `emergencyFundCooldown`, `debt`, `loansTaken`, `intakeThrottled`, `recoveryContractsUsed`, `recoveryContractCooldown`), the client system's `clientSatisfaction`, the CEO Inbox (`ceoDecision`, including optional narrative metadata, plus `ceoInboxCooldown`), recurring reporting (`companyReportTimer`, `companyReportBaseline`, `companyReport`, `companyReportSequence`), dynamic events (`lastDynamicEvent`, `dynamicEventCooldown`), the Operations Manager (`manager`), company culture & special employees (`culture`, `specialHires`, `availableSpecialist`, `specialistCooldown`), employee morale (`employeeHappiness`, `salaryPressure`), competitors (`lastCompetitorEvent`, `competitorCooldown`), market share (`marketShare`), industry trends (`industryTrend`, `lastIndustryTrend`, `industryTrendCooldown`), venture capital (`venture`), and optional strategic operating-layer state (`publicCompany`, `integration`, `compliance`, `acquisitionTransition`, `strategicEvent`, `portfolio`). Old saves receive micro-goal, report, and payment-history defaults in `cloneState` on their next tick.

- `saveRoster(roster)` — stamps the active company's `lastActiveAt = Date.now()` and writes the v2 record.
- `loadRoster()` — reads + `normalizeSave()` → a roster, or `null`.
- `normalizeSave(payload)` — **pure** (no `localStorage`): normalizes a v2 roster, **or migrates a legacy v1 single-sim save** (`{ version, lastActiveAt, sim, notifications }`) into a one-company roster, falling back gracefully (drops sim-less records, repairs an unknown `activeId`). This is what keeps pre-#24 saves loading seamlessly.
- `clearGame()` — removes the save (used by Reset).

All access is wrapped in `try/catch` so private-mode or quota failures degrade gracefully. The simulation core stays pure — it has no timestamp field; `lastActiveAt` lives only in the save record. `App.jsx` boots the active company (catching it up via `simulateOffline`) and keeps the paused roster; background companies are caught up lazily when switched to (see **Active Multi-Company Management**).

When are saves written? `App` autosaves on a 5s interval (skipped while the tab is hidden), on `visibilitychange → hidden`, on `blur`, on `pagehide`, and immediately when a new company starts.

### Offline Progress

`core/offline.js#simulateOffline(sim, lastActiveAt, now)` advances the company for the elapsed wall-clock time by calling the existing `tickSimulation` in bounded coarse steps — the same business logic the live loop uses. It returns `{ sim, summary }`.

Caps (to prevent huge jumps and keep resume fast):

- Elapsed time is capped at `MAX_OFFLINE_SECONDS` (4 hours).
- The number of catch-up ticks is bounded (`MAX_OFFLINE_TICKS = 1500`); the step grows with the gap so total work is constant.
- A `TASK_SAFETY_CAP` (800 in-flight tasks) stops catch-up early if a backlog explodes (a badly bottlenecked company), bounding memory and per-tick cost.
- Gaps under a couple of seconds are ignored (tab flicker).

The **"while you were away" company report** is built by the shared report model from a full-period before/after snapshot. It includes the five headline deltas, biggest bottleneck, improvement, risk, and live Advisor recommendation. It is shown only after meaningful offline progress, in the existing resume sheet.

### Resume / Reconciliation Flow

There are two entry points, both using `simulateOffline`:

1. **App start / reload** — `bootFromSave()` runs once, synchronously, inside the initial `useState` initializer: it loads the save, runs offline catch-up, and seeds React state (company, sim, notifications, away summary). This resumes straight into the company with no flash of the start screen. Because it only reads storage and `simulateOffline` is pure, it is safe under React StrictMode's double-invocation.
2. **Tab return without reload** — on `visibilitychange → hidden` (or `blur`) we record `lastHiddenAt` and save; on `visibilitychange → visible` (or `focus`) we `simulateOffline` from `lastHiddenAt` to now, apply the result, and show the summary if meaningful. The `requestAnimationFrame` loop resumes afterward; its first frame `dt` is clamped, so the gap is never double-counted.

### Notification Rules

`core/notifications.js` holds a data-driven rule list. Each rule has an `id`, `severity` (`critical | warning | info`), a numeric `priority`, a `cooldownMs`, and an `evaluate(sim, metrics, context)` that returns a match (optionally with a dedupe `key` and `vars`) or `null`. Current rules:

| id | severity | fires when |
| --- | --- | --- |
| `cashNegative` | critical | balance below zero |
| `cashLow` | warning | balance below `LOW_CASH_THRESHOLD` |
| `severeBottleneck` | critical | a department newly enters an overloaded episode with severity ≥ 0.5 |
| `queueOverloaded` | warning | a department queue ≥ `QUEUE_OVERLOAD_THRESHOLD` |
| `automationAvailable` | info | the next automation tool is unlocked and affordable |
| `performanceDropping` | warning | revenue > 0 but profit < 0 |
| `stageAdvanced` / `acquisitionOffer` / `mergerOffer` / `pathsUnlocked` | info/critical | lifecycle / strategic milestones (once per unique key) |
| `clientAtRisk` | warning | client satisfaction < `CLIENT_RISK_THRESHOLD` (client at risk) |
| `clientDecisionWaiting` | warning | a client complaint, media issue, or invoice dispute needs a CEO choice |
| `riskyCeoSituation` | warning | a narrative CEO situation with material tradeoffs is waiting |
| `majorContractDeadline` | critical | one or more rare/high-value client projects have 30 seconds or less before deadline; overlapping projects share one deadline-pressure episode |
| `decisionWaiting` | info | a routine CEO Inbox decision or strategic-layer event is pending |
| `companyReportReady` | info | the recurring company report is ready to review |
| `offlineProgressReady` | info | meaningful offline progress produced a return summary |
| `dynamicEventGood` / `dynamicEventBad` | info / warning | a dynamic world event occurred (employee issue, outage, viral success, press, industry trend) — severity matches the event |
| `specialistAvailable` | info | a rare special (star) employee is available to sign |
| `competitorEvent` | info | a competitor did something (launched a product, poached talent, was acquired) |

`evaluateNotifications` combines **priority, per-key cooldowns, and an active-condition latch**. Every evaluation records all currently matched keys in persisted `activeKeys`, but emits at most the single highest-priority newly matched reason. Lower-priority simultaneous conditions are latched rather than cascading over subsequent autosave ticks. Across later evaluations, an unresolved active reason also suppresses any newly appearing weaker reason; only a higher-priority condition can replace it. A persistent condition cannot notify again merely because its cooldown elapsed: it must clear (which releases its active key), recur, and satisfy its cooldown. Unique stage/offer/decision/report/event ids use `FIRE_ONCE_MS`, so a genuinely new instance can still notify immediately.

The `dynamicEvent*` rules carry `vars.eventType`; deadline alerts carry stable `clientId`/`projectId` plus remaining seconds; offline alerts carry revenue/project deltas. `App.jsx#notificationVars` localizes and formats those values at render time. New items are prepended to the inbox (capped at `INBOX_LIMIT`). `App` runs the evaluator on the autosave tick and on resume; a meaningful offline summary is passed as evaluator context, so it competes in the same priority/dedupe pass instead of creating a separate notification stream. The resume sheet still shows the detailed report.

### Notification Delivery

- **In-game inbox** (always available, no permission needed): the persistent bottom-nav Inbox badge reflects unread notifications and important pending work (CEO/strategic decisions, acquisition/merger offers, and company reports). The Inbox lists items with severity color, relative time, and localized title/body. This is the primary channel and works regardless of system permission.
- **Browser notifications** (where supported): permission is requested only on an explicit user gesture (the "Enable notifications" button in the inbox) — never automatically on load. When granted, new `critical`/`warning` items raise a system `Notification` while the tab is hidden.

### Browser / Mobile Background Limitations

Honest constraints of a no-backend web prototype:

- A backgrounded tab throttles timers and pauses `requestAnimationFrame`, so the simulation does not advance in real time while hidden — it is **replayed on resume** from the saved timestamp. The company state is correct on return, but there is no live ticking in the background.
- A fully closed tab runs no JavaScript, so true background push is not possible without a Service Worker + Push API + a backend (out of scope). Browser notifications therefore fire on the throttled background tick or on resume, not from a closed app.
- `localStorage` is synchronous and size-limited; the save holds the full task list, so offline backlog is capped (see `TASK_SAFETY_CAP`).
- Offline progress is capped at `MAX_OFFLINE_SECONDS`; longer absences are summarized as that capped window (flagged in the summary).

## Simulation Flow

Per animation tick:

1. Advance elapsed time.
2. Generate new tasks based on company lead interval and queue pressure.
3. Move queued tasks into department active slots, up to capacity (employees + automation capacity bonus).
4. Process active tasks using department speed and the aggregated automation speed multiplier.
5. Transform completed work into the next task type.
6. Route QA rejections back to Development as Bug tasks.
7. Move approved Accounting output as Payment tasks.
8. Complete Payment tasks, add revenue, and append the bounded paid-project event used by money-flow explanations.
9. Apply payroll expenses once per second.
10. Update queue history and bottleneck snapshots.
11. Advance the long-term lifecycle layer (`updateEvolution`): the industry-trend climate and market-share drift, the reputation EMA (with the market-share standing bonus), stage milestones, buyout-offer generation, and — when present — the strategic operating layers (public-company investor pressure/stock confidence/quarter timer, merger integration, government compliance, and acquisition transition objectives).
12. Generate one strategic decision event at a time when an operating layer needs player input and the cooldown has expired.
13. Snapshot founder profile career totals.
14. Apply player guidance: grant the active goal's reward once when met, dispense the early-game safety net, and repay outstanding founder-loan debt (`updateGuidance`).
15. Surface one everyday CEO Inbox decision when due and the slot is free (`updateCeoInbox`).
16. Fire one dynamic world event when due, applying its effect and recording it for notification (`updateDynamicEvents`).
17. Run the Operations Manager's enabled policies on its cadence, if hired (`updateManagers`).
18. Offer one rare special employee when due, once the company is established (`updateSpecialists`).
19. Update employee morale (burnout + salary expectations) and fire one competitor event when due (`updateHappiness`, `updateCompetitors`).
20. Advance the recurring company-report timer; generate one persisted 90-second report if due and no unread report exists.
21. Recompute metrics for HUD, queue sizes, throughput, bottleneck state, founder profile, prestige unlocks, evolution state, department chips, guidance views, client view, pending CEO decision, pending company report + live recommendation, manager, culture/talent, morale, and market/trend views.

## Data Models

### Company Type

```js
{
  id,
  name,
  tagline,          // shown only in the locked-company detail sheet, not on cards
  taskName,
  icon,             // emoji for the compact company card (stamped from COMPANY_ICONS)
  tier,             // "beginner" | "intermediate" | "advanced" (careerTiers.js)
  unlockPrestige,   // optional: extra prestige-level gate (Holding/Investment Fund = 5)
  departments,
  startingEmployees,
  baseTaskValue,
  leadInterval
}
```

### Department

```js
{
  id,
  name,
  color,
  baseSpeed,
  baseAccuracy,
  employeeCost,
  taskType,
  employees,        // gameplay capacity count
  staff,            // Employee[] for rendering; staff.length === employees
  queue,
  active,
  completed,
  throughputWindow,
  queueHistory,
  bottleneck,
  x,
  y
}
```

### Employee

```js
{
  id,             // e.g. "emp_12", stable for the employee's lifetime
  departmentId,
  characterType   // "black_employee" | "red_employee" | "woman_employee" (visual only)
}
```

### Task

```js
{
  id,
  label,
  kind,
  value,             // the client's project budget
  rareContract,      // true for prestige-unlocked high-value leads
  clientId,          // client roster id (localized name/industry)
  industry,          // client industry id
  projectId,         // localized project name id
  bornAt,            // elapsed time when the lead was created
  deadline,          // elapsed-time delivery deadline (drives client satisfaction)
  fromDepartmentId,
  targetDepartmentId,
  status,
  departmentId,
  progress,
  seed
}
```

### Paid Project Event

```js
{
  time,       // simulation elapsed time when Payment completed
  amount,     // actual payout after every multiplier/penalty
  clientId,   // stable localization id
  projectId   // stable localization id
}
```

`state.recentRevenue` contains at most 80 of these events and only the last 120 simulated seconds are considered. `metrics.incomeBreakdown` derives `trend`, `topSource`, `biggestLeak`, `bottleneckImpact`, and `actionEffect`; none are persisted separately.

### Automation

```js
{
  id,
  name,
  tier,
  cost,
  requires,            // ids that must be owned to unlock this tool
  speedMultiplier,     // reduces processing time (global)
  accuracyBonus,       // reduces error rates (global)
  valueMultiplier,     // payout per completed task (global)
  moveSpeedMultiplier, // speeds task movement (global)
  capacityBonus,       // extra parallel slots for target departments
  target,              // department ids the capacity/visual effect focuses on
  visual,              // "workflow-lines" | "fast-movement" | "auto-invoice"
  autoInvoice,         // Accounting System: auto-generate invoices
  desc,                // player-facing description
  officeEffect         // short note describing the visible office change
}
```

Owned tools are tracked on the simulation state as `ownedAutomations` (an array of automation ids), starting with `["spreadsheet"]`.

### Founder Profile

```js
{
  id,
  groupName,
  founderLevel,
  founderExperience,
  legacyPoints,
  prestige,
  reputation,
  companiesFounded,
  companiesSold,
  mergersCompleted,
  iposAchieved,
  governmentContracts,
  companiesGraduated,   // companies grown to maturity and graduated from (Beginner-tier progression)
  totalEmployeesManaged,
  totalRevenueGenerated,
  companies,
  timeline,
  legacyBonuses: {
    startingReputation,
    investorConfidence,
    complianceScore,
    hiringAttractiveness
  },
  skills: { hiring, fundraising, automation, negotiation }  // Founder Skill Tree (#22) levels
}

// Founder Traits (#21) are NOT stored — they are derived from the career counters
// above (companiesFounded / companiesSold / mergersCompleted / iposAchieved) via
// getUnlockedTraits, so they need no save state.
```

`prestigeLevel` and `prestigeUnlocks` are derived views returned by metrics, not stored profile fields. `prestigeLevel` is derived from *effective prestige* (`prestige + founderExperience * 0.3`), and `getPrestigeUnlockEffects(profile)` returns the concrete per-tier gameplay effects the simulation reads:

```js
{
  prestigeLevel,     // 1..5, derived from effective prestige
  prestigeUnlocks: [
    { id, level, unlocked }
  ]
}

// getPrestigeUnlockEffects(profile)
{
  level,
  startingReputationBonus, startingCashMultiplier,   // L1
  rareContracts, rareContractChance, acquisitionPremium, // L2
  eliteManagers, eliteManagerDiscount, investorAccess,   // L3
  governmentEligibility, mergerNegotiation,              // L4
  holdingUnlock                                          // L5
}
```

### Founder Timeline Event

```js
{
  year,
  type,             // "founded" | "acquired" | "merged" | "ipo" | "government" | "graduated"
  companyId,
  companyNameKey,
  buyerId,          // acquisition / merger only
  amount,           // acquisition payout or strategic valuation
  prestigeGain
}
```

### Public Company Layer

```js
{
  stockPrice,
  shareholderConfidence,
  quarterlyExpectation,
  previousQuarterRevenue,
  quarterTimer,
  analystReputation,
  investorPressure,
  boardAlignment,      // board's confidence in the CEO (0–100); drifts from market performance
  guidance,            // quarterly guidance stance: "conservative" | "balanced" | "aggressive"
  boardSeatsGranted,   // control concessions ceded to the board / activists
  activist,            // null, or an active campaign { demandId }
  activistTimer        // countdown to the next activist check
}
```

### Merger Integration Layer

```js
{
  cultureConflict,
  morale,                 // staff morale; with culture conflict drives the live throughput drag
  duplicatedDepartments,  // duplicate departments still to merge
  restructuringDebt,
  progress,               // progress integrating the current duplicate department
  // Expanded merger gameplay (#20):
  integratedDepartments,  // duplicates successfully merged (a synergy source)
  leadershipConflict,     // 0–100 tension between overlapping leaders
  politics,               // 0–100 corporate factionalism (drifts from culture + leadership)
  synergy                 // 0–100 earned merger upside → read-time bonus via getSynergyEffects
}
```

### Government Contractor Layer

```js
{
  nationalContracts,
  auditRisk,
  complianceScore,
  publicReputation,
  pendingPayment,    // delayed national-contract payout awaiting its timer
  paymentTimer,      // seconds until pendingPayment lands
  auditPressure,     // accumulates with audit risk; triggers an audit at AUDIT_PRESSURE_THRESHOLD
  lastAudit,         // null | "passed" | "fined" (last audit outcome, for UI/event log)
  // Expanded government gameplay (#19): competitive bidding + audit history.
  contractsLost,     // tenders lost to rival bidders
  lastBid,           // last bid outcome { stance, won, value } (null until first bid)
  auditsRun,         // total audits fired
  auditsPassed,      // audits passed cleanly
  auditsFined,       // audits that drew a fine
  lastFine           // amount of the most recent fine
}
```

A government tender (carried on a `govContractOffer` strategic event as `event.tender`):

```js
{
  value,             // contract payout the bid competes for
  rivals,            // procurement competition: number of competing bidders (2–4)
  competition        // "low" | "medium" | "high" (derived from rivals, for the UI)
}
```

### Acquisition Transition Layer

```js
{
  daysRemaining,
  morale,
  buyerTrust,
  clientRetention,
  systemsIntegration,
  completed
}
```

### Venture Capital Layer

```js
{
  round,             // 0..VENTURE_MAX_ROUNDS (Seed → Series A/B/C)
  founderEquity,     // founder ownership % (100 until diluted by raising)
  investorInfluence, // 0–100 board influence held by investors
  expectation,       // revenue-growth target set at the last raise
  raisedTotal,       // total private capital raised
  pressure,          // 0–100 investor pressure (rises when expectations are missed)
  checkTimer         // seconds until the next investor expectation review
}
```

### Founder Portfolio Layer

Stored state (`state.portfolio`) is just the unlock flag + active company id:

```js
{
  unlocked,
  activeCompanyId
}
```

The Evolution view derives the displayed ledger live via `getPortfolioView(state)`:

```js
{
  unlocked,
  activeCompanyId,
  assets,             // live snapshot of founderProfile.companies (id, nameKey,
                      // status, revenue, peakEmployees, valuation, ...)
  totalValuation      // summary: sum of max(valuation, revenue) across assets
}
```

### Strategic Event

```js
{
  id,
  type,               // acquisitionSystems, mergeDepartments, cultureConflict, clientOwnership,
                      // restructuring, leadershipOverlap, corporatePolitics,
                      // ipoQuarterReview, ipoProfitQuality, ipoIssueShares,
                      // ipoGuidance, ipoBoardMeeting, ipoShareholderVote, ipoActivist,
                      // govContractOffer, govAuditNotice, govComplianceUpgrade,
                      // govCertification, govWhistleblower, govDeadlinePressure
  choices             // stable choice ids handled by chooseStrategicDecision()
}
```

### CEO Decision

Stored pending decision (localized at render time):

```js
{
  id,                 // unique decision instance, used by notification dedupe
  type,               // stable situation id from CEO_SITUATIONS
  choices,            // 2-3 stable choice ids from CEO_CHOICE_BY_ID
  icon,               // compact sender/situation icon
  code,               // narrative cards only, e.g. "B1-U-03"
  channel,            // narrative cards only: media / operations / people / finance / market
  narrative           // true for the dramatic situation-card anatomy
}
```

Declarative registry entry (`src/data/ceoSituations.js`):

```js
{
  id, code?, channel?, icon, weight, when?,
  choices: [{ id, tone, effects }]
}
```

### Company Report

Persisted regular-report state:

```js
{
  companyReportTimer,       // seconds until the next report; pauses while unread
  companyReportBaseline,    // compact snapshot used for period deltas
  companyReportSequence,    // monotonic report id source
  companyReport: {          // null, or the unread report
    id, sequence, kind, periodSeconds,
    revenue, profit, cashChange, completedProjects, satisfaction,
    bottleneckId, bottleneckQueue,
    improvement: { id, vars },
    risk: { id, vars }
  }
}
```

`metrics.companyReport` adds the current derived `recommendation` from the CEO Advisor; the recommendation is intentionally not stored, so it always describes the action that is useful now. Offline reports use the same report object plus `awaySeconds`, `capped`, `stoppedEarly`, and the current recommendation, but live only in App resume state and are not persisted after dismissal.

### Notification Inbox

```js
{
  items: [{ id, ruleId, key, severity, titleKey, bodyKey, vars, time, read }],
  lastFired: { [dedupeKey]: timestamp },
  activeKeys: [dedupeKey] // conditions matched by the previous evaluation
}
```

The inbox belongs to the founder roster rather than one company. `key` identifies the condition or unique event instance; `activeKeys` is replaced on every evaluation so resolved conditions naturally release their latch.

### Bottleneck Snapshot

```js
{
  isOverloaded,
  queueGrowthRate,
  utilization,
  severity,
  completionSlowdown
}
```

## Game-Feel Roadmap (living office, visual progression)

The product direction is for the game to feel like a **living, evolving company** the player reads by watching the office, not by reading panels. Several pillars of that vision are **art-dependent** and are deliberately staged as future work, because the renderer uses only hand-authored sprites (there is no art generation in the pipeline) and adding them blind is risky. What ships today vs. what is roadmapped:

- **Shipped (data/CSS, no new art):** the AI-automation era progression and its CSS office ambiance (#7/#8), the achievement/celebration moments (#5, confetti + popup), the compact visual UI / company cards (earlier work), and the existing living-office motion (employee idle/blink/walk-to-cooler, bottleneck pulse, QA/invoice/payment token traffic) and dynamic + CEO-inbox **emotional events** (#4).
- **Roadmapped (needs sprite art):**
  - **Living Office (#1)** — richer per-employee behaviors (chat, coffee, celebrate, run-when-overloaded), managers walking between departments, couriers/visitors, ringing phones, printers, growing plants, occupied meeting rooms. These need new sprites/animation frames; the current single-frame-per-state character sets and room art don't cover them.
  - **Visual Company Progression (#2)** — the office itself evolving with milestones (better furniture → reception → glass offices → executive office → multiple floors → HQ → campus). This needs a set of stage-keyed office/background art; the data hook already exists (`reachedStages`, founder prestige), so it can be driven without new simulation logic once art lands.
  - **Per-company depth (#6)** — beyond the per-company departments/flows/icons already in place, deeper signature mechanics (coffee-shop tips/queues, IT outages/deploys, game-studio reviews/crunch, manufacturing conveyors/forklifts) — partly data (new dynamic-event flavor per company type) and partly art.
  - **AI executives as agents (#7 late-game)** — the AI-executive *tools* exist as automation effects today; modelling them as distinct on-canvas AI employees / autonomous departments is future work.
  - **Audio & camera** — sound effects and camera moves for celebrations require audio assets and are out of scope for the no-backend web prototype.

The guiding rule for picking up roadmap items: drive every visual from existing simulation state (stage, era, bottleneck, events) so new art is a presentation layer, never a new economy.

## Technical Decisions

- Use a web prototype first because Flutter is not installed in the workspace and Vite/React enables immediate playable iteration.
- Keep simulation state in plain JavaScript objects to make balancing and debugging straightforward.
- Use Canvas for the office because moving task tokens and pixel-style office rendering are central to the fantasy.
- Keep company definitions data-driven from the start to support IT, Marketing, and E-Commerce without separate systems.
- Use department-level employee actions to preserve the design rule: the player optimizes systems, not individual employees.
- Import PNG assets directly into the canvas renderer so Vite fingerprints them and the prototype can run without a separate asset server.
- Keep bottleneck detection inside the simulation core so UI, rendering, and gameplay penalties all read the same state.

## Deployment (itch.io)

The production build (`npm run build` → `dist/`) targets static HTML5 hosting on itch.io. itch serves each uploaded game from a nested subdirectory (e.g. `https://html-classic.itch.zone/html/<id>/index.html`), **not** from the domain root, so the build must use relative asset URLs:

- `vite.config.mjs` sets `base: "./"`. This makes Vite emit `./assets/index-*.js` / `./assets/index-*.css` in `index.html` and resolve every bundled image via `new URL("<file>.png", import.meta.url)`, which resolves relative to the JS module's own location. With the default `base: "/"` these become root-absolute `/assets/...` paths that 404 under itch's subpath hosting (blank page, no sprites).
- **Packaging:** zip the **contents of `dist/`**, not the `dist/` folder itself, so `index.html` sits at the **root of the uploaded ZIP**. On itch, set the kind to "HTML" and mark it as played in the browser.

Verified by serving `dist/` from a nested path (`/html/<id>/index.html`): the HTML, JS, CSS, and PNG assets all resolve correctly, while the equivalent root-absolute path 404s.

## Validation

There is no test framework in the prototype; correctness is guarded by small, deterministic Node scripts under `scripts/` that import the real simulation modules and assert behaviour. They use a shared `mature()` helper to force a state to enterprise maturity and run fixed-`dt` ticks, so outcomes are reproducible. `npm run validate` runs them all:

- `validate:gameplay` — the **gameplay requirements checklist**: eight labelled sections proving prestige unlocks affect gameplay, founder experience persists across companies, acquisition choice outcomes work, strategic offers respect `destinyPath`, merger event choices mutate integration state, the IPO quarterly review moves stock price and shareholder confidence (strong vs weak quarter), government audit events change compliance and reputation, and a new company inherits founder bonuses. (IPO/government/holding sections run on the matching Advanced-tier company — Enterprise Corporation / Government Contractor / Holding Company — since those are tier-gated capabilities.)
- `validate:legacy` — deeper regression suite for the founder-legacy and strategic operating layers (transition objectives, merger restructuring/leadership events and throughput drag, IPO scoring, government contracts/delayed payments/audits, portfolio ledger, prestige gating).
- `validate:guidance` — onboarding / anti-stuck regression suite (advisor priority, income breakdown, goal rewards once, growth-block diagnostics, founder loan, intake throttle, soft-lock recoverability).
- `validate:clients` — client system + recovery-contract suite (leads carry client/industry/project/budget/deadline, late delivery lowers satisfaction, client reputation drives bigger budgets / more referrals / higher offers, recovery contract advances cash + injects high-value work and is bounded).
- `validate:ceo` — CEO Inbox suite (decisions generate during play; the declarative registry has 2–3 choices per card and rotates narrative cards into eligible play; representative choices visibly affect cash, reputation, satisfaction, morale, real queued work, income modifiers, and future-event timing; invalid choices remain no-ops).
- `validate:events` — dynamic events + notification-expansion suite (events fire and apply real effects, and the clientAtRisk / decisionWaiting / dynamicEvent rules raise the right notifications).
- `validate:managers` — Operations Manager suite (gated to Small Business, draws a salary, and its policies auto-hire / auto-automate / auto-rebalance, with toggles respected).
- `validate:culture` — culture + special-employee suite (each culture changes effects and unlocks only its signature event; specialists are gated, offered one at a time, and signing grants a persistent perk + notification).
- `validate:morale` — employee happiness/retention + competitor suite (untended morale declines, raises lift it and reset salary pressure, morale raises throughput, and competitor events fire + notify).
- `validate:market` — market share + industry-trend suite (share is tracked and grows with company strength; share shortens lead interval, raises valuation, and lifts reputation; trends activate/expire on their timers, apply effects via `getCompanyEffects` so a boom out-earns a recession, and raise a localizable notification; metrics expose both views).
- `validate:ipo` — expanded IPO governance suite (board alignment drifts from market performance and a misaligned board calls a meeting; quarterly guidance scales the target and amplifies the review swing while preserving the `acceptQuarterPlan` contract; shareholder votes and board decisions move cash/confidence/alignment; an activist emerges under sustained pressure and is resolved by settle/fight/buyback, with a lost proxy fight forcing a board-seat concession).
- `validate:gov` — expanded government suite (a contract offer carries a competitive tender; a strong bid wins and schedules a delayed payment while a weak bid loses to rivals; bid stance changes the outcome and the payout; certification/whistleblower compliance events move compliance/risk/cash; audits fire on accumulated pressure, fines scale with the contract book, and a compliant company passes).
- `validate:merger` — expanded merger suite (merging a department counts an integration and grants synergy; leadership-overlap and corporate-politics decisions move leadership conflict / politics / morale; unresolved conflict breeds politics over time; synergy builds in a calm, well-integrated merger and becomes a read-time bonus — payout up, costs down, faster work — while a fresh merger has negligible synergy and feels the drag first).
- `validate:career` — founder traits + skill-tree suite (a first-time founder has no traits and inert skills; career milestones unlock the matching traits and feed `getCompanyEffects`; founder level grants skill points; spending them levels skills within bounds and applies real effects — cheaper hires/automation, more starting cash, higher offers).
- `validate:tiers` — career-tier suite (Beginner companies expose no investors/exits/M&A/IPO/government/holding mechanics and no strategic paths; Intermediate adds investors + sell/merge; Advanced unlocks IPO/board/government/holding/multi-company; capabilities are cumulative; company unlock gating advances with completed ventures and prestige, with the prestige-5 gate on Holding Company / Investment Fund; founder graduation increments the counter, commits a one-shot `graduated` destiny, and raises the legacy overlay).
- `validate:automation` — automation-era tree + achievements suite (tree integrity: prerequisites resolvable, acyclic, every tool reachable from the starter; each era populated and `getAutomationEra` progresses early→growing→ai→advanced; stacked effects stay within the aggregate caps while the legacy four-tool baseline is unchanged; every tool/era/achievement is localized in en+ru; achievements fire once, record in canonical order, surface via metrics, and only yield defined ids).
- `validate:vc` — venture-capital suite (a bootstrapped company is neutral and can raise; raising injects cash, advances the round, and dilutes equity; dilution shrinks the founder's acquisition cash-out; board influence rises per round and shortens the lead interval; rounds are capped and blocked after a destiny path; missing the investor expectation builds pressure that raises the burn rate, meeting it eases pressure and raises the bar).
- `validate:reports` — recurring/offline company-report suite (90-second generation, complete summary shape, live recommendation, unread-report dedupe, review/reset cadence, improvement/risk ranking, meaningful-offline gating, stale periodic-report replacement).
- `validate:return-hooks` — important return-reason suite (client/risky CEO decisions, major deadline, severe bottleneck, rare specialist, company report, meaningful offline progress, highest-priority single emission, unresolved-condition latch, clear-and-recur behavior, and no lower-priority cascade).
- `validate:money-flow` — Finance/Company clarity suite (paid-project event capture, old-save default, adjacent-minute revenue trend and reason, top client/project aggregation, operating-cost loss explanation, quantified bottleneck penalty, and recommended-action estimate).
- `validate:save` — multi-company persistence + internal-synergy + executive suite (v1→v2 migration preserving sim/timestamp/inbox; a v2 roster keeps all companies + per-company timestamps + active id; an unknown active id falls back to the first company; sim-less records dropped; internal synergies are neutral for a solo company, scale with `portfolioCount`, flow into `getCompanyEffects`, and are capped; appointing an executive installs the fully-enabled manager despite the Small-Business gate, costs the hire fee, and is a no-op when one is already in place).
- `validate:locales` — en/ru locale key parity.

`npm run build` must also pass. These scripts are deterministic (no `Date.now`/`Math.random` dependence in their assertions beyond bounded loops) so they are safe to run in CI.

## Showcase / Recording Mode

`src/showcase.js` is an **opt-in, off-by-default** mode for capturing a gameplay trailer without permanently changing the game. It is activated only by an explicit signal — the URL flag `?showcase=1` (fast demo) or `?showcase=max` (also unlock everything), or `localStorage["flowcorp.showcase"]` = `"1"`/`"max"`. With no flag present every export is a no-op / identity, so normal play is byte-for-byte unchanged and **nothing is persisted into the save**.

- **`isShowcase()`** gates a render-loop time-scale: the per-frame `dt` (already capped at 0.08s) is multiplied by `SHOWCASE_TIME_SCALE` (6×) in `App.jsx`'s animation loop, so the whole living simulation — revenue, hiring effects, company reports, CEO inbox, dynamic events, lifecycle stages, achievements — fast-forwards enough to fill a 4–5 minute reel. `SHOWCASE_BONUS_CASH` ($250k) is added to a newly-started company so the office fills with hires/automation immediately.
- **`showcaseUnlockAll()`** (`?showcase=max`) seeds a boosted founder profile via `showcaseFounderProfile()` (prestige/experience/exits to the empire tier) and treats every company card as unlocked, so advanced companies (Enterprise / Holding / Investment Fund / Government) and their late-game mechanics can be demoed directly. The default `?showcase=1` leaves the profile untouched so the recorder still **sees locked companies and earns the real graduation/unlock moments on camera**.
- A non-interactive **`.showcase-badge`** ("SHOWCASE ·6×") is rendered while the mode is active so recordings are clearly marked as sped-up.

A fast-forwarded run is verified stable and eventful (a ~30-minute sim, ≈5 min wall-clock at 6×, reaches all five lifecycle stages and all four automation eras, fires ~10 achievements, and keeps the in-flight task list bounded — no crash).

## Tradeoffs

- React state updates drive the simulation each animation frame. This is acceptable for the MVP but may need a dedicated simulation store later.
- The canvas uses hand-authored room, employee, task-token, and background sprites. Some lane, badge, and feedback elements remain programmatic for speed and flexibility.
- The typed task flow is currently authored for the IT Company first. Other company types still use fallback routing and need their own typed workflows.
- Bottleneck thresholds are intentionally simple MVP constants. They will need tuning after longer play sessions.
- Save/load exists through `localStorage`, including founder legacy and strategic operating-layer state. It is still a single-browser prototype save, not a cloud profile or account system.
- Automation is a small tier tree (4 tools). Speed/accuracy/value/move effects are global while capacity is targeted to specific departments. Deeper, fully department-specific automation trees are deferred to a later milestone.
- Automation office overlays (workflow lines, flow dashes, auto-invoice generator) are drawn programmatically on the canvas rather than as swapped-in sprites.
- Active Multi-Company Management (#24), Internal Synergies (#25), and the Holding Company simulator (#26) let the prestige-5 founder run a roster of companies, switch the live one, share a bounded portfolio synergy, allocate capital between them, appoint auto-managing executives, and acquire new subsidiaries — but it is a **bounded** model: one company ticks at a time and the others advance by lazy offline catch-up on switch (not true simultaneous per-frame simulation), and executives reuse the Operations Manager rather than a distinct exec-skills system. A holding treasury and capital-markets depth are future work. Founder Portfolio remains the read-only ledger view of company history; the holding dashboard is the active layer on top.
- IPO and government contractor paths now have recurring decisions and gameplay pressure, but they remain lightweight operating layers. Shareholders, stock price, investor pressure, compliance, audits, and contracts are modeled as compact metrics rather than full secondary economies.
- Merger integration creates real decisions and operating tradeoffs, but it does not yet restructure departments into a merged org chart or simulate two independent pre-merger companies.
- Career tiers are a fully data-driven *capability gate* + unlock/graduation progression (`careerTiers.js`), and they reclassify which companies can use which mechanics. But the Advanced-tier "entirely new mechanics" reuse the existing operating layers (IPO/board → the public-company layer, government → the compliance layer, holding/multi-company → the roster layer) rather than each shipping a brand-new economy. The **Investment Fund** in particular is modeled as an Advanced operational company on the holding/portfolio rails (deal-flow pipeline + capital allocation), not yet a distinct equity-portfolio / passive-income simulation. New companies reuse existing department art/flows/localization and an aliased background until dedicated assets ship. Deepening each Advanced tier into its own secondary economy is future work.
