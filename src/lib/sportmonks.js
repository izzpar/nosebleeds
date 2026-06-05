// src/lib/sportmonks.js — server-side SportMonks v3 client.
// Reads SPORTMONKS_API_KEY from the environment. SERVER-ONLY secret: never
// expose to the browser, never prefix with NEXT_PUBLIC_.
// Auth: token in the `Authorization` header (raw token, no "Bearer").

const SM_BASE = "https://api.sportmonks.com/v3";

// --- Verified against a live key (2026-06) ---
export const WC_LEAGUE_ID = 732;            // "World Cup"
export const WC_SEASON = { 2026: 26618, 2022: 18017, 2018: 892 };

// Per-player match-stat type IDs (verified on WC2022 fixture data).
export const STAT = {
  GOALS: 52,
  ASSISTS: 79,
  SHOTS_TOTAL: 42,
  SHOTS_ON_TARGET: 86,
  SHOTS_OFF_TARGET: 41,
  TACKLES: 78,
  TACKLES_WON: 27267,
  INTERCEPTIONS: 100,
  CLEARANCES: 101,
  MINUTES: 119,
  GOALS_CONCEDED: 88,
  GK_GOALS_CONCEDED: 1535,
  SAVES: 57,
  YELLOW: 84,
  RED: 83,            // not present in the sampled match; standard SportMonks id
  OFFSIDES: 51,
  PEN_SCORED: 111,
  PEN_WON: 115,
  PEN_COMMITTED: 114,
  OWN_GOAL: 324,      // standard id; confirm when one occurs live
  RATING: 118,
};

// Lineup position_id -> coarse fantasy role. (SportMonks standard position types.)
export const POSITION_ROLE = { 24: "GK", 25: "DEF", 26: "MID", 27: "FWD" };

export function hasKey() {
  return !!process.env.SPORTMONKS_API_KEY;
}

// Low-level fetch. Returns { ok, status, json }; never throws on HTTP errors.
export async function smFetch(path, { searchParams } = {}) {
  const key = process.env.SPORTMONKS_API_KEY;
  if (!key) throw new Error("SPORTMONKS_API_KEY not set");
  const url = new URL(`${SM_BASE}/${path.replace(/^\//, "")}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, { headers: { Authorization: key, Accept: "application/json" } });
  let json = {};
  try { json = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, json };
}

export async function listAccessibleLeagues() {
  return smFetch("football/leagues", { searchParams: { per_page: 200 } });
}

// The 48 national teams in a season (the draft/salary player pool lives under these).
export async function fetchSeasonTeams(seasonId) {
  return smFetch(`football/teams/seasons/${seasonId}`, { searchParams: { per_page: 100 } });
}

// A national team's squad for a season, with each player's position.
// Tries the season-specific squad first, falls back to the team's current squad.
export async function fetchSquad(teamId, seasonId) {
  let r = await smFetch(`football/squads/seasons/${seasonId}/teams/${teamId}`, {
    searchParams: { include: "player.position" },
  });
  if (!r.ok || r.json?.message || !(r.json?.data || []).length) {
    r = await smFetch(`football/squads/teams/${teamId}`, {
      searchParams: { include: "player.position" },
    });
  }
  return r;
}

// The season's team list includes knockout-bracket placeholders ("Winner
// Quarter-final 1", "Runner-up Group A", …). Keep only the real nations.
const PLACEHOLDER_NAME = /winner|runner[- ]?up|loser|group [a-l]\b|quarter|semi|^final$|third|play-?off|\btbd\b|to be|placeholder/i;
export function isRealNation(t) {
  const img = t.image || t.image_path || "";
  if (/placeholder/i.test(img)) return false;
  if (PLACEHOLDER_NAME.test(t.name || "")) return false;
  return true;
}

// Fixtures for a season (results + status), for scoring sweeps.
export async function fetchSeasonFixtures(seasonId) {
  return smFetch("football/fixtures", {
    searchParams: { filters: `fixtureSeasons:${seasonId}`, include: "participants;scores;state", per_page: 200 },
  });
}

// A single fixture with per-player stats (the scoring source). Verified include.
export async function fetchFixturePlayerStats(fixtureId) {
  return smFetch(`football/fixtures/${fixtureId}`, {
    searchParams: { include: "lineups.details.type;lineups.player;participants;scores;state" },
  });
}

// Normalize a fixture's lineups into flat per-player stat rows.
// `played` is true when the player has any recorded stats (unused subs have none).
export function parsePlayerStats(fixture) {
  const lineups = fixture?.lineups || [];
  return lineups.map((p) => {
    const stats = {};
    for (const d of p.details || []) {
      const id = d.type?.id ?? d.type_id;
      const val = d.data?.value;
      if (id != null) stats[id] = val;
    }
    return {
      player_id: p.player_id,
      name: p.player_name || p.player?.name,
      team_id: p.team_id,
      position_id: p.position_id,
      role: POSITION_ROLE[p.position_id] || "MID",
      minutes: Number(stats[STAT.MINUTES] || 0),
      played: (p.details || []).length > 0,
      stats,
    };
  });
}
