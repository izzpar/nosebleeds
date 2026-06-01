"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

function rc(r) {
  const n = Math.round(r);
  if (n <= 1) return "#7f1d1d";
  if (n === 2) return "#dc2626";
  if (n === 3) return "#f87171";
  if (n === 4) return "#fb923c";
  if (n === 5) return "#fbbf24";
  if (n === 6) return "#facc15";
  if (n === 7) return "#a3e635";
  if (n === 8) return "#4ade80";
  if (n === 9) return "#22c55e";
  return "#15803d";
}
const SPORT_EMOJI = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒", tennis: "🎾" };
const WINDOWS = [
  { id: 1, label: "24h" },
  { id: 2, label: "48h" },
  { id: 7, label: "Week" },
];

export default function TrendingPage() {
  const [days, setDays] = useState(2);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  const sbFetch = (path) => {
    const tokenKey = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
    const token = session?.access_token;
    return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };
  const sbJson = async (res) => { try { const d = await res.json(); return Array.isArray(d) ? d : []; } catch (e) { return []; } };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const rows = await sbJson(await sbFetch(`ratings?public=eq.true&rating=not.is.null&created_at=gte.${since}&order=created_at.desc&limit=600&select=game_id,sport,away_team,home_team,away_score,home_score,rating,created_at`));
        if (cancelled) return;
        const byGame = {};
        rows.forEach((r) => {
          if (!byGame[r.game_id]) byGame[r.game_id] = { game_id: r.game_id, sport: r.sport, away_team: r.away_team, home_team: r.home_team, away_score: r.away_score, home_score: r.home_score, count: 0, sum: 0 };
          const g = byGame[r.game_id];
          g.count++; g.sum += parseFloat(r.rating);
        });
        const list = Object.values(byGame)
          .map((g) => ({ ...g, avg: g.sum / g.count }))
          .sort((a, b) => b.count - a.count || b.avg - a.avg)
          .slice(0, 25);
        setGames(list);
      } catch (e) { console.error("Trending:", e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  const gh = (g) => (g.sport === "tennis" ? `/tennis/${g.game_id}` : g.sport && g.sport !== "nfl" ? `/game/${g.game_id}?sport=${g.sport}` : `/game/${g.game_id}`);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">📈 Trending</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <p className="text-xs text-zinc-500 mb-3">The most-rated games across every sport.</p>
        <div className="flex gap-1.5 mb-4">
          {WINDOWS.map((w) => (
            <button key={w.id} onClick={() => setDays(w.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${days === w.id ? "bg-red-600 text-white" : "bg-zinc-900 text-zinc-500 border border-zinc-800"}`}>
              {w.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-16 text-zinc-500">Loading trending…</div>}

        {!loading && games.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-base font-bold text-white">Nothing trending yet</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">No games have been rated in this window. Be the first to rate one.</div>
            <Link href="/" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</Link>
          </div>
        )}

        {games.map((g, i) => (
          <Link key={g.game_id} href={gh(g)} className="block">
            <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
              <span className="text-lg font-extrabold w-6 text-center shrink-0" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">{SPORT_EMOJI[g.sport] || ""} {g.away_team} {g.away_score} — {g.home_team} {g.home_score}</div>
                <div className="text-[10px] text-zinc-500">🔥 {g.count} {g.count === 1 ? "rating" : "ratings"} in this window</div>
              </div>
              <div className="w-11 h-11 flex items-center justify-center text-white font-extrabold rounded-xl text-base shrink-0" style={{ backgroundColor: rc(g.avg) }}>{g.avg.toFixed(1)}</div>
            </div>
          </Link>
        ))}
      </div>

      <Nav />
    </div>
  );
}
