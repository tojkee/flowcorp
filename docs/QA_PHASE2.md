# Founder Legacy — Phase 2 QA Report

_Scope: the Founder Legacy gameplay-completion work (prestige, founder experience, acquisition continuation, merger, IPO, government contractor, holding/portfolio, onboarding/anti-stuck, localization, tests)._

## Build & validation result

| Check | Command | Result |
| --- | --- | --- |
| Production build | `npm run build` | ✅ pass (~360 KB JS, gzip ~109 KB) |
| Locale parity (en/ru) | `npm run validate:locales` | ✅ pass (472 keys) |
| Gameplay checklist (8 items) | `npm run validate:gameplay` | ✅ pass (25 checks) |
| Founder-legacy regression | `npm run validate:legacy` | ✅ pass |
| Onboarding/anti-stuck regression | `npm run validate:guidance` | ✅ pass |

Run everything: `npm run validate` then `npm run build`.

## Subsystem status

| Subsystem | Status | Notes |
| --- | --- | --- |
| Prestige unlocks | **COMPLETE** | Levels 1–5 each have real gameplay effects via `getPrestigeUnlockEffects` (starting reputation+cash, rare contracts + acquisition premium, elite-manager hiring discount + eased IPO reqs, eased gov reqs + merger negotiation, holding path). Visible in the Legacy panel; verified in tests. |
| Founder experience | **COMPLETE** | Distinct `founderExperience` stat awarded by exits/mergers/IPOs/gov/stage milestones/decisions; persists across companies; feeds founder level **and** accelerates prestige-tier pacing (effective prestige). Shown in the Legacy panel. |
| Acquisition continuation | **COMPLETE** | Three real choices: found next company, stay as transition CEO (morale/buyer-trust/retention/integration objectives + decisions), or negotiate terms (one-time; success raises payout, failure cuts buyer trust into the transition). |
| Strategic offer rules | **COMPLETE** | `evaluateOfferGeneration` returns `null` once `destinyPath` is set; merger negotiability gated by prestige. No regeneration after a path. |
| Merger gameplay | **MOSTLY COMPLETE** | ≥5 integration event types (duplicate depts, culture, client ownership, restructuring, leadership overlap) with morale/cost/throughput/progress consequences; integration health drags live throughput. _Does not_ remodel two orgs into one combined department graph. |
| IPO gameplay | **MOSTLY COMPLETE** | Stock price, shareholder confidence, quarterly target + review scoring profit/growth/reputation/bottlenecks, plus profit-vs-quality and issue-shares-vs-control events. Lightweight compact metrics — **not** a full stock-market sim. |
| Government contractor | **MOSTLY COMPLETE** | Contract offers, delayed payments, audit risk that actually fires audits with fines, compliance checks; ≥3 event types (audit notice, compliance upgrade, deadline pressure) + contract offer. Compact model — **not** a procurement/bid simulator. |
| Holding / Founder Portfolio | **PARTIAL (honest MVP)** | Read-only ledger of companies as legacy assets (name, role, valuation, total, active marker), derived live. **Full multi-company management / switching between concurrent live companies is NOT implemented** and is documented as future work. |
| Bonus display accuracy | **COMPLETE** | Point boosts → `+N pts`, rate bonus → `+N%`, cash → `+$N` (currency); all labels localized. |
| Onboarding / anti-stuck | **COMPLETE** | CEO Advisor (prioritized + one-tap action), income breakdown, goals with rewards, growth-block diagnostics with ranked blockers + alternative solutions + tradeoff estimates, next-unlock, emergency grant + founder loan + intake throttle. |
| Localization (en/ru) | **COMPLETE** | All new categories localized; 103 code-referenced strategic/choice/category keys verified present in both locales; no hardcoded visible strings (`eventLog` is internal, only canvas literal is `"!"`). |
| Validation tests | **COMPLETE** | Four deterministic Node scripts; the gameplay checklist maps 1:1 to the 8 required behaviours. |

## Tested flows

- Acquisition → each of the three continuation choices; transition decisions; one-time negotiation.
- Merger → integration decisions (merge/keep/cut, culture, restructuring, leadership) mutate state; integration drag reduces throughput.
- IPO → quarterly review on a strong quarter (stock up) and a weak quarter (stock + confidence down).
- Government → audit prep (risk↓, compliance↑, reputation↑); contract offer (delayed payment scheduled); delayed payment lands; high-risk audit fires and fines a non-compliant contractor.
- Prestige → starting reputation/cash scaling, hiring discount, level-5 holding unlock; experience accelerating tier.
- Inheritance → next company starts above baseline reputation/cash; founder experience and legacy bonuses persist.
- New-player loop verified in-browser: onboarding overlay, advisor, growth-block panel with alternative solutions, next-unlock, income breakdown, loan/throttle recovery.

## Known limitations

- Income-breakdown per-department contributors are a throughput-share **approximation** (linear pipelines trend similar at steady state); net = income − expenses is exact.
- Growth-block solution `~%` estimates are deliberately rough, labelled "approximately".
- Merger does not build a true combined org chart; IPO/government are compact metric layers, not full economies.
- Founder Portfolio is a tracker, not active multi-company management.
- No automated test framework; validation is via deterministic Node scripts (intentional for a no-backend prototype).

## Remaining future work

- Option B holding company: concurrent company states + switching the active company.
- Deeper IPO (real shareholders/market), government procurement/bidding, and a merged-org department graph.
- Dedicated room art for non-IT departments (currently placeholders).

## Success-criteria check

After selling, merging, going public, or entering government contracting, the player faces new recurring decisions (transition objectives, integration events, quarterly reviews, audits/contracts) with consequences — not just a flag and a number. The Founder Legacy system is a gameplay loop, not only a statistics panel.
