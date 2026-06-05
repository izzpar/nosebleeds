// src/app/api/wc-score/route.js
// Vercel Cron: recompute cumulative fantasy points for every World Cup player
// from completed matches, and upsert them into wc_player_points. Player-league
// standings read from that table.
//
// Required env: SPORTMONKS_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, (optional) CRON_SECRET.

import { smFetch, parsePlayerStats, WC_SEASON } from "@/lib/sportmonks";
import { playerMatchPoints, playerComponents, addComponents } from "@/lib/playerScoring";
import { buildRounds, fixtureRoundMap } from "@/lib/rounds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEASON = WC_SEASON[2026];
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FINISHED = new Set(["FT", "AET", "FT_PEN"]);

async function sb(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

// All season fixtures (paginated), with round + state for round-building.
async function allFixtures() {
  const out = [];
  for (let page = 1; page <= 6; page++) {
    const { ok, json } = await smFetch("football/fixtures", {
      searchParams: { filters: `fixtureSeasons:${SEASON}`, include: "state;round", per_page: 50, page },
    });
    if (!ok) break;
    const data = json.data || [];
    out.push(...data);
    if (data.length < 50) break;
  }
  return out;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
  }
  if (!SERVICE_KEY) return Response.json({ error: "missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  if (!process.env.SPORTMONKS_API_KEY) return Response.json({ error: "missing SPORTMONKS_API_KEY" }, { status: 500 });

  const fixtures = await allFixtures();
  const rounds = buildRounds(fixtures);
  const roundOf = fixtureRoundMap(rounds);
  const completedIds = fixtures.filter((f) => FINISHED.has(f.state?.developer_name)).map((f) => f.id);
  if (completedIds.length === 0) {
    return Response.json({ ok: true, fixtures: 0, players: 0, message: "no completed matches yet" });
  }

  // Accumulate cumulative per-player totals + per-(player,round) points.
  const totals = {};      // player_id -> {points, matches, goals, assists, minutes, name, team_id}
  const roundPts = {};    // `${player_id}|${round_id}` -> points
  const BATCH = 10;
  for (let i = 0; i < completedIds.length; i += BATCH) {
    const slice = completedIds.slice(i, i + BATCH);
    const detail = await Promise.all(
      slice.map((id) =>
        smFetch(`football/fixtures/${id}`, { searchParams: { include: "lineups.details.type" } })
          .then((r) => (r.ok ? r.json.data : null))
          .catch(() => null)
      )
    );
    for (const fx of detail) {
      if (!fx) continue;
      const rid = roundOf[String(fx.id)] || "0";
      for (const p of parsePlayerStats(fx)) {
        if (!p.player_id || !p.played) continue;
        const key = String(p.player_id);
        const pts = playerMatchPoints(p);
        const t = (totals[key] = totals[key] || {
          points: 0, matches: 0, goals: 0, assists: 0, minutes: 0,
          name: p.name, team_id: p.team_id, role: p.role, components: {},
        });
        t.points += pts;
        t.matches += 1;
        t.goals += Number(p.stats[52] || 0);
        t.assists += Number(p.stats[79] || 0);
        t.minutes += p.minutes;
        t.role = p.role;
        t.components = addComponents(t.components, playerComponents(p));
        const rk = `${key}|${rid}`;
        roundPts[rk] = (roundPts[rk] || 0) + pts;
      }
    }
  }

  const rows = Object.entries(totals).map(([player_id, t]) => ({
    player_id,
    player_name: t.name,
    team_id: String(t.team_id ?? ""),
    points: Math.round(t.points * 100) / 100,
    matches: t.matches,
    goals: t.goals,
    assists: t.assists,
    minutes: t.minutes,
    role: t.role || null,
    components: t.components || {},
    updated_at: new Date().toISOString(),
  }));

  // Bulk upsert cumulative totals.
  const res = await sb("wc_player_points?on_conflict=player_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });

  // Bulk upsert per-round points (powers per-round snapshot scoring).
  const roundRows = Object.entries(roundPts).map(([k, pts]) => {
    const [player_id, round_id] = k.split("|");
    return { player_id, round_id, points: Math.round(pts * 100) / 100 };
  });
  let roundStatus = 204;
  if (roundRows.length) {
    const rr = await sb("wc_player_round_points?on_conflict=player_id,round_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(roundRows),
    });
    roundStatus = rr.status;
  }

  return Response.json({
    ok: res.ok,
    fixtures: completedIds.length,
    rounds: rounds.length,
    players: rows.length,
    roundRows: roundRows.length,
    status: res.status,
    roundStatus,
  });
}
