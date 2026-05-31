"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function ListPage({ params }) {
  const { id } = use(params);
  const [list, setList] = useState(null);
  const [games, setGames] = useState([]);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const sbFetch = (path) => {
    const tokenKey = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
    const token = session?.access_token;
    return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };
  const sbJson = async (res) => { try { const d = await res.json(); return Array.isArray(d) ? d : []; } catch (e) { return []; } };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const lArr = await sbJson(await sbFetch(`lists?id=eq.${id}&select=*`));
        const listData = lArr[0];
        if (!listData) { if (!cancelled) { setNotFound(true); setLoading(false); } return; }
        if (cancelled) return;
        setList(listData);
        const g = await sbJson(await sbFetch(`list_games?list_id=eq.${id}&order=created_at.asc&select=*`));
        if (!cancelled) setGames(g);
        const p = await sbJson(await sbFetch(`profiles?user_id=eq.${listData.user_id}&select=handle,display_name,avatar_url`));
        if (!cancelled) setOwner(p[0] || null);
      } catch (e) { console.error("List load:", e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `${list?.icon || "📋"} ${list?.name || "List"} on The Nosebleeds`;
    if (navigator.share) { try { await navigator.share({ title: text, url }); return; } catch (e) {} }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) {}
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading list…</div>;
  if (notFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="text-4xl">📋</div>
      <div className="text-zinc-500">List not found</div>
      <Link href="/" className="text-red-400 text-sm font-semibold">← Back to The Nosebleeds</Link>
    </div>
  );

  const ownerName = owner?.display_name || (owner?.handle ? `@${owner.handle}` : "Anonymous");

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center truncate">{list.icon} {list.name}</h1>
          <button onClick={share} className="text-zinc-400 hover:text-white text-sm font-medium w-12 text-right">{copied ? "✓" : "🔗"}</button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Hero */}
        <div className="rounded-2xl p-5 bg-gradient-to-br from-red-900/30 via-zinc-900 to-zinc-900 border border-zinc-800 mb-4">
          <div className="flex items-center gap-4">
            <div className="text-4xl shrink-0">{list.icon || "📋"}</div>
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-white truncate">{list.name}</div>
              <Link href={owner?.handle ? `/u/${owner.handle}` : "#"} className="text-xs text-zinc-400 hover:text-red-400 mt-0.5 inline-flex items-center gap-1.5">
                {owner?.avatar_url && <img src={owner.avatar_url} referrerPolicy="no-referrer" className="w-4 h-4 rounded-full" />}
                by {ownerName} · {games.length} {games.length === 1 ? "game" : "games"}
              </Link>
            </div>
          </div>
        </div>

        {games.length === 0 ? (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center">
            <div className="text-5xl mb-3">📋</div>
            <div className="text-base font-bold text-white">This list is empty</div>
            <div className="text-sm text-zinc-500 mt-1">No games have been added yet.</div>
          </div>
        ) : (
          games.map((gm, i) => (
            <Link key={gm.id} href={`/game/${gm.game_id}`} className="block">
              <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                <span className="text-sm font-extrabold w-6 text-center text-zinc-600 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{gm.away_team} {gm.away_score} — {gm.home_team} {gm.home_score}</div>
                  <div className="text-[10px] text-zinc-500">{gm.week ? `Wk ${gm.week} · ` : ""}{gm.season || ""}</div>
                </div>
                <span className="text-zinc-600 text-xs shrink-0">→</span>
              </div>
            </Link>
          ))
        )}
      </div>

      <Nav />
    </div>
  );
}
