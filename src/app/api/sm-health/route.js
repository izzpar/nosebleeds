// src/app/api/sm-health/route.js
// One-shot health check for the SportMonks integration. Hit this on your
// preview URL (/api/sm-health) AFTER setting SPORTMONKS_API_KEY in Vercel.
// It validates the token and reports which leagues / World Cup season IDs your
// plan can access. It NEVER returns the key itself. Safe to delete post-setup.

import { hasKey, listAccessibleLeagues } from "@/lib/sportmonks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  if (!hasKey()) {
    return Response.json({
      ok: false,
      keySet: false,
      message: "SPORTMONKS_API_KEY is not set in this environment. Add it in Vercel → Settings → Environment Variables (Production + Preview), then redeploy.",
    });
  }

  try {
    const { ok, status, json } = await listAccessibleLeagues();
    if (!ok) {
      return Response.json({
        ok: false,
        keySet: true,
        status,
        error: json?.message || json,
        hint: "Token is set but SportMonks rejected the request — check the token value and that your plan is active.",
      });
    }
    const leagues = (json.data || []).map((l) => ({ id: l.id, name: l.name }));
    const worldCup = leagues.filter((l) => /world cup/i.test(l.name || ""));
    return Response.json({
      ok: true,
      keySet: true,
      leagueCount: leagues.length,
      worldCupLeagues: worldCup,            // <-- the league id(s) we build around
      sampleLeagues: leagues.slice(0, 15),
    });
  } catch (e) {
    return Response.json({ ok: false, keySet: true, error: String(e) });
  }
}
