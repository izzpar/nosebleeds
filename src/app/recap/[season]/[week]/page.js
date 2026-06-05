"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";

// Same color scale as elsewhere
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

export default function RecapPage({ params }) {
  const { season, week } = use(params);
  const seasonNum = parseInt(season);
  const weekNum = parseInt(week);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState([]);
  const [comments, setComments] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [barDrilldown, setBarDrilldown] = useState(null); // { rating: int, games: [] }

  // Direct REST helper
  const sbFetch = async (path, options = {}, retried = false) => {
    const tokenKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
    const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
    const token = session?.access_token;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 401 && !retried && session?.refresh_token) {
      try {
        const refreshRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (refreshRes.ok) {
          const newSession = await refreshRes.json();
          localStorage.setItem(tokenKey, JSON.stringify({ ...session, ...newSession }));
          return sbFetch(path, options, true);
        }
      } catch (e) {}
    }
    return res;
  };
  const sbJson = async (res) => {
    try { const d = await res.json(); return Array.isArray(d) ? d : []; }
    catch (e) { return []; }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const rRes = await sbFetch(`ratings?season=eq.${seasonNum}&week=eq.${weekNum}&public=eq.true&rating=not.is.null&sport=eq.nfl&select=*`);
        const rData = await sbJson(rRes);
        if (cancelled) return;
        setRatings(rData);

        // Collect all unique game_ids
        const gameIds = [...new Set(rData.map(r => r.game_id))];
        if (gameIds.length > 0) {
          const cRes = await sbFetch(`comments?game_id=in.(${gameIds.join(",")})&select=*`);
          const cData = await sbJson(cRes);
          if (cancelled) return;
          setComments(cData);
        }

        // Profiles for raters + commenters
        const userIds = [...new Set([...rData.map(r => r.user_id), ...(comments || []).map(c => c.user_id)])];
        if (userIds.length > 0) {
          const pRes = await sbFetch(`profiles?user_id=in.(${userIds.join(",")})&select=user_id,handle,display_name,avatar_url,favorite_team`);
          const pData = await sbJson(pRes);
          if (cancelled) return;
          const pmap = {};
          pData.forEach(p => { pmap[p.user_id] = p; });
          setProfiles(pmap);
        }
      } catch (e) { console.error("Recap load:", e); }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [seasonNum, weekNum]);

  // ===== Computed aggregates =====
  // Per-game stats
  const gameStats = {};
  ratings.forEach(r => {
    if (!gameStats[r.game_id]) {
      gameStats[r.game_id] = {
        game_id: r.game_id,
        away_team: r.away_team, home_team: r.home_team,
        away_score: r.away_score, home_score: r.home_score,
        ratings: [], reviews: [],
      };
    }
    gameStats[r.game_id].ratings.push(parseFloat(r.rating));
    if (r.review) gameStats[r.game_id].reviews.push({ review: r.review, user_id: r.user_id, rating: parseFloat(r.rating) });
  });
  const allGames = Object.values(gameStats).map(g => ({
    ...g,
    count: g.ratings.length,
    avg: g.ratings.length > 0 ? (g.ratings.reduce((s, r) => s + r, 0) / g.ratings.length).toFixed(1) : null,
    commentCount: comments.filter(c => c.game_id === g.game_id).length,
  }));

  // Top by community avg (min 1 rating)
  const bestGames = [...allGames].filter(g => g.count >= 1).sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg)).slice(0, 5);
  // Worst games (min 1 rating)
  const worstGames = [...allGames].filter(g => g.count >= 1).sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg)).slice(0, 3);
  // Most discussed (sum of ratings + comments)
  const mostDiscussed = [...allGames].sort((a, b) => (b.count + b.commentCount) - (a.count + a.commentCount)).slice(0, 5);

  // MVP votes — with share of all MVP picks
  const mvpVotes = {};
  ratings.forEach(r => { if (r.mvp) mvpVotes[r.mvp] = (mvpVotes[r.mvp] || 0) + 1; });
  const totalMvpPicks = Object.values(mvpVotes).reduce((s, n) => s + n, 0);
  const topMvps = Object.entries(mvpVotes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, votes]) => ({ name, votes, pct: totalMvpPicks > 0 ? Math.round((votes / totalMvpPicks) * 100) : 0 }));

  // Letdown votes
  const letdownVotes = {};
  ratings.forEach(r => { if (r.letdown) letdownVotes[r.letdown] = (letdownVotes[r.letdown] || 0) + 1; });
  const topLetdowns = Object.entries(letdownVotes).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Worth-it %
  const worthYes = ratings.filter(r => r.worth_it === "yes").length;
  const worthNo = ratings.filter(r => r.worth_it === "no").length;
  const worthMeh = ratings.filter(r => r.worth_it === "meh").length;
  const totalWorth = worthYes + worthNo + worthMeh;
  const worthPct = totalWorth > 0 ? Math.round((worthYes / totalWorth) * 100) : 0;

  // Top raters this week
  const raterCounts = {};
  ratings.forEach(r => { raterCounts[r.user_id] = (raterCounts[r.user_id] || 0) + 1; });
  const topRaters = Object.entries(raterCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([uid, count]) => ({
    user_id: uid, count, profile: profiles[uid],
  }));

  // Top reviews (longest with rating)
  const topReviews = ratings
    .filter(r => r.review && r.review.length > 30)
    .map(r => ({ ...r, profile: profiles[r.user_id] }))
    .sort((a, b) => b.review.length - a.review.length)
    .slice(0, 4);

  // Overall avg
  const allRatingsList = ratings.map(r => parseFloat(r.rating));
  const overallAvg = allRatingsList.length > 0 ? (allRatingsList.reduce((s, r) => s + r, 0) / allRatingsList.length).toFixed(1) : "—";

  // Game-level distribution: each game counted once at its community avg
  const ratedGames = allGames.filter(g => g.avg !== null);
  const dist = Array(10).fill(0).map((_, i) => ratedGames.filter(g => Math.round(parseFloat(g.avg)) === i + 1).length);

  // Quality buckets
  const greatGames = ratedGames.filter(g => parseFloat(g.avg) >= 8);
  const goodGames = ratedGames.filter(g => parseFloat(g.avg) >= 6 && parseFloat(g.avg) < 8);
  const mehGames = ratedGames.filter(g => parseFloat(g.avg) >= 4 && parseFloat(g.avg) < 6);
  const badGames = ratedGames.filter(g => parseFloat(g.avg) < 4);

  // Distinguish previous/next week navigation
  const prevWeek = weekNum > 1 ? weekNum - 1 : null;
  const nextWeek = weekNum < 18 ? weekNum + 1 : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading recap...</div>;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/?tab=games" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">📰 Week {weekNum} Recap</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Hero card */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-900 border border-zinc-800 p-5 mb-4 text-center">
          <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mb-1">{seasonNum} NFL Season</div>
          <div className="text-3xl font-extrabold text-white">Week {weekNum} Recap</div>
          <div className="text-xs text-zinc-500 mt-1">{ratings.length} {ratings.length === 1 ? "rating" : "ratings"} · {comments.length} {comments.length === 1 ? "comment" : "comments"} · {allGames.length} {allGames.length === 1 ? "game" : "games"}</div>
        </div>

        {ratings.length === 0 ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center">
            <div className="text-5xl mb-3">🌱</div>
            <div className="text-base font-bold text-white">No ratings for this week yet</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Once people start rating Week {weekNum} games, the recap will fill in here</div>
            <Link href="/?tab=games" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</Link>
          </div>
        ) : (
          <>
            {/* Worth Watching big stat */}
            {totalWorth > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-base font-bold text-white">👀 Was it worth watching?</h3>
                  <div className="text-3xl font-extrabold text-green-400">{worthPct}%</div>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-zinc-950">
                  {worthYes > 0 && <div style={{ width: `${(worthYes / totalWorth) * 100}%`, backgroundColor: "#22c55e" }} />}
                  {worthMeh > 0 && <div style={{ width: `${(worthMeh / totalWorth) * 100}%`, backgroundColor: "#eab308" }} />}
                  {worthNo > 0 && <div style={{ width: `${(worthNo / totalWorth) * 100}%`, backgroundColor: "#ef4444" }} />}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-zinc-500">
                  <span>👍 {worthYes} yes</span>
                  <span>😐 {worthMeh} meh</span>
                  <span>👎 {worthNo} no</span>
                </div>
              </div>
            )}

            {/* Quality Breakdown - new card */}
            {ratedGames.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">🎬 Game Quality Breakdown</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { l: "🔥 Great", subl: "8+", games: greatGames, color: "#22c55e" },
                    { l: "👍 Good", subl: "6–7.9", games: goodGames, color: "#a3e635" },
                    { l: "😐 Meh", subl: "4–5.9", games: mehGames, color: "#facc15" },
                    { l: "👎 Bad", subl: "<4", games: badGames, color: "#ef4444" },
                  ].map(b => (
                    <button
                      key={b.l}
                      onClick={() => b.games.length > 0 && setBarDrilldown({ rating: b.l, games: b.games })}
                      disabled={b.games.length === 0}
                      className={`p-3 rounded-xl bg-zinc-950 text-center transition-all ${b.games.length > 0 ? "hover:ring-2 hover:ring-red-600 cursor-pointer" : "opacity-50 cursor-default"}`}
                    >
                      <div className="text-3xl font-extrabold" style={{ color: b.color }}>{b.games.length}</div>
                      <div className="text-[10px] font-bold text-white mt-0.5">{b.l}</div>
                      <div className="text-[9px] text-zinc-500">{b.subl}</div>
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-zinc-600 text-center mt-2">Click a bucket to see those games</div>
              </div>
            )}

            {/* Avg rating + game-level distribution */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">📊 Games by Rating</h3>
                <div className="text-3xl font-extrabold" style={{ color: rc(parseFloat(overallAvg)) }}>{overallAvg}</div>
              </div>
              <div className="flex gap-1 mb-1" style={{ height: "64px" }}>
                {dist.map((c, i) => {
                  const mx = Math.max(...dist, 1);
                  const fillPct = c > 0 ? Math.max((c / mx) * 100, 8) : 0;
                  const clickable = c > 0;
                  return (
                    <div
                      key={i}
                      className={`group flex-1 relative ${clickable ? "cursor-pointer" : "cursor-help"}`}
                      onClick={() => {
                        if (!clickable) return;
                        const games = ratedGames.filter(g => Math.round(parseFloat(g.avg)) === i + 1);
                        setBarDrilldown({ rating: i + 1, games });
                      }}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-zinc-800 border border-zinc-700 text-white text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap z-30 shadow-lg">
                        {c} {c === 1 ? "game" : "games"}{clickable && " · click"}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-700" />
                      </div>
                      <div className={`absolute inset-0 bg-zinc-800/40 rounded overflow-hidden ${clickable ? "hover:ring-2 hover:ring-red-600 transition-all" : ""}`}>
                        <div className="absolute bottom-0 left-0 right-0 transition-all" style={{ height: `${fillPct}%`, backgroundColor: rc(i + 1) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1">
                {dist.map((_, i) => <div key={i} className="flex-1 text-center"><span className="text-[10px] text-zinc-500 font-bold">{i + 1}</span></div>)}
              </div>
              <div className="text-[10px] text-zinc-600 text-center mt-2">Each game counted once at its community average</div>
            </div>

            {/* Best Games */}
            {bestGames.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">🏆 Best Games of the Week</h3>
                {bestGames.map((g, i) => (
                  <Link key={g.game_id} href={`/game/${g.game_id}`} className="block">
                    <div className="flex items-center gap-3 p-2.5 rounded-xl mb-2 bg-zinc-950 hover:bg-zinc-900 transition-colors">
                      <span className="text-lg font-extrabold w-6 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{g.away_team} {g.away_score} — {g.home_team} {g.home_score}</div>
                        <div className="text-[10px] text-zinc-500">{g.count} {g.count === 1 ? "rater" : "raters"}{g.commentCount > 0 && ` · ${g.commentCount} ${g.commentCount === 1 ? "comment" : "comments"}`}</div>
                      </div>
                      <div className="w-11 h-11 flex items-center justify-center text-white font-extrabold rounded-xl text-base shrink-0" style={{ backgroundColor: rc(parseFloat(g.avg)) }}>{g.avg}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* MVP Votes */}
            {topMvps.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-1">🌟 MVP of the Week</h3>
                <p className="text-[10px] text-zinc-500 mb-3">Share of all {totalMvpPicks} MVP picks across the week</p>
                {topMvps.map((m, i) => (
                  <div key={m.name} className="p-2.5 rounded-xl mb-1.5 bg-zinc-950">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-extrabold w-6 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                      <Link href={`/player/${encodeURIComponent(m.name)}`} className="flex-1 text-sm font-bold text-white hover:text-red-400 transition-colors">{m.name}</Link>
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-red-400">{m.pct}%</div>
                        <div className="text-[9px] text-zinc-600">{m.votes} {m.votes === 1 ? "pick" : "picks"}</div>
                      </div>
                    </div>
                    {/* Share bar */}
                    <div className="mt-2 ml-9 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, backgroundColor: i === 0 ? "#fbbf24" : "#dc2626" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Letdowns */}
            {topLetdowns.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">😤 Biggest Letdowns</h3>
                {topLetdowns.map(([name, votes]) => (
                  <div key={name} className="flex items-center gap-3 p-2.5 rounded-xl mb-1.5 bg-zinc-950">
                    <Link href={`/player/${encodeURIComponent(name)}`} className="flex-1 text-sm font-semibold text-zinc-300 hover:text-red-400 transition-colors">{name}</Link>
                    <div className="text-xs font-bold text-zinc-500">{votes} {votes === 1 ? "vote" : "votes"}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Worst games */}
            {worstGames.length > 0 && worstGames[0].avg && parseFloat(worstGames[0].avg) < 6 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">💩 Most Painful Watches</h3>
                {worstGames.map((g) => (
                  <Link key={g.game_id} href={`/game/${g.game_id}`} className="block">
                    <div className="flex items-center gap-3 p-2.5 rounded-xl mb-2 bg-zinc-950 hover:bg-zinc-900 transition-colors">
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{g.away_team} {g.away_score} — {g.home_team} {g.home_score}</div>
                        <div className="text-[10px] text-zinc-500">{g.count} {g.count === 1 ? "rater" : "raters"}</div>
                      </div>
                      <div className="w-11 h-11 flex items-center justify-center text-white font-extrabold rounded-xl text-base shrink-0" style={{ backgroundColor: rc(parseFloat(g.avg)) }}>{g.avg}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Top Reviews */}
            {topReviews.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">💬 Top Reviews</h3>
                {topReviews.map((r) => (
                  <Link key={r.id} href={`/game/${r.game_id}`} className="block">
                    <div className="p-3 rounded-xl mb-2 bg-zinc-950 hover:bg-zinc-900 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        {r.profile?.avatar_url ? (
                          <img src={r.profile.avatar_url} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-[10px] font-bold text-white">
                            {(r.profile?.display_name || r.profile?.handle || "?")[0]?.toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs font-bold text-white">{r.profile?.display_name || `@${r.profile?.handle || "anon"}`}</span>
                        {r.profile?.favorite_team && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600/15 text-red-300">🏈 {r.profile.favorite_team}</span>}
                        <span className="text-[10px] text-zinc-600 ml-auto">{r.away_team} v {r.home_team}</span>
                        <span className="text-xs font-bold" style={{ color: rc(parseFloat(r.rating)) }}>{r.rating}</span>
                      </div>
                      <div className="text-xs text-zinc-300 italic">&quot;{r.review}&quot;</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Top raters */}
            {topRaters.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">🏅 Top Raters This Week</h3>
                {topRaters.map((r, i) => (
                  <Link key={r.user_id} href={r.profile?.handle ? `/u/${r.profile.handle}` : "#"} className="flex items-center gap-3 p-2.5 rounded-xl mb-1.5 bg-zinc-950 hover:bg-zinc-900 transition-colors">
                    <span className="text-base font-extrabold w-5 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                    {r.profile?.avatar_url ? (
                      <img src={r.profile.avatar_url} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-xs font-bold text-white">
                        {(r.profile?.display_name || r.profile?.handle || "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 text-sm font-bold text-white">{r.profile?.display_name || `@${r.profile?.handle || "anon"}`}</div>
                    <div className="text-xs font-bold text-red-400">{r.count} {r.count === 1 ? "rating" : "ratings"}</div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Navigation */}
        <div className="flex gap-2 mt-6">
          {prevWeek ? (
            <Link href={`/recap/${seasonNum}/${prevWeek}`} className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm text-center hover:bg-zinc-800">← Week {prevWeek}</Link>
          ) : <div className="flex-1" />}
          <Link href={`/recap`} className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm text-center hover:bg-zinc-800">All Recaps</Link>
          {nextWeek ? (
            <Link href={`/recap/${seasonNum}/${nextWeek}`} className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm text-center hover:bg-zinc-800">Week {nextWeek} →</Link>
          ) : <div className="flex-1" />}
        </div>
      </div>

      {/* Bar drilldown modal */}
      {barDrilldown && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" onClick={() => setBarDrilldown(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-zinc-800 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-zinc-950 px-5 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Games at this rating</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-lg font-bold text-white">{barDrilldown.games.length} {barDrilldown.games.length === 1 ? "game" : "games"}</span>
                  {typeof barDrilldown.rating === "number" && (
                    <span className="text-xl font-extrabold px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor: rc(barDrilldown.rating) }}>{barDrilldown.rating}</span>
                  )}
                  {typeof barDrilldown.rating === "string" && (
                    <span className="text-sm font-bold text-zinc-400">{barDrilldown.rating}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setBarDrilldown(null)} className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-lg font-bold">×</button>
            </div>
            <div className="p-5">
              {barDrilldown.games.map(g => (
                <Link key={g.game_id} href={`/game/${g.game_id}`} onClick={() => setBarDrilldown(null)} className="block">
                  <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{g.away_team} {g.away_score}—{g.home_team} {g.home_score}</div>
                      <div className="text-[10px] text-zinc-500">{g.count} {g.count === 1 ? "rater" : "raters"}{g.commentCount > 0 && ` · ${g.commentCount} comments`}</div>
                    </div>
                    <div className="w-11 h-11 flex items-center justify-center text-white font-extrabold rounded-xl text-base shrink-0" style={{ backgroundColor: rc(parseFloat(g.avg)) }}>{g.avg}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <Nav />
    </div>
  );
}
