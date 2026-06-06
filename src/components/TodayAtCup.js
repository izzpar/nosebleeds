"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WC_BASE, WC_START, WC_END } from "@/lib/worldcup";

// "Today at the Cup" — the daily what's-happening strip on the World Cup hub.
// Shows today's fixtures (live scores / kickoff times); before the tournament
// it falls back to the next match day so there's always something to see.

const localDay = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const timeLabel = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function TodayAtCup() {
  const router = useRouter();
  const [data, setData] = useState(undefined); // undefined=loading, null=error/none

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${WC_BASE}/scoreboard?dates=${WC_START}-${WC_END}&limit=200`);
        const d = await r.json();
        const all = (d.events || []).map((ev) => {
          const comp = ev.competitions?.[0]; const cs = comp?.competitors || [];
          const h = cs.find((c) => c.homeAway === "home") || cs[0];
          const a = cs.find((c) => c.homeAway === "away") || cs[1];
          if (!h || !a) return null;
          const side = (c) => ({ abbr: c.team?.abbreviation, logo: c.team?.logo || c.team?.logos?.[0]?.href, score: c.score });
          return {
            id: String(ev.id), date: ev.date,
            state: comp?.status?.type?.state || "pre",
            detail: comp?.status?.type?.shortDetail || "",
            home: side(h), away: side(a),
          };
        }).filter(Boolean).sort((x, y) => new Date(x.date) - new Date(y.date));
        if (cancelled) return;
        if (all.length === 0) { setData(null); return; }

        const today = localDay(new Date());
        let day = today;
        let list = all.filter((m) => localDay(m.date) === today);
        if (list.length === 0) {
          // No matches today → show the next upcoming match day.
          const next = all.find((m) => new Date(m.date) >= new Date());
          if (!next) { setData(null); return; }
          day = localDay(next.date);
          list = all.filter((m) => localDay(m.date) === day);
        }
        setData({ isToday: day === today, day, list: list.slice(0, 6) });
      } catch (e) { if (!cancelled) setData(null); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (data === undefined || data === null) return null;

  const title = data.isToday ? "Today at the Cup" : "Next at the Cup";
  const dayLabel = new Date(data.list[0].date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">{title}</h2>
        <span className="text-[11px] text-zinc-600">{data.isToday ? "" : dayLabel}</span>
      </div>
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/70 overflow-hidden">
        {data.list.map((m) => {
          const live = m.state === "in";
          const done = m.state === "post";
          return (
            <button key={m.id} onClick={() => router.push(`/game/${m.id}?sport=wc`)} className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-zinc-900 text-left">
              <div className="flex-1 min-w-0 flex items-center gap-2 text-sm font-bold">
                <span className="flex items-center gap-1.5 min-w-0">{m.home.logo && <img src={m.home.logo} alt="" className="w-5 h-5 object-contain shrink-0" />}<span className="truncate">{m.home.abbr}</span></span>
                {(live || done)
                  ? <span className="text-zinc-300 tabular-nums px-1">{m.home.score}-{m.away.score}</span>
                  : <span className="text-zinc-600 text-xs px-1">vs</span>}
                <span className="flex items-center gap-1.5 min-w-0">{m.away.logo && <img src={m.away.logo} alt="" className="w-5 h-5 object-contain shrink-0" />}<span className="truncate">{m.away.abbr}</span></span>
              </div>
              {live
                ? <span className="text-[10px] font-bold text-red-400 bg-red-500/15 rounded-full px-2 py-0.5 shrink-0">{m.detail || "LIVE"}</span>
                : done
                  ? <span className="text-[10px] font-bold text-zinc-500 shrink-0">FT</span>
                  : <span className="text-[11px] text-zinc-400 shrink-0">{timeLabel(m.date)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
