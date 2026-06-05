// Server-side proxy for the 48 World Cup nations from ESPN. Some users' networks
// block/again fail the client-side ESPN call, blanking the Power Ranking — this
// fetches it server-side (reliable) and caches it. Same shape as fetchTeams().

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const WC_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

export async function GET() {
  try {
    const r = await fetch(`${WC_BASE}/teams`);
    const d = await r.json();
    const list = d?.sports?.[0]?.leagues?.[0]?.teams || [];
    const teams = list
      .map(({ team }) => ({
        id: String(team.id),
        abbr: team.abbreviation,
        name: team.displayName,
        color: team.color,
        logo: team.logos?.[0]?.href || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return new Response(JSON.stringify({ ok: true, teams }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (e) {
    return Response.json({ ok: false, teams: [], error: String(e) });
  }
}
