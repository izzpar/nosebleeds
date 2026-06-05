// Real player projections + salary-cap pricing, from SportMonks season stats.
// On the World Cup plan the accessible statistics are players' international
// (national-team) production — goals, assists, minutes, appearances, rating —
// which we blend with a nation-strength prior so low-cap players still get a
// sensible number. Pure/server-usable.

import { nationStrength } from "@/lib/worldcup";

// Prior weights leave headroom so real production differentiates the top
// (rather than everyone saturating at the cap).
const POS_W = { FWD: 0.78, MID: 0.70, DEF: 0.62, GK: 0.55 };
const ROLE_OUT = { FWD: 1.0, MID: 0.75, DEF: 0.4, GK: 0.3 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Season stat type-ids (season-aggregate shape: value is an object).
const T = { GOALS: 52, ASSISTS: 79, MINUTES: 119, APPEARANCES: 321, RATING: 118 };

// Richest season = the one with the most populated detail rows (a player's
// fullest recent national-team campaign).
function bestSeason(statistics = []) {
  const withDetails = (statistics || []).filter((s) => (s.details || []).length);
  if (!withDetails.length) return null;
  return withDetails.sort((a, b) => b.details.length - a.details.length)[0];
}

export function playerForm(player) {
  const s = bestSeason(player?.statistics);
  if (!s) return null;
  const m = {};
  for (const d of s.details || []) m[d.type_id] = d.value;
  const total = (v) => (v && typeof v === "object" ? v.total ?? 0 : v || 0);
  return {
    g: total(m[T.GOALS]),
    a: total(m[T.ASSISTS]),
    min: total(m[T.MINUTES]),
    app: total(m[T.APPEARANCES]),
    rating: m[T.RATING]?.average || 0,
    season_id: s.season_id,
  };
}

// Returns { proj (5–99), price (€4.0–13.0), form }.
export function projectAndPrice(player) {
  const role = player?.role || "MID";
  const prior = nationStrength(player?.team_name) * (POS_W[role] ?? 0.7);
  const f = playerForm(player);

  // Performance bump from real international output (only with enough sample).
  let perf = 0;
  if (f && f.min >= 200 && f.app >= 4) {
    const per90 = 90 / Math.max(f.min, 1);
    const g90 = f.g * per90;
    const a90 = f.a * per90;
    const outAdj = (g90 * 9 + a90 * 6) * (ROLE_OUT[role] ?? 0.6);
    const ratAdj = f.rating ? (f.rating - 6.8) * 4 : 0;
    perf = clamp(outAdj + ratAdj, -8, 28);
  }
  // Availability: uncapped / barely-played players are unlikely starters.
  let avail = 0;
  if (!f || f.min < 90) avail = -16;
  else if (f.min < 300) avail = -4;

  const proj = clamp(Math.round(prior + perf + avail), 5, 99);
  // Cheaper, more affordable spread: €4.0–€11.0, with lots of sub-€6 options so a
  // €100m / 15-player squad is comfortably buildable.
  const price = Math.round((4 + clamp((proj - 45) / 50, 0, 1) * 7) * 10) / 10;
  return { proj, price, form: f };
}
