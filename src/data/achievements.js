// Achievements / celebration milestones (#5: "Big Celebration Moments").
//
// Each entry is a stable id + an emoji icon + display order. The *detection* lives
// in simulation.js (evaluateAchievements) because it reads live state; this file is
// just the data the UI and localization key off (`achievement.<id>.{title,desc}`).
// Achievements fire once, are stored on `state.achievements`, and pop a celebration
// overlay (confetti + popup) the moment they unlock. Order = roughly the order a
// growing company reaches them, so the celebration cadence tells the growth story.

export const ACHIEVEMENTS = [
  { id: "first-profit", icon: "💰", order: 1 },
  { id: "first-automation", icon: "⚙️", order: 2 },
  { id: "small-business", icon: "🏪", order: 3 },
  { id: "first-manager", icon: "🧑‍💼", order: 4 },
  { id: "first-funding", icon: "🤝", order: 5 },
  { id: "growing-company", icon: "📈", order: 6 },
  { id: "first-million", icon: "💵", order: 7 },
  { id: "market-leader", icon: "👑", order: 8 },
  { id: "enterprise", icon: "🏢", order: 9 },
  { id: "ai-era", icon: "🤖", order: 10 },
  { id: "corporation", icon: "🏛️", order: 11 },
  { id: "autonomous", icon: "✨", order: 12 },
];

export const ACHIEVEMENT_BY_ID = ACHIEVEMENTS.reduce((map, achievement) => {
  map[achievement.id] = achievement;
  return map;
}, {});

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
