"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { fetchTennisMatches } from "@/lib/tennis";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const TEAM_SPORTS = [
  { id: "nfl", path: "football/nfl", emoji: "🏈" },
  { id: "mlb", path: "baseball/mlb", emoji: "⚾" },
  { id: "nba", path: "basketball/nba", emoji: "🏀" },
  { id: "nhl", path: "hockey/nhl", emoji: "🏒" },
];
const LIVE_STATUSES = new Set([
  "STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD",
  "STATUS_END_OF_INNING", "STATUS_DELAYED", "STATUS_RAIN_DELAY",
]);

function todayParam() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchLiveTeamGames(sport, path, emoji) {
  try {
    const r = await fetch(`${ESPN_BASE}/${path}/scoreboard?dates=${todayParam()}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.events || []).map((e) => {
      const c = e.competitions?.[0];
      if (!c) return null;
      const st = c.status?.type?.name || "";
      if (!LIVE_STATUSES.has(st)) return null;
      const ho = (c.competitors || []).find((t) => t.homeAway === "home");
      const aw = (c.competitors || []).find((t) => t.homeAway === "away");
      if (!ho || !aw) return null;
      return {
        id: e.id, sport, emoji, kind: "team",
        statusDetail: c.status?.type?.shortDetail || "LIVE",
        net: c.broadcasts?.[0]?.names?.[0] || "",
        away: { abbr: aw.team.abbreviation, name: aw.team.displayName, logo: aw.team.logo, color: "#" + (aw.team.color || "333"), score: parseInt(aw.score) || 0 },
        home: { abbr: ho.team.abbreviation, name: ho.team.displayName, logo: ho.team.logo, color: "#" + (ho.team.color || "333"), score: parseInt(ho.score) || 0 },
        href: sport === "nfl" ? `/game/${e.id}` : `/game/${e.id}?sport=${sport}`,
      };
    }).filter(Boolean);
  } catch (e) { return []; }
}

export default function LivePage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const teamResults = await Promise.all(TEAM_SPORTS.map((s) => fetchLiveTeamGames(s.id, s.path, s.emoji)));
        // Tennis: reuse the shared helper, keep only live matches
        let tennis = [];
        try {
          const d = new Date();
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const matches = await fetchTennisMatches(ds);
          tennis = matches.filter((m) => m.isLive).map((m) => ({
            id: m.id, sport: "tennis", emoji: "🎾", kind: "tennis",
            statusDetail: m.statusDetail || "LIVE", net: m.net || "",
            tournament: m.tournament, round: m.round,
            p1: m.p1, p2: m.p2,
            href: `/tennis/${m.id}?l=${m.league}&d=${m.gameDate}`,
          }));
        } catch (e) {}
        if (cancelled) return;
        setGames([...teamResults.flat(), ...tennis]);
        setUpdatedAt(new Date());
      } catch (e) { /* keep prior */ }
      if (!cancelled) setLoading(false);
    };
    load();
    const t = setInterval(load, 30000); // refresh every 30s
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">🔴 Live Now</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-zinc-500">{loading ? "Checking every sport…" : `${games.length} game${games.length === 1 ? "" : "s"} in progress`}</div>
          {updatedAt && <div className="text-[10px] text-zinc-600">updated {updatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · auto-refreshes</div>}
        </div>

        {loading && games.length === 0 && (
          <div className="text-center py-16 text-zinc-500">Loading live games…</div>
        )}

        {!loading && games.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">😴</div>
            <div className="text-base font-bold text-white">Nothing live right now</div>
            <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">No games in progress across any sport. Check back at game time.</div>
            <Link href="/" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</Link>
          </div>
        )}

        {games.map((g) => (
          <Link key={`${g.sport}-${g.id}`} href={g.href} className="block">
            <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-3 hover:-translate-y-0.5 transition-transform">
              <div className="h-[3px]" style={{ background: g.kind === "tennis" ? "linear-gradient(90deg,#eab308,#84cc16)" : `linear-gradient(90deg, ${g.away.color} 50%, ${g.home.color} 50%)` }} />
              <div className="p-3.5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-zinc-500 tracking-wide uppercase truncate">
                    {g.emoji} {g.kind === "tennis" ? `${g.tournament}${g.round ? " · " + g.round : ""}` : g.sport.toUpperCase()}{g.net ? ` · ${g.net}` : ""}
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold animate-pulse shrink-0">🔴 {g.statusDetail}</span>
                </div>
                {g.kind === "tennis" ? (
                  <>
                    {[g.p1, g.p2].map((p, i) => (
                      <div key={i} className="flex items-center gap-2.5 mb-1.5 last:mb-0">
                        {p.flag ? <img src={p.flag} alt="" className="w-6 h-4 object-cover rounded-sm shrink-0" /> : <div className="w-6 h-4 rounded-sm bg-zinc-800 shrink-0" />}
                        <span className={`flex-1 text-sm truncate ${p.winner ? "font-bold text-white" : "text-white"}`}>{p.name}</span>
                        <span className="flex gap-1 shrink-0">{p.sets.map((s, j) => <span key={j} className="text-sm tabular-nums w-4 text-center text-zinc-300">{s}</span>)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {[g.away, g.home].map((team, i) => (
                      <div key={i} className="flex items-center gap-2.5 mb-1.5 last:mb-0">
                        {team.logo ? <img src={team.logo} alt={team.abbr} className="w-7 h-7 object-contain" /> : <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: team.color }}>{team.abbr}</div>}
                        <span className="flex-1 text-sm text-white truncate">{team.name}</span>
                        <span className="text-xl font-extrabold tabular-nums text-white">{team.score}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Nav />
    </div>
  );
}
