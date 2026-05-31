"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const SPORTS = [
  { id: "nfl", emoji: "🏈", label: "NFL" },
  { id: "mlb", emoji: "⚾", label: "MLB" },
  { id: "nba", emoji: "🏀", label: "NBA" },
  { id: "nhl", emoji: "🏒", label: "NHL" },
];
const VALID_SPORTS = SPORTS.map((s) => s.id);
const sportEmoji = (s) => SPORTS.find((x) => x.id === s)?.emoji || "🏈";
const sportLabel = (s) => SPORTS.find((x) => x.id === s)?.label || "NFL";
const gameHref = (id, s) => (s && s !== "nfl" ? `/game/${id}?sport=${s}` : `/game/${id}`);

// ---- helpers ----
function fmtGameTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Sport-aware term for when a game starts / a pick locks
function startTerm(sport) {
  return sport === "mlb" ? "first pitch" : sport === "nba" ? "tip-off" : sport === "nhl" ? "puck drop" : "kickoff";
}

export default function PredictionsPage() {
  const { user } = useAuth();

  const [sport, setSport] = useState("nfl");
  const [subTab, setSubTab] = useState("make");   // 'make' | 'mine'
  const [viewMode, setViewMode] = useState("fun"); // 'fun' (W-L) | 'units' (betting)
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPicks, setMyPicks] = useState([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [saving, setSaving] = useState(null);      // gameId currently saving
  const [toast, setToast] = useState("");
  const [checking, setChecking] = useState(false);

  // persist sport choice + view mode
  useEffect(() => {
    try {
      const s = localStorage.getItem("nb_sport");
      if (VALID_SPORTS.includes(s)) setSport(s);
      const vm = localStorage.getItem("nb_predict_view");
      if (vm === "fun" || vm === "units") setViewMode(vm);
    } catch (e) {}
  }, []);

  const changeViewMode = (m) => {
    setViewMode(m);
    try { localStorage.setItem("nb_predict_view", m); } catch (e) {}
  };

  // ---- Supabase direct-fetch helper (JS client hangs) ----
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

  // ---- Load upcoming games for the chosen sport ----
  useEffect(() => {
    let cancelled = false;
    async function loadGames() {
      setLoading(true);
      try {
        // NFL: current week's scoreboard. MLB/NBA/NHL: today + next 2 days.
        let events = [];
        if (sport === "nfl") {
          const r = await fetch(`${ESPN_BASE}/${SPORT_PATHS.nfl}/scoreboard`);
          if (r.ok) {
            const d2 = await r.json();
            events = d2.events || [];
          }
        } else {
          const base = new Date();
          for (let i = 0; i < 3; i++) {
            const d = new Date(base);
            d.setDate(d.getDate() + i);
            const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
            const r = await fetch(`${ESPN_BASE}/${SPORT_PATHS[sport]}/scoreboard?dates=${ds}`);
            if (r.ok) {
              const d2 = await r.json();
              events.push(...(d2.events || []));
            }
          }
        }
        if (cancelled) return;

        // Only scheduled (not started) games
        const parsed = events
          .filter(e => e.competitions?.[0]?.status?.type?.name === "STATUS_SCHEDULED")
          .map(e => {
            const c = e.competitions[0];
            const ho = (c.competitors || []).find(t => t.homeAway === "home");
            const aw = (c.competitors || []).find(t => t.homeAway === "away");
            if (!ho || !aw) return null;
            // Odds (spread + moneyline) — inline on scoreboard when available
            const odds = c.odds?.[0];
            let spread = null, favAbbr = null;
            const moneylines = {};
            if (odds) {
              if (typeof odds.spread === "number") spread = odds.spread;
              // details like "KC -1.5"
              if (odds.details) {
                const m = odds.details.match(/^([A-Z]+)\s+(-?\d+(?:\.\d+)?)/);
                if (m) { favAbbr = m[1]; }
              }
              // Moneylines per team
              const homeML = odds.homeTeamOdds?.moneyLine;
              const awayML = odds.awayTeamOdds?.moneyLine;
              if (typeof homeML === "number") moneylines[ho.team.abbreviation] = homeML;
              if (typeof awayML === "number") moneylines[aw.team.abbreviation] = awayML;
            }
            return {
              id: e.id,
              sport,
              date: e.date,
              home: { abbr: ho.team.abbreviation, name: ho.team.displayName, logo: ho.team.logo, color: "#" + (ho.team.color || "333"), record: ho.records?.[0]?.summary || "" },
              away: { abbr: aw.team.abbreviation, name: aw.team.displayName, logo: aw.team.logo, color: "#" + (aw.team.color || "333"), record: aw.records?.[0]?.summary || "" },
              spread, favAbbr, moneylines,
              spreadText: odds?.details || null,
            };
          })
          .filter(Boolean)
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (!cancelled) setGames(parsed);
      } catch (e) { console.error("Predictions games load:", e); }
      if (!cancelled) setLoading(false);
    }
    loadGames();
    return () => { cancelled = true; };
  }, [sport]);

  // ---- Settlement engine: score finished picks against ESPN results ----
  // For each pending pick whose game has started, fetch the game result and
  // determine won/lost/push. Returns the number of picks newly settled.
  async function settlePicks(picks) {
    const now = Date.now();
    // Only attempt picks whose game should have finished (locked + buffer)
    const toCheck = picks.filter(p =>
      p.status === "pending" &&
      p.locks_at &&
      new Date(p.locks_at).getTime() < now
    );
    if (toCheck.length === 0) return 0;

    // Group by game so we fetch each game's summary only once
    const byGame = {};
    toCheck.forEach(p => {
      if (!byGame[p.game_id]) byGame[p.game_id] = { sport: p.sport, picks: [] };
      byGame[p.game_id].picks.push(p);
    });

    let settledCount = 0;

    for (const gameId of Object.keys(byGame)) {
      const { sport: gSport, picks: gPicks } = byGame[gameId];
      try {
        const sportPath = SPORT_PATHS[gSport] || SPORT_PATHS.nfl;
        const r = await fetch(`${ESPN_BASE}/${sportPath}/summary?event=${gameId}`);
        if (!r.ok) continue;
        const d = await r.json();
        const comp = d.header?.competitions?.[0];
        const status = comp?.status?.type;
        // Only settle if the game is actually complete
        if (!status?.completed) continue;

        const competitors = comp?.competitors || [];
        const homeC = competitors.find(c => c.homeAway === "home");
        const awayC = competitors.find(c => c.homeAway === "away");
        if (!homeC || !awayC) continue;

        const homeScore = parseInt(homeC.score, 10);
        const awayScore = parseInt(awayC.score, 10);
        const homeAbbr = homeC.team?.abbreviation;
        const awayAbbr = awayC.team?.abbreviation;
        const winnerAbbr = homeC.winner ? homeAbbr : awayC.winner ? awayAbbr : null;

        for (const pick of gPicks) {
          let result = null; // 'won' | 'lost' | 'push'

          if (pick.pick_type === "winner") {
            if (!winnerAbbr) result = "push"; // tie (rare)
            else result = pick.pick_value === winnerAbbr ? "won" : "lost";
          } else if (pick.pick_type === "ats") {
            // pick.line is the spread magnitude; pick_value is the team taken.
            // Determine the picked team's margin, then apply the spread.
            const pickedIsHome = pick.pick_value === homeAbbr;
            const pickedScore = pickedIsHome ? homeScore : awayScore;
            const oppScore = pickedIsHome ? awayScore : homeScore;
            const margin = pickedScore - oppScore;
            // pick_label encodes the line direction, e.g. "KC -1.5" or "DEN +1.5"
            const lineMatch = (pick.pick_label || "").match(/([+-]\d+(?:\.\d+)?)\s*$/);
            const signedLine = lineMatch ? parseFloat(lineMatch[1]) : 0;
            const adjusted = margin + signedLine;
            if (adjusted > 0) result = "won";
            else if (adjusted < 0) result = "lost";
            else result = "push";
          }

          if (result) {
            // Units: a loss is always -1. A win pays out by the odds.
            // Moneyline picks use the stored moneyline; ATS picks use standard -110.
            let units = 0;
            if (result === "won") {
              if (pick.pick_type === "winner" && pick.moneyline != null) {
                const ml = pick.moneyline;
                units = ml > 0 ? ml / 100 : 100 / Math.abs(ml);
              } else {
                // ATS or moneyline w/o stored odds → standard -110
                units = 100 / 110;
              }
            } else if (result === "lost") {
              units = -1;
            } // push → 0
            units = Math.round(units * 100) / 100;

            const patch = await sbFetch(`predictions?id=eq.${pick.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                status: result, units, settled_at: new Date().toISOString(),
                result_away: `${awayAbbr} ${awayScore}`,
                result_home: `${homeAbbr} ${homeScore}`,
              }),
            });
            if (patch.ok) settledCount++;
          }
        }
      } catch (e) {
        console.error("Settle game", gameId, e);
      }
    }
    return settledCount;
  }

  // Manual "check results" — settle on demand
  async function handleCheckResults() {
    if (!user || checking) return;
    setChecking(true);
    try {
      const settled = await settlePicks(myPicks);
      const refreshed = await sbJson(await sbFetch(`predictions?user_id=eq.${user.id}&order=created_at.desc&select=*`));
      setMyPicks(refreshed);
      setToast(settled > 0 ? `${settled} pick${settled === 1 ? "" : "s"} settled` : "No finished games yet");
    } catch (e) {
      setToast("Couldn't check results");
    }
    setChecking(false);
    setTimeout(() => setToast(""), 2500);
  }

  // ---- Load this user's existing picks, then settle any finished ones ----
  useEffect(() => {
    if (!user) { setMyPicks([]); return; }
    let cancelled = false;
    async function loadPicks() {
      setPicksLoading(true);
      try {
        const res = await sbFetch(`predictions?user_id=eq.${user.id}&order=created_at.desc&select=*`);
        const data = await sbJson(res);
        if (cancelled) return;
        setMyPicks(data);

        // Lazy settlement: score any finished picks, then reload if anything changed
        const settled = await settlePicks(data);
        if (cancelled) return;
        if (settled > 0) {
          const refreshed = await sbJson(await sbFetch(`predictions?user_id=eq.${user.id}&order=created_at.desc&select=*`));
          if (!cancelled) {
            setMyPicks(refreshed);
            setToast(`${settled} pick${settled === 1 ? "" : "s"} settled`);
            setTimeout(() => setToast(""), 2500);
          }
        }
      } catch (e) { console.error("Picks load:", e); }
      if (!cancelled) setPicksLoading(false);
    }
    loadPicks();
    return () => { cancelled = true; };
  }, [user]);

  // Map of gameId -> existing pick (for the chosen sport & pickem mode)
  const pickByGame = {};
  myPicks.forEach(p => {
    if (p.mode === "pickem") pickByGame[p.game_id] = p;
  });

  // ---- Make / change a pick ----
  // Pick'em: one pick per game, unlimited games per day. Picking again on the
  // same game updates that pick; a different game adds a new one.
  async function makePick(game, pickType, pickValue, pickLabel) {
    if (!user) { setToast("Sign in to make picks"); setTimeout(() => setToast(""), 2000); return; }
    // If the game has already started, block.
    if (game.date && new Date(game.date).getTime() < Date.now()) {
      setToast("That game has already started");
      setTimeout(() => setToast(""), 2000);
      return;
    }
    setSaving(game.id);
    try {
      const existingThisGame = pickByGame[game.id];
      const body = {
        user_id: user.id,
        sport: game.sport,
        mode: "pickem",
        game_id: game.id,
        game_date: game.date ? game.date.slice(0, 10) : null,
        pick_type: pickType,
        pick_value: pickValue,
        pick_label: pickLabel,
        line: pickType === "ats" && game.spread != null ? game.spread : null,
        moneyline: pickType === "winner" ? (game.moneylines?.[pickValue] ?? null) : null,
        locks_at: game.date,
        status: "pending",
      };
      let res;
      if (existingThisGame) {
        // Update the existing pick on this game
        res = await sbFetch(`predictions?id=eq.${existingThisGame.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            pick_type: pickType, pick_value: pickValue, pick_label: pickLabel,
            line: body.line, moneyline: body.moneyline, status: "pending",
          }),
        });
      } else {
        res = await sbFetch(`predictions`, {
          method: "POST",
          headers: { "Prefer": "return=representation" },
          body: JSON.stringify(body),
        });
      }
      if (res.ok) {
        const refreshed = await sbJson(await sbFetch(`predictions?user_id=eq.${user.id}&order=created_at.desc&select=*`));
        setMyPicks(refreshed);
        setToast(existingThisGame ? "Pick updated" : "Pick locked in");
      } else {
        const t = await res.text();
        setToast(`Error: ${t.substring(0, 60)}`);
      }
    } catch (e) {
      setToast(`Error: ${e.message}`);
    }
    setSaving(null);
    setTimeout(() => setToast(""), 2000);
  }

  const pendingPicks = myPicks.filter(p => p.status === "pending");
  const settledPicks = myPicks.filter(p => p.status !== "pending");
  const wins = settledPicks.filter(p => p.status === "won").length;
  const losses = settledPicks.filter(p => p.status === "lost").length;
  const pushes = settledPicks.filter(p => p.status === "push").length;
  const winPct = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  const totalUnits = settledPicks.reduce((s, p) => s + (parseFloat(p.units) || 0), 0);
  const unitsStr = (totalUnits >= 0 ? "+" : "") + totalUnits.toFixed(2);

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">🔮 Predictions</h1>
          {/* Sport switcher */}
          <div className="flex gap-0.5 p-0.5 rounded-full bg-zinc-900 border border-zinc-800">
            {SPORTS.map((s) => (
              <button key={s.id} onClick={() => setSport(s.id)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${sport === s.id ? "bg-red-600 text-white" : "text-zinc-500"}`}>{s.emoji}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Fun ⇄ Units toggle */}
        <div className="flex gap-1 p-1 rounded-full bg-zinc-900 border border-zinc-800 mb-3 w-fit mx-auto">
          <button
            onClick={() => changeViewMode("fun")}
            className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${viewMode === "fun" ? "bg-red-600 text-white" : "text-zinc-500"}`}
          >
            😎 Fun
          </button>
          <button
            onClick={() => changeViewMode("units")}
            className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${viewMode === "units" ? "bg-red-600 text-white" : "text-zinc-500"}`}
          >
            💰 Units
          </button>
        </div>

        {/* Record summary */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-900 border border-zinc-800 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase">Your Pick'em Record</div>
              <div className="text-2xl font-extrabold text-white mt-0.5">
                {wins}-{losses}{pushes > 0 && `-${pushes}`}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {viewMode === "units" && (
                <Link href="/predictions/breakdown" className="text-right hover:opacity-80 transition-opacity">
                  <div className="text-2xl font-extrabold" style={{ color: totalUnits > 0 ? "#22c55e" : totalUnits < 0 ? "#ef4444" : "#a1a1aa" }}>{unitsStr}u</div>
                  <div className="text-[9px] text-zinc-500 font-bold tracking-wider">UNITS ›</div>
                </Link>
              )}
              <div className="text-right">
                <div className="text-2xl font-extrabold" style={{ color: winPct >= 50 ? "#22c55e" : "#ef4444" }}>{winPct}%</div>
                <div className="text-[9px] text-zinc-500 font-bold tracking-wider">WIN RATE</div>
              </div>
            </div>
          </div>
          {pendingPicks.length > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-zinc-500">{pendingPicks.length} pick{pendingPicks.length === 1 ? "" : "s"} awaiting results</span>
              <button
                onClick={handleCheckResults}
                disabled={checking}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {checking ? "Checking…" : "↻ Check results"}
              </button>
            </div>
          )}
          <Link href="/leaderboard" className="mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs font-bold text-zinc-300 hover:border-red-600/40 transition-colors">
            🏆 View Leaderboards
          </Link>
        </div>

        {/* Beat the Streak entry — its own game mode (MLB hitters), always shown */}
        <Link href="/streak" className="block mb-4">
          <div className="rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-br from-orange-900/50 via-zinc-900 to-zinc-900 border border-orange-600/30 hover:border-orange-600 transition-all">
            <div className="text-3xl">🔥</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">Beat the Streak <span className="text-[9px] font-bold text-orange-400/80">🏈⚾🏀🏒</span></div>
              <div className="text-[10px] text-zinc-400">Pick a team to win (or an MLB hitter to get a hit). One pick a day — how long can you keep it alive?</div>
            </div>
            <span className="text-orange-400 text-sm font-bold">Play →</span>
          </div>
        </Link>


        {/* Sub-tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800 mb-4">
          <button onClick={() => setSubTab("make")} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${subTab === "make" ? "bg-red-600 text-white" : "text-zinc-500"}`}>Make Picks</button>
          <button onClick={() => setSubTab("mine")} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${subTab === "mine" ? "bg-red-600 text-white" : "text-zinc-500"}`}>My Picks ({myPicks.length})</button>
        </div>

        {/* ===== MAKE PICKS ===== */}
        {subTab === "make" && (
          <>
            {loading && <div className="text-center py-12 text-zinc-500 text-sm">Loading upcoming games…</div>}

            {!loading && games.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🗓️</div>
                <div className="text-base font-bold text-white">No upcoming games</div>
                <div className="text-sm text-zinc-500 mt-1">No scheduled {sportLabel(sport)} games to predict right now.</div>
              </div>
            )}

            {!loading && games.map(g => {
              const pick = pickByGame[g.id];
              const isSaving = saving === g.id;
              const href = gameHref(g.id, g.sport);
              return (
                <div key={g.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 mb-3 overflow-hidden">
                  <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${g.away.color} 50%, ${g.home.color} 50%)` }} />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{fmtGameTime(g.date)}</span>
                      {pick && <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-bold">✓ Your Pick</span>}
                    </div>

                    {/* Teams — tap to open the game page */}
                    <Link href={href} className="flex items-center justify-between mb-3 hover:opacity-80 transition-opacity">
                      {[g.away, g.home].map((t, i) => (
                        <div key={i} className={`flex items-center gap-2 ${i === 0 ? "" : "flex-row-reverse"}`}>
                          {t.logo
                            ? <img src={t.logo} alt={t.abbr} className="w-8 h-8 object-contain" />
                            : <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-bold text-white" style={{ background: t.color }}>{t.abbr}</div>}
                          <div className={i === 0 ? "" : "text-right"}>
                            <div className="text-sm font-bold text-white">{t.abbr}</div>
                            <div className="text-[9px] text-zinc-500">{t.record}</div>
                          </div>
                        </div>
                      ))}
                    </Link>

                    {/* Winner pick */}
                    <div className="mb-2">
                      <div className="text-[9px] font-bold text-zinc-600 tracking-widest uppercase mb-1">Pick the winner</div>
                      <div className="flex gap-2">
                        {[g.away, g.home].map((t, i) => {
                          const selected = pick?.pick_type === "winner" && pick?.pick_value === t.abbr;
                          return (
                            <button
                              key={i}
                              disabled={isSaving}
                              onClick={() => makePick(g, "winner", t.abbr, `${t.abbr} to win`)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${selected ? "bg-green-500/15 text-green-400 border-green-500/50" : "bg-zinc-950 text-zinc-400 border-transparent hover:border-zinc-700"}`}
                            >
                              {t.abbr}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* ATS pick — only if a spread is available */}
                    {viewMode === "units" && g.spread != null && g.favAbbr && (
                      <div>
                        <div className="text-[9px] font-bold text-zinc-600 tracking-widest uppercase mb-1">
                          Against the spread {g.spreadText && `(${g.spreadText})`}
                        </div>
                        <div className="flex gap-2">
                          {[g.away, g.home].map((t, i) => {
                            // Favorite covers a -spread; underdog gets +spread
                            const isFav = t.abbr === g.favAbbr;
                            const lineLabel = isFav ? `-${Math.abs(g.spread)}` : `+${Math.abs(g.spread)}`;
                            const selected = pick?.pick_type === "ats" && pick?.pick_value === t.abbr;
                            return (
                              <button
                                key={i}
                                disabled={isSaving}
                                onClick={() => makePick(g, "ats", t.abbr, `${t.abbr} ${lineLabel}`)}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${selected ? "bg-green-500/15 text-green-400 border-green-500/50" : "bg-zinc-950 text-zinc-400 border-transparent hover:border-zinc-700"}`}
                              >
                                {t.abbr} {lineLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {pick && (
                      <div className="text-[10px] text-zinc-500 mt-2 text-center">
                        Your pick: <span className="text-green-400 font-bold">{pick.pick_label}</span> · locks at {startTerm(g.sport)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ===== MY PICKS ===== */}
        {subTab === "mine" && (
          <>
            {picksLoading && <div className="text-center py-12 text-zinc-500 text-sm">Loading your picks…</div>}

            {!picksLoading && myPicks.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🔮</div>
                <div className="text-base font-bold text-white">No picks yet</div>
                <div className="text-sm text-zinc-500 mt-1">Head to Make Picks to predict some games.</div>
              </div>
            )}

            {!picksLoading && pendingPicks.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2">⏳ Pending ({pendingPicks.length})</div>
                {pendingPicks.map(p => {
                  const href = gameHref(p.game_id, p.sport);
                  return (
                    <Link key={p.id} href={href} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-colors">
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{p.pick_label}</div>
                        <div className="text-[10px] text-zinc-500">
                          {sportEmoji(p.sport)} {p.pick_type === "ats" ? "Against the spread" : "Moneyline"}
                          {p.locks_at && ` · locks ${fmtGameTime(p.locks_at)}`}
                        </div>
                      </div>
                      <span className="text-[9px] px-2 py-1 rounded-full bg-zinc-800 text-zinc-400 font-bold">PENDING</span>
                    </Link>
                  );
                })}
              </>
            )}

            {!picksLoading && settledPicks.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2 mt-4">📋 Settled ({settledPicks.length})</div>
                {settledPicks.map(p => {
                  const c = p.status === "won" ? { bg: "bg-green-500/15", tx: "text-green-400", lbl: "WON", icon: "✓" }
                    : p.status === "lost" ? { bg: "bg-red-500/15", tx: "text-red-400", lbl: "LOST", icon: "✗" }
                    : { bg: "bg-zinc-800", tx: "text-zinc-400", lbl: p.status === "push" ? "PUSH" : "VOID", icon: "–" };
                  const href = gameHref(p.game_id, p.sport);
                  const score = (p.result_away && p.result_home) ? `${p.result_away} — ${p.result_home}` : null;
                  return (
                    <Link key={p.id} href={href} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-colors">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-extrabold shrink-0 ${c.bg} ${c.tx}`}>{c.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{p.pick_label}</div>
                        <div className="text-[10px] text-zinc-500">
                          {score
                            ? <span className="text-zinc-400 font-semibold">Final: {score}</span>
                            : <>{sportEmoji(p.sport)} {p.pick_type === "ats" ? "Against the spread" : "Moneyline"}</>}
                        </div>
                      </div>
                      {p.units != null && (
                        <span className="text-xs font-extrabold shrink-0" style={{ color: parseFloat(p.units) > 0 ? "#22c55e" : parseFloat(p.units) < 0 ? "#ef4444" : "#a1a1aa" }}>
                          {parseFloat(p.units) >= 0 ? "+" : ""}{parseFloat(p.units).toFixed(2)}u
                        </span>
                      )}
                    </Link>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-0 right-0 z-[150] flex justify-center pointer-events-none">
          <div className="px-5 py-2.5 rounded-full text-sm font-bold bg-zinc-800/95 text-white backdrop-blur-md shadow-xl">
            {toast}
          </div>
        </div>
      )}

      <Nav />
    </div>
  );
}
