"use client";
import Link from "next/link";

// A thin horizontal strip of the current scope's games — quick glanceable
// scores above the full list. Reuses the already-loaded `games` array, so it
// adds no network calls. Pass the same filtered/in-scope games the list shows.
export default function ScoresTicker({ games }) {
  if (!games || games.length < 2) return null;

  const isLive = (g) => ["STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD", "STATUS_END_OF_INNING", "STATUS_DELAYED", "STATUS_RAIN_DELAY"].includes(g.status);
  const href = (g) => (g.sport && g.sport !== "nfl" ? `/game/${g.id}?sport=${g.sport}` : `/game/${g.id}`);

  return (
    <div className="-mx-4 px-4 mb-3 overflow-x-auto">
      <div className="flex gap-2 min-w-max pb-1">
        {games.map((g) => {
          const live = isLive(g);
          const aw = g.away, ho = g.home;
          const awWin = g.isFinal && aw.score > ho.score;
          const hoWin = g.isFinal && ho.score > aw.score;
          return (
            <Link key={g.id} href={href(g)} className="shrink-0">
              <div className={`rounded-xl border px-2.5 py-1.5 min-w-[104px] ${live ? "bg-red-950/30 border-red-600/40" : "bg-zinc-900 border-zinc-800"} hover:border-red-600/50 transition-colors`}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-bold ${awWin ? "text-white" : "text-zinc-400"}`}>{aw.abbr}</span>
                  <span className={`font-extrabold tabular-nums ${g.isPre ? "text-zinc-600" : awWin ? "text-white" : "text-zinc-400"}`}>{g.isPre ? "" : aw.score}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-bold ${hoWin ? "text-white" : "text-zinc-400"}`}>{ho.abbr}</span>
                  <span className={`font-extrabold tabular-nums ${g.isPre ? "text-zinc-600" : hoWin ? "text-white" : "text-zinc-400"}`}>{g.isPre ? "" : ho.score}</span>
                </div>
                <div className="text-[8px] font-bold tracking-wide mt-0.5 text-center uppercase" style={{ color: live ? "#ef4444" : "#52525b" }}>
                  {live ? "🔴 Live" : g.isPre ? "Soon" : "Final"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
