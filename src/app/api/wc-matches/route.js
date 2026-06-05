// Server endpoint: the World Cup fixture list (teams, scores, status, kickoff)
// for the match-ratings feature. Computed from SportMonks; cached.

import { hasKey, smFetch, WC_SEASON } from "@/lib/sportmonks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const SEASON = WC_SEASON[2026];

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

export async function GET() {
  if (!hasKey()) return Response.json({ ok: false, matches: [], message: "SPORTMONKS_API_KEY not set" });
  const fixtures = [];
  for (let page = 1; page <= 6; page++) {
    const { ok, json } = await smFetch("football/fixtures", {
      searchParams: { filters: `fixtureSeasons:${SEASON}`, include: "participants;scores;state;round", per_page: 50, page },
    });
    if (!ok) break;
    const data = json.data || [];
    fixtures.push(...data);
    if (data.length < 50) break;
  }

  const matches = fixtures.map((fx) => {
    const dev = fx.state?.developer_name || "NS";
    const status = FINISHED.has(dev) ? "finished" : LIVE.has(dev) ? "live" : "upcoming";
    return {
      id: String(fx.id),
      starting_at: fx.starting_at || null,
      kickoff: fx.starting_at_timestamp ? fx.starting_at_timestamp * 1000 : (fx.starting_at ? Date.parse(fx.starting_at) : null),
      status,
      state: dev,
      state_label: fx.state?.name || fx.state?.short_name || "",
      round: fx.round?.name || "",
      ...parseTeams(fx),
      score: parseScore(fx),
    };
  }).filter((m) => m.home && m.away)
    .sort((a, b) => (a.kickoff || 0) - (b.kickoff || 0));

  return new Response(JSON.stringify({ ok: true, matches }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
  });
}
