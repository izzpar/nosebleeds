"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { repScore, repTier } from "@/lib/reputation";

const MIN_PICKS_FOR_PCT = 5; // minimum settled picks to qualify for the win% board

const BOARDS = [
  { id: "rep", label: "Rep", icon: "🏅", blurb: "Highest community reputation (Cred)" },
  { id: "units", label: "Units", icon: "💰", blurb: "Most units won (odds-weighted profit)" },
  { id: "winpct", label: "Win %", icon: "🎯", blurb: `Best win rate (min ${MIN_PICKS_FOR_PCT} picks)` },
  { id: "wins", label: "Wins", icon: "🏆", blurb: "Most correct picks all-time" },
  { id: "streak", label: "Streak", icon: "🔥", blurb: "Longest active win streak" },
  { id: "best", label: "Best", icon: "⚡", blurb: "Longest streak ever recorded" },
];

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState("rep");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [repRows, setRepRows] = useState(null); // lazy-loaded reputation board

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
        // All settled predictions (both modes)
        const predRes = await sbFetch(`predictions?status=in.(won,lost,push)&order=game_date.asc.nullslast,locks_at.asc&select=user_id,status,units,mode,locks_at,game_date,settled_at`);
        const preds = await sbJson(predRes);
        if (cancelled) return;

        // Group by user, split by mode
        const byUser = {};
        preds.forEach(p => {
          if (!byUser[p.user_id]) byUser[p.user_id] = { pickem: [], streak: [] };
          if (p.mode === "streak") byUser[p.user_id].streak.push(p);
          else byUser[p.user_id].pickem.push(p);
        });

        // Compute per-user stats
        const stats = Object.entries(byUser).map(([uid, modes]) => {
          const picks = modes.pickem;      // pick'em → units, wins, win%
          const streakPicks = modes.streak; // Beat the Streak → streak boards
          let wins = 0, losses = 0, pushes = 0, units = 0;
          picks.forEach(p => {
            units += parseFloat(p.units) || 0;
            if (p.status === "won") wins++;
            else if (p.status === "lost") losses++;
            else pushes++;
          });
          // Streak math from the dedicated streak game (chronological)
          let curStreak = 0, bestStreak = 0, running = 0;
          streakPicks.forEach(p => {
            if (p.status === "won") { running++; if (running > bestStreak) bestStreak = running; }
            else if (p.status === "lost") running = 0;
          });
          for (let i = streakPicks.length - 1; i >= 0; i--) {
            if (streakPicks[i].status === "won") curStreak++;
            else if (streakPicks[i].status === "lost") break;
          }
          const decided = wins + losses;
          return {
            user_id: uid,
            wins, losses, pushes,
            settled: picks.length,
            decided,
            winPct: decided > 0 ? (wins / decided) * 100 : 0,
            units: Math.round(units * 100) / 100,
            curStreak,
            bestStreak,
          };
        });

        // Fetch profiles for everyone on the board
        const uids = stats.map(s => s.user_id);
        let profMap = {};
        if (uids.length > 0) {
          const profRes = await sbFetch(`profiles?user_id=in.(${uids.join(",")})&select=user_id,handle,display_name,avatar_url`);
          const profs = await sbJson(profRes);
          profs.forEach(p => { profMap[p.user_id] = p; });
        }
        if (cancelled) return;

        const enriched = stats.map(s => ({ ...s, profile: profMap[s.user_id] || null }));
        setRows(enriched);
      } catch (e) { console.error("Leaderboard load:", e); }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Reputation board — lazy-loaded the first time it's opened
  useEffect(() => {
    if (board !== "rep" || repRows !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const ratings = await sbJson(await sbFetch(`ratings?public=eq.true&select=user_id,review,rating`));
        const comments = await sbJson(await sbFetch(`comments?select=id,user_id`));
        const reactions = await sbJson(await sbFetch(`comment_reactions?select=comment_id,user_id`));
        const follows = await sbJson(await sbFetch(`follows?select=following_id`));
        if (cancelled) return;
        const stats = {};
        const ensure = (u) => (stats[u] || (stats[u] = { ratings: 0, reviews: 0, comments: 0, likes: 0, followers: 0 }));
        ratings.forEach((r) => { const s = ensure(r.user_id); if (r.rating != null) s.ratings++; if (r.review) s.reviews++; });
        const owner = {};
        comments.forEach((c) => { ensure(c.user_id).comments++; owner[c.id] = c.user_id; });
        reactions.forEach((r) => { const o = owner[r.comment_id]; if (o && r.user_id !== o) ensure(o).likes++; });
        follows.forEach((f) => { ensure(f.following_id).followers++; });
        const list = Object.entries(stats)
          .map(([uid, s]) => ({ user_id: uid, ...s, rep: repScore(s) }))
          .filter((x) => x.rep > 0)
          .sort((a, b) => b.rep - a.rep)
          .slice(0, 50);
        let profMap = {};
        if (list.length) {
          const profs = await sbJson(await sbFetch(`profiles?user_id=in.(${list.map((x) => x.user_id).join(",")})&select=user_id,handle,display_name,avatar_url`));
          profs.forEach((p) => { profMap[p.user_id] = p; });
        }
        if (cancelled) return;
        setRepRows(list.map((x) => ({ ...x, profile: profMap[x.user_id] || null })));
      } catch (e) { console.error("Rep board:", e); if (!cancelled) setRepRows([]); }
    })();
    return () => { cancelled = true; };
  }, [board, repRows]);

  // Sort + filter rows for the active board
  function rankedRows() {
    if (board === "rep") return repRows || [];
    let r = [...rows];
    if (board === "units") {
      // Anyone with at least one settled pick can rank (units can be negative)
      r = r.filter(x => x.decided >= 1);
      r.sort((a, b) => b.units - a.units || b.winPct - a.winPct);
    } else if (board === "winpct") {
      r = r.filter(x => x.decided >= MIN_PICKS_FOR_PCT);
      r.sort((a, b) => b.winPct - a.winPct || b.decided - a.decided);
    } else if (board === "wins") {
      r = r.filter(x => x.wins > 0);
      r.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
    } else if (board === "streak") {
      r = r.filter(x => x.curStreak > 0);
      r.sort((a, b) => b.curStreak - a.curStreak || b.wins - a.wins);
    } else if (board === "best") {
      r = r.filter(x => x.bestStreak > 0);
      r.sort((a, b) => b.bestStreak - a.bestStreak || b.wins - a.wins);
    }
    return r;
  }

  function statFor(row) {
    if (board === "rep") {
      const t = repTier(row.rep);
      return { big: row.rep.toLocaleString(), sub: `${t.emoji} ${t.name} · ${row.likes} likes`, color: t.color };
    }
    if (board === "units") {
      const u = (row.units >= 0 ? "+" : "") + row.units.toFixed(2);
      return { big: `${u}u`, sub: `${row.wins}-${row.losses}${row.pushes ? `-${row.pushes}` : ""}`, color: row.units > 0 ? "#22c55e" : row.units < 0 ? "#ef4444" : "#a1a1aa" };
    }
    if (board === "winpct") return { big: `${Math.round(row.winPct)}%`, sub: `${row.wins}-${row.losses}${row.pushes ? `-${row.pushes}` : ""}` };
    if (board === "wins") return { big: `${row.wins}`, sub: `${Math.round(row.winPct)}% · ${row.decided} picks` };
    if (board === "streak") return { big: `${row.curStreak}🔥`, sub: `${row.wins} total wins` };
    return { big: `${row.bestStreak}⚡`, sub: `${row.wins} total wins` };
  }

  const ranked = rankedRows();
  const myRank = user ? ranked.findIndex(r => r.user_id === user.id) : -1;
  const activeBoard = BOARDS.find(b => b.id === board);
  const boardLoading = board === "rep" ? repRows === null : loading;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/predictions" className="text-zinc-400 hover:text-white text-sm font-medium">← Predictions</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">🏆 Leaderboards</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Board switcher */}
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {BOARDS.map(b => (
            <button
              key={b.id}
              onClick={() => setBoard(b.id)}
              className={`p-2.5 rounded-xl text-center transition-all border ${board === b.id ? "bg-red-600/15 border-red-600/50" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"}`}
            >
              <div className="text-lg">{b.icon}</div>
              <div className={`text-[9px] font-bold mt-0.5 ${board === b.id ? "text-white" : "text-zinc-500"}`}>{b.label}</div>
            </button>
          ))}
        </div>

        {/* Active board blurb */}
        <div className="text-xs text-zinc-500 mb-3 text-center">{activeBoard?.blurb}</div>

        {boardLoading && <div className="text-center py-12 text-zinc-500 text-sm">Loading leaderboard…</div>}

        {!boardLoading && ranked.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">{activeBoard?.icon}</div>
            <div className="text-base font-bold text-white">Nothing here yet</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">
              {board === "rep"
                ? "Once people start rating games and posting comments, they'll rank here."
                : board === "winpct"
                ? `Once players have ${MIN_PICKS_FOR_PCT}+ settled picks, they'll rank here.`
                : "Make and settle some picks to get on the board."}
            </div>
          </div>
        )}

        {!boardLoading && ranked.map((row, i) => {
          const s = statFor(row);
          const isMe = user && row.user_id === user.id;
          const rankColor = i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b";
          const name = row.profile?.display_name || (row.profile?.handle ? `@${row.profile.handle}` : "Anonymous");
          const inner = (
            <div className={`flex items-center gap-3 p-3 rounded-xl mb-2 border transition-all ${isMe ? "bg-red-600/10 border-red-600/40" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"}`}>
              <span className="text-base font-extrabold w-6 text-center shrink-0" style={{ color: rankColor }}>{i + 1}</span>
              {row.profile?.avatar_url ? (
                <img src={row.profile.avatar_url} referrerPolicy="no-referrer" className="w-9 h-9 rounded-full shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {name[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">{name}{isMe && <span className="text-[10px] text-red-400 ml-1">you</span>}</div>
                <div className="text-[10px] text-zinc-500">{s.sub}</div>
              </div>
              <div className="text-lg font-extrabold shrink-0" style={{ color: s.color || "#ffffff" }}>{s.big}</div>
            </div>
          );
          return row.profile?.handle
            ? <Link key={row.user_id} href={`/u/${row.profile.handle}`}>{inner}</Link>
            : <div key={row.user_id}>{inner}</div>;
        })}

        {/* Your rank, if off-screen */}
        {!boardLoading && user && myRank >= 0 && (
          <div className="text-[10px] text-zinc-500 text-center mt-3">
            You're ranked #{myRank + 1} of {ranked.length} on this board
          </div>
        )}
        {!boardLoading && user && myRank < 0 && ranked.length > 0 && (
          <div className="text-[10px] text-zinc-600 text-center mt-3">
            {board === "rep"
              ? "Rate games, write reviews, and get likes on your comments to climb the rankings."
              : board === "winpct"
              ? `Make ${MIN_PICKS_FOR_PCT}+ settled picks to qualify for this board`
              : "You're not on this board yet — make some winning picks!"}
          </div>
        )}
      </div>

      <Nav />
    </div>
  );
}
