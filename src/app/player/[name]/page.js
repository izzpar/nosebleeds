"use client";
import { useState, useEffect, use } from "react";
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

const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const ALL_SPORTS = ["nfl", "mlb", "nba", "nhl"];
const ESPN_TEAM_IDS = {
  nfl: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","33","34"],
  mlb: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"],
  nba: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"],
  nhl: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","25","26","27","28","29","30","37","124292","129764"],
};

// Module-level cache: sport -> { playerName: { id, sport, team, position, headshot } }
const playerIndexCache = { nfl: null, mlb: null, nba: null, nhl: null };

async function buildPlayerIndex(sport) {
  if (playerIndexCache[sport]) return playerIndexCache[sport];
  const sportPath = SPORT_PATHS[sport];
  const ids = ESPN_TEAM_IDS[sport] || [];
  const index = {};
  for (const teamId of ids) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/roster`);
      if (!r.ok) continue;
      const d = await r.json();
      const abbr = d.team?.abbreviation || "";
      // Rosters come in two shapes: grouped (NFL/MLB/NHL: [{position, items:[…]}])
      // or flat (NBA: [player, player, …]). Flatten either into a player list.
      const athletes = [];
      (d.athletes || []).forEach((entry) => {
        if (entry && Array.isArray(entry.items)) athletes.push(...entry.items);
        else if (entry && entry.displayName) athletes.push(entry);
      });
      athletes.forEach((p) => {
        if (p.displayName && p.id) {
          index[p.displayName] = {
            id: p.id,
            sport,
            team: abbr,
            position: p.position?.abbreviation || "",
            headshot: p.headshot?.href || "",
          };
        }
      });
    } catch (e) { /* skip */ }
  }
  playerIndexCache[sport] = index;
  return index;
}

// Format a stat line from gamelog labels + values, per sport
function buildStatLine(sport, labels, stats) {
  const get = (label) => {
    const i = labels.indexOf(label);
    return i >= 0 ? stats[i] : null;
  };
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  if (sport === "nba") {
    const pts = get("PTS"), reb = get("REB"), ast = get("AST");
    const bits = [];
    if (pts != null) bits.push(`${pts} PTS`);
    if (reb != null && num(reb)) bits.push(`${reb} REB`);
    if (ast != null && num(ast)) bits.push(`${ast} AST`);
    return bits.join(" · ") || "—";
  }
  if (sport === "nhl") {
    // Goalie line if save stats present, otherwise skater line
    const sv = get("SV") ?? get("SAVES"), ga = get("GA"), svpct = get("SV%");
    if (sv != null || svpct != null) {
      const bits = [];
      if (sv != null) bits.push(`${sv} SV`);
      if (ga != null) bits.push(`${ga} GA`);
      if (svpct != null) bits.push(`${svpct} SV%`);
      return bits.join(" · ") || "—";
    }
    const g = get("G"), a = get("A"), s = get("S") ?? get("SOG"), pm = get("+/-");
    const bits = [];
    if (g != null) bits.push(`${g} G`);
    if (a != null) bits.push(`${a} A`);
    if (s != null && num(s)) bits.push(`${s} S`);
    if (pm != null && bits.length === 0) bits.push(`${pm} +/-`);
    return bits.join(" · ") || "—";
  }
  if (sport === "mlb") {
    const ab = get("AB"), ip = get("IP");
    if (ip != null) {
      const bits = [`${ip} IP`];
      if (get("K") != null) bits.push(`${get("K")} K`);
      if (get("ER") != null) bits.push(`${get("ER")} ER`);
      if (get("H") != null) bits.push(`${get("H")} H`);
      return bits.join(" · ");
    }
    if (ab != null) {
      const h = get("H"), hr = get("HR"), rbi = get("RBI"), r = get("R");
      const bits = [];
      if (h != null && ab != null) bits.push(`${h}-${ab}`);
      if (num(hr)) bits.push(`${hr} HR`);
      if (num(rbi)) bits.push(`${rbi} RBI`);
      if (num(r)) bits.push(`${r} R`);
      return bits.join(" · ") || "—";
    }
    return "—";
  } else {
    const cmp = get("CMP"), patt = get("ATT");
    const car = get("CAR"), rec = get("REC");
    if (cmp != null && patt != null && num(patt) > 0) {
      const bits = [`${cmp}/${patt}`];
      const py = labels.indexOf("YDS") >= 0 ? stats[labels.indexOf("YDS")] : null;
      if (py != null) bits.push(`${py} YDS`);
      const ptd = labels.indexOf("TD") >= 0 ? stats[labels.indexOf("TD")] : null;
      if (num(ptd)) bits.push(`${ptd} TD`);
      const pint = get("INT");
      if (num(pint)) bits.push(`${pint} INT`);
      return bits.join(" · ");
    }
    if (car != null && num(car) > 0) {
      const bits = [`${car} CAR`];
      const idx = labels.lastIndexOf("YDS");
      if (idx >= 0) bits.push(`${stats[idx]} YDS`);
      return bits.join(" · ");
    }
    if (rec != null && num(rec) > 0) {
      const bits = [`${rec} REC`];
      const idx = labels.indexOf("YDS");
      if (idx >= 0) bits.push(`${stats[idx]} YDS`);
      return bits.join(" · ");
    }
    return "—";
  }
}

export default function PlayerPage({ params }) {
  const { name: rawName } = use(params);
  const playerName = decodeURIComponent(rawName);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [resolveProgress, setResolveProgress] = useState(0);
  const [meta, setMeta] = useState(null);
  const [gameLog, setGameLog] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [mvpPicks, setMvpPicks] = useState(0);
  const [letdownPicks, setLetdownPicks] = useState(0);
  const [seasonName, setSeasonName] = useState("");
  const [compareName, setCompareName] = useState("");

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
      setNotFound(false);
      try {
        // 1. Community picks for this player
        const enc = encodeURIComponent(playerName);
        const pickRes = await sbFetch(`ratings?or=(mvp.eq.${enc},letdown.eq.${enc})&public=eq.true&select=game_id,sport,mvp,letdown,rating`);
        const pickRows = await sbJson(pickRes);
        if (cancelled) return;

        const mvpCount = pickRows.filter(r => r.mvp === playerName).length;
        const letdownCount = pickRows.filter(r => r.letdown === playerName).length;
        setMvpPicks(mvpCount);
        setLetdownPicks(letdownCount);

        const communityByGame = {};
        pickRows.forEach(r => {
          if (!communityByGame[r.game_id]) communityByGame[r.game_id] = { ratings: [], mvp: 0, letdown: 0 };
          const c = communityByGame[r.game_id];
          if (r.rating != null) c.ratings.push(parseFloat(r.rating));
          if (r.mvp === playerName) c.mvp++;
          if (r.letdown === playerName) c.letdown++;
        });

        // 2. Resolve player to an ESPN athlete id — try the sport from their
        // community picks first, then fall back across the other leagues.
        const pickSport = pickRows[0]?.sport;
        const sportsToTry = pickSport
          ? [pickSport, ...ALL_SPORTS.filter((s) => s !== pickSport)]
          : ALL_SPORTS;

        let resolved = null;
        for (let si = 0; si < sportsToTry.length && !resolved; si++) {
          const sp = sportsToTry[si];
          const index = await buildPlayerIndex(sp);
          if (cancelled) return;
          setResolveProgress(Math.round((100 * (si + 1)) / sportsToTry.length));
          if (index[playerName]) resolved = index[playerName];
        }

        if (!resolved) {
          if (pickRows.length > 0) {
            const log = Object.keys(communityByGame).map(gid => {
              const c = communityByGame[gid];
              const avg = c.ratings.length > 0 ? c.ratings.reduce((s, x) => s + x, 0) / c.ratings.length : null;
              return { eventId: gid, sport: pickSport || "nfl", date: null, oppAbbr: "", atVs: "", statLine: "", gameResult: "", score: "", communityAvg: avg, mvpCount: c.mvp, letdownCount: c.letdown };
            });
            setGameLog(log);
            setMeta({ id: "", sport: pickSport || "nfl", team: "", position: "", headshot: "" });
          } else {
            setNotFound(true);
          }
          if (!cancelled) setLoading(false);
          return;
        }

        setMeta(resolved);

        // 3. Fetch full season gamelog
        const sportPath = SPORT_PATHS[resolved.sport];
        const glRes = await fetch(`https://site.api.espn.com/apis/common/v3/sports/${sportPath}/athletes/${resolved.id}/gamelog`);
        const gl = await glRes.json();
        if (cancelled) return;

        const labels = gl.labels || [];
        const eventsMeta = gl.events || {};
        const log = [];
        let sName = "";

        (gl.seasonTypes || []).forEach((st) => {
          if (!sName) sName = st.displayName || "";
          (st.categories || []).forEach((cat) => {
            (cat.events || []).forEach((ev) => {
              const em = eventsMeta[ev.eventId] || {};
              const c = communityByGame[ev.eventId] || { ratings: [], mvp: 0, letdown: 0 };
              const avg = c.ratings.length > 0 ? c.ratings.reduce((s, x) => s + x, 0) / c.ratings.length : null;
              log.push({
                eventId: ev.eventId,
                sport: resolved.sport,
                date: em.gameDate || null,
                oppAbbr: em.opponent?.abbreviation || "",
                atVs: em.atVs || "",
                gameResult: em.gameResult || "",
                score: em.score || "",
                statLine: buildStatLine(resolved.sport, labels, ev.stats || []),
                communityAvg: avg,
                mvpCount: c.mvp,
                letdownCount: c.letdown,
              });
            });
          });
        });
        log.sort((a, b) => {
          if (a.date && b.date) return b.date.localeCompare(a.date);
          return 0;
        });
        if (!cancelled) {
          setSeasonName(sName);
          setGameLog(log);
        }
      } catch (e) {
        console.error("Player page load:", e);
        if (!cancelled) setNotFound(true);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [playerName]);

  const totalPicks = mvpPicks + letdownPicks;
  const mvpRate = totalPicks > 0 ? Math.round((mvpPicks / totalPicks) * 100) : 0;

  let repLabel = null, repColor = "#a1a1aa";
  if (totalPicks >= 3) {
    if (mvpRate >= 80) { repLabel = "Fan Favorite"; repColor = "#22c55e"; }
    else if (mvpRate >= 55) { repLabel = "Crowd Pleaser"; repColor = "#a3e635"; }
    else if (mvpRate >= 45) { repLabel = "Lightning Rod"; repColor = "#facc15"; }
    else if (mvpRate >= 20) { repLabel = "Divisive"; repColor = "#fb923c"; }
    else { repLabel = "Frustrating Watch"; repColor = "#ef4444"; }
  }

  const ratedGames = gameLog.filter(g => g.communityAvg != null);
  const avgGameRating = ratedGames.length > 0
    ? (ratedGames.reduce((s, g) => s + g.communityAvg, 0) / ratedGames.length).toFixed(1)
    : null;

  const sportEmoji = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒" }[meta?.sport] || "🏟️";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-zinc-500 gap-3">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-red-500 rounded-full animate-spin" />
        <div className="text-sm">Loading {playerName}…</div>
        {resolveProgress > 0 && resolveProgress < 100 && (
          <div className="text-[10px] text-zinc-600">Resolving player…</div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center truncate">{playerName}</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Hero */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-900 border border-zinc-800 p-5 mb-4">
          <div className="flex items-center gap-4">
            {meta?.headshot ? (
              <img
                src={meta.headshot}
                alt={playerName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover bg-zinc-800 shrink-0"
                onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
              />
            ) : null}
            <div
              className="w-16 h-16 rounded-2xl bg-zinc-800 items-center justify-center text-2xl font-extrabold text-white shrink-0"
              style={{ display: meta?.headshot ? "none" : "flex" }}
            >
              {playerName.split(" ").map(w => w[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-white truncate">{playerName}</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                {sportEmoji} {meta?.team || "—"}{meta?.position && ` · ${meta.position}`}
              </div>
              {repLabel && (
                <div className="inline-block mt-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: repColor + "22", color: repColor }}>
                  {repLabel}
                </div>
              )}
            </div>
          </div>
        </div>

        {notFound ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center">
            <div className="text-5xl mb-3">🤷</div>
            <div className="text-base font-bold text-white">Player not found</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Couldn't find {playerName} on a current roster or in any rated game.</div>
          </div>
        ) : (
          <>
            {/* Compare with another player */}
            <form
              onSubmit={(e) => { e.preventDefault(); const n = compareName.trim(); if (n) window.location.href = `/compare/${encodeURIComponent(playerName)}/${encodeURIComponent(n)}`; }}
              className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 mb-4 flex items-center gap-2"
            >
              <span className="text-lg shrink-0">⚖️</span>
              <input
                value={compareName}
                onChange={(e) => setCompareName(e.target.value)}
                placeholder="Compare with a player…"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 placeholder:text-zinc-600"
              />
              <button type="submit" disabled={!compareName.trim()} className="shrink-0 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-40">Compare</button>
            </form>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 text-center">
                <div className="text-2xl font-extrabold text-green-400">{mvpPicks}</div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">MVP Picks</div>
              </div>
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 text-center">
                <div className="text-2xl font-extrabold text-red-400">{letdownPicks}</div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Letdowns</div>
              </div>
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 text-center">
                <div className="text-2xl font-extrabold text-white">{gameLog.length}</div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Games</div>
              </div>
            </div>

            {totalPicks > 0 && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-base font-bold text-white">🌟 Community Sentiment</h3>
                  <div className="text-3xl font-extrabold" style={{ color: mvpRate >= 50 ? "#22c55e" : "#ef4444" }}>{mvpRate}%</div>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-zinc-950">
                  {mvpPicks > 0 && <div style={{ width: `${(mvpPicks / totalPicks) * 100}%`, backgroundColor: "#22c55e" }} />}
                  {letdownPicks > 0 && <div style={{ width: `${(letdownPicks / totalPicks) * 100}%`, backgroundColor: "#ef4444" }} />}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-zinc-500">
                  <span>🌟 {mvpPicks} MVP</span>
                  <span>😤 {letdownPicks} Letdown</span>
                </div>
                {avgGameRating && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Avg rating of their rated games</span>
                    <span className="text-lg font-extrabold" style={{ color: rc(parseFloat(avgGameRating)) }}>{avgGameRating}</span>
                  </div>
                )}
              </div>
            )}

            {totalPicks === 0 && (
              <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-3 mb-4 text-center">
                <div className="text-xs text-zinc-500">No community MVP or Letdown picks yet — full season stats shown below.</div>
              </div>
            )}

            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">📋 Game Log</h3>
                {seasonName && <span className="text-[10px] text-zinc-600 font-semibold">{seasonName}</span>}
              </div>
              {gameLog.length === 0 && (
                <div className="text-xs text-zinc-600 text-center py-3">No games found</div>
              )}
              {gameLog.map((g) => {
                const href = g.sport && g.sport !== "nfl" ? `/game/${g.eventId}?sport=${g.sport}` : `/game/${g.eventId}`;
                const dateStr = g.date
                  ? new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "";
                return (
                  <Link key={g.eventId} href={href} className="block">
                    <div className="flex items-center gap-3 p-2.5 rounded-xl mb-2 bg-zinc-950 hover:bg-zinc-900 transition-colors">
                      <div className="w-12 shrink-0 text-center">
                        {g.gameResult && (
                          <div className="text-sm font-extrabold" style={{ color: g.gameResult === "W" ? "#22c55e" : g.gameResult === "L" ? "#ef4444" : "#a1a1aa" }}>
                            {g.gameResult}
                          </div>
                        )}
                        <div className="text-[9px] text-zinc-600">{dateStr}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white">
                          {g.atVs === "vs" ? "vs" : g.atVs === "@" ? "@" : ""} {g.oppAbbr || "—"}
                          {g.score && <span className="text-zinc-500 font-normal ml-1.5">{g.score}</span>}
                        </div>
                        <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 flex-wrap">
                          {g.statLine && g.statLine !== "—" && <span className="text-zinc-400">{g.statLine}</span>}
                          {g.mvpCount > 0 && <span className="text-green-400">🌟 ×{g.mvpCount}</span>}
                          {g.letdownCount > 0 && <span className="text-red-400">😤 ×{g.letdownCount}</span>}
                        </div>
                      </div>
                      {g.communityAvg != null && (
                        <div className="w-10 h-10 flex items-center justify-center text-white font-extrabold rounded-xl text-sm shrink-0" style={{ backgroundColor: rc(g.communityAvg) }}>
                          {g.communityAvg.toFixed(1)}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
              <div className="text-[10px] text-zinc-600 text-center mt-1">Score badges show community ratings where games have been rated</div>
            </div>
          </>
        )}
      </div>

      <Nav />
    </div>
  );
}
