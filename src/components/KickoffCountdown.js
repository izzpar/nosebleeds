"use client";
import { useState, useEffect } from "react";
import { RANKING_LOCK_ISO } from "@/lib/worldcup";

// Compact countdown to the World Cup opening kickoff. Renders nothing once it
// has started. `variant="hero"` is larger for the hub landing.
export default function KickoffCountdown({ variant = "inline" }) {
  const [now, setNow] = useState(null); // null until mounted (avoids hydration mismatch)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0); // defer first set out of the effect's sync phase
    const iv = setInterval(tick, 1000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, []);

  if (now == null) return null;
  const target = new Date(RANKING_LOCK_ISO).getTime();
  const diff = target - now;
  if (diff <= 0) return null;

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const parts = [["D", d], ["H", h], ["M", m], ["S", s]];

  if (variant === "hero") {
    return (
      <div className="flex gap-2 justify-center">
        {parts.map(([l, v]) => (
          <div key={l} className="bg-black/30 rounded-xl px-3 py-2 min-w-[3.2rem] text-center">
            <div className="text-2xl font-extrabold tabular-nums text-white">{String(v).padStart(2, "0")}</div>
            <div className="text-[9px] font-bold text-red-200/70">{l}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <span className="tabular-nums text-zinc-300">
      {d}d {String(h).padStart(2, "0")}h {String(m).padStart(2, "0")}m
    </span>
  );
}
