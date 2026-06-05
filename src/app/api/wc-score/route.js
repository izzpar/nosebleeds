// src/app/api/wc-score/route.js
// Vercel Cron: recompute cumulative fantasy points for every World Cup player
// from completed matches, and upsert them into wc_player_points. Player-league
// standings read from that table.
//
// Required env: SPORTMONKS_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, (optional) CRON_SECRET.

import { smFetch, parsePlayerStats, WC_SEASON } from "@/lib/sportmonks";
import { playerMatchPoints } from "@/lib/playerScoring";

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

// All season fixtures (paginated), keeping only completed ones.
async function completedFixtures() {
  const out = [];
  for (let page = 1; page <= 6; page++) {
    const { ok, json } = await smFetch("football/fixtures", {
      searchParams: { filters: `fixtureSeasons:${SEASON}`, include: "state", per_page: 50, page },
    });
    if (!ok) break;
    const data = json.data || [];
    for (const f of data) {
      if (FINISHED.has(f.state?.developer_name)) out.push(f.id);
    }
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

  const fixtureIds = await completedFixtures();
  if (fixtureIds.length === 0) {
    return Response.json({ ok: true, fixtures: 0, players: 0, message: "no completed matches yet" });
  }

  // Accumulate per-player totals across all completed fixtures (full recompute).
  const totals = {}; // player_id -> {points, matches, goals, assists, minutes, name, team_id}
  const BATCH = 10;
  for (let i = 0; i < fixtureIds.length; i += BATCH) {
    const slice = fixtureIds.slice(i, i + BATCH);
    const fixtures = await Promise.all(
      slice.map((id) =>
        smFetch(`football/fixtures/${id}`, { searchParams: { include: "lineups.details.type" } })
          .then((r) => (r.ok ? r.json.data : null))
          .catch(() => null)
      )
    );
    for (const fx of fixtures) {
      if (!fx) continue;
      for (const p of parsePlayerStats(fx)) {
        if (!p.player_id || !p.played) continue;
        const key = String(p.player_id);
        const t = (totals[key] = totals[key] || {
          points: 0, matches: 0, goals: 0, assists: 0, minutes: 0,
          name: p.name, team_id: p.team_id,
        });
        t.points += playerMatchPoints(p);
        t.matches += 1;
        t.goals += Number(p.stats[52] || 0);
        t.assists += Number(p.stats[79] || 0);
        t.minutes += p.minutes;
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
    updated_at: new Date().toISOString(),
  }));

  // Bulk upsert.
  const res = await sb("wc_player_points?on_conflict=player_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });

  return Response.json({
    ok: res.ok,
    fixtures: fixtureIds.length,
    players: rows.length,
    status: res.status,
  });
}
