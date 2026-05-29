"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const SPORT_EMOJI = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒" };

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

export default function TeamPage({ params }) {
  const { sport, abbr } = use(params);
  const sportPath = SPORT_PATHS[sport] || SPORT_PATHS.nfl;
  const gameHref = (id) => (sport === "nfl" ? `/game/${id}` : `/game/${id}?sport=${sport}`);

  const [team, setTeam] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);

  const sbFetch = async (path) => {
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
      // Team identity from ESPN (accepts the abbreviation as the id)
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${abbr}`);
        if (r.ok) {
          const d = await r.json();
          const t = d.team || {};
          if (!cancelled) setTeam({
            name: t.displayName || abbr,
            logo: (t.logos || [])[0]?.href || `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbr.toLowerCase()}.png`,
            color: "#" + (t.color || "27272a"),
            record: (t.record?.items || [])[0]?.summary || "",
          });
        }
      } catch (e) {}
      // Community ratings for any game this team played
      try {
        const res = await sbFetch(`ratings?or=(away_team.eq.${abbr},home_team.eq.${abbr})&sport=eq.${sport}&public=eq.true&rating=not.is.null&select=*`);
        const data = await sbJson(res);
        if (!cancelled) setRatings(data);
      } catch (e) {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sport, abbr]);

  // Aggregate by game
  const byGame = {};
  ratings.forEach((r) => {
    if (!byGame[r.game_id]) byGame[r.game_id] = { game_id: r.game_id, away_team: r.away_team, home_team: r.home_team, away_score: r.away_score, home_score: r.home_score, week: r.week, season: r.season, ratings: [] };
    byGame[r.game_id].ratings.push(parseFloat(r.rating));
  });
  const games = Object.values(byGame).map((g) => ({ ...g, count: g.ratings.length, avg: g.ratings.reduce((s, x) => s + x, 0) / g.ratings.length }));
  const totalGames = games.length;
  const overallAvg = totalGames > 0 ? (games.reduce((s, g) => s + g.avg, 0) / totalGames).toFixed(1) : null;
  const best = [...games].sort((a, b) => b.avg - a.avg).slice(0, 5);
  const worst = [...games].sort((a, b) => a.avg - b.avg).slice(0, 3);

  const worthYes = ratings.filter((r) => r.worth_it === "yes").length;
  const worthTotal = ratings.filter((r) => r.worth_it).length;
  const worthPct = worthTotal > 0 ? Math.round((worthYes / worthTotal) * 100) : null;

  const mvpVotes = {};
  ratings.forEach((r) => { if (r.mvp) mvpVotes[r.mvp] = (mvpVotes[r.mvp] || 0) + 1; });
  const topMvps = Object.entries(mvpVotes).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const dist = Array(10).fill(0).map((_, i) => games.filter((g) => Math.round(g.avg) === i + 1).length);
  const distMax = Math.max(...dist, 1);

  const GameRow = ({ g, rank }) => (
    <Link href={gameHref(g.game_id)} className="block">
      <div className="flex items-center gap-3 p-2.5 rounded-xl mb-2 bg-zinc-950 hover:bg-zinc-900 transition-colors">
        {rank != null && <span className="text-base font-extrabold w-5 text-center" style={{ color: rank === 0 ? "#fbbf24" : rank === 1 ? "#a1a1aa" : rank === 2 ? "#b45309" : "#52525b" }}>{rank + 1}</span>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{g.away_team} {g.away_score} — {g.home_team} {g.home_score}</div>
          <div className="text-[10px] text-zinc-500">{g.count} {g.count === 1 ? "rater" : "raters"}{sport === "nfl" && g.week ? ` · Wk ${g.week}` : g.season ? ` · ${g.season}` : ""}</div>
        </div>
        <div className="w-11 h-11 flex items-center justify-center text-white font-extrabold rounded-xl text-base shrink-0" style={{ backgroundColor: rc(g.avg) }}>{g.avg.toFixed(1)}</div>
      </div>
    </Link>
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading {abbr}…</div>;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center truncate">{team?.name || abbr}</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Hero */}
        <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-4">
          <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${team?.color || "#3f3f46"}, #18181b)` }} />
          <div className="p-5 flex items-center gap-4">
            {team?.logo && <img src={team.logo} alt={abbr} className="w-16 h-16 object-contain shrink-0" />}
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-white truncate">{team?.name || abbr}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{SPORT_EMOJI[sport] || ""} {abbr}{team?.record ? ` · ${team.record}` : ""}</div>
            </div>
          </div>
        </div>

        {totalGames === 0 ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center">
            <div className="text-5xl mb-3">{SPORT_EMOJI[sport] || "📊"}</div>
            <div className="text-base font-bold text-white">No rated games yet</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Once the community rates {team?.name || abbr} games, they'll show up here.</div>
            <Link href="/" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</Link>
          </div>
        ) : (
          <>
            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 text-center">
                <div className="text-2xl font-extrabold text-white">{totalGames}</div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Games</div>
              </div>
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 text-center">
                <div className="text-2xl font-extrabold" style={{ color: rc(parseFloat(overallAvg)) }}>{overallAvg}</div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Avg</div>
              </div>
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 text-center">
                <div className="text-2xl font-extrabold text-green-400">{worthPct != null ? `${worthPct}%` : "—"}</div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Worth It</div>
              </div>
            </div>

            {/* Distribution */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-3">Watchability of their games</div>
              <div className="flex gap-1 mb-1" style={{ height: "56px" }}>
                {dist.map((c, i) => (
                  <div key={i} className="flex-1 relative group cursor-help">
                    <div className="absolute inset-0 bg-zinc-800/40 rounded overflow-hidden">
                      <div className="absolute bottom-0 left-0 right-0" style={{ height: `${c > 0 ? Math.max((c / distMax) * 100, 8) : 0}%`, backgroundColor: rc(i + 1) }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                {dist.map((_, i) => <div key={i} className="flex-1 text-center"><span className="text-[10px] text-zinc-500 font-bold">{i + 1}</span></div>)}
              </div>
            </div>

            {/* Best games */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <h3 className="text-base font-bold text-white mb-3">🏆 Best {abbr} Games</h3>
              {best.map((g, i) => <GameRow key={g.game_id} g={g} rank={i} />)}
            </div>

            {/* Worst games */}
            {worst.length > 0 && worst[0].avg < 6 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">💩 Most Painful</h3>
                {worst.map((g) => <GameRow key={g.game_id} g={g} />)}
              </div>
            )}

            {/* Top MVPs */}
            {topMvps.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">🌟 Fan-Favorite Players</h3>
                {topMvps.map(([name, votes], i) => (
                  <Link key={name} href={`/player/${encodeURIComponent(name)}`} className="flex items-center gap-3 p-2.5 rounded-xl mb-1.5 bg-zinc-950 hover:bg-zinc-900 transition-colors">
                    <span className="text-base font-extrabold w-5 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                    <span className="flex-1 text-sm font-bold text-white truncate">{name}</span>
                    <span className="text-xs font-bold text-red-400">{votes} MVP {votes === 1 ? "pick" : "picks"}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Nav />
    </div>
  );
}
