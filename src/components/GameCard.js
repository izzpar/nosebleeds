"use client";
import Link from "next/link";

function autoMoods(g) {
  const m = [];
  if (g.total >= 55) m.push("🔥 Shootout");
  if (g.diff <= 3 && g.isFinal) m.push("🎯 Clutch");
  if (g.diff >= 21) m.push("💨 Blowout");
  if (g.ot) m.push("⏱️ OT");
  if (g.total <= 30 && g.isFinal) m.push("🛡️ Defensive");
  return m;
}

export default function GameCard({ game: g }) {
  const moods = autoMoods(g);

  return (
    <Link href={`/game/${g.id}`} className="block">
      <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-3 cursor-pointer hover:-translate-y-0.5 transition-transform active:scale-[0.98]">
        <div
          className="h-[3px]"
          style={{
            background: `linear-gradient(90deg, ${g.away.color} 50%, ${g.home.color} 50%)`,
          }}
        />
        <div className="p-3.5">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5">
              {g.ot && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-bold">
                  OT
                </span>
              )}
              <span className="text-[10px] font-bold text-zinc-500 tracking-wide uppercase">
                Wk {g.week} · {g.net} · {g.shortDate}
              </span>
            </div>
            <div className="flex gap-1">
              {g.diff <= 3 && g.isFinal && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-600/10 text-red-400 font-bold">
                  CLOSE
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              {[g.away, g.home].map((team, i) => {
                const isWinner =
                  g.isFinal && team.score > (i === 0 ? g.home : g.away).score;
                return (
                  <div key={i} className="flex items-center gap-2.5 mb-1.5 last:mb-0">
                    {team.logo ? (
                      <img src={team.logo} alt={team.abbr} className="w-7 h-7 object-contain" />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-bold"
                        style={{ backgroundColor: team.color }}
                      >
                        {team.abbr}
                      </div>
                    )}
                    <span className={`flex-1 text-sm ${isWinner ? "font-bold text-white" : g.isPre ? "text-white" : "text-zinc-500"}`}>
                      {team.name}
                    </span>
                    <span className={`text-xl font-extrabold tabular-nums ${isWinner ? "text-white" : "text-zinc-700"}`}>
                      {g.isPre ? "" : team.score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {moods.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {moods.slice(0, 3).map((m) => (
                <span key={m} className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-semibold">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}