// src/app/api/wc-waivers/route.js
// Processes pending waiver claims for friend draft leagues. Priority = reverse
// standings (worst record picks first); a claim adds a free agent and drops one
// of your players. Runs on a schedule (vercel.json) — a "set time" each day.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (optional) CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, json };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!SERVICE_KEY) return Response.json({ error: "missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const { json: pending } = await sb("wc_waiver_claims?status=eq.pending&select=*&order=created_at.asc");
  if (!Array.isArray(pending) || pending.length === 0) {
    return Response.json({ ok: true, processed: 0, message: "no pending claims" });
  }

  // group claims by league
  const byLeague = {};
  for (const c of pending) (byLeague[c.league_id] = byLeague[c.league_id] || []).push(c);

  let won = 0, failed = 0;
  for (const leagueId of Object.keys(byLeague)) {
    const claims = byLeague[leagueId];
    const { json: picks } = await sb(`wc_picks?league_id=eq.${leagueId}&select=id,user_id,player_id,pick_number`);
    const { json: members } = await sb(`wc_members?league_id=eq.${leagueId}&select=user_id,draft_position`);
    if (!Array.isArray(picks) || !Array.isArray(members)) continue;

    // current points for standings (reverse standings = waiver priority)
    const playerIds = [...new Set(picks.map((p) => String(p.player_id)).filter(Boolean))];
    const ptMap = {};
    for (let i = 0; i < playerIds.length; i += 100) {
      const chunk = playerIds.slice(i, i + 100).map(encodeURIComponent).join(",");
      if (!chunk) continue;
      const { json } = await sb(`wc_player_points?player_id=in.(${chunk})&select=player_id,points`);
      for (const r of json || []) ptMap[String(r.player_id)] = Number(r.points || 0);
    }
    const rosterByUser = {};   // user_id -> Set(player_id)
    const totalByUser = {};
    for (const p of picks) {
      const u = p.user_id;
      (rosterByUser[u] = rosterByUser[u] || new Set()).add(String(p.player_id));
      totalByUser[u] = (totalByUser[u] || 0) + (ptMap[String(p.player_id)] || 0);
    }
    const taken = new Set(picks.map((p) => String(p.player_id)));
    let maxPick = picks.reduce((m, p) => Math.max(m, p.pick_number || 0), 0);

    // priority order: worst total first, tie-break by draft_position
    const order = members
      .map((m) => ({ user_id: m.user_id, total: totalByUser[m.user_id] || 0, pos: m.draft_position ?? 99 }))
      .sort((a, b) => a.total - b.total || a.pos - b.pos);

    for (const m of order) {
      const mine = claims.filter((c) => c.user_id === m.user_id);
      for (const c of mine) {
        const roster = rosterByUser[m.user_id] || new Set();
        const valid = roster.has(String(c.drop_player_id)) && !taken.has(String(c.add_player_id));
        if (valid) {
          await sb(`wc_picks?league_id=eq.${leagueId}&user_id=eq.${m.user_id}&player_id=eq.${encodeURIComponent(c.drop_player_id)}`, { method: "DELETE" });
          await sb("wc_picks", {
            method: "POST",
            body: JSON.stringify({
              league_id: leagueId, user_id: m.user_id, player_id: c.add_player_id,
              player_name: c.add_player_name, position: c.add_position, team_name: c.add_team,
              pick_number: ++maxPick, price: 0,
            }),
          });
          roster.delete(String(c.drop_player_id)); roster.add(String(c.add_player_id));
          taken.delete(String(c.drop_player_id)); taken.add(String(c.add_player_id));
          await sb(`wc_waiver_claims?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "won" }) });
          won++;
        } else {
          await sb(`wc_waiver_claims?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed" }) });
          failed++;
        }
      }
    }
  }

  return Response.json({ ok: true, won, failed, leagues: Object.keys(byLeague).length });
}
