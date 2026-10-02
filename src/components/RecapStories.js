"use client";
import { useState, useEffect } from "react";

function rc(r) {
  const n = Math.round(r);
  return ["#7f1d1d", "#7f1d1d", "#dc2626", "#f87171", "#fb923c", "#fbbf24", "#facc15", "#a3e635", "#4ade80", "#22c55e", "#15803d"][Math.max(0, Math.min(10, n))];
}
const SLIDE_MS = 5000;

// Full-screen "your week" stories built from the last 7 days of your ratings.
// Tap right/left to move, auto-advances; the last card shares a summary.
// `logs`: your ratings ({ gameId, rating, awayTeam, homeTeam, awayScore, homeScore, mvp, sport, createdAt }).
export default function RecapStories({ logs, name, sbFetch, sbJson, onClose }) {
  const [crowd, setCrowd] = useState({}); // gameId -> community average
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const week = logs;

  useEffect(() => {
    const ids = [...new Set(week.map((l) => l.gameId))].slice(0, 60);
    if (!ids.length) return;
    (async () => {
      try {
        const rows = await sbJson(await sbFetch(`ratings?game_id=in.(${ids.join(",")})&public=eq.true&rating=not.is.null&select=game_id,rating`));
        const acc = {};
        rows.forEach((r) => { const a = (acc[r.game_id] = acc[r.game_id] || { s: 0, n: 0 }); a.s += parseFloat(r.rating); a.n += 1; });
        setCrowd(Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.n > 1 ? v.s / v.n : null])));
      } catch (e) { /* stories still work without the crowd */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const score = (l) => `${l.awayTeam} ${l.awayScore}–${l.homeScore} ${l.homeTeam}`;
  const sorted = [...week].sort((a, b) => b.rating - a.rating);
  const best = sorted[0], worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const avg = week.reduce((s, l) => s + l.rating, 0) / week.length;
  const takes = week.filter((l) => crowd[l.gameId] != null).map((l) => ({ l, gap: l.rating - crowd[l.gameId] })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const hot = takes[0] && Math.abs(takes[0].gap) >= 1 ? takes[0] : null;
  const mvps = week.filter((l) => l.mvp).slice(0, 4);
  const sports = [...new Set(week.map((l) => (l.sport || "nfl").toUpperCase()))];

  const slides = [
    { bg: "from-red-700 to-zinc-950", body: (
      <>
        <div className="text-sm font-bold uppercase tracking-widest text-red-200">{name ? `${name}'s` : "Your"} week</div>
        <div className="text-7xl font-extrabold text-white mt-4">{week.length}</div>
        <div className="text-xl font-bold text-white">{week.length === 1 ? "game rated" : "games rated"}</div>
        <div className="text-zinc-300 mt-6">Average rating <span className="font-extrabold" style={{ color: rc(avg) }}>{avg.toFixed(1)}</span></div>
        <div className="text-zinc-400 text-sm mt-1">{sports.join(" · ")}</div>
      </>
    ) },
    best && { bg: "from-green-800 to-zinc-950", body: (
      <>
        <div className="text-sm font-bold uppercase tracking-widest text-green-200">Your game of the week</div>
        <div className="text-3xl font-extrabold text-white mt-6">{score(best)}</div>
        <div className="mt-6 inline-flex w-24 h-24 rounded-3xl items-center justify-center text-4xl font-extrabold text-white" style={{ backgroundColor: rc(best.rating) }}>{best.rating}</div>
      </>
    ) },
    hot && { bg: "from-orange-700 to-zinc-950", body: (
      <>
        <div className="text-sm font-bold uppercase tracking-widest text-orange-200">Your hottest take 🌶️</div>
        <div className="text-2xl font-extrabold text-white mt-6">{score(hot.l)}</div>
        <div className="flex justify-center gap-6 mt-6">
          <div><div className="text-5xl font-extrabold" style={{ color: rc(hot.l.rating) }}>{hot.l.rating}</div><div className="text-zinc-300 text-sm mt-1">you</div></div>
          <div><div className="text-5xl font-extrabold text-zinc-400">{crowd[hot.l.gameId].toFixed(1)}</div><div className="text-zinc-400 text-sm mt-1">the crowd</div></div>
        </div>
        <div className="text-zinc-300 mt-6">{Math.abs(hot.gap).toFixed(1)} {hot.gap > 0 ? "higher" : "lower"} than everyone else.</div>
      </>
    ) },
    mvps.length > 0 && { bg: "from-sky-800 to-zinc-950", body: (
      <>
        <div className="text-sm font-bold uppercase tracking-widest text-sky-200">Your MVPs 🌟</div>
        <div className="mt-6 space-y-3">
          {mvps.map((l) => (
            <div key={l.gameId}><div className="text-xl font-extrabold text-white">{l.mvp}</div><div className="text-xs text-zinc-400">{score(l)}</div></div>
          ))}
        </div>
      </>
    ) },
    worst && worst.rating < best.rating && { bg: "from-zinc-700 to-zinc-950", body: (
      <>
        <div className="text-sm font-bold uppercase tracking-widest text-zinc-300">The one you'd take back 😬</div>
        <div className="text-2xl font-extrabold text-white mt-6">{score(worst)}</div>
        <div className="mt-6 inline-flex w-20 h-20 rounded-3xl items-center justify-center text-3xl font-extrabold text-white" style={{ backgroundColor: rc(worst.rating) }}>{worst.rating}</div>
      </>
    ) },
    { bg: "from-red-800 to-black", share: true, body: (
      <>
        <div className="text-5xl">🩸</div>
        <div className="text-2xl font-extrabold text-white mt-4">That's your week</div>
        <div className="text-zinc-300 mt-2">{week.length} rated · avg {avg.toFixed(1)}{best ? ` · top: ${score(best)}` : ""}</div>
      </>
    ) },
  ].filter(Boolean);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => (i < slides.length - 1 ? setI(i + 1) : null), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, paused, slides.length]);

  const share = async (e) => {
    e.stopPropagation();
    const text = `My week on The Nosebleeds: ${week.length} games rated, avg ${avg.toFixed(1)}${best ? `, game of the week ${score(best)} (${best.rating})` : ""}${hot ? `, hottest take ${score(hot.l)}: me ${hot.l.rating} vs crowd ${crowd[hot.l.gameId].toFixed(1)}` : ""} 🩸`;
    try { if (navigator.share) await navigator.share({ text, url: window.location.origin }); else await navigator.clipboard.writeText(`${text} ${window.location.origin}`); } catch (err) {}
  };

  const s = slides[i];
  return (
    <div className="fixed inset-0 z-[200] bg-black" role="dialog" aria-modal="true" aria-label="Your week in ratings">
      <div className={`absolute inset-0 bg-gradient-to-b ${s.bg} flex flex-col items-center justify-center text-center px-8`}
        onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX - r.left < r.width / 3) setI(Math.max(0, i - 1)); else if (i < slides.length - 1) setI(i + 1); else onClose(); }}>
        <div key={i} className="nb-pop">{s.body}</div>
        {s.share && <button onClick={share} className="mt-8 h-12 px-8 rounded-full bg-white text-red-700 font-extrabold">Share my week</button>}
      </div>
      <div className="absolute left-3 right-3 flex gap-1" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}>
        {slides.map((_, k) => (
          <div key={k} className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden">
            <div key={k === i ? `on-${i}` : k} className="h-full bg-white"
              style={k === i ? { width: 0, animation: `nb-story ${SLIDE_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" } : { width: k < i ? "100%" : "0%" }} />
          </div>
        ))}
      </div>
      <button onClick={onClose} aria-label="Close" className="absolute right-3 w-10 h-10 rounded-full bg-black/30 text-white text-xl" style={{ top: "calc(env(safe-area-inset-top) + 24px)" }}>×</button>
    </div>
  );
}
