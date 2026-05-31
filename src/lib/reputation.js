// Reputation ("Cred") — a permanent standing score derived from a user's
// activity and how the community responds to it. Computed live from existing
// tables (no schema needed). Likes received on your comments weigh heavily,
// since that's the community vouching for your takes.

export const REP = {
  perRating: 2,        // logging a game rating
  perReview: 5,        // writing a review
  perComment: 2,       // joining a discussion
  perLikeReceived: 4,  // someone reacted to your comment (quality signal)
  perFollower: 5,      // someone follows your takes
};

export function repScore({ ratings = 0, reviews = 0, comments = 0, likes = 0, followers = 0 }) {
  return Math.round(
    ratings * REP.perRating +
    reviews * REP.perReview +
    comments * REP.perComment +
    likes * REP.perLikeReceived +
    followers * REP.perFollower
  );
}

// Ascending tiers. Each has a floor score, label, emoji, and color.
export const REP_TIERS = [
  { min: 0,    name: "Rookie",        emoji: "🌱", color: "#a1a1aa" },
  { min: 75,   name: "Regular",       emoji: "🎟️", color: "#60a5fa" },
  { min: 200,  name: "Veteran",       emoji: "🎯", color: "#a3e635" },
  { min: 500,  name: "All-Star",      emoji: "⭐", color: "#fbbf24" },
  { min: 1200, name: "Superstar",     emoji: "🔥", color: "#fb923c" },
  { min: 3000, name: "Hall of Famer", emoji: "🏆", color: "#f59e0b" },
];

export function repTier(score) {
  let tier = REP_TIERS[0];
  for (const t of REP_TIERS) { if (score >= t.min) tier = t; }
  return tier;
}

// The next tier up (or null if maxed) — for progress bars.
export function nextTier(score) {
  return REP_TIERS.find((t) => t.min > score) || null;
}

// 0–1 progress through the current tier toward the next.
export function tierProgress(score) {
  const cur = repTier(score);
  const next = nextTier(score);
  if (!next) return 1;
  return Math.max(0, Math.min(1, (score - cur.min) / (next.min - cur.min)));
}
