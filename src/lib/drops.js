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

// Unlockable name-color flair (applied to your display name across the app).
export const NAME_FLAIR = [
  { id: "flair_aqua", name: "Aqua", color: "#22d3ee", cost: 200 },
  { id: "flair_gold", name: "Gold", color: "#fbbf24", cost: 400 },
  { id: "flair_crimson", name: "Crimson", color: "#f43f5e", cost: 400 },
  { id: "flair_violet", name: "Violet", color: "#a855f7", cost: 700 },
];

// Every purchasable item (used to total spend regardless of type).
const ALL_ITEMS = [...EMOTE_PACKS, ...NAME_FLAIR];

// Total Drops spent, derived from the list of unlocked item ids.
export function dropsSpent(unlocked = []) {
  return (unlocked || []).reduce((sum, id) => sum + (ALL_ITEMS.find((p) => p.id === id)?.cost || 0), 0);
}

// The name color to apply (priciest unlocked flair wins), or null.
export function nameColor(unlocked = []) {
  let color = null, best = -1;
  (unlocked || []).forEach((id) => { const f = NAME_FLAIR.find((x) => x.id === id); if (f && f.cost > best) { color = f.color; best = f.cost; } });
  return color;
}

// Flattened, de-duped list of emotes a user has unlocked.
export function emotesFor(unlocked = []) {
  const set = new Set();
  (unlocked || []).forEach((id) => (EMOTE_PACKS.find((p) => p.id === id)?.emotes || []).forEach((e) => set.add(e)));
  return [...set];
}
