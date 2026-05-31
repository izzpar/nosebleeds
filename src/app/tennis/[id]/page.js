"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { fetchTennisMatch } from "@/lib/tennis";

function rc(r) {
  const n = Math.round(r);
  if (n <= 1) return "#7f1d1d";
  if (n === 2) return "#dc2626";
  if (n === 3) return "#f87171";
  if (n === 4) return "#fb923c";
  if (n === 5) return "#fbbf24";
  if (n === 6) return "#facc15";
  if (n === 7) return "#a3e635";
  if (n === 8) return "#4ade80";
  if (n === 9) return "#22c55e";
  return "#15803d";
}
function ratingLabel(r) {
  if (r >= 9) return "INSTANT CLASSIC";
  if (r >= 7.5) return "GREAT MATCH";
  if (r >= 6) return "GOOD";
  if (r >= 4) return "MEDIOCRE";
  if (r >= 2) return "BAD";
  return "TERRIBLE";
}

export default function TennisMatchPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const league = searchParams.get("l") || "";
  const dateParam = searchParams.get("d") || "";
  const { user } = useAuth();

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sbFetch = async (path, options = {}, retried = false) => {
    const tokenKey = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
    const token = session?.access_token;
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPA_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 401 && !retried && session?.refresh_token) {
      try {
        const rr = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (rr.ok) {
          const ns = await rr.json();
          localStorage.setItem(tokenKey, JSON.stringify({ ...session, ...ns }));
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

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(7);
  const [worthIt, setWorthIt] = useState("");
  const [review, setReview] = useState("");
  const [logged, setLogged] = useState(false);
  const [rootingFor, setRootingFor] = useState("");
  const [rootingCounts, setRootingCounts] = useState({});
  const [rootingReady, setRootingReady] = useState(false);
  const [communityAvg, setCommunityAvg] = useState(null);
  const [communityCount, setCommunityCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const m = await fetchTennisMatch(id, dateParam, league);
      if (!cancelled) { setMatch(m); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, dateParam, league]);

  // User's existing rating
  useEffect(() => {
    if (!user) { setLogged(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await sbFetch(`ratings?game_id=eq.${id}&user_id=eq.${user.id}&select=*`);
        const arr = await sbJson(res);
        const r = arr && arr[0];
        if (cancelled || !r) return;
        if (r.rating) { setRating(parseFloat(r.rating)); setLogged(true); }
        setWorthIt(r.worth_it || "");
        setReview(r.review || "");
        if (r.rooting_for) setRootingFor(r.rooting_for);
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [user, id]);

  // Community ratings + rooting split
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&rating=not.is.null&select=rating`);
        const data = await sbJson(res);
        if (cancelled) return;
        if (data.length > 0) {
          setCommunityCount(data.length);
          setCommunityAvg((data.reduce((s, r) => s + parseFloat(r.rating), 0) / data.length).toFixed(1));
        } else { setCommunityCount(0); setCommunityAvg(null); }
      } catch (e) {}
      try {
        const res = await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&rooting_for=not.is.null&select=rooting_for`);
        if (!res.ok) { if (!cancelled) setRootingReady(false); return; }
        const rows = await sbJson(res);
        if (cancelled) return;
        const counts = {};
        rows.forEach((r) => { if (r.rooting_for) counts[r.rooting_for] = (counts[r.rooting_for] || 0) + 1; });
        setRootingCounts(counts);
        setRootingReady(true);
      } catch (e) { if (!cancelled) setRootingReady(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const requireAuth = () => { if (!user) { window.location.href = "/login"; return false; } return true; };

  const upsert = async (updates, label = "Saved ✓") => {
    if (!requireAuth() || !match) return;
    setSaveStatus("Saving...");
    const base = {
      game_id: id, user_id: user.id, sport: "tennis",
      away_team: match.p1.name, home_team: match.p2.name,
      away_score: match.p1.setsWon, home_score: match.p2.setsWon,
      game_date: match.gameDate || dateParam || null,
      ...updates,
    };
    try {
      const ex = await sbJson(await sbFetch(`ratings?game_id=eq.${id}&user_id=eq.${user.id}&select=id`));
      if (ex && ex.length > 0) {
        const r = await sbFetch(`ratings?id=eq.${ex[0].id}`, { method: "PATCH", body: JSON.stringify(updates) });
        if (!r.ok) { setSaveStatus(`Error: ${(await r.text()).slice(0, 80)}`); return; }
      } else {
        const r = await sbFetch(`ratings`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(base) });
        if (!r.ok) { setSaveStatus(`Error: ${(await r.text()).slice(0, 80)}`); return; }
      }
      setSaveStatus(label);
      setTimeout(() => setSaveStatus(""), 1200);
    } catch (e) { setSaveStatus(`Error: ${e.message}`); }
  };

  const submitRating = async () => {
    await upsert({ rating, worth_it: worthIt || null, review: review || null });
    setLogged(true);
    // refresh community avg
    try {
      const data = await sbJson(await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&rating=not.is.null&select=rating`));
      if (data.length > 0) { setCommunityCount(data.length); setCommunityAvg((data.reduce((s, r) => s + parseFloat(r.rating), 0) / data.length).toFixed(1)); }
    } catch (e) {}
  };

  const pickRooting = async (name) => {
    if (!requireAuth()) return;
    const prev = rootingFor;
    const next = rootingFor === name ? "" : name;
    setRootingFor(next);
    setRootingCounts((c) => {
      const n = { ...c };
      if (prev) n[prev] = Math.max(0, (n[prev] || 0) - 1);
      if (next) n[next] = (n[next] || 0) + 1;
      return n;
    });
    await upsert({ rooting_for: next || null }, next ? "Rooting locked in 🙌" : "Cleared");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading match…</div>;
  if (!match) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="text-4xl">🎾</div>
      <div className="text-zinc-500">Match not found</div>
      <Link href="/?tab=games" className="text-red-400 text-sm font-semibold">← Back to games</Link>
    </div>
  );

  const m = match;
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${m.p1.name} vs ${m.p2.name} ${m.tournament} highlights tennis`)}`;
  const r1 = rootingCounts[m.p1.name] || 0;
  const r2 = rootingCounts[m.p2.name] || 0;
  const totalRoot = r1 + r2;
  const r1pct = totalRoot > 0 ? Math.round((r1 / totalRoot) * 100) : 50;

  const PlayerRow = ({ p, big }) => (
    <div className="flex items-center gap-3">
      {p.flag ? <img src={p.flag} alt={p.country} className="w-8 h-5 object-cover rounded-sm shrink-0" /> : <div className="w-8 h-5 rounded-sm bg-zinc-800 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className={`${big ? "text-base" : "text-sm"} font-bold truncate ${p.winner || m.isPre || m.isLive ? "text-white" : "text-zinc-400"}`}>{p.name}{p.winner && <span className="ml-1.5 text-[10px] text-green-400">✓</span>}</div>
        <div className="text-[10px] text-zinc-500">{p.country}</div>
      </div>
      {!m.isPre && (
        <div className="flex gap-1.5 shrink-0">
          {p.sets.map((s, i) => (
            <span key={i} className={`text-lg tabular-nums w-5 text-center font-extrabold ${p.winner ? "text-white" : "text-zinc-500"}`}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/?tab=games" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center truncate">🎾 {m.p1.short} v {m.p2.short}</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Match card */}
        <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-4">
          <div className="h-1 bg-gradient-to-r from-yellow-500 via-lime-400 to-green-500" />
          <div className="p-5">
            <div className="text-center text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-3">
              {m.tournament}{m.round ? ` · ${m.round}` : ""}{m.group ? ` · ${m.group}` : ""}
            </div>
            <div className="space-y-3">
              <PlayerRow p={m.p1} big />
              <div className="flex items-center justify-center">
                {m.isLive ? <span className="text-[10px] font-bold text-white px-2 py-1 rounded-full bg-red-600 animate-pulse">🔴 {m.statusDetail || "LIVE"}</span>
                  : m.isPre ? <span className="text-[10px] font-bold text-zinc-500">{m.date}</span>
                  : <span className="text-[10px] font-bold text-zinc-600">FINAL</span>}
              </div>
              <PlayerRow p={m.p2} big />
            </div>
            {m.note && <div className="text-[11px] text-zinc-500 text-center mt-4 pt-3 border-t border-zinc-800">{m.note}</div>}
            {m.net && <div className="text-[10px] text-zinc-600 text-center mt-2">📺 {m.net}</div>}
          </div>
        </div>

        {/* Rooting poll */}
        {rootingReady && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 mb-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">🙌 {m.isFinal ? "Who fans backed" : "Who are you rooting for?"}</div>
              <div className="text-[10px] text-zinc-600">{totalRoot} {totalRoot === 1 ? "fan" : "fans"}</div>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-950 mb-2">
              {totalRoot > 0 ? (<><div style={{ width: `${r1pct}%`, backgroundColor: "#84cc16" }} /><div style={{ width: `${100 - r1pct}%`, backgroundColor: "#3b82f6" }} /></>) : <div className="w-full bg-zinc-800/40" />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[{ p: m.p1, count: r1, c: "#84cc16" }, { p: m.p2, count: r2, c: "#3b82f6" }].map(({ p, count, c }) => {
                const mine = rootingFor === p.name;
                const pct = totalRoot > 0 ? Math.round((count / totalRoot) * 100) : 0;
                return (
                  <button key={p.name} onClick={() => !m.isFinal && pickRooting(p.name)} disabled={m.isFinal}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 transition-all ${mine ? "border-red-600 bg-red-600/10" : "border-zinc-800 bg-zinc-950"} ${m.isFinal ? "cursor-default" : "hover:border-zinc-600"}`}>
                    <span className="text-xs font-bold text-white truncate">{p.short}{mine && <span className="ml-1 text-[10px] text-red-400">✓</span>}</span>
                    <span className="text-xs font-extrabold shrink-0" style={{ color: c }}>{totalRoot > 0 ? `${pct}%` : "—"}</span>
                  </button>
                );
              })}
            </div>
            {!user && <div className="text-[10px] text-zinc-600 text-center mt-2">Sign in to pick your side</div>}
          </div>
        )}

        {/* Community + your rating */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-2xl bg-gradient-to-br from-red-950/40 to-zinc-900 border border-zinc-800 p-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Community</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{communityCount} {communityCount === 1 ? "rater" : "raters"}</div>
            </div>
            <div className="w-14 h-14 flex items-center justify-center text-white font-extrabold rounded-xl text-lg shrink-0" style={{ backgroundColor: communityAvg != null ? rc(parseFloat(communityAvg)) : "rgba(63,63,70,0.4)", color: communityAvg != null ? "#fff" : "#52525b" }}>{communityAvg != null ? communityAvg : "—"}</div>
          </div>
          <div className="rounded-2xl bg-zinc-900 border-2 border-zinc-800 p-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase">Your Rating</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{logged ? "Saved" : m.isPre ? "After the match" : "Rate below"}</div>
            </div>
            <div className="w-14 h-14 flex items-center justify-center font-extrabold rounded-xl text-lg shrink-0" style={{ backgroundColor: logged ? rc(rating) : "rgba(63,63,70,0.4)", color: logged ? "#fff" : "#52525b" }}>{logged ? rating : "—"}</div>
          </div>
        </div>

        {/* Rating editor (post/live only) */}
        {!m.isPre && (
          user ? (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <div className="text-center mb-3">
                <div className="text-5xl font-extrabold" style={{ color: rc(rating) }}>{rating}</div>
                <div className="text-xs font-bold mt-1" style={{ color: rc(rating) }}>{ratingLabel(rating)}</div>
              </div>
              <input type="range" min="1" max="10" step="0.5" value={rating} onChange={(e) => setRating(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, ${rc(rating)} ${((rating - 1) / 9) * 100}%, #27272a ${((rating - 1) / 9) * 100}%)` }} />
              <div className="flex justify-between mt-1 mb-4"><span className="text-xs text-zinc-600">1</span><span className="text-xs text-zinc-600">10</span></div>
              <div className="text-sm font-semibold text-white text-center mb-2">Was it worth watching?</div>
              <div className="flex gap-2 justify-center mb-4">
                {[{ v: "yes", l: "👍 Yes", c: "#22c55e" }, { v: "no", l: "👎 No", c: "#ef4444" }, { v: "meh", l: "😐 Meh", c: "#eab308" }].map((o) => (
                  <button key={o.v} onClick={() => setWorthIt(o.v)} className="px-5 py-2.5 rounded-xl text-sm font-bold"
                    style={{ border: worthIt === o.v ? `2px solid ${o.c}` : "2px solid #27272a", backgroundColor: worthIt === o.v ? o.c + "15" : "transparent", color: worthIt === o.v ? o.c : "#71717a" }}>{o.l}</button>
                ))}
              </div>
              <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Write your review…" rows={3}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm outline-none resize-none focus:border-red-600 mb-3" />
              <button onClick={submitRating} className="w-full py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-500 transition-colors">{logged ? "Update Rating ✓" : "Log Match ✓"}</button>
            </div>
          ) : (
            <Link href="/login" className="block text-center rounded-2xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-4 mb-4 text-sm text-red-400 hover:text-red-300">Sign in to rate this match →</Link>
          )
        )}

        {/* Highlights */}
        {m.isFinal && (
          <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 mb-4 hover:-translate-y-0.5 transition-transform">
            <div className="w-12 h-9 rounded-lg bg-red-600 flex items-center justify-center text-xl shrink-0">▶</div>
            <div>
              <div className="text-sm font-bold text-white">Watch Highlights</div>
              <div className="text-xs text-zinc-500">{m.p1.short} v {m.p2.short} · {m.tournament}</div>
            </div>
          </a>
        )}
      </div>

      {saveStatus && (
        <div className="fixed bottom-24 left-0 right-0 z-[150] flex justify-center pointer-events-none">
          <div className={`px-5 py-2.5 rounded-full text-sm font-bold backdrop-blur-md shadow-xl ${saveStatus.startsWith("Saved") || saveStatus.includes("🙌") ? "bg-green-600/90 text-white" : saveStatus.includes("Error") ? "bg-red-600/90 text-white" : "bg-zinc-800/95 text-zinc-200"}`}>
            {saveStatus.replace(" ✓", "")}
          </div>
        </div>
      )}

      <Nav />
    </div>
  );
}
