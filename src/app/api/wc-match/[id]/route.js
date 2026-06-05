// Server endpoint: a single World Cup fixture with the players who featured —
// powers the match-rating page (header + Star Man picker).

import { hasKey, fetchFixturePlayerStats, parsePlayerStats } from "@/lib/sportmonks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FINISHED = new Set(["FT", "AET", "FT_PEN"]);
const LIVE = new Set([
  "INPLAY_1ST_HALF", "INPLAY_2ND_HALF", "HT", "BREAK", "EXTRA_TIME",
  "INPLAY_ET", "INPLAY_ET_2ND_HALF", "PEN_BREAK", "INPLAY_PENALTIES",
]);

function parseTeams(fx) {
  const ps = fx.participants || [];
  const find = (loc) => ps.find((p) => p.meta?.location === loc) || null;
  const map = (p) => (p ? { id: String(p.id), name: p.name, logo: p.image_path || "" } : null);
  return { home: map(find("home")), away: map(find("away")) };
}

function parseScore(fx) {
  const out = { home: null, away: null };
  for (const s of fx.scores || []) {
    if (s.description === "CURRENT") {
      const loc = s.score?.participant;
      if (loc === "home") out.home = s.score.goals;
      else if (loc === "away") out.away = s.score.goals;
    }
  }
  return out;
}

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!hasKey()) return Response.json({ ok: false, message: "SPORTMONKS_API_KEY not set" }, { status: 503 });
  const { ok, json } = await fetchFixturePlayerStats(id);
  if (!ok || !json?.data) return Response.json({ ok: false, message: "fixture not found" }, { status: 404 });
  const fx = json.data;
  const dev = fx.state?.developer_name || "NS";
  const status = FINISHED.has(dev) ? "finished" : LIVE.has(dev) ? "live" : "upcoming";

  const players = parsePlayerStats(fx)
    .map((p) => ({
      id: String(p.player_id),
      name: p.name || "Player",
      team_id: String(p.team_id ?? ""),
      role: p.role,
      minutes: p.minutes,
      played: p.played,
    }))
    .filter((p) => p.id && p.name)
    .sort((a, b) => (b.played - a.played) || (b.minutes - a.minutes));

  return new Response(JSON.stringify({
    ok: true,
    match: {
      id: String(fx.id),
      starting_at: fx.starting_at || null,
      kickoff: fx.starting_at_timestamp ? fx.starting_at_timestamp * 1000 : (fx.starting_at ? Date.parse(fx.starting_at) : null),
      status, state: dev,
      state_label: fx.state?.name || "",
      round: fx.round?.name || "",
      ...parseTeams(fx),
      score: parseScore(fx),
    },
    players,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
