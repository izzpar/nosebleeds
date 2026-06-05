// src/app/api/wc-players/route.js
// Server-side player pool for the player-draft / salary-cap modes. Pulls all 48
// World Cup squads from SportMonks (using SPORTMONKS_API_KEY, server-only) and
// returns a clean, browser-safe player list — the key never reaches the client.
//
// Cached at the edge (squads change rarely). Hit /api/wc-players?debug=1 to see
// a raw squad sample for verifying the response shape.

import { hasKey, fetchSeasonTeams, fetchSquad, WC_SEASON, smFetch } from "@/lib/sportmonks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEASON = WC_SEASON[2026];

// Map a SportMonks position (id or name) to a coarse fantasy role.
function roleOf(position, positionId) {
  const byId = { 24: "GK", 25: "DEF", 26: "MID", 27: "FWD" };
  if (byId[positionId]) return byId[positionId];
  const name = (position?.name || position?.developer_name || "").toLowerCase();
  if (/keeper|goalkeep/.test(name)) return "GK";
  if (/back|defend/.test(name)) return "DEF";
  if (/midfield/.test(name)) return "MID";
  if (/forward|attack|strike|winger/.test(name)) return "FWD";
  return "MID";
}

export async function GET(request) {
  if (!hasKey()) {
    return Response.json({ ok: false, keySet: false, message: "SPORTMONKS_API_KEY not set in this environment." });
  }
  const debug = new URL(request.url).searchParams.get("debug");

  // 1) The 48 nations in the 2026 season.
  let teams = [];
  try {
    const { ok, json } = await fetchSeasonTeams(SEASON);
    if (!ok) return Response.json({ ok: false, error: json?.message || "could not load teams" });
    teams = (json.data || []).map((t) => ({ id: t.id, name: t.name, image: t.image_path }));
  } catch (e) {
    return Response.json({ ok: false, error: String(e) });
  }

  if (debug && teams[0]) {
    const sample = await fetchSquad(teams[0].id, SEASON);
    return Response.json({ ok: true, teamCount: teams.length, sampleTeam: teams[0], rawSquadSample: sample.json });
  }

  // 2) Each squad, flattened to a browser-safe player list.
  const players = [];
  for (const team of teams) {
    try {
      const { ok, json } = await fetchSquad(team.id, SEASON);
      if (!ok) continue;
      for (const row of json.data || []) {
        const player = row.player || {};
        const position = player.position || row.position;
        players.push({
          id: row.player_id || player.id,
          name: player.display_name || player.name || player.common_name,
          team_id: team.id,
          team_name: team.name,
          team_image: team.image,
          role: roleOf(position, row.position_id || player.position_id),
          image: player.image_path || null,
        });
      }
    } catch (e) { /* skip a failing squad */ }
  }

  return new Response(JSON.stringify({ ok: true, teamCount: teams.length, playerCount: players.length, players }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
