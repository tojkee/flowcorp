// Competitor companies: a small named roster that drives a rival event stream
// (see updateCompetitors in simulation.js) so the market feels alive. Names are
// id-based for i18n (`competitor.<id>`); event flavor is localized under
// `competitorEvent.<type>` and surfaced through the notification inbox.

export const COMPETITORS = [
  { id: "apex" },
  { id: "zenith" },
  { id: "quantal" },
  { id: "ironwood" },
];

// Rival event types and the mild effect each has on the player's world.
// Effects use existing levers (reputation, client satisfaction) — competitor
// pressure nudges your standing; a rival being acquired makes you stand out.
export const COMPETITOR_EVENTS = [
  { type: "launchedProduct", severity: "bad" },
  { type: "hiredTalent", severity: "bad" },
  { type: "acquired", severity: "good" },
];
