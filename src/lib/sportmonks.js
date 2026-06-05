// src/lib/sportmonks.js — server-side SportMonks v3 client.
// Reads SPORTMONKS_API_KEY from the environment. This is a SERVER-ONLY secret:
// never expose it to the browser and never prefix it with NEXT_PUBLIC_.
//
// Auth: SportMonks v3 accepts the token in the `Authorization` header (raw
// token, no "Bearer"). Docs: https://docs.sportmonks.com/v3/

const SM_BASE = "https://api.sportmonks.com/v3";

export function hasKey() {
  return !!process.env.SPORTMONKS_API_KEY;
}

// Low-level fetch. Returns { ok, status, json } and never throws on HTTP errors
// so callers can surface SportMonks' own error messages.
export async function smFetch(path, { searchParams } = {}) {
  const key = process.env.SPORTMONKS_API_KEY;
  if (!key) throw new Error("SPORTMONKS_API_KEY not set");
  const url = new URL(`${SM_BASE}/${path.replace(/^\//, "")}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  let json = {};
  try { json = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, json };
}

// Lists the leagues your subscription can access. Used to DISCOVER the World
// Cup league id + current season id for your specific plan, so we don't have to
// hardcode the (plan-dependent) IDs that the research flagged as "verify first".
export async function listAccessibleLeagues() {
  return smFetch("football/leagues", { searchParams: { per_page: 200 } });
}

// ---- The functions below are fleshed out once we've verified the real v3
// ---- response shapes against a live key (includes syntax, stat type ids, etc).
// ---- Intentionally thin stubs for now; see /api/sm-health to validate access.

// Squad (player pool) for a national team in a given season.
export async function fetchSquad(teamId, seasonId) {
  return smFetch(`football/squads/teams/${teamId}/seasons/${seasonId}`, {
    searchParams: { include: "player.position" },
  });
}

// Fixtures for the World Cup season (results + status), for scoring sweeps.
export async function fetchSeasonFixtures(seasonId) {
  return smFetch("football/fixtures", {
    searchParams: { filters: `fixtureSeasons:${seasonId}`, include: "participants;scores;state" },
  });
}

// Per-player statistics + lineups for a single fixture (the scoring source).
export async function fetchFixturePlayerStats(fixtureId) {
  return smFetch(`football/fixtures/${fixtureId}`, {
    searchParams: { include: "lineups.details;lineups.player;statistics;state" },
  });
}
