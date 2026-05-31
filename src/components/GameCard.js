"use client";
import Link from "next/link";
import { useState } from "react";

function autoMoods(g) {
  const m = [];
  if (g.sport === "mlb") {
    // MLB-ish moods
    if (g.total >= 15) m.push("💣 Slugfest");
    if (g.diff <= 1 && g.isFinal) m.push("🎯 Nail-biter");
    if (g.diff >= 8) m.push("💨 Blowout");
    if (g.ot) m.push("🔟 Extras");
    if (g.total <= 4 && g.isFinal) m.push("⚡ Pitcher's Duel");
  } else if (g.sport === "nba") {
    if (g.total >= 240) m.push("🔥 Shootout");
    if (g.diff <= 3 && g.isFinal) m.push("🎯 Clutch");
    if (g.diff >= 20) m.push("💨 Blowout");
    if (g.ot) m.push("⏱️ OT");
    if (g.total <= 190 && g.isFinal) m.push("🛡️ Defensive");
  } else if (g.sport === "nhl") {
    if (g.total >= 9) m.push("🚨 Goal Fest");
    if (g.diff <= 1 && g.isFinal) m.push("🎯 Nail-biter");
    if (g.diff >= 5) m.push("💨 Blowout");
    if (g.ot) m.push("⏱️ OT");
    if (g.total <= 3 && g.isFinal) m.push("🥅 Goalie Duel");
  } else {
    // NFL moods (default)
    if (g.total >= 55) m.push("🔥 Shootout");
    if (g.diff <= 3 && g.isFinal) m.push("🎯 Clutch");
    if (g.diff >= 21) m.push("💨 Blowout");
    if (g.ot) m.push("⏱️ OT");
    if (g.total <= 30 && g.isFinal) m.push("🛡️ Defensive");
  }
  return m;
}

function isLive(g) {
  return g.status === "STATUS_IN_PROGRESS" || g.status === "STATUS_HALFTIME"
    || g.status === "STATUS_END_PERIOD" || g.status === "STATUS_END_OF_INNING"
    || g.status === "STATUS_DELAYED" || g.status === "STATUS_RAIN_DELAY";
}

// 1-10 color scale (matches the rest of the app)
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

export default function GameCard({ game: g, logged, myRating, onQuickRate }) {
  const moods = autoMoods(g);
  const live = isLive(g);
  const dateBased = g.sport && g.sport !== "nfl"; // mlb/nba/nhl are shown by date, not week
  // Carry ?sport= so the game page hits the right ESPN endpoint
  const href = dateBased ? `/game/${g.id}?sport=${g.sport}` : `/game/${g.id}`;
  // Low-scoring sports (MLB/NHL) are "close" within 1; high-scoring within 3
  const closeWithin = (g.sport === "mlb" || g.sport === "nhl") ? 1 : 3;
  // Quick-rate only makes sense once a game has started (not for upcoming)
  const canQuickRate = onQuickRate && !g.isPre;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(myRating || 7);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await onQuickRate(g, draft); } finally { setSaving(false); setOpen(false); }
  };

  return (
    // Per Next docs (nesting.md): Link is a full-bleed overlay sibling, not a
    // wrapper, so the quick-rate control can be interactive without invalid <a>.
    <div className="relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-3 hover:-translate-y-0.5 transition-transform">
      <Link href={href} aria-label={`Open ${g.away.name} vs ${g.home.name}`} className="absolute inset-0 z-0" />
      <div className="relative z-10 pointer-events-none">
        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${g.away.color} 50%, ${g.home.color} 50%)` }} />
        <div className="p-3.5">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {g.ot && <span className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-bold shrink-0">{g.sport === "mlb" ? "EXTRAS" : "OT"}</span>}
              <span className="text-[10px] font-bold text-zinc-500 tracking-wide uppercase truncate">
                {dateBased
                  ? `${g.shortDate}${g.net ? " · " + g.net : ""}`
                  : `Wk ${g.week} · ${g.net} · ${g.shortDate}`}
              </span>
            </div>
            <div className="flex gap-1 shrink-0">
              {live && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold animate-pulse">
                  🔴 {g.statusDetail || "LIVE"}
                </span>
              )}
              {g.diff <= closeWithin && g.isFinal && <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-600/10 text-red-400 font-bold">CLOSE</span>}
              {logged && <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-bold">✓</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {[g.away, g.home].map((team, i) => {
                const isWinner = g.isFinal && team.score > (i === 0 ? g.home : g.away).score;
                return (
                  <div key={i} className="flex items-center gap-2.5 mb-1.5 last:mb-0">
                    {team.logo ? (
                      <img src={team.logo} alt={team.abbr} className="w-7 h-7 object-contain" />
                    ) : (
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: team.color }}>{team.abbr}</div>
                    )}
                    <span className={`flex-1 text-sm truncate ${isWinner ? "font-bold text-white" : g.isPre ? "text-white" : live ? "text-white" : "text-zinc-500"}`}>{team.name}</span>
                    <span className={`text-xl font-extrabold tabular-nums ${isWinner || live ? "text-white" : "text-zinc-700"}`}>{g.isPre ? "" : team.score}</span>
                  </div>
                );
              })}
            </div>
            {/* Quick-rate control — interactive island above the link overlay */}
            {canQuickRate && (
              <button
                onClick={() => { setDraft(myRating || 7); setOpen((v) => !v); }}
                className="pointer-events-auto shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center font-extrabold transition-all border"
                style={myRating != null
                  ? { backgroundColor: rc(myRating), color: "#fff", borderColor: "transparent" }
                  : { backgroundColor: "rgba(63,63,70,0.4)", color: "#a1a1aa", borderColor: "#3f3f46" }}
                aria-label="Quick rate"
              >
                {myRating != null ? <span className="text-base leading-none">{myRating}</span> : <span className="text-lg leading-none">＋</span>}
                <span className="text-[7px] font-bold tracking-wider opacity-80 mt-0.5">{myRating != null ? "RATED" : "RATE"}</span>
              </button>
            )}
          </div>

          {/* Inline quick-rate stepper */}
          {open && canQuickRate && (
            <div className="pointer-events-auto mt-3 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Quick rate</span>
                <span className="text-lg font-extrabold" style={{ color: rc(draft) }}>{draft}</span>
              </div>
              <input
                type="range" min="1" max="10" step="0.5" value={draft}
                onChange={(e) => setDraft(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, ${rc(draft)} ${((draft - 1) / 9) * 100}%, #27272a ${((draft - 1) / 9) * 100}%)` }}
              />
              <div className="flex gap-2 mt-2.5">
                <button onClick={() => setOpen(false)} className="flex-1 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold">Cancel</button>
                <button onClick={save} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50">
                  {saving ? "Saving…" : myRating != null ? "Update" : "Save"}
                </button>
              </div>
              <Link href={href} className="block text-center text-[10px] text-zinc-500 hover:text-red-400 mt-2">Add a review & details →</Link>
            </div>
          )}

          {moods.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {moods.slice(0, 3).map((m) => (
                <span key={m} className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-semibold">{m}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
