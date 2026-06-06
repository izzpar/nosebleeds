"use client";
import { useState, useEffect } from "react";
import { sbFetch } from "@/lib/sbrest";
import { RANKING_LOCK_ISO } from "@/lib/worldcup";

// Unlisted launch-day health page. Open /status to confirm at a glance that
// scoring is alive — no Vercel log digging. Exposes no secrets (sm-health
// never returns the key; the counts below are public-ish aggregate numbers).

// Cheap exact count via PostgREST Content-Range, without pulling all rows.
async function countRows(path) {
  try {
    const res = await sbFetch(`${path}&limit=1`, { headers: { Prefer: "count=exact", Range: "0-0" } });
    const cr = res.headers.get("content-range");
    return cr ? Number(cr.split("/")[1]) : null;
  } catch (e) { return null; }
}

function Light({ ok, children }) {
  const c = ok == null ? "#a1a1aa" : ok ? "#22c55e" : "#ef4444";
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default function StatusPage() {
  const [health, setHealth] = useState(undefined);
  const [scores, setScores] = useState(undefined);
  const [entries, setEntries] = useState(undefined);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = async () => {
    fetch("/api/sm-health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    setScores(await countRows("wc_player_round_points?select=player_id"));
    const e = await countRows("wc_salary_submissions?select=id");
    const r = await countRows("wc_ranking_submissions?select=id");
    setEntries({ salary: e, ranking: r });
    setRefreshedAt(new Date());
  };
  useEffect(() => { load(); }, []);

  const kickoff = new Date(RANKING_LOCK_ISO).getTime();
  const started = Date.now() >= kickoff;
  const days = Math.max(0, Math.ceil((kickoff - Date.now()) / 86400000));

  return (
    <div className="min-h-screen bg-[#09090b] text-white px-5 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-extrabold tracking-tight">System status</h1>
          <button onClick={load} className="text-[12px] font-bold px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Refresh</button>
        </div>
        <p className="text-[11px] text-zinc-500 mb-5">
          {started ? "Tournament is live." : `Kickoff in ${days} day${days === 1 ? "" : "s"} (Jun 11).`} Private launch-day check.
        </p>

        <div className="space-y-4">
          {/* SportMonks key / scoring source */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Scoring data (SportMonks)</div>
            {health === undefined ? (
              <Light ok={null}>Checking…</Light>
            ) : health === null ? (
              <Light ok={false}>Couldn&apos;t reach /api/sm-health</Light>
            ) : !health.keySet ? (
              <Light ok={false}>API key NOT set in this environment — salary scores will stay 0</Light>
            ) : !health.ok ? (
              <Light ok={false}>Key set but SportMonks rejected it ({health.status || "error"}) — check the token</Light>
            ) : (
              <div className="space-y-1.5">
                <Light ok>Key valid · {health.leagueCount} leagues accessible</Light>
                <div className="text-[11px] text-zinc-500 pl-5">
                  World Cup: {health.worldCupLeagues?.length ? health.worldCupLeagues.map((l) => `${l.name} (#${l.id})`).join(", ") : "none matched — verify plan covers the WC"}
                </div>
              </div>
            )}
          </div>

          {/* Player points populated */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Player points scored</div>
            {scores === undefined ? (
              <Light ok={null}>Checking…</Light>
            ) : scores ? (
              <Light ok>{scores.toLocaleString()} player-round scores recorded</Light>
            ) : (
              <Light ok={started ? false : null}>
                No scores yet{started ? " — if matches have finished, the cron isn't writing (check the key above)" : " (expected before kickoff)"}
              </Light>
            )}
          </div>

          {/* Entries built */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Entries</div>
            {entries === undefined ? (
              <Light ok={null}>Checking…</Light>
            ) : (
              <div className="space-y-1.5">
                <Light ok={!!entries.salary}>{entries.salary ?? "?"} salary squads entered</Light>
                <Light ok={!!entries.ranking}>{entries.ranking ?? "?"} rankings entered</Light>
              </div>
            )}
          </div>
        </div>

        {refreshedAt && <p className="text-[10px] text-zinc-600 mt-5 text-center">Updated {refreshedAt.toLocaleTimeString()}</p>}
      </div>
    </div>
  );
}
