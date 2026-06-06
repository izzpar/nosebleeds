// Server endpoint: the World Cup's rounds (matchdays + knockout rounds) with
// each round's lock time (first kickoff). The transfers/waivers UIs use this to
// know when edits close. Computed from SportMonks fixtures; cached.

import { hasKey, smFetch, WC_SEASON } from "@/lib/sportmonks";
import { buildRounds } from "@/lib/rounds";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const SEASON = WC_SEASON[2026];

export async function GET() {
  if (!hasKey()) return Response.json({ ok: false, rounds: [], message: "SPORTMONKS_API_KEY not set" });
  const fixtures = [];
  for (let page = 1; page <= 6; page++) {
    const { ok, json } = await smFetch("football/fixtures", {
      searchParams: { filters: `fixtureSeasons:${SEASON}`, include: "state;round", per_page: 50, page },
    });
    if (!ok) break;
    const data = json.data || [];
    fixtures.push(...data);
    if (data.length < 50) break;
  }
  const now = Date.now();
  const rounds = buildRounds(fixtures).map((r) => ({
    round_id: r.round_id,
    index: r.index,
    label: r.label,
    lock: r.lock,
    locked: r.lock <= now,
    count: r.count,
  }));
  const currentIndex = rounds.reduce((acc, r, i) => (r.locked ? i : acc), -1);

  return new Response(JSON.stringify({ ok: true, currentIndex, rounds }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
