"use client";
import Link from "next/link";

function isLiveStatus(s) {
  return s !== "STATUS_SCHEDULED" && s !== "STATUS_FINAL";
}

export default function TennisCard({ match: m, logged }) {
  const live = isLiveStatus(m.status);
  const href = `/tennis/${m.id}?l=${m.league}&d=${m.gameDate}`;

  const Row = ({ p }) => (
    <div className="flex items-center gap-2.5 mb-1.5 last:mb-0">
      {p.flag ? (
        <img src={p.flag} alt={p.country} className="w-6 h-4 object-cover rounded-sm shrink-0" />
      ) : (
        <div className="w-6 h-4 rounded-sm bg-zinc-800 shrink-0" />
      )}
      <span className={`flex-1 text-sm truncate ${p.winner ? "font-bold text-white" : m.isPre ? "text-white" : live ? "text-white" : "text-zinc-500"}`}>{p.name}</span>
      {/* Per-set scores */}
      <span className="flex gap-1 shrink-0">
        {m.isPre ? null : p.sets.map((s, i) => (
          <span key={i} className={`text-sm tabular-nums w-4 text-center ${p.winner ? "text-white font-bold" : "text-zinc-500"}`}>{s}</span>
        ))}
      </span>
    </div>
  );

  return (
    <Link href={href} className="block">
      <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-3 cursor-pointer hover:-translate-y-0.5 transition-transform active:scale-[0.98]">
        <div className="h-[3px] bg-gradient-to-r from-yellow-500 via-lime-400 to-green-500" />
        <div className="p-3.5">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-zinc-500 tracking-wide uppercase truncate">
                {m.tournament}{m.group ? ` · ${m.group}` : ""}{m.round ? ` · ${m.round}` : ""}
              </span>
            </div>
            <div className="flex gap-1 shrink-0">
              {live && <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold animate-pulse">🔴 {m.statusDetail || "LIVE"}</span>}
              {logged && <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-bold">✓</span>}
            </div>
          </div>
          <Row p={m.p1} />
          <Row p={m.p2} />
          <div className="text-[9px] text-zinc-600 mt-2">{m.isPre ? m.date : m.shortDate}{m.net ? ` · ${m.net}` : ""}</div>
        </div>
      </div>
    </Link>
  );
}
