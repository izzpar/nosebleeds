"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };

// Slim strip of your favorite teams' current / just-finished / next game across
// every sport, ESPN-style. `favorites`: [{ sport, abbr }].
export default function MyTeamsBar({ favorites }) {
  const [games, setGames] = useState([]);
  const key = favorites.map((f) => `${f.sport}:${f.abbr}`).join(",");

  useEffect(() => {
    if (!favorites.length) { setGames([]); return; }
    let cancelled = false, timer = null;
    const load = async () => {
      const out = await Promise.all(favorites.map(async ({ sport, abbr }) => {
        try {
          const d = await (await fetch(`${ESPN_BASE}/${PATHS[sport]}/teams/${abbr}`)).json();
          const e = d.team?.nextEvent?.[0];
          const c = e?.competitions?.[0];
          if (!c) return null;
          const side = (t) => ({ abbr: t.team?.abbreviation, logo: t.team?.logos?.[0]?.href, score: typeof t.score === "object" ? t.score?.displayValue : t.score });
          const home = c.competitors.find((t) => t.homeAway === "home"), away = c.competitors.find((t) => t.homeAway === "away");
          if (!home || !away) return null;
          return { id: e.id, sport, mine: abbr, state: c.status?.type?.state, detail: c.status?.type?.shortDetail || "", start: e.date, home: side(home), away: side(away) };
        } catch (err) { return null; }
      }));
      if (cancelled) return;
      const list = out.filter(Boolean);
      setGames(list);
      if (list.some((g) => g.state === "in")) timer = setTimeout(load, 60000); // keep live scores fresh
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!games.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto mb-3 -mx-1 px-1" aria-label="Your teams">
      {games.map((g) => {
        const live = g.state === "in", pre = g.state === "pre";
        const when = pre ? new Date(g.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : live ? g.detail : "Final";
        return (
          <Link key={g.sport + g.id} href={g.sport === "nfl" ? `/game/${g.id}` : `/game/${g.id}?sport=${g.sport}`}
            className={`shrink-0 rounded-xl px-3 py-2 border min-w-[150px] ${live ? "bg-red-950/40 border-red-700/60" : "bg-zinc-900 border-zinc-800"}`}>
            {[g.away, g.home].map((t) => (
              <div key={t.abbr} className="flex items-center gap-1.5 h-5">
                {t.logo && <img src={t.logo} alt="" className="w-4 h-4 object-contain" />}
                <span className={`text-xs font-bold ${t.abbr === g.mine ? "text-white" : "text-zinc-400"}`}>{t.abbr}</span>
                {!pre && <span className="ml-auto text-xs font-extrabold tabular-nums text-white">{t.score}</span>}
              </div>
            ))}
            <div className={`text-[11px] font-bold mt-0.5 ${live ? "text-red-400" : "text-zinc-500"}`}>{live && "● "}{when}</div>
          </Link>
        );
      })}
    </div>
  );
}
