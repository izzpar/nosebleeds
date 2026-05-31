"use client";
import Link from "next/link";

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

export default function GameCard({ game: g, logged }) {
  const moods = autoMoods(g);
  const live = isLive(g);
  const dateBased = g.sport && g.sport !== "nfl"; // mlb/nba/nhl are shown by date, not week
  // Carry ?sport= so the game page hits the right ESPN endpoint
  const href = dateBased ? `/game/${g.id}?sport=${g.sport}` : `/game/${g.id}`;
  // Low-scoring sports (MLB/NHL) are "close" within 1; high-scoring within 3
  const closeWithin = (g.sport === "mlb" || g.sport === "nhl") ? 1 : 3;

  return (
    <Link href={href} className="block">
      <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-3 cursor-pointer hover:-translate-y-0.5 transition-transform active:scale-[0.98]">
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
            <div className="flex-1">
              {[g.away, g.home].map((team, i) => {
                const isWinner = g.isFinal && team.score > (i === 0 ? g.home : g.away).score;
                return (
                  <div key={i} className="flex items-center gap-2.5 mb-1.5 last:mb-0">
                    {team.logo ? (
                      <img src={team.logo} alt={team.abbr} className="w-7 h-7 object-contain" />
                    ) : (
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: team.color }}>{team.abbr}</div>
                    )}
                    <span className={`flex-1 text-sm ${isWinner ? "font-bold text-white" : g.isPre ? "text-white" : live ? "text-white" : "text-zinc-500"}`}>{team.name}</span>
                    <span className={`text-xl font-extrabold tabular-nums ${isWinner || live ? "text-white" : "text-zinc-700"}`}>{g.isPre ? "" : team.score}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {moods.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {moods.slice(0, 3).map((m) => (
                <span key={m} className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-semibold">{m}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
