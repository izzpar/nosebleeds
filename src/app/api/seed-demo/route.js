// One-time demo seeder: creates a few realistic accounts with a Nations Ranking
// and a Salary Cap team, entered on the Global board, so the leaderboards aren't
// empty at launch. Gated by a secret. Visit:
//   /api/seed-demo?secret=YOUR_SECRET
// Requires SUPABASE_SERVICE_ROLE_KEY and SEED_SECRET (or CRON_SECRET) in the env.
// Safe-ish to re-run: existing demo accounts are skipped.

import { WC_TEAMS_FALLBACK, nationStrength } from "@/lib/worldcup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO = [
  { name: "Mike Rivera", handle: "midfieldmike", label: "Group-stage gut feel" },
  { name: "Sara K.", handle: "sarak_10", label: "Dark horses" },
  { name: "Diego M.", handle: "diego_vamos", label: "Trust the process" },
  { name: "Tom Whitfield", handle: "tomw", label: "Home cooking" },
  { name: "Yuki T.", handle: "yuki_t", label: "Vibes only" },
  { name: "Lena B.", handle: "lenab", label: "Euro bias incoming" },
  { name: "Cam P.", handle: "camp_98", label: "Bracket buster" },
  { name: "Andre S.", handle: "andre_s", label: "Samba squad" },
];

const sb = (path, opts = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
const insRet = async (table, body) => {
  const r = await sb(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j[0] : j;
};

// A plausible but varied ranking: strength + noise.
function makeRanking() {
  return [...WC_TEAMS_FALLBACK]
    .map((t) => ({ id: String(t.id), s: nationStrength(t.name) + Math.random() * 28 }))
    .sort((a, b) => b.s - a.s)
    .map((t) => t.id);
}

// A valid 15-squad under €100m: start cheapest (feasible), then upgrade by projection.
function buildSquad(players) {
  const REQ = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const cheap = {}, proj = {};
  for (const k of Object.keys(REQ)) {
    const pool = players.filter((p) => p.role === k);
    if (pool.length < REQ[k]) return null;
    cheap[k] = [...pool].sort((a, b) => (a.price || 0) - (b.price || 0));
    proj[k] = [...pool].sort((a, b) => (b.proj || 0) - (a.proj || 0));
  }
  const used = new Set(); const squad = [];
  for (const k of Object.keys(REQ)) for (let i = 0; i < REQ[k]; i++) { const p = cheap[k][i]; squad.push(p); used.add(p.id); }
  let spent = squad.reduce((s, p) => s + (p.price || 0), 0);
  for (let pass = 0; pass < 60; pass++) {
    const k = ["GK", "DEF", "MID", "FWD"][Math.floor(Math.random() * 4)];
    const cand = proj[k][Math.floor(Math.random() * Math.min(18, proj[k].length))];
    if (!cand || used.has(cand.id)) continue;
    const idx = squad.findIndex((p) => p.role === k && (p.proj || 0) < (cand.proj || 0) && used.has(p.id));
    if (idx < 0) continue;
    const out = squad[idx]; const next = spent - (out.price || 0) + (cand.price || 0);
    if (next <= 100) { used.delete(out.id); used.add(cand.id); squad[idx] = cand; spent = next; }
  }
  const want = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
  const starters = [];
  for (const k of Object.keys(want)) {
    squad.filter((p) => p.role === k).sort((a, b) => (b.proj || 0) - (a.proj || 0)).slice(0, want[k]).forEach((p) => starters.push(String(p.id)));
  }
  const bench = squad.map((p) => String(p.id)).filter((id) => !starters.includes(id));
  const capPool = squad.filter((p) => starters.includes(String(p.id))).sort((a, b) => (b.proj || 0) - (a.proj || 0));
  return { squad: squad.map((p) => String(p.id)), starters, bench, captain: capPool[0] ? String(capPool[0].id) : null };
}

export async function GET(request) {
  const secret = process.env.SEED_SECRET || process.env.CRON_SECRET;
  const given = new URL(request.url).searchParams.get("secret");
  if (!secret) return Response.json({ error: "Set SEED_SECRET (or CRON_SECRET) in the environment first." }, { status: 500 });
  if (given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!SVC) return Response.json({ error: "missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const origin = new URL(request.url).origin;
  let players = [];
  try { const d = await (await fetch(`${origin}/api/wc-players`)).json(); players = d.players || []; } catch (e) {}
  let roundId = "all";
  try { const d = await (await fetch(`${origin}/api/wc-rounds`)).json(); roundId = d.rounds?.[0]?.round_id || "all"; } catch (e) {}

  const results = [];
  for (const d of DEMO) {
    const email = `${d.handle}@demo.thenosebleeds.app`;
    // create the auth user
    const cu = await sb(`/auth/v1/admin/users`, {
      method: "POST",
      body: JSON.stringify({ email, password: crypto.randomUUID(), email_confirm: true, user_metadata: { full_name: d.name } }),
    });
    const cj = await cu.json().catch(() => ({}));
    const userId = cj.id || cj.user?.id;
    if (!userId) { results.push({ handle: d.handle, skipped: cj.msg || cj.error_description || cj.code || "exists/failed" }); continue; }

    await sb(`/rest/v1/profiles`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: userId, handle: d.handle, display_name: d.name }) });

    // Ranking entry → Global
    const re = await insRet("wc_ranking_entries", { user_id: userId, handle: d.handle, display_name: d.name, label: d.label, ranking: makeRanking() });
    if (re?.id) await sb(`/rest/v1/wc_ranking_submissions`, { method: "POST", body: JSON.stringify({ entry_id: re.id, group_id: null, user_id: userId }) });

    // Salary team → Global
    let salaryOk = false;
    const sq = players.length ? buildSquad(players) : null;
    if (sq) {
      const se = await insRet("wc_salary_entries", { user_id: userId, handle: d.handle, display_name: d.name, label: `${d.name.split(" ")[0]}'s XI` });
      if (se?.id) {
        await sb(`/rest/v1/wc_salary_submissions`, { method: "POST", body: JSON.stringify({ entry_id: se.id, group_id: null, user_id: userId }) });
        await sb(`/rest/v1/wc_salary_entry_lineups`, { method: "POST", body: JSON.stringify({ entry_id: se.id, round_id: roundId, squad: sq.squad, starters: sq.starters, bench: sq.bench, captain: sq.captain }) });
        salaryOk = true;
      }
    }
    results.push({ handle: d.handle, ok: true, salary: salaryOk });
  }

  return Response.json({ ok: true, seeded: results.filter((r) => r.ok).length, results });
}
