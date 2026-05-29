// 🩸 Drops — the app's earn-and-spend currency.
// "Earned" is computed live from a user's activity; "spent" is derived from the
// items they've unlocked (stored in profiles.unlocked), so only ONE column is
// needed: `unlocked text[]`.

export const DROPS = {
  perRating: 5,   // logging a game rating
  perReview: 10,  // writing a review
  perLike: 1,     // each reaction someone leaves on your comment
};

// Unlockable emote packs — these become extra comment reactions.
export const EMOTE_PACKS = [
  { id: "pack_hype", name: "Hype Pack", emoji: "🔥", cost: 100, emotes: ["🔥", "🎉", "🤯", "🐐", "💯"] },
  { id: "pack_salt", name: "Salty Pack", emoji: "🧂", cost: 100, emotes: ["🧂", "💀", "🤡", "😭", "🥶"] },
  { id: "pack_party", name: "Party Pack", emoji: "🍿", cost: 250, emotes: ["🍿", "🙌", "🚨", "🎰", "👑"] },
];

// Drops earned from raw activity counts.
export function dropsEarned({ ratings = 0, reviews = 0, likes = 0 }) {
  return ratings * DROPS.perRating + reviews * DROPS.perReview + likes * DROPS.perLike;
}

// Total Drops spent, derived from the list of unlocked item ids.
export function dropsSpent(unlocked = []) {
  return (unlocked || []).reduce((sum, id) => sum + (EMOTE_PACKS.find((p) => p.id === id)?.cost || 0), 0);
}

// Flattened, de-duped list of emotes a user has unlocked.
export function emotesFor(unlocked = []) {
  const set = new Set();
  (unlocked || []).forEach((id) => (EMOTE_PACKS.find((p) => p.id === id)?.emotes || []).forEach((e) => set.add(e)));
  return [...set];
}
