"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function AllRecaps() {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState([]);

  const sbFetch = async (path, options = {}, retried = false) => {
    const tokenKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
    const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
    const token = session?.access_token;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 401 && !retried && session?.refresh_token) {
      try {
        const refreshRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (refreshRes.ok) {
          const newSession = await refreshRes.json();
          localStorage.setItem(tokenKey, JSON.stringify({ ...session, ...newSession }));
          return sbFetch(path, options, true);
        }
      } catch (e) {}
    }
    return res;
  };
  const sbJson = async (res) => {
    try { const d = await res.json(); return Array.isArray(d) ? d : []; }
    catch (e) { return []; }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await sbFetch(`ratings?public=eq.true&rating=not.is.null&sport=eq.nfl&select=season,week,rating,game_id`);
        const data = await sbJson(res);
        if (cancelled) return;
        const groups = {};
        data.forEach(r => {
          const key = `${r.season}-${r.week}`;
          if (!groups[key]) groups[key] = { season: r.season, week: r.week, count: 0, games: new Set(), sum: 0 };
          groups[key].count++;
          groups[key].sum += parseFloat(r.rating);
          groups[key].games.add(r.game_id);
        });
        const arr = Object.values(groups).map(g => ({
          ...g,
          gameCount: g.games.size,
          avg: (g.sum / g.count).toFixed(1),
        })).sort((a, b) => b.season - a.season || b.week - a.week);
        setWeeks(arr);
      } catch (e) { console.error("All recaps:", e); }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/?tab=games" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">📰 Weekly Recaps</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="mb-4">
          <h2 className="text-xl font-extrabold text-white">All Recaps</h2>
          <p className="text-sm text-zinc-500">Browse highlights from past NFL weeks</p>
        </div>

        {loading && <div className="text-center py-8 text-zinc-500 text-sm">Loading...</div>}
        {!loading && weeks.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">🌱</div>
            <div className="text-base font-bold text-white">No recaps yet</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Once people rate games, weekly recaps will appear here</div>
          </div>
        )}

        {weeks.map(w => (
          <Link key={`${w.season}-${w.week}`} href={`/recap/${w.season}/${w.week}`} className="block">
            <div className="flex items-center gap-3 p-4 rounded-2xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
              <div className="flex-1">
                <div className="text-base font-bold text-white">Week {w.week} · {w.season}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{w.gameCount} {w.gameCount === 1 ? "game" : "games"} · {w.count} {w.count === 1 ? "rating" : "ratings"}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-zinc-500">avg</div>
                <div className="text-xl font-extrabold text-white">{w.avg}</div>
              </div>
              <span className="text-zinc-500">→</span>
            </div>
          </Link>
        ))}
      </div>

      <Nav />
    </div>
  );
}
