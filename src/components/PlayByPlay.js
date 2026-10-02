"use client";
import { useState, useEffect } from "react";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const REACTIONS = ["🔥", "😱", "😤", "😂"];

// ESPN play feeds differ per sport; normalize to { id, text, when, scoring, key, away, home }.
function normalize(sport, d) {
  let raw = [];
  if (sport === "nfl") {
    const drives = [...(d.drives?.previous || []), ...(d.drives?.current ? [d.drives.current] : [])];
    const seen = new Set();
    drives.forEach((dr) => (dr.plays || []).forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); raw.push(p); } }));
  } else {
    raw = d.plays || [];
    if (sport === "mlb") raw = raw.filter((p) => p.type?.type === "play-result"); // drop pitch-by-pitch noise
  }
  const periodLabel = (p) => sport === "mlb"
    ? `${p.period?.type === "Bottom" ? "Bot" : "Top"} ${p.period?.number || ""}`
    : sport === "nhl" ? `P${p.period?.number || ""}` : `Q${p.period?.number || ""}`;
  return raw.filter((p) => p.text).map((p) => ({
    id: String(p.id),
    text: p.text,
    when: `${periodLabel(p)}${p.clock?.displayValue && sport !== "mlb" ? ` · ${p.clock.displayValue}` : ""}`,
    scoring: !!p.scoringPlay,
    key: !!p.scoringPlay || !!p.isTurnover,
    away: p.awayScore, home: p.homeScore,
  })).reverse(); // newest first
}

// Play-by-play for live and finished games, with per-play reactions. Reactions
// stay hidden until the `play_reactions` table exists (see supabase/setup.sql).
export default function PlayByPlay({ gameId, sport, live, away, home, user, sbFetch, sbJson, requireAuth }) {
  const [plays, setPlays] = useState(null);
  const [view, setView] = useState("key");
  const [reactReady, setReactReady] = useState(false);
  const [reacts, setReacts] = useState([]); // [{ play_id, emoji, user_id }]

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${ESPN_BASE}/${SPORT_PATHS[sport] || SPORT_PATHS.nfl}/summary?event=${gameId}`);
        const d = await r.json();
        if (!cancelled) setPlays(normalize(sport, d));
      } catch (e) { if (!cancelled) setPlays((p) => p || []); }
    };
    load();
    const t = live ? setInterval(load, 30000) : null;
    return () => { cancelled = true; if (t) clearInterval(t); };
  }, [gameId, sport, live]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await sbFetch(`play_reactions?game_id=eq.${gameId}&select=play_id,emoji,user_id`);
        if (!res.ok) return;
        const data = await sbJson(res);
        if (!cancelled) { setReacts(data); setReactReady(true); }
      } catch (e) { /* reactions stay hidden */ }
    })();
    return () => { cancelled = true; };
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const react = async (playId, emoji) => {
    if (!requireAuth()) return;
    const mine = reacts.find((r) => r.play_id === playId && r.user_id === user.id);
    const next = mine?.emoji === emoji ? null : emoji; // tap your reaction again to remove it
    setReacts((rs) => [...rs.filter((r) => !(r.play_id === playId && r.user_id === user.id)), ...(next ? [{ play_id: playId, emoji: next, user_id: user.id }] : [])]);
    try {
      if (next) {
        await sbFetch("play_reactions?on_conflict=user_id,game_id,play_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ user_id: user.id, game_id: String(gameId), play_id: playId, emoji: next }),
        });
      } else {
        await sbFetch(`play_reactions?user_id=eq.${user.id}&game_id=eq.${gameId}&play_id=eq.${playId}`, { method: "DELETE" });
      }
    } catch (e) { /* optimistic state stays */ }
  };

  if (plays === null) return <div className="text-center py-8 text-zinc-500 text-sm">Loading plays…</div>;
  const shown = view === "key" ? plays.filter((p) => p.key) : plays;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 p-1 rounded-full bg-zinc-900 border border-zinc-800">
          {[{ id: "key", l: "Key plays" }, { id: "all", l: "All plays" }].map((v) => (
            <button key={v.id} onClick={() => setView(v.id)} aria-pressed={view === v.id}
              className={`h-8 px-3 rounded-full text-xs font-bold ${view === v.id ? "bg-red-600 text-white" : "text-zinc-400"}`}>{v.l}</button>
          ))}
        </div>
        {live && <span className="text-[11px] text-red-400 font-bold animate-pulse">● Live · updates every 30s</span>}
      </div>
      {shown.length === 0 && (
        <div className="text-center py-8 text-zinc-500 text-sm">{plays.length === 0 ? "No plays yet." : "No key plays yet — try All plays."}</div>
      )}
      <div className="space-y-2">
        {shown.slice(0, 150).map((p) => {
          const counts = REACTIONS.map((e) => ({ e, n: reacts.filter((r) => r.play_id === p.id && r.emoji === e).length }));
          const mine = user && reacts.find((r) => r.play_id === p.id && r.user_id === user.id)?.emoji;
          return (
            <div key={p.id} className={`rounded-xl p-3 border ${p.scoring ? "bg-red-950/30 border-red-900/50" : "bg-zinc-900 border-zinc-800"}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">{p.when}</span>
                {p.scoring && p.away != null && (
                  <span className="text-[11px] font-extrabold text-white">{away.abbr} {p.away} – {p.home} {home.abbr}</span>
                )}
              </div>
              <div className="text-sm text-zinc-200 leading-snug">{p.text}</div>
              {reactReady && (
                <div className="flex gap-1.5 mt-2">
                  {counts.map(({ e, n }) => (
                    <button key={e} onClick={() => react(p.id, e)} aria-pressed={mine === e} aria-label={`React ${e}`}
                      className={`h-8 px-2.5 rounded-full text-xs font-bold border flex items-center gap-1 ${mine === e ? "bg-red-600/15 border-red-600/50 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400"}`}>
                      <span>{e}</span>{n > 0 && <span>{n}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
