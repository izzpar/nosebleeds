"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { sbFetch, sbJson } from "@/lib/sbrest";

// Rating → color (red low → green high), matching the core app's scale.
function rc(r) {
  const n = Math.round(r);
  if (n <= 1) return "#7f1d1d"; if (n === 2) return "#dc2626"; if (n === 3) return "#f87171";
  if (n === 4) return "#fb923c"; if (n === 5) return "#fbbf24"; if (n === 6) return "#facc15";
  if (n === 7) return "#a3e635"; if (n === 8) return "#4ade80"; if (n === 9) return "#22c55e";
  return "#15803d";
}
function fmtKick(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function TeamRow({ t, score, bold }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {t.logo ? <img src={t.logo} alt="" className="w-5 h-5 object-contain shrink-0" /> : <span className="w-5 h-5 shrink-0" />}
      <span className={`text-sm truncate ${bold ? "font-bold text-white" : "text-zinc-300"}`}>{t.name}</span>
      {score != null && <span className={`ml-auto text-sm tabular-nums ${bold ? "font-bold" : ""}`}>{score}</span>}
    </div>
  );
}

export default function MatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState(null);
  const [agg, setAgg] = useState({}); // fixture_id -> { sum, n }
  const [tab, setTab] = useState("results"); // 'results' | 'fixtures'

  useEffect(() => {
    fetch("/api/wc-matches").then((r) => r.json()).then((d) => setMatches(d.matches || [])).catch(() => setMatches([]));
  }, []);

  useEffect(() => {
    (async () => {
      const rows = await sbJson(await sbFetch(`wc_match_ratings?select=fixture_id,rating`));
      const m = {};
      for (const r of rows) { const k = String(r.fixture_id); (m[k] = m[k] || { sum: 0, n: 0 }); m[k].sum += Number(r.rating) || 0; m[k].n += 1; }
      setAgg(m);
    })().catch(() => {});
  }, []);

  const { results, fixtures } = useMemo(() => {
    const all = matches || [];
    const done = all.filter((m) => m.status === "finished" || m.status === "live")
      .sort((a, b) => (b.kickoff || 0) - (a.kickoff || 0));
    const up = all.filter((m) => m.status === "upcoming").sort((a, b) => (a.kickoff || 0) - (b.kickoff || 0));
    return { results: done, fixtures: up };
  }, [matches]);

  const list = tab === "results" ? results : fixtures;

  const MatchCard = (m) => {
    const a = agg[String(m.id)];
    const avg = a && a.n ? a.sum / a.n : null;
    const showScore = m.status !== "upcoming";
    const hs = m.score?.home, as = m.score?.away;
    const homeWin = showScore && hs > as, awayWin = showScore && as > hs;
    return (
      <button key={m.id} onClick={() => router.push(`/worldcup/match/${m.id}`)}
        className="w-full text-left bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2.5 mb-2 hover:border-zinc-700">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500 truncate">{m.round || "World Cup"}</span>
          {m.status === "live" ? (
            <span className="text-[10px] font-bold text-red-500">● LIVE {m.state_label}</span>
          ) : m.status === "finished" ? (
            <span className="text-[10px] text-zinc-600">FT</span>
          ) : (
            <span className="text-[10px] text-zinc-500">{fmtKick(m.kickoff)}</span>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-3 items-center">
          <div className="space-y-1 min-w-0">
            <TeamRow t={m.home} score={showScore ? hs : null} bold={homeWin} />
            <TeamRow t={m.away} score={showScore ? as : null} bold={awayWin} />
          </div>
          {avg != null ? (
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: rc(avg) }}>{avg.toFixed(1)}</div>
              <span className="text-[9px] text-zinc-600 mt-0.5">{a.n} rating{a.n === 1 ? "" : "s"}</span>
            </div>
          ) : m.status === "finished" ? (
            <span className="text-[11px] text-red-400 font-semibold">Rate →</span>
          ) : <span className="text-zinc-700">›</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">⭐</span>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">World Cup Match Ratings</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Rate every game · vote your Star Man</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["results", "Results"], ["fixtures", "Fixtures"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`pb-2 font-bold border-b-2 ${tab === id ? "text-white border-red-500" : "text-zinc-600 border-transparent"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {matches === null ? (
          <p className="text-zinc-600 text-sm py-8">Loading matches…</p>
        ) : list.length === 0 ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-8 text-center text-sm text-zinc-400">
            {tab === "results"
              ? "No matches have kicked off yet. Ratings open the moment the first game goes final — come back after June 11. ⚽"
              : "Fixtures will appear here as the schedule is confirmed."}
          </div>
        ) : (
          list.map(MatchCard)
        )}
      </div>
      <Nav />
    </div>
  );
}
