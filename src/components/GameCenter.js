"use client";
import { useState, useEffect } from "react";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };

// ESPN-style game center for started games: win-probability chart (how the game
// swung) and, for live NFL, the current situation and drive. Hidden when ESPN
// has none of it for this game.
export default function GameCenter({ gameId, sport, live, home, away }) {
  const [wp, setWp] = useState([]);
  const [sit, setSit] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await (await fetch(`${ESPN_BASE}/${PATHS[sport] || PATHS.nfl}/summary?event=${gameId}`)).json();
        if (cancelled) return;
        setWp((d.winprobability || []).map((p) => p.homeWinPercentage).filter((x) => typeof x === "number"));
        const s = d.situation, cur = d.drives?.current;
        setSit(live && (s?.downDistanceText || cur?.description) ? {
          down: s?.downDistanceText || "",
          drive: cur?.description || "",
          team: cur?.team?.abbreviation || "",
          last: s?.lastPlay?.text || "",
        } : null);
      } catch (e) { /* keep what we have */ }
    };
    load();
    const t = live ? setInterval(load, 30000) : null;
    return () => { cancelled = true; if (t) clearInterval(t); };
  }, [gameId, sport, live]);

  if (wp.length < 2 && !sit) return null;

  const W = 300, H = 90;
  const pts = wp.map((p, i) => [(i / (wp.length - 1)) * W, (1 - p) * H]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H / 2} L0,${H / 2} Z`;
  const now = wp[wp.length - 1];
  const leader = now >= 0.5 ? home : away;
  const pct = Math.round((now >= 0.5 ? now : 1 - now) * 100);
  const color = (t) => (t.color && t.color !== "#333" && t.color !== "#000000" ? t.color : "#a1a1aa");

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 mb-3">
      {sit && (
        <div className="mb-3 rounded-xl bg-zinc-950 border border-red-900/50 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <span className="text-red-400 animate-pulse">●</span>
            {sit.team && <span>{sit.team} ball</span>}
            {sit.down && <span className="text-zinc-300">· {sit.down}</span>}
          </div>
          {sit.drive && <div className="text-[11px] text-zinc-500 mt-0.5">Drive: {sit.drive}</div>}
          {sit.last && <div className="text-xs text-zinc-300 mt-1 line-clamp-2">{sit.last}</div>}
        </div>
      )}
      {wp.length >= 2 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-zinc-500 tracking-widest uppercase">Win probability</span>
            <span className="text-xs font-extrabold" style={{ color: color(leader) }}>{leader.abbr} {pct}%</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none" role="img"
            aria-label={`Win probability over the game; ${leader.abbr} ${pct}% now`}>
            <defs>
              <clipPath id={`wp-top-${gameId}`}><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
              <clipPath id={`wp-bot-${gameId}`}><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
            </defs>
            <path d={area} fill={color(home)} opacity="0.35" clipPath={`url(#wp-top-${gameId})`} />
            <path d={area} fill={color(away)} opacity="0.35" clipPath={`url(#wp-bot-${gameId})`} />
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#3f3f46" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <path d={line} fill="none" stroke="#fafafa" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex justify-between text-[11px] font-bold mt-1">
            <span style={{ color: color(home) }}>▲ {home.abbr}</span>
            <span className="text-zinc-600">{live ? "now" : "final"}</span>
            <span style={{ color: color(away) }}>▼ {away.abbr}</span>
          </div>
        </>
      )}
    </div>
  );
}
