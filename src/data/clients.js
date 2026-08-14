// Real client roster for the client system. Clients are id-based so every
// visible string (name, industry, project) is localized via the i18n system
// (`client.<id>`, `clientIndustry.<industry>`, `project.<id>`). `budget` is a
// multiplier on the company's baseTaskValue, giving each client a different
// project budget; the roster averages ~1.0 so the economy stays balanced.

export const CLIENTS = [
  { id: "novamotors", industry: "automotive", budget: 1.5 },
  { id: "cornerbakery", industry: "retail", budget: 0.7 },
  { id: "stratosai", industry: "tech", budget: 1.3 },
  { id: "meridianbank", industry: "finance", budget: 1.4 },
  { id: "greenleaf", industry: "retail", budget: 0.8 },
  { id: "orbitlogistics", industry: "logistics", budget: 1.1 },
  { id: "pulsehealth", industry: "healthcare", budget: 1.2 },
  { id: "summitedu", industry: "education", budget: 0.7 },
  { id: "vertexmedia", industry: "media", budget: 0.9 },
  { id: "atlasrealty", industry: "realestate", budget: 1.0 },
];

export const PROJECTS = [
  "websiteRedesign",
  "prototypeDev",
  "mobileApp",
  "marketingCampaign",
  "dataMigration",
  "supportContract",
  "brandRefresh",
  "automationRollout",
];

export const CLIENT_BY_ID = Object.fromEntries(CLIENTS.map((client) => [client.id, client]));

// Deterministic-friendly pickers: callers pass a 0..1 number (Math.random or a
// task seed) so behaviour is reproducible when seeded.
export function pickClient(roll) {
  return CLIENTS[Math.floor(roll * CLIENTS.length) % CLIENTS.length];
}

export function pickProject(roll) {
  return PROJECTS[Math.floor(roll * PROJECTS.length) % PROJECTS.length];
}
