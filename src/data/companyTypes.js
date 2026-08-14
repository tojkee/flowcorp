// Data-driven company roster. Each company carries a `tier` (see
// data/careerTiers.js) that decides which level of business management it
// unlocks. Tiers gate mechanics by capability, never by hardcoded company ids.
//
// IMPORTANT: the first five entries (indices 0-4) are the original operational
// companies and MUST keep their order/ids — saves and validators reference them
// positionally. New companies are appended after them.
//
// Beginner companies teach the fundamentals (no investors/exits/M&A/IPO/etc.).
// Intermediate companies add scaling + exits. Advanced companies add corporate
// strategy (IPO/board, government, holding/multi-company, investment fund).
// All new companies reuse existing department ids, so they resolve to existing
// room art, typed/fallback flows, and `department.<id>` localization with no new
// assets required.
export const COMPANY_TYPES = [
  {
    id: "it-company",
    name: "IT Company",
    tagline: "Ship client projects through a technical delivery pipeline.",
    taskName: "Client Project",
    tier: "intermediate",
    departments: [
      { id: "sales", name: "Sales", color: "#58d86b", baseSpeed: 1.08, baseAccuracy: 0.92, employeeCost: 18, taskType: "Lead" },
      { id: "analysis", name: "Analysis", color: "#4bb4ff", baseSpeed: 0.92, baseAccuracy: 0.95, employeeCost: 22, taskType: "Requirements" },
      { id: "development", name: "Development", color: "#ff654f", baseSpeed: 0.58, baseAccuracy: 0.86, employeeCost: 32, taskType: "Dev Task" },
      { id: "qa", name: "QA", color: "#a16cff", baseSpeed: 0.76, baseAccuracy: 0.91, employeeCost: 24, taskType: "Bug Check" },
      { id: "support", name: "Support", color: "#42d7d4", baseSpeed: 0.95, baseAccuracy: 0.9, employeeCost: 20, taskType: "Ticket" },
      { id: "accounting", name: "Accounting", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 21, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      analysis: 1,
      development: 1,
      qa: 1,
      support: 1,
      accounting: 1,
    },
    baseTaskValue: 420,
    leadInterval: 2.2,
  },
  {
    id: "marketing-agency",
    name: "Marketing Agency",
    tagline: "Turn briefs into campaigns, reports, and repeat revenue.",
    taskName: "Client Campaign",
    tier: "intermediate",
    departments: [
      { id: "sales", name: "Sales", color: "#58d86b", baseSpeed: 1.08, baseAccuracy: 0.93, employeeCost: 17, taskType: "Lead" },
      { id: "strategy", name: "Strategy", color: "#4bb4ff", baseSpeed: 0.82, baseAccuracy: 0.94, employeeCost: 23, taskType: "Brief" },
      { id: "copywriting", name: "Copywriting", color: "#ff8c42", baseSpeed: 0.78, baseAccuracy: 0.88, employeeCost: 21, taskType: "Copy" },
      { id: "design", name: "Design", color: "#a16cff", baseSpeed: 0.7, baseAccuracy: 0.9, employeeCost: 26, taskType: "Creative" },
      { id: "advertising", name: "Advertising", color: "#ff654f", baseSpeed: 0.76, baseAccuracy: 0.86, employeeCost: 28, taskType: "Campaign" },
      { id: "analytics", name: "Analytics", color: "#42d7d4", baseSpeed: 0.92, baseAccuracy: 0.95, employeeCost: 24, taskType: "Report" },
      { id: "accounting", name: "Accounting", color: "#f5c846", baseSpeed: 0.92, baseAccuracy: 0.96, employeeCost: 20, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      strategy: 1,
      copywriting: 1,
      design: 1,
      advertising: 1,
      analytics: 1,
      accounting: 1,
    },
    baseTaskValue: 360,
    leadInterval: 1.9,
  },
  {
    id: "ecommerce-company",
    name: "E-Commerce Company",
    tagline: "Route orders from stock to support, returns, and payment.",
    taskName: "Customer Order",
    tier: "intermediate",
    departments: [
      { id: "procurement", name: "Procurement", color: "#4bb4ff", baseSpeed: 0.86, baseAccuracy: 0.93, employeeCost: 21, taskType: "Stock Request" },
      { id: "warehouse", name: "Warehouse", color: "#ff8c42", baseSpeed: 0.74, baseAccuracy: 0.88, employeeCost: 19, taskType: "Order" },
      { id: "marketing", name: "Marketing", color: "#58d86b", baseSpeed: 0.98, baseAccuracy: 0.89, employeeCost: 23, taskType: "Promo" },
      { id: "support", name: "Support", color: "#42d7d4", baseSpeed: 0.9, baseAccuracy: 0.9, employeeCost: 19, taskType: "Ticket" },
      { id: "accounting", name: "Accounting", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 20, taskType: "Invoice" },
    ],
    startingEmployees: {
      procurement: 1,
      warehouse: 2,
      marketing: 1,
      support: 1,
      accounting: 1,
    },
    baseTaskValue: 210,
    leadInterval: 1.35,
  },
  {
    id: "manufacturing",
    name: "Manufacturing Company",
    tagline: "Turn raw orders into finished goods on the factory floor.",
    taskName: "Production Order",
    tier: "intermediate",
    departments: [
      { id: "sales", name: "Sales", color: "#58d86b", baseSpeed: 1.05, baseAccuracy: 0.92, employeeCost: 18, taskType: "Lead" },
      { id: "procurement", name: "Procurement", color: "#4bb4ff", baseSpeed: 0.9, baseAccuracy: 0.93, employeeCost: 21, taskType: "Purchase Order" },
      { id: "production", name: "Production", color: "#ff8c42", baseSpeed: 0.6, baseAccuracy: 0.87, employeeCost: 30, taskType: "Production" },
      { id: "quality-control", name: "Quality Control", color: "#a16cff", baseSpeed: 0.78, baseAccuracy: 0.9, employeeCost: 24, taskType: "QC" },
      { id: "warehouse", name: "Warehouse", color: "#42d7d4", baseSpeed: 0.8, baseAccuracy: 0.9, employeeCost: 20, taskType: "Stock" },
      { id: "accounting", name: "Accounting", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 21, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      procurement: 1,
      production: 1,
      "quality-control": 1,
      warehouse: 1,
      accounting: 1,
    },
    baseTaskValue: 380,
    leadInterval: 2,
  },
  {
    id: "logistics",
    name: "Logistics Company",
    tagline: "Move shipments from dispatch to delivery and payment.",
    taskName: "Shipment",
    tier: "intermediate",
    departments: [
      { id: "sales", name: "Sales", color: "#58d86b", baseSpeed: 1.05, baseAccuracy: 0.92, employeeCost: 18, taskType: "Lead" },
      { id: "dispatch", name: "Dispatch", color: "#4bb4ff", baseSpeed: 0.95, baseAccuracy: 0.92, employeeCost: 20, taskType: "Dispatch Order" },
      { id: "operations", name: "Operations", color: "#ff8c42", baseSpeed: 0.72, baseAccuracy: 0.88, employeeCost: 27, taskType: "Operation" },
      { id: "tracking", name: "Tracking", color: "#a16cff", baseSpeed: 0.9, baseAccuracy: 0.93, employeeCost: 22, taskType: "Tracking" },
      { id: "support", name: "Support", color: "#42d7d4", baseSpeed: 0.92, baseAccuracy: 0.9, employeeCost: 19, taskType: "Ticket" },
      { id: "accounting", name: "Accounting", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 20, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      dispatch: 1,
      operations: 2,
      tracking: 1,
      support: 1,
      accounting: 1,
    },
    baseTaskValue: 300,
    leadInterval: 1.7,
  },

  // ---------------------------------------------------------------------------
  // Beginner tier — teach the fundamentals. No investors, exits, M&A, IPO,
  // board, government, or multiple companies (enforced by tier capabilities).
  // ---------------------------------------------------------------------------
  {
    id: "coffee-shop",
    name: "Coffee Shop",
    tagline: "Serve every customer fast before the line backs up.",
    taskName: "Customer Order",
    tier: "beginner",
    departments: [
      { id: "sales", name: "Counter", color: "#58d86b", baseSpeed: 1.1, baseAccuracy: 0.93, employeeCost: 12, taskType: "Order" },
      { id: "procurement", name: "Supplies", color: "#4bb4ff", baseSpeed: 0.95, baseAccuracy: 0.93, employeeCost: 13, taskType: "Restock" },
      { id: "production", name: "Kitchen", color: "#ff8c42", baseSpeed: 0.7, baseAccuracy: 0.88, employeeCost: 16, taskType: "Drink" },
      { id: "support", name: "Service", color: "#42d7d4", baseSpeed: 0.95, baseAccuracy: 0.9, employeeCost: 12, taskType: "Service" },
      { id: "accounting", name: "Till", color: "#f5c846", baseSpeed: 0.95, baseAccuracy: 0.96, employeeCost: 12, taskType: "Receipt" },
    ],
    startingEmployees: {
      sales: 1,
      procurement: 1,
      production: 2,
      support: 1,
      accounting: 1,
    },
    baseTaskValue: 95,
    leadInterval: 1.1,
  },
  {
    id: "digital-agency",
    name: "Digital Agency",
    tagline: "Take small briefs from pitch to delivery and invoice.",
    taskName: "Client Brief",
    tier: "beginner",
    departments: [
      { id: "sales", name: "Sales", color: "#58d86b", baseSpeed: 1.08, baseAccuracy: 0.92, employeeCost: 15, taskType: "Lead" },
      { id: "design", name: "Design", color: "#a16cff", baseSpeed: 0.74, baseAccuracy: 0.9, employeeCost: 22, taskType: "Mockup" },
      { id: "development", name: "Development", color: "#ff654f", baseSpeed: 0.66, baseAccuracy: 0.87, employeeCost: 26, taskType: "Build" },
      { id: "marketing", name: "Marketing", color: "#58d86b", baseSpeed: 0.98, baseAccuracy: 0.89, employeeCost: 18, taskType: "Promo" },
      { id: "accounting", name: "Accounting", color: "#f5c846", baseSpeed: 0.92, baseAccuracy: 0.96, employeeCost: 17, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      design: 1,
      development: 1,
      marketing: 1,
      accounting: 1,
    },
    baseTaskValue: 180,
    leadInterval: 1.6,
  },

  // ---------------------------------------------------------------------------
  // Intermediate tier — teach scaling. Adds investors / venture capital /
  // valuation / loans and the exit options (sell / merge / strategic invest).
  // ---------------------------------------------------------------------------
  {
    id: "tech-startup",
    name: "Tech Startup",
    tagline: "Build features, win funding, and scale toward an exit.",
    taskName: "Product Feature",
    tier: "intermediate",
    departments: [
      { id: "sales", name: "Sales", color: "#58d86b", baseSpeed: 1.06, baseAccuracy: 0.92, employeeCost: 19, taskType: "Lead" },
      { id: "analysis", name: "Product", color: "#4bb4ff", baseSpeed: 0.9, baseAccuracy: 0.94, employeeCost: 23, taskType: "Spec" },
      { id: "development", name: "Engineering", color: "#ff654f", baseSpeed: 0.56, baseAccuracy: 0.85, employeeCost: 34, taskType: "Feature" },
      { id: "qa", name: "QA", color: "#a16cff", baseSpeed: 0.76, baseAccuracy: 0.91, employeeCost: 25, taskType: "Bug Check" },
      { id: "marketing", name: "Growth", color: "#58d86b", baseSpeed: 0.96, baseAccuracy: 0.89, employeeCost: 24, taskType: "Campaign" },
      { id: "accounting", name: "Finance", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 22, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      analysis: 1,
      development: 1,
      qa: 1,
      marketing: 1,
      accounting: 1,
    },
    baseTaskValue: 450,
    leadInterval: 2.1,
  },
  {
    id: "game-studio",
    name: "Game Studio",
    tagline: "Ship polished builds without burning out the team.",
    taskName: "Game Build",
    tier: "intermediate",
    departments: [
      { id: "design", name: "Game Design", color: "#a16cff", baseSpeed: 0.72, baseAccuracy: 0.9, employeeCost: 26, taskType: "Design" },
      { id: "development", name: "Development", color: "#ff654f", baseSpeed: 0.56, baseAccuracy: 0.85, employeeCost: 33, taskType: "Build" },
      { id: "qa", name: "QA", color: "#4bb4ff", baseSpeed: 0.76, baseAccuracy: 0.9, employeeCost: 25, taskType: "Playtest" },
      { id: "marketing", name: "Marketing", color: "#58d86b", baseSpeed: 0.96, baseAccuracy: 0.89, employeeCost: 24, taskType: "Hype" },
      { id: "support", name: "Community", color: "#42d7d4", baseSpeed: 0.94, baseAccuracy: 0.9, employeeCost: 20, taskType: "Ticket" },
      { id: "accounting", name: "Accounting", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 21, taskType: "Invoice" },
    ],
    startingEmployees: {
      design: 1,
      development: 2,
      qa: 1,
      marketing: 1,
      support: 1,
      accounting: 1,
    },
    baseTaskValue: 400,
    leadInterval: 2,
  },

  // ---------------------------------------------------------------------------
  // Advanced tier — teach corporate strategy. Each unlocks an entirely new layer
  // (IPO/board, government contracting, holding/multi-company, investment fund).
  // Holding Company / Investment Fund additionally require the prestige-5
  // "business empire" tier (`unlockPrestige`).
  // ---------------------------------------------------------------------------
  {
    id: "enterprise-corp",
    name: "Enterprise Corporation",
    tagline: "Run a public-scale corporation with a board and shareholders.",
    taskName: "Enterprise Account",
    tier: "advanced",
    departments: [
      { id: "sales", name: "Enterprise Sales", color: "#58d86b", baseSpeed: 1.0, baseAccuracy: 0.93, employeeCost: 24, taskType: "Lead" },
      { id: "strategy", name: "Strategy", color: "#4bb4ff", baseSpeed: 0.82, baseAccuracy: 0.94, employeeCost: 30, taskType: "Plan" },
      { id: "operations", name: "Operations", color: "#ff8c42", baseSpeed: 0.7, baseAccuracy: 0.89, employeeCost: 32, taskType: "Delivery" },
      { id: "analytics", name: "Analytics", color: "#42d7d4", baseSpeed: 0.9, baseAccuracy: 0.95, employeeCost: 28, taskType: "Report" },
      { id: "support", name: "Account Mgmt", color: "#a16cff", baseSpeed: 0.9, baseAccuracy: 0.9, employeeCost: 26, taskType: "Ticket" },
      { id: "accounting", name: "Finance", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 26, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      strategy: 1,
      operations: 2,
      analytics: 1,
      support: 1,
      accounting: 1,
    },
    baseTaskValue: 720,
    leadInterval: 2.4,
  },
  {
    id: "holding-company",
    name: "Holding Company",
    tagline: "Own a portfolio of businesses and move capital between them.",
    taskName: "Portfolio Review",
    tier: "advanced",
    unlockPrestige: 5,
    departments: [
      { id: "strategy", name: "Corporate Strategy", color: "#4bb4ff", baseSpeed: 0.84, baseAccuracy: 0.95, employeeCost: 32, taskType: "Plan" },
      { id: "operations", name: "Operations", color: "#ff8c42", baseSpeed: 0.74, baseAccuracy: 0.9, employeeCost: 33, taskType: "Oversight" },
      { id: "analytics", name: "Analytics", color: "#42d7d4", baseSpeed: 0.9, baseAccuracy: 0.95, employeeCost: 30, taskType: "Report" },
      { id: "support", name: "Shared Services", color: "#a16cff", baseSpeed: 0.9, baseAccuracy: 0.9, employeeCost: 27, taskType: "Ticket" },
      { id: "accounting", name: "Treasury", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.97, employeeCost: 28, taskType: "Transfer" },
    ],
    startingEmployees: {
      strategy: 2,
      operations: 2,
      analytics: 1,
      support: 1,
      accounting: 1,
    },
    baseTaskValue: 820,
    leadInterval: 2.6,
  },
  {
    id: "investment-fund",
    name: "Investment Fund",
    tagline: "Source deals, take equity, and live off portfolio returns.",
    taskName: "Deal Flow",
    tier: "advanced",
    unlockPrestige: 5,
    departments: [
      { id: "analysis", name: "Deal Sourcing", color: "#58d86b", baseSpeed: 0.92, baseAccuracy: 0.94, employeeCost: 30, taskType: "Lead" },
      { id: "strategy", name: "Due Diligence", color: "#4bb4ff", baseSpeed: 0.8, baseAccuracy: 0.95, employeeCost: 34, taskType: "Review" },
      { id: "operations", name: "Portfolio Ops", color: "#ff8c42", baseSpeed: 0.74, baseAccuracy: 0.9, employeeCost: 33, taskType: "Manage" },
      { id: "analytics", name: "Analytics", color: "#42d7d4", baseSpeed: 0.9, baseAccuracy: 0.96, employeeCost: 31, taskType: "Report" },
      { id: "accounting", name: "Fund Accounting", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.97, employeeCost: 30, taskType: "Distribution" },
    ],
    startingEmployees: {
      analysis: 2,
      strategy: 1,
      operations: 1,
      analytics: 1,
      accounting: 1,
    },
    baseTaskValue: 900,
    leadInterval: 2.8,
  },
  {
    id: "government-contractor",
    name: "Government Contractor",
    tagline: "Win national tenders and survive the audits that follow.",
    taskName: "Public Contract",
    tier: "advanced",
    departments: [
      { id: "sales", name: "Bids & Tenders", color: "#58d86b", baseSpeed: 0.96, baseAccuracy: 0.93, employeeCost: 24, taskType: "Tender" },
      { id: "procurement", name: "Procurement", color: "#4bb4ff", baseSpeed: 0.86, baseAccuracy: 0.94, employeeCost: 26, taskType: "Purchase Order" },
      { id: "operations", name: "Delivery", color: "#ff8c42", baseSpeed: 0.7, baseAccuracy: 0.89, employeeCost: 31, taskType: "Project" },
      { id: "quality-control", name: "Compliance", color: "#a16cff", baseSpeed: 0.78, baseAccuracy: 0.95, employeeCost: 28, taskType: "Audit Check" },
      { id: "accounting", name: "Finance", color: "#f5c846", baseSpeed: 0.9, baseAccuracy: 0.97, employeeCost: 26, taskType: "Invoice" },
    ],
    startingEmployees: {
      sales: 2,
      procurement: 1,
      operations: 2,
      "quality-control": 1,
      accounting: 1,
    },
    baseTaskValue: 680,
    leadInterval: 2.4,
  },
];

// Per-company emoji icon for the compact, visual company cards (mobile-game feel).
// Kept as data so a card never has to fall back to text. Stamped onto each company
// type below so consumers read `companyType.icon`.
const COMPANY_ICONS = {
  "coffee-shop": "☕",
  "digital-agency": "💻",
  "it-company": "🖥️",
  "marketing-agency": "📣",
  "ecommerce-company": "🛒",
  "manufacturing": "🏭",
  "logistics": "🚚",
  "tech-startup": "🚀",
  "game-studio": "🎮",
  "enterprise-corp": "🏢",
  "holding-company": "🏛️",
  "investment-fund": "💹",
  "government-contractor": "🛡️",
};
for (const company of COMPANY_TYPES) {
  company.icon = COMPANY_ICONS[company.id] ?? "🏢";
}

// id → company type, for save back-compat and validator/UI lookups by id.
export const COMPANY_TYPES_BY_ID = Object.fromEntries(COMPANY_TYPES.map((company) => [company.id, company]));
