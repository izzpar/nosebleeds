"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function BreakdownPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("units"); // 'units' | 'picks' | 'streak'
  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState([]);

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
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await sbFetch(`predictions?user_id=eq.${user.id}&order=settled_at.desc.nullslast,created_at.desc&select=*`);
        const data = await sbJson(res);
        if (!cancelled) setPicks(data);
      } catch (e) { console.error("Breakdown load:", e); }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  const pickem = picks.filter(p => p.mode === "pickem");
  const streak = picks.filter(p => p.mode === "streak");
  const settled = pickem.filter(p => p.status !== "pending");

  // Units tab — only settled picks that have a units value
  const unitsRows = settled.filter(p => p.units != null);
  const totalUnits = unitsRows.reduce((s, p) => s + (parseFloat(p.units) || 0), 0);
  const wins = settled.filter(p => p.status === "won").length;
  const losses = settled.filter(p => p.status === "lost").length;
  const pushes = settled.filter(p => p.status === "push").length;

  const statusStyle = (st) => {
    if (st === "won") return { bg: "bg-green-500/15", tx: "text-green-400", lbl: "WON" };
    if (st === "lost") return { bg: "bg-red-500/15", tx: "text-red-400", lbl: "LOST" };
    if (st === "push") return { bg: "bg-zinc-800", tx: "text-zinc-400", lbl: "PUSH" };
    return { bg: "bg-zinc-800", tx: "text-zinc-500", lbl: "PENDING" };
  };

  const TABS = [
    { id: "units", label: "💰 Units" },
    { id: "picks", label: "🎯 All Picks" },
    { id: "streak", label: "🔥 Streak" },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/predictions" className="text-zinc-400 hover:text-white text-sm font-medium">← Predictions</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">📊 Breakdown</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800 mb-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === t.id ? "bg-red-600 text-white" : "text-zinc-500"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-12 text-zinc-500 text-sm">Loading…</div>}
        {!loading && !user && <div className="text-center py-12 text-zinc-500 text-sm">Sign in to see your breakdown.</div>}

        {/* ===== UNITS TAB ===== */}
        {!loading && user && tab === "units" && (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-900 border border-zinc-800 p-4 mb-4 text-center">
              <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase">Net Units</div>
              <div className="text-4xl font-extrabold mt-1" style={{ color: totalUnits > 0 ? "#22c55e" : totalUnits < 0 ? "#ef4444" : "#a1a1aa" }}>
                {totalUnits >= 0 ? "+" : ""}{totalUnits.toFixed(2)}u
              </div>
              <div className="text-[10px] text-zinc-500 mt-1">{wins}W · {losses}L{pushes ? ` · ${pushes}P` : ""} settled</div>
            </div>

            {unitsRows.length === 0 && (
              <div className="text-center py-12 text-zinc-600 text-sm">No settled picks with units yet.</div>
            )}

            {unitsRows.map(p => {
              const u = parseFloat(p.units) || 0;
              const s = statusStyle(p.status);
              return (
                <Link key={p.id} href={p.sport && p.sport !== "nfl" ? `/game/${p.game_id}?sport=${p.sport}` : `/game/${p.game_id}`}
                  className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{p.pick_label}</div>
                    <div className="text-[10px] text-zinc-500">
                      {p.sport === "mlb" ? "⚾" : "🏈"} {p.pick_type === "ats" ? "ATS" : "Moneyline"}
                      {p.moneyline != null && ` · ${p.moneyline > 0 ? "+" : ""}${p.moneyline}`}
                      {p.settled_at && ` · ${fmtDate(p.settled_at)}`}
                    </div>
                  </div>
                  <span className={`text-[9px] px-2 py-1 rounded-full font-bold ${s.bg} ${s.tx}`}>{s.lbl}</span>
                  <div className="text-sm font-extrabold w-14 text-right" style={{ color: u > 0 ? "#22c55e" : u < 0 ? "#ef4444" : "#a1a1aa" }}>
                    {u >= 0 ? "+" : ""}{u.toFixed(2)}u
                  </div>
                </Link>
              );
            })}
          </>
        )}

        {/* ===== ALL PICKS TAB ===== */}
        {!loading && user && tab === "picks" && (
          <>
            {pickem.length === 0 && (
              <div className="text-center py-12 text-zinc-600 text-sm">No pick'em picks yet.</div>
            )}
            {pickem.map(p => {
              const s = statusStyle(p.status);
              return (
                <Link key={p.id} href={p.sport && p.sport !== "nfl" ? `/game/${p.game_id}?sport=${p.sport}` : `/game/${p.game_id}`}
                  className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{p.pick_label}</div>
                    <div className="text-[10px] text-zinc-500">
                      {p.sport === "mlb" ? "⚾" : "🏈"} {p.pick_type === "ats" ? "Against the spread" : "Moneyline"}
                      {p.locks_at && ` · ${fmtDate(p.locks_at)}`}
                    </div>
                  </div>
                  <span className={`text-[9px] px-2 py-1 rounded-full font-bold ${s.bg} ${s.tx}`}>{s.lbl}</span>
                </Link>
              );
            })}
          </>
        )}

        {/* ===== STREAK TAB ===== */}
        {!loading && user && tab === "streak" && (
          <>
            {streak.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🔥</div>
                <div className="text-base font-bold text-white">No streak picks yet</div>
                <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Beat the Streak picks will show up here once that mode is live.</div>
              </div>
            ) : (
              streak.map(p => {
                const s = statusStyle(p.status);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{p.pick_label}</div>
                      <div className="text-[10px] text-zinc-500">{fmtDate(p.game_date || p.locks_at)}</div>
                    </div>
                    <span className={`text-[9px] px-2 py-1 rounded-full font-bold ${s.bg} ${s.tx}`}>{s.lbl}</span>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      <Nav />
    </div>
  );
}
