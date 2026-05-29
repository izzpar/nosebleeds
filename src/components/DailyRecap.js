"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";

// Shared 1-10 color scale
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

function shiftDate(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const SPORT_META = {
  mlb: { emoji: "⚾", label: "MLB", path: "baseball/mlb" },
  nba: { emoji: "🏀", label: "NBA", path: "basketball/nba" },
  nhl: { emoji: "🏒", label: "NHL", path: "hockey/nhl" },
};

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// Parse one ESPN game summary into ranked performer groups, per sport.
function parsePerformers(sport, d) {
  const idxOf = (cat) => {
    const labels = cat.labels || cat.names || [];
    return (label) => labels.indexOf(label);
  };
  const teams = d.boxscore?.players || [];
  if (sport === "mlb") {
    const hitters = [], pitchers = [];
    teams.forEach((team) => {
      const teamAbbr = team.team?.abbreviation || "";
      (team.statistics || []).forEach((cat) => {
        const type = cat.type || cat.name;
        const idx = idxOf(cat);
        (cat.athletes || []).forEach((a) => {
          const name = a.athlete?.displayName; const stats = a.stats || [];
          if (!name || stats.length === 0) return;
          if (type === "batting") {
            const H = num(stats[idx("H")]), R = num(stats[idx("R")]), RBI = num(stats[idx("RBI")]);
            const HR = num(stats[idx("HR")]), BB = num(stats[idx("BB")]), AB = num(stats[idx("AB")]);
            if (AB === 0 && BB === 0) return;
            const score = H * 1 + R * 1 + RBI * 1.5 + HR * 3 + BB * 0.5;
            const line = [];
            if (H || AB) line.push(`${H}-${AB}`);
            if (HR) line.push(`${HR} HR`);
            if (RBI) line.push(`${RBI} RBI`);
            if (R) line.push(`${R} R`);
            hitters.push({ name, team: teamAbbr, score, line: line.join(" · ") || "—" });
          } else if (type === "pitching") {
            const IP = num(stats[idx("IP")]), K = num(stats[idx("K")]), ER = num(stats[idx("ER")]);
            const BB = num(stats[idx("BB")]), H = num(stats[idx("H")]);
            if (IP === 0) return;
            const score = K * 1 + IP * 1.5 - ER * 2 - BB * 0.3;
            const line = [`${IP} IP`, `${K} K`, `${ER} ER`];
            if (H) line.push(`${H} H`);
            pitchers.push({ name, team: teamAbbr, score, line: line.join(" · ") });
          }
        });
      });
    });
    return [
      { key: "hitters", title: "🏏 Top Hitters", color: "#22c55e", players: hitters },
      { key: "pitchers", title: "⚾ Top Pitchers", color: "#60a5fa", players: pitchers },
    ];
  }
  if (sport === "nba") {
    const players = [];
    teams.forEach((team) => {
      const teamAbbr = team.team?.abbreviation || "";
      (team.statistics || []).forEach((cat) => {
        const idx = idxOf(cat);
        (cat.athletes || []).forEach((a) => {
          const name = a.athlete?.displayName; const stats = a.stats || [];
          if (!name || stats.length === 0) return;
          const PTS = num(stats[idx("PTS")]), REB = num(stats[idx("REB")]), AST = num(stats[idx("AST")]);
          const STL = num(stats[idx("STL")]), BLK = num(stats[idx("BLK")]);
          const min = stats[idx("MIN")];
          // Skip DNPs
          if ((min === undefined || min === "0" || min === "" || min === "--") && PTS + REB + AST === 0) return;
          const score = PTS + REB * 1.2 + AST * 1.5 + STL * 3 + BLK * 3;
          const line = [];
          if (PTS || min) line.push(`${PTS} PTS`);
          if (REB) line.push(`${REB} REB`);
          if (AST) line.push(`${AST} AST`);
          players.push({ name, team: teamAbbr, score, line: line.join(" · ") || "—" });
        });
      });
    });
    return [{ key: "perf", title: "🏀 Top Performers", color: "#a3e635", players }];
  }
  if (sport === "nhl") {
    const skaters = [], goalies = [];
    teams.forEach((team) => {
      const teamAbbr = team.team?.abbreviation || "";
      (team.statistics || []).forEach((cat) => {
        const type = cat.name || cat.type;
        const idx = idxOf(cat);
        (cat.athletes || []).forEach((a) => {
          const name = a.athlete?.displayName; const stats = a.stats || [];
          if (!name || stats.length === 0) return;
          if (type === "goalies") {
            const SV = num(stats[idx("SV")] ?? stats[idx("SAVES")]), GA = num(stats[idx("GA")]);
            const svpct = stats[idx("SV%")];
            if (SV === 0 && GA === 0) return;
            const score = SV * 0.2 - GA * 1 + (num(svpct) >= 0.92 || num(svpct) >= 92 ? 2 : 0);
            const line = [`${SV} SV`, `${GA} GA`];
            if (svpct) line.push(`${svpct} SV%`);
            goalies.push({ name, team: teamAbbr, score, line: line.join(" · ") });
          } else {
            const G = num(stats[idx("G")]), A = num(stats[idx("A")]), S = num(stats[idx("S")] ?? stats[idx("SOG")]);
            if (G === 0 && A === 0 && S === 0) return;
            const score = G * 3 + A * 2 + S * 0.3;
            const line = [];
            if (G) line.push(`${G} G`);
            if (A) line.push(`${A} A`);
            if (S) line.push(`${S} S`);
            skaters.push({ name, team: teamAbbr, score, line: line.join(" · ") || "—" });
          }
        });
      });
    });
    return [
      { key: "skaters", title: "🏒 Top Skaters", color: "#a3e635", players: skaters },
      { key: "goalies", title: "🥅 Top Goalies", color: "#60a5fa", players: goalies },
    ];
  }
  return [];
}

export default function DailyRecap({ sport, date }) {
  const meta = SPORT_META[sport] || SPORT_META.mlb;
  const favTeamKey = `favorite_team_${sport}`;
  const gh = (gameId) => `/game/${gameId}?sport=${sport}`;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState([]);
  const [comments, setComments] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [barDrilldown, setBarDrilldown] = useState(null);
  const [perfGroups, setPerfGroups] = useState([]);
  const [perfLoading, setPerfLoading] = useState(false);

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
        const rRes = await sbFetch(`ratings?game_date=eq.${date}&public=eq.true&rating=not.is.null&sport=eq.${sport}&select=*`);
        const rData = await sbJson(rRes);
        if (cancelled) return;
        setRatings(rData);

        const gameIds = [...new Set(rData.map(r => r.game_id))];
        if (gameIds.length > 0) {
          const cRes = await sbFetch(`comments?game_id=in.(${gameIds.join(",")})&select=*`);
          const cData = await sbJson(cRes);
          if (cancelled) return;
          setComments(cData);

          const userIds = [...new Set([...rData.map(r => r.user_id), ...cData.map(c => c.user_id)])];
          if (userIds.length > 0) {
            const pRes = await sbFetch(`profiles?user_id=in.(${userIds.join(",")})&select=user_id,handle,display_name,avatar_url,${favTeamKey}`);
            const pData = await sbJson(pRes);
            if (cancelled) return;
            const pmap = {};
            pData.forEach(p => { pmap[p.user_id] = p; });
            setProfiles(pmap);
          }
        } else {
          setComments([]);
          setProfiles({});
        }
      } catch (e) { console.error("Daily recap load:", e); }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [date, sport]);

  // Top Performers — fetch boxscores for every rated game, rank players
  useEffect(() => {
    let cancelled = false;
    async function loadPerformers() {
      const gameIds = [...new Set(ratings.map(r => r.game_id))];
      if (gameIds.length === 0) { setPerfGroups([]); return; }
      setPerfLoading(true);
      try {
        // Accumulate players per group key across all games
        const acc = {};
        for (const gid of gameIds) {
          const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${meta.path}/summary?event=${gid}`);
          if (!r.ok) continue;
          const d = await r.json();
          if (cancelled) return;
          parsePerformers(sport, d).forEach((group) => {
            if (!acc[group.key]) acc[group.key] = { ...group, players: [] };
            acc[group.key].players.push(...group.players);
          });
        }
        if (cancelled) return;
        // Dedupe by name (keep best score), top 5 per group
        const groups = Object.values(acc).map((group) => {
          const best = {};
          group.players.forEach(p => { if (!best[p.name] || p.score > best[p.name].score) best[p.name] = p; });
          return { ...group, players: Object.values(best).sort((a, b) => b.score - a.score).slice(0, 5) };
        }).filter(g => g.players.length > 0);
        setPerfGroups(groups);
      } catch (e) { console.error("Top performers:", e); }
      if (!cancelled) setPerfLoading(false);
    }
    loadPerformers();
    return () => { cancelled = true; };
  }, [ratings, sport]);

  // ===== Computed aggregates (sport-agnostic) =====
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

  const bestGames = [...allGames].filter(g => g.count >= 1).sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg)).slice(0, 5);
  const worstGames = [...allGames].filter(g => g.count >= 1).sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg)).slice(0, 3);

  const mvpVotes = {};
  ratings.forEach(r => { if (r.mvp) mvpVotes[r.mvp] = (mvpVotes[r.mvp] || 0) + 1; });
  const totalMvpPicks = Object.values(mvpVotes).reduce((s, n) => s + n, 0);
  const topMvps = Object.entries(mvpVotes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, votes]) => ({ name, votes, pct: totalMvpPicks > 0 ? Math.round((votes / totalMvpPicks) * 100) : 0 }));

  const letdownVotes = {};
  ratings.forEach(r => { if (r.letdown) letdownVotes[r.letdown] = (letdownVotes[r.letdown] || 0) + 1; });
  const topLetdowns = Object.entries(letdownVotes).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const worthYes = ratings.filter(r => r.worth_it === "yes").length;
  const worthNo = ratings.filter(r => r.worth_it === "no").length;
  const worthMeh = ratings.filter(r => r.worth_it === "meh").length;
  const totalWorth = worthYes + worthNo + worthMeh;
  const worthPct = totalWorth > 0 ? Math.round((worthYes / totalWorth) * 100) : 0;

  const raterCounts = {};
  ratings.forEach(r => { raterCounts[r.user_id] = (raterCounts[r.user_id] || 0) + 1; });
  const topRaters = Object.entries(raterCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([uid, count]) => ({
    user_id: uid, count, profile: profiles[uid],
  }));

  const topReviews = ratings
    .filter(r => r.review && r.review.length > 30)
    .map(r => ({ ...r, profile: profiles[r.user_id] }))
    .sort((a, b) => b.review.length - a.review.length)
    .slice(0, 4);

  const allRatingsList = ratings.map(r => parseFloat(r.rating));
  const overallAvg = allRatingsList.length > 0 ? (allRatingsList.reduce((s, r) => s + r, 0) / allRatingsList.length).toFixed(1) : "—";

  const ratedGames = allGames.filter(g => g.avg !== null);
  const dist = Array(10).fill(0).map((_, i) => ratedGames.filter(g => Math.round(parseFloat(g.avg)) === i + 1).length);

  const greatGames = ratedGames.filter(g => parseFloat(g.avg) >= 8);
  const goodGames = ratedGames.filter(g => parseFloat(g.avg) >= 6 && parseFloat(g.avg) < 8);
  const mehGames = ratedGames.filter(g => parseFloat(g.avg) >= 4 && parseFloat(g.avg) < 6);
  const badGames = ratedGames.filter(g => parseFloat(g.avg) < 4);

  const prevDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const canGoNext = nextDate <= todayStr;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading recap...</div>;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">{meta.emoji} Daily Recap</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-900 border border-zinc-800 p-5 mb-4 text-center">
          <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mb-1">{meta.emoji} {meta.label}</div>
          <div className="text-2xl font-extrabold text-white">{prettyDate(date)}</div>
          <div className="text-xs text-zinc-500 mt-1">{ratings.length} {ratings.length === 1 ? "rating" : "ratings"} · {comments.length} {comments.length === 1 ? "comment" : "comments"} · {allGames.length} {allGames.length === 1 ? "game" : "games"}</div>
        </div>

        {ratings.length === 0 ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center">
            <div className="text-5xl mb-3">{meta.emoji}</div>
            <div className="text-base font-bold text-white">No ratings for this day yet</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Once people rate games from {prettyDate(date)}, the recap will fill in here</div>
            <Link href="/" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</Link>
          </div>
        ) : (
          <>
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

            {ratedGames.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">{meta.emoji} Game Quality Breakdown</h3>
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

            {bestGames.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">🏆 Best Games of the Day</h3>
                {bestGames.map((g, i) => (
                  <Link key={g.game_id} href={gh(g.game_id)} className="block">
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

            {(perfLoading || perfGroups.length > 0) && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-1">📈 Top Performers</h3>
                <p className="text-[10px] text-zinc-500 mb-3">Best statistical games across all rated matchups</p>
                {perfLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-4 justify-center">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                    Crunching box scores…
                  </div>
                ) : (
                  <div className="space-y-4">
                    {perfGroups.map((group) => (
                      <div key={group.key}>
                        <div className="text-[11px] font-extrabold tracking-widest uppercase mb-2" style={{ color: group.color }}>{group.title}</div>
                        {group.players.map((p, i) => (
                          <Link key={p.name + i} href={`/player/${encodeURIComponent(p.name)}`} className="flex items-center gap-3 p-2.5 rounded-xl mb-1.5 bg-zinc-950 hover:bg-zinc-900 transition-colors">
                            <span className="text-base font-extrabold w-5 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-white truncate">{p.name} <span className="text-[10px] text-zinc-600 font-semibold">{p.team}</span></div>
                              <div className="text-[10px] text-zinc-500">{p.line}</div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {topMvps.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-1">🌟 MVP of the Day</h3>
                <p className="text-[10px] text-zinc-500 mb-3">Share of all {totalMvpPicks} MVP picks today</p>
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
                    <div className="mt-2 ml-9 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, backgroundColor: i === 0 ? "#fbbf24" : "#dc2626" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

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

            {worstGames.length > 0 && worstGames[0].avg && parseFloat(worstGames[0].avg) < 6 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">💩 Most Painful Watches</h3>
                {worstGames.map((g) => (
                  <Link key={g.game_id} href={gh(g.game_id)} className="block">
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

            {topReviews.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">💬 Top Reviews</h3>
                {topReviews.map((r) => (
                  <Link key={r.id} href={gh(r.game_id)} className="block">
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
                        {r.profile?.[favTeamKey] && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600/15 text-red-300">{meta.emoji} {r.profile[favTeamKey]}</span>}
                        <span className="text-[10px] text-zinc-600 ml-auto">{r.away_team} v {r.home_team}</span>
                        <span className="text-xs font-bold" style={{ color: rc(parseFloat(r.rating)) }}>{r.rating}</span>
                      </div>
                      <div className="text-xs text-zinc-300 italic">&quot;{r.review}&quot;</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {topRaters.length > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="text-base font-bold text-white mb-3">🏅 Top Raters Today</h3>
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

        <div className="flex gap-2 mt-6">
          <Link href={`/recap/${sport}/${prevDate}`} className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm text-center hover:bg-zinc-800">← Prev Day</Link>
          {canGoNext ? (
            <Link href={`/recap/${sport}/${nextDate}`} className="flex-1 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-sm text-center hover:bg-zinc-800">Next Day →</Link>
          ) : <div className="flex-1" />}
        </div>
      </div>

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
                <Link key={g.game_id} href={gh(g.game_id)} onClick={() => setBarDrilldown(null)} className="block">
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
