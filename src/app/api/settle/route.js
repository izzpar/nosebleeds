// src/app/api/settle/route.js
// Server-side settlement backstop, run on a schedule by Vercel Cron.
// Settles EVERY user's pending picks (pick'em + Beat the Streak) once their
// game has finished. Uses the Supabase service-role key to bypass RLS.
//
// Required env vars (set in Vercel project settings + .env.local for local testing):
//   NEXT_PUBLIC_SUPABASE_URL       (already set)
//   SUPABASE_SERVICE_ROLE_KEY      (server-only secret — NEVER prefix with NEXT_PUBLIC_)
//   CRON_SECRET                    (optional; if set, Vercel sends it and we verify)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

export async function GET(request) {
  // If CRON_SECRET is configured, require Vercel's Authorization header to match.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
  }
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "missing SUPABASE_SERVICE_ROLE_KEY" }), { status: 500 });
  }

  const nowIso = new Date().toISOString();

  // All pending picks whose game has already locked (started)
  let pending = [];
  try {
    const r = await sb(`predictions?status=eq.pending&locks_at=lt.${nowIso}&select=*`);
    pending = await r.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "fetch pending failed", detail: String(e) }), { status: 500 });
  }
  if (!Array.isArray(pending) || pending.length === 0) {
    return Response.json({ ok: true, settled: 0, message: "nothing to settle" });
  }

  // Group picks by game so we fetch each game's result only once
  const byGame = {};
  for (const p of pending) {
    const key = `${p.sport || "nfl"}:${p.game_id}`;
    (byGame[key] = byGame[key] || []).push(p);
  }

  let settled = 0;
  for (const key of Object.keys(byGame)) {
    const sep = key.indexOf(":");
    const sport = key.slice(0, sep);
    const gameId = key.slice(sep + 1);
    const sportPath = SPORT_PATHS[sport] || SPORT_PATHS.nfl;

    let d;
    try {
      const r = await fetch(`${ESPN_BASE}/${sportPath}/summary?event=${gameId}`);
      if (!r.ok) continue;
      d = await r.json();
    } catch (e) { continue; }

    const comp = d.header?.competitions?.[0];
    if (!comp?.status?.type?.completed) continue; // game not final yet

    const competitors = comp.competitors || [];
    const homeC = competitors.find((c) => c.homeAway === "home");
    const awayC = competitors.find((c) => c.homeAway === "away");
    if (!homeC || !awayC) continue;
    const homeAbbr = homeC.team?.abbreviation;
    const awayAbbr = awayC.team?.abbreviation;
    const homeScore = parseInt(homeC.score, 10);
    const awayScore = parseInt(awayC.score, 10);
    const winnerAbbr = homeC.winner ? homeAbbr : awayC.winner ? awayAbbr : null;

    for (const pick of byGame[key]) {
      let result = null;
      let units = null;

      if (pick.pick_type === "winner") {
        if (!winnerAbbr) result = "push";
        else result = pick.pick_value === winnerAbbr ? "won" : "lost";
        if (result === "won") {
          const ml = pick.moneyline;
          units = ml != null ? (ml > 0 ? ml / 100 : 100 / Math.abs(ml)) : 100 / 110;
        } else if (result === "lost") units = -1;
        else units = 0;
        units = Math.round(units * 100) / 100;
      } else if (pick.pick_type === "ats") {
        const pickedIsHome = pick.pick_value === homeAbbr;
        const pickedScore = pickedIsHome ? homeScore : awayScore;
        const oppScore = pickedIsHome ? awayScore : homeScore;
        const margin = pickedScore - oppScore;
        const m = (pick.pick_label || "").match(/([+-]\d+(?:\.\d+)?)\s*$/);
        const signed = m ? parseFloat(m[1]) : 0;
        const adj = margin + signed;
        result = adj > 0 ? "won" : adj < 0 ? "lost" : "push";
        units = result === "won" ? Math.round((100 / 110) * 100) / 100 : result === "lost" ? -1 : 0;
      } else if (pick.pick_type === "team_win") {
        // Beat the Streak — team to win (no units)
        if (!winnerAbbr) result = "void";
        else result = pick.pick_value === winnerAbbr ? "won" : "lost";
      } else if (pick.pick_type === "hitter_hit") {
        // Beat the Streak — hitter to get >= 1 hit
        let found = false;
        let hits = null;
        const players = d.boxscore?.players || [];
        for (const tp of players) {
          const batting = (tp.statistics || []).find((s) => s.type === "batting" || s.name === "batting");
          if (!batting) continue;
          const hIdx = (batting.labels || []).indexOf("H");
          const ath = (batting.athletes || []).find((a) => String(a.athlete?.id) === String(pick.pick_value));
          if (ath) {
            found = true;
            hits = hIdx >= 0 ? parseInt(ath.stats?.[hIdx], 10) : null;
            break;
          }
        }
        if (!found || hits == null || isNaN(hits)) result = "void";
        else result = hits >= 1 ? "won" : "lost";
      }

      if (result) {
        const body = {
          status: result,
          settled_at: new Date().toISOString(),
          result_away: `${awayAbbr} ${awayScore}`,
          result_home: `${homeAbbr} ${homeScore}`,
        };
        if (units != null) body.units = units;
        try {
          const patch = await sb(`predictions?id=eq.${pick.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          if (patch.ok) settled++;
        } catch (e) { /* skip this pick */ }
      }
    }
  }

  return Response.json({ ok: true, settled, checked: pending.length });
}
