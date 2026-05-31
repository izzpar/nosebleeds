"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const SPORT_EMOJI = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒" };
// Sports whose daily slate we pull team-to-win props from (NFL is weekly, still works by date)
const STREAK_SPORTS = ["mlb", "nba", "nhl", "nfl"];

// Local calendar day (user timezone)
function localDay(iso) {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
// Moneyline → implied win probability (0-1)
function mlToProb(ml) {
  if (ml == null) return null;
  return ml > 0 ? 100 / (ml + 100) : Math.abs(ml) / (Math.abs(ml) + 100);
}

export default function StreakPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [props, setProps] = useState([]);       // today's curated propositions
  const [myStreakPicks, setMyStreakPicks] = useState([]);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState("");
  const [checking, setChecking] = useState(false);

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

  // ---- Build today's prop pool across sports. Team-to-win for all; plus the
  // signature MLB hitter-to-get-a-hit props. ----
  useEffect(() => {
    let cancelled = false;
    async function loadProps() {
      setLoading(true);
      try {
        const all = [];
        const d = new Date();
        const dateParam = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;

        // Pull every sport's slate in parallel
        const slates = await Promise.all(STREAK_SPORTS.map(async (sp) => {
          try {
            const r = await fetch(`${ESPN_BASE}/${SPORT_PATHS[sp]}/scoreboard?dates=${dateParam}`);
            if (!r.ok) return { sport: sp, scheduled: [] };
            const d2 = await r.json();
            const scheduled = [];
            (d2.events || []).forEach(e => {
              const c = e.competitions?.[0];
              if (!c || c.status?.type?.name !== "STATUS_SCHEDULED") return;
              const ho = (c.competitors || []).find(t => t.homeAway === "home");
              const aw = (c.competitors || []).find(t => t.homeAway === "away");
              if (!ho || !aw) return;
              scheduled.push({ e, ho, aw, comp: c });
            });
            return { sport: sp, scheduled };
          } catch (e) { return { sport: sp, scheduled: [] }; }
        }));
        if (cancelled) return;

        for (const { sport, scheduled } of slates) {
          scheduled.sort((a, b) => new Date(a.e.date) - new Date(b.e.date));

          if (sport === "mlb") {
            // MLB keeps the richer two-pass: summary per game for moneylines + hitters
            for (const { e, ho, aw } of scheduled.slice(0, 20)) {
              if (cancelled) return;
              let homeML = null, awayML = null;
              try {
                const sumR = await fetch(`${ESPN_BASE}/${SPORT_PATHS.mlb}/summary?event=${e.id}`);
                if (!sumR.ok) continue;
                const sd = await sumR.json();
                const pc = sd.pickcenter?.[0];
                if (pc) {
                  if (pc.homeTeamOdds?.moneyLine != null) homeML = pc.homeTeamOdds.moneyLine;
                  if (pc.awayTeamOdds?.moneyLine != null) awayML = pc.awayTeamOdds.moneyLine;
                }
                [
                  { side: ho, ml: homeML, opp: aw },
                  { side: aw, ml: awayML, opp: ho },
                ].forEach(({ side, ml, opp }) => {
                  const prob = mlToProb(ml);
                  if (prob == null || prob < 0.30 || prob > 0.70) return;
                  all.push({
                    key: `${e.id}-${side.team.abbreviation}-win`,
                    propClass: "team", game_id: e.id, sport: "mlb", date: e.date,
                    pick_type: "team_win", pick_value: side.team.abbreviation,
                    pick_label: `${side.team.displayName} to beat ${opp.team.abbreviation}`,
                    teamAbbr: side.team.abbreviation, teamName: side.team.displayName,
                    teamLogo: side.team.logo, oppAbbr: opp.team.abbreviation,
                    prob, moneyline: ml,
                  });
                });
                (sd.leaders || []).forEach(teamL => {
                  const teamAbbr = teamL.team?.abbreviation;
                  const teamLogo = teamL.team?.logos?.[0]?.href || teamL.team?.logo;
                  const oppAbbr = teamAbbr === ho.team.abbreviation ? aw.team.abbreviation : ho.team.abbreviation;
                  const avgCat = (teamL.leaders || []).find(c => c.name === "avg");
                  (avgCat?.leaders || []).slice(0, 1).forEach(l => {
                    const ath = l.athlete;
                    if (!ath) return;
                    const avg = parseFloat(l.displayValue);
                    if (isNaN(avg)) return;
                    const hitProb = 1 - Math.pow(1 - avg, 3.8);
                    all.push({
                      key: `${e.id}-${ath.id}-hit`,
                      propClass: "hitter", game_id: e.id, sport: "mlb", date: e.date,
                      pick_type: "hitter_hit", pick_value: String(ath.id),
                      pick_label: `${ath.displayName} to get a hit`,
                      playerName: ath.displayName, playerId: String(ath.id),
                      playerAvg: l.displayValue, playerPos: ath.position?.abbreviation || "",
                      teamAbbr, teamName: teamL.team?.displayName, teamLogo, oppAbbr,
                      headshot: ath.headshot?.href || `https://a.espncdn.com/i/headshots/mlb/players/full/${ath.id}.png`,
                      prob: hitProb,
                    });
                  });
                });
              } catch (err) { /* skip game */ }
            }
          } else {
            // NFL / NBA / NHL: team-win props from scoreboard-level odds (one fetch, no per-game summaries)
            for (const { e, ho, aw, comp } of scheduled) {
              const odds = (comp.odds || [])[0] || {};
              [
                { side: ho, opp: aw, ml: odds.homeTeamOdds?.moneyLine },
                { side: aw, opp: ho, ml: odds.awayTeamOdds?.moneyLine },
              ].forEach(({ side, opp, ml }) => {
                const prob = mlToProb(ml);
                all.push({
                  key: `${e.id}-${side.team.abbreviation}-win`,
                  propClass: "team", game_id: e.id, sport, date: e.date,
                  pick_type: "team_win", pick_value: side.team.abbreviation,
                  pick_label: `${side.team.displayName} to beat ${opp.team.abbreviation}`,
                  teamAbbr: side.team.abbreviation, teamName: side.team.displayName,
                  teamLogo: side.team.logo, oppAbbr: opp.team.abbreviation,
                  prob, moneyline: ml,
                });
              });
            }
          }
        }

        // Hitters first (the signature prop); within a class, surface the strongest plays
        all.sort((a, b) => {
          if (a.propClass !== b.propClass) return a.propClass === "hitter" ? -1 : 1;
          if (a.propClass === "hitter") return b.prob - a.prob;
          // team props: known favorites first, then unknown-odds games
          if (a.prob == null && b.prob == null) return 0;
          if (a.prob == null) return 1;
          if (b.prob == null) return -1;
          return b.prob - a.prob;
        });
        if (!cancelled) setProps(all);
      } catch (e) { console.error("Streak props:", e); }
      if (!cancelled) setLoading(false);
    }
    loadProps();
    return () => { cancelled = true; };
  }, []);

  // ---- Load user's streak picks + settle finished ones ----
  useEffect(() => {
    if (!user) { setMyStreakPicks([]); return; }
    let cancelled = false;
    async function load() {
      try {
        const res = await sbFetch(`predictions?user_id=eq.${user.id}&mode=eq.streak&order=game_date.asc&select=*`);
        const data = await sbJson(res);
        if (cancelled) return;
        setMyStreakPicks(data);
        const settled = await settleStreak(data);
        if (settled > 0 && !cancelled) {
          const refreshed = await sbJson(await sbFetch(`predictions?user_id=eq.${user.id}&mode=eq.streak&order=game_date.asc&select=*`));
          if (!cancelled) setMyStreakPicks(refreshed);
        }
      } catch (e) { console.error("Streak load:", e); }
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  // ---- Settlement for streak picks ----
  async function settleStreak(picks) {
    const now = Date.now();
    const toCheck = picks.filter(p => p.status === "pending" && p.locks_at && new Date(p.locks_at).getTime() < now);
    if (toCheck.length === 0) return 0;
    let settledCount = 0;
    for (const pick of toCheck) {
      try {
        const sportPath = SPORT_PATHS[pick.sport] || SPORT_PATHS.nfl;
        const r = await fetch(`${ESPN_BASE}/${sportPath}/summary?event=${pick.game_id}`);
        if (!r.ok) continue;
        const d = await r.json();
        const comp = d.header?.competitions?.[0];
        if (!comp?.status?.type?.completed) continue;
        const competitors = comp.competitors || [];
        const homeC = competitors.find(c => c.homeAway === "home");
        const awayC = competitors.find(c => c.homeAway === "away");
        if (!homeC || !awayC) continue;
        const winnerAbbr = homeC.winner ? homeC.team?.abbreviation : awayC.winner ? awayC.team?.abbreviation : null;

        let result = null;
        if (pick.pick_type === "team_win") {
          if (!winnerAbbr) result = "void";
          else result = pick.pick_value === winnerAbbr ? "won" : "lost";
        } else if (pick.pick_type === "hitter_hit") {
          // Find the player in the boxscore and check hits (H, index 3 in batting stats)
          let hits = null, found = false;
          const players = d.boxscore?.players || [];
          for (const teamP of players) {
            const batting = (teamP.statistics || []).find(s => s.type === "batting" || s.name === "batting");
            if (!batting) continue;
            const hIdx = (batting.labels || []).indexOf("H");
            const ath = (batting.athletes || []).find(a => String(a.athlete?.id) === String(pick.pick_value));
            if (ath) {
              found = true;
              hits = hIdx >= 0 ? parseInt(ath.stats?.[hIdx], 10) : null;
              break;
            }
          }
          if (!found) result = "void";      // player didn't appear (DNP / scratched)
          else if (hits == null) result = "void";
          else result = hits >= 1 ? "won" : "lost";
        }
        if (result) {
          const patch = await sbFetch(`predictions?id=eq.${pick.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: result, settled_at: new Date().toISOString(),
              result_away: `${awayC.team?.abbreviation} ${awayC.score}`,
              result_home: `${homeC.team?.abbreviation} ${homeC.score}`,
            }),
          });
          if (patch.ok) settledCount++;
        }
      } catch (e) { console.error("Settle streak", pick.id, e); }
    }
    return settledCount;
  }

  // Today's pick (if any) — one per calendar day across all sports
  const today = localDay();
  const todaysPick = myStreakPicks.find(p => p.game_date === today || localDay(p.locks_at) === today);

  // Compute streak stats (chronological — a loss zeroes the running streak)
  const settled = myStreakPicks.filter(p => p.status === "won" || p.status === "lost")
    .sort((a, b) => (a.game_date || "").localeCompare(b.game_date || ""));
  let curStreak = 0, bestStreak = 0, run = 0;
  settled.forEach(p => {
    if (p.status === "won") { run++; if (run > bestStreak) bestStreak = run; }
    else { run = 0; }
  });
  // current streak = trailing run of wins
  for (let i = settled.length - 1; i >= 0; i--) {
    if (settled[i].status === "won") curStreak++;
    else break;
  }

  async function pickProp(prop) {
    if (!user) { setToast("Sign in to play"); setTimeout(() => setToast(""), 2000); return; }
    if (prop.date && new Date(prop.date).getTime() < Date.now()) { setToast("That game already started"); setTimeout(() => setToast(""), 2000); return; }
    setSaving(prop.key);
    try {
      const body = {
        user_id: user.id, sport: prop.sport, mode: "streak",
        game_id: prop.game_id, game_date: today,
        pick_type: prop.pick_type, pick_value: prop.pick_value, pick_label: prop.pick_label,
        moneyline: prop.moneyline ?? null,
        locks_at: prop.date, status: "pending",
      };
      let res;
      if (todaysPick) {
        // Replace today's single pick
        res = await sbFetch(`predictions?id=eq.${todaysPick.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            sport: body.sport, game_id: body.game_id, pick_type: body.pick_type,
            pick_value: body.pick_value, pick_label: body.pick_label, moneyline: body.moneyline,
            locks_at: body.locks_at, status: "pending",
          }),
        });
      } else {
        res = await sbFetch(`predictions`, { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(body) });
      }
      if (res.ok) {
        const refreshed = await sbJson(await sbFetch(`predictions?user_id=eq.${user.id}&mode=eq.streak&order=game_date.asc&select=*`));
        setMyStreakPicks(refreshed);
        setToast(todaysPick ? "Today's pick changed" : "Locked in — good luck! 🔥");
      } else {
        setToast("Error saving pick");
      }
    } catch (e) { setToast("Error: " + e.message); }
    setSaving(null);
    setTimeout(() => setToast(""), 2200);
  }

  async function handleCheck() {
    if (!user || checking) return;
    setChecking(true);
    const n = await settleStreak(myStreakPicks);
    const refreshed = await sbJson(await sbFetch(`predictions?user_id=eq.${user.id}&mode=eq.streak&order=game_date.asc&select=*`));
    setMyStreakPicks(refreshed);
    setToast(n > 0 ? `${n} result${n === 1 ? "" : "s"} in` : "No finished games yet");
    setChecking(false);
    setTimeout(() => setToast(""), 2200);
  }

  const hasPickedToday = !!todaysPick;
  const pendingCount = myStreakPicks.filter(p => p.status === "pending").length;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/predictions" className="text-zinc-400 hover:text-white text-sm font-medium">← Predictions</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">🔥 Beat the Streak</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Streak counter hero */}
        <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-orange-900/50 via-zinc-900 to-zinc-900 border border-orange-600/30 p-5 mb-4 text-center">
          <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase">Current Streak</div>
          <div className="text-6xl font-extrabold text-white mt-1 mb-1">{curStreak}<span className="text-2xl text-orange-500">🔥</span></div>
          <div className="text-[11px] text-zinc-500">Best ever: {bestStreak} · {settled.filter(p => p.status === "won").length} correct all-time</div>
        </div>

        {/* How it works */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-3 mb-4 text-center">
          <span className="text-[11px] text-zinc-400">One pick per day across all sports. Pick a team to win — or a hot MLB hitter to get a hit. Hit it and your streak grows; miss and you're back to zero. 🔥</span>
        </div>

        {/* Today's pick status */}
        {hasPickedToday && (
          <div className="rounded-2xl bg-zinc-900 border-2 border-orange-600/40 p-4 mb-4">
            <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase mb-1">✓ Today's Pick</div>
            <div className="text-base font-bold text-white">{todaysPick.pick_label}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {todaysPick.status === "pending" ? `Locks at ${fmtTime(todaysPick.locks_at)} · you can still change it below` : `Result: ${todaysPick.status.toUpperCase()}`}
            </div>
          </div>
        )}

        {pendingCount > 0 && (
          <div className="flex justify-end mb-3">
            <button onClick={handleCheck} disabled={checking}
              className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors">
              {checking ? "Checking…" : "↻ Check results"}
            </button>
          </div>
        )}

        {/* Today's prop pool */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-white">Today's Picks</h2>
          <Link href="/leaderboard" className="text-[10px] font-bold text-orange-400 hover:text-orange-300">🏆 Streak leaders ›</Link>
        </div>

        {loading && <div className="text-center py-12 text-zinc-500 text-sm">Loading today's slate…</div>}

        {!loading && props.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔥</div>
            <div className="text-base font-bold text-white">No games on the board today</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Beat the Streak runs on each day's slate across NFL, MLB, NBA & NHL. Check back on a game day for matchups to pick.</div>
          </div>
        )}

        {(() => {
          const hitters = props.filter(p => p.propClass === "hitter");
          const teams = props.filter(p => p.propClass === "team");

          const renderProp = (prop) => {
            const selected = todaysPick && todaysPick.game_id === prop.game_id && todaysPick.pick_value === prop.pick_value;
            const isSaving = saving === prop.key;
                const gameHref = prop.sport === "nfl" ? `/game/${prop.game_id}` : `/game/${prop.game_id}?sport=${prop.sport}`;
            return (
              <div key={prop.key}
                className={`rounded-2xl border-2 p-3.5 mb-2.5 transition-all ${selected ? "bg-orange-500/15 border-orange-500/60" : "bg-zinc-900 border-zinc-800"}`}>
                {/* Tap the top row to open the game */}
                <Link href={gameHref} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  {prop.propClass === "hitter" ? (
                    <img src={prop.headshot} alt={prop.playerName} referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full bg-zinc-800 object-cover shrink-0"
                      onError={(e) => { e.target.style.display = "none"; }} />
                  ) : prop.teamLogo ? (
                    <img src={prop.teamLogo} alt={prop.teamAbbr} className="w-10 h-10 object-contain shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-white shrink-0">{prop.teamAbbr}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    {prop.propClass === "hitter" ? (
                      <>
                        <div className="text-sm font-bold text-white truncate">{prop.playerName} <span className="text-zinc-500 font-normal">to get a hit</span></div>
                        <div className="text-[10px] text-zinc-500">⚾ {prop.teamAbbr} {prop.playerPos && `· ${prop.playerPos}`} · {prop.playerAvg} AVG · vs {prop.oppAbbr}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-bold text-white truncate">{prop.teamName} <span className="text-zinc-500 font-normal">to win</span></div>
                        <div className="text-[10px] text-zinc-500">{SPORT_EMOJI[prop.sport] || ""} vs {prop.oppAbbr} · {fmtTime(prop.date)}</div>
                      </>
                    )}
                  </div>
                  <span className="text-zinc-600 text-xs shrink-0">→</span>
                </Link>
                {/* Pick / selected button */}
                <button onClick={() => pickProp(prop)} disabled={isSaving}
                  className={`w-full mt-3 py-2 rounded-xl text-xs font-bold transition-all ${selected ? "bg-orange-600 text-white" : "bg-zinc-950 text-zinc-300 border border-zinc-700 hover:border-orange-600"}`}>
                  {isSaving ? "Saving…" : selected ? "✓ Your pick today — tap to keep" : "Make this my pick"}
                </button>
              </div>
            );
          };

          return (
            <>
              {hitters.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase mb-2">⚾ Hitters to get a hit</div>
                  {hitters.map(renderProp)}
                </div>
              )}
              {STREAK_SPORTS.filter((sp) => teams.some((t) => t.sport === sp)).map((sp) => (
                <div key={sp} className="mb-4">
                  <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase mb-2">{SPORT_EMOJI[sp]} {sp.toUpperCase()} — teams to win</div>
                  {teams.filter((t) => t.sport === sp).map(renderProp)}
                </div>
              ))}
            </>
          );
        })()}

        {/* Recent streak history */}
        {settled.length > 0 && (
          <div className="mt-6">
            <h2 className="text-base font-bold text-white mb-2">Your Streak History</h2>
            <div className="flex flex-wrap gap-1.5">
              {settled.slice().reverse().map(p => (
                <div key={p.id} title={p.pick_label}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-extrabold ${p.status === "won" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {p.status === "won" ? "✓" : "✗"}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-0 right-0 z-[150] flex justify-center pointer-events-none">
          <div className="px-5 py-2.5 rounded-full text-sm font-bold bg-zinc-800/95 text-white backdrop-blur-md shadow-xl">{toast}</div>
        </div>
      )}

      <Nav />
    </div>
  );
}
