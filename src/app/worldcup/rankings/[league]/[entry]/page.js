"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import WcBackdrop from "@/components/WcBackdrop";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import { fetchResults, rankingPoints, rankingsLocked, fetchTeams, WC_TEAMS_FALLBACK } from "@/lib/worldcup";

export default function RankingEntryPage() {
  const { league, entry } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locked = rankingsLocked();

  const [row, setRow] = useState(undefined); // undefined=loading, null=not found
  const [teams, setTeams] = useState([]);
  const [results, setResults] = useState(null);

  useEffect(() => { fetchTeams().then((t) => setTeams(t?.length ? t : WC_TEAMS_FALLBACK)).catch(() => setTeams(WC_TEAMS_FALLBACK)); }, []);
  useEffect(() => { fetchResults().then(setResults).catch(() => setResults({ events: 0 })); }, []);
  useEffect(() => {
    sbFetch(`wc_ranking_entries?id=eq.${entry}&select=*`).then(async (r) => setRow((await sbJson(r))[0] || null)).catch(() => setRow(null));
  }, [entry]);

  if (row === undefined || results === null) return <Shell><p className="text-zinc-600 text-sm py-10">Loading…</p></Shell>;
  if (row === null) return <Shell><p className="text-zinc-500 py-10">Entry not found.</p></Shell>;

  const mine = row.user_id === user?.id;
  const reveal = locked || (results.events || 0) > 0;
  const teamById = (id) => teams.find((t) => String(t.id) === String(id));
  const name = row.display_name || row.handle || "Player";
  const ranking = (row.ranking || []).map(String);

  // Per-team points (once revealed).
  let contrib = {};
  let total = 0;
  if (reveal && ranking.length) {
    const res = rankingPoints(ranking, results);
    total = Math.round(res.total);
    res.contributions.forEach((c) => { contrib[String(c.team_id)] = c; });
  }

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push(`/worldcup/rankings/${league}`)} className="text-zinc-500 text-xl leading-none">‹</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{name}{row.label ? ` · ${row.label}` : ""}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Nations Ranking entry{reveal ? ` · ${total} pts` : ""}</p>
          </div>
          {row.handle && <Link href={`/u/${row.handle}`} className="text-[11px] text-zinc-400 hover:text-red-400 shrink-0">profile ↗</Link>}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {mine && !locked && (
          <button onClick={() => router.push(`/worldcup/rankings?league=${league}&entry=${entry}`)} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl mb-4">✏️ Edit your ranking</button>
        )}

        {!reveal && !mine ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-10 text-center">
            <div className="text-4xl mb-2">🔒</div>
            <div className="font-bold">Hidden until kickoff</div>
            <p className="text-[12px] text-zinc-500 mt-1">You&apos;ll be able to see {name}&apos;s ranking once the first game kicks off (Jun 11).</p>
          </div>
        ) : ranking.length === 0 ? (
          <p className="text-zinc-600 text-sm py-6">No ranking submitted yet.</p>
        ) : (
          <div className="space-y-1.5">
            {ranking.map((id, i) => {
              const t = teamById(id);
              const c = contrib[id];
              return (
                <div key={id} className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
                  <span className="text-red-500 font-bold w-6 text-sm">{i + 1}</span>
                  {t?.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain" />}
                  <span className="text-sm font-medium flex-1 truncate">{t?.name || "—"}</span>
                  {reveal && c && <span className="text-[11px] text-zinc-500 tabular-nums">{Math.round(c.points)} pts</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Nav />
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="max-w-2xl mx-auto px-4 pt-6">{children}</div>
      <Nav />
    </div>
  );
}
