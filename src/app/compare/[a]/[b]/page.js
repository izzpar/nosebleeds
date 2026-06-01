"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

function rc(r) {
  if (r >= 9) return "#22c55e";
  if (r >= 7.5) return "#84cc16";
  if (r >= 6) return "#eab308";
  if (r >= 4) return "#f97316";
  if (r >= 2) return "#ef4444";
  return "#991b1b";
}

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

async function loadPlayer(name) {
  const enc = encodeURIComponent(name);
  const rows = await sbJson(await sbFetch(`ratings?or=(mvp.eq.${enc},letdown.eq.${enc})&public=eq.true&select=mvp,letdown,rating,game_id`));
  const mvp = rows.filter((r) => r.mvp === name).length;
  const letdown = rows.filter((r) => r.letdown === name).length;
  const total = mvp + letdown;
  const games = new Set(rows.map((r) => r.game_id).filter(Boolean));
  const ratings = rows.filter((r) => r.rating != null).map((r) => parseFloat(r.rating));
  const avg = ratings.length ? ratings.reduce((s, x) => s + x, 0) / ratings.length : null;
  return {
    name, mvp, letdown, total,
    mvpRate: total > 0 ? Math.round((mvp / total) * 100) : 0,
    games: games.size,
    avg,
  };
}

export default function ComparePage({ params }) {
  const { a, b } = use(params);
  const nameA = decodeURIComponent(a);
  const nameB = decodeURIComponent(b);
  const [pa, setPa] = useState(null);
  const [pb, setPb] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [ra, rb] = await Promise.all([loadPlayer(nameA), loadPlayer(nameB)]);
      if (!cancelled) { setPa(ra); setPb(rb); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [nameA, nameB]);

  const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // higher-is-better metrics (avg, mvp, mvpRate, games); letdown is lower-is-better
  const Row = ({ label, va, vb, lowerBetter, fmt = (x) => x, color }) => {
    const na = va ?? 0, nb = vb ?? 0;
    let aWin = false, bWin = false;
    if (na !== nb) { if (lowerBetter) { aWin = na < nb; bWin = nb < na; } else { aWin = na > nb; bWin = nb > na; } }
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 border-b border-zinc-800 last:border-b-0">
        <div className={`text-left text-lg font-extrabold ${aWin ? "text-white" : "text-zinc-500"}`} style={aWin && color ? { color } : undefined}>{va == null ? "—" : fmt(va)}{aWin && <span className="text-[10px] ml-1">◀</span>}</div>
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center px-1">{label}</div>
        <div className={`text-right text-lg font-extrabold ${bWin ? "text-white" : "text-zinc-500"}`} style={bWin && color ? { color } : undefined}>{bWin && <span className="text-[10px] mr-1">▶</span>}{vb == null ? "—" : fmt(vb)}</div>
      </div>
    );
  };

  const Head = ({ p, name }) => (
    <Link href={`/player/${encodeURIComponent(name)}`} className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center text-base font-extrabold text-white">{initials(name)}</div>
      <div className="text-sm font-bold text-white text-center truncate w-full px-1">{name}</div>
    </Link>
  );

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/player/${encodeURIComponent(nameA)}`} className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">⚖️ Compare</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {loading ? (
          <div className="text-center py-16 text-zinc-500">Comparing…</div>
        ) : (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Head p={pa} name={nameA} />
              <div className="text-xs font-extrabold text-zinc-600 shrink-0">VS</div>
              <Head p={pb} name={nameB} />
            </div>
            {pa.total === 0 && pb.total === 0 ? (
              <div className="text-center py-6 text-sm text-zinc-500">Neither player has community MVP or Letdown picks yet.</div>
            ) : (
              <div>
                <Row label="Avg game rating" va={pa.avg} vb={pb.avg} fmt={(x) => x.toFixed(1)} color="#22c55e" />
                <Row label="🌟 MVP picks" va={pa.mvp} vb={pb.mvp} color="#22c55e" />
                <Row label="MVP rate" va={pa.mvpRate} vb={pb.mvpRate} fmt={(x) => `${x}%`} color="#22c55e" />
                <Row label="😤 Letdowns" va={pa.letdown} vb={pb.letdown} lowerBetter color="#ef4444" />
                <Row label="Games rated" va={pa.games} vb={pb.games} />
              </div>
            )}
          </div>
        )}
        <div className="text-[10px] text-zinc-600 text-center mt-3">Based on the community&apos;s MVP / Letdown picks and the ratings of games they appeared in.</div>
      </div>

      <Nav />
    </div>
  );
}
