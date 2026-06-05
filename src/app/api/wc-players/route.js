// src/app/api/wc-players/route.js
// Server-side player pool for the player-draft / salary-cap modes. Pulls all 48
// World Cup squads from SportMonks (using SPORTMONKS_API_KEY, server-only) and
// returns a clean, browser-safe player list — the key never reaches the client.
//
// Cached at the edge (squads change rarely). Hit /api/wc-players?debug=1 to see
// a raw squad sample for verifying the response shape.

import { hasKey, fetchSeasonTeams, fetchSquad, fetchSquadStats, isRealNation, WC_SEASON } from "@/lib/sportmonks";
import { projectAndPrice } from "@/lib/projections";

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

  // 1) The 48 nations in the 2026 season (filtering out bracket placeholders).
  let teams = [];
  let rawCount = 0;
  try {
    const { ok, json } = await fetchSeasonTeams(SEASON);
    if (!ok) return Response.json({ ok: false, error: json?.message || "could not load teams" });
    rawCount = (json.data || []).length;
    teams = (json.data || [])
      .map((t) => ({ id: t.id, name: t.name, image: t.image_path }))
      .filter(isRealNation);
  } catch (e) {
    return Response.json({ ok: false, error: String(e) });
  }

  if (debug && teams[0]) {
    const sample = await fetchSquad(teams[0].id, SEASON);
    return Response.json({
      ok: true,
      rawTeamCount: rawCount,
      realTeamCount: teams.length,
      sampleTeam: teams[0],
      sampleNations: teams.slice(0, 8).map((t) => t.name),
      squadSize: (sample.json?.data || []).length,
      rawSquadSample: sample.json,
    });
  }

  // 2) Each squad (with season stats), flattened + projected. Fetched in
  // parallel batches so we stay well within the function time budget.
  const players = [];
  const BATCH = 12;
  for (let i = 0; i < teams.length; i += BATCH) {
    const slice = teams.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((team) => fetchSquadStats(team.id, SEASON).then((r) => ({ team, r })).catch(() => null))
    );
    for (const item of results) {
      if (!item || !item.r.ok) continue;
      const { team, r } = item;
      for (const row of r.json.data || []) {
        const player = row.player || {};
        const position = player.position || row.position;
        const base = {
          id: row.player_id || player.id,
          name: player.display_name || player.name || player.common_name,
          team_id: team.id,
          team_name: team.name,
          team_image: team.image,
          role: roleOf(position, row.position_id || player.position_id),
          image: player.image_path || null,
        };
        const { proj, price, form } = projectAndPrice({ ...base, statistics: player.statistics });
        players.push({ ...base, proj, price, g: form?.g ?? null, a: form?.a ?? null });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, teamCount: teams.length, playerCount: players.length, players }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
