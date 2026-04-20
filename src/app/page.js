"use client";
import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import GameCard from "@/components/GameCard";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

async function fetchWeek(year, week) {
  try {
    const r = await fetch(
      `${ESPN}/scoreboard?seasontype=2&week=${week}&dates=${year}`
    );
    const d = await r.json();
    return (d.events || [])
      .map((e) => {
        const c = e.competitions?.[0];
        if (!c) return null;
        const ts = c.competitors || [];
        const ho = ts.find((t) => t.homeAway === "home");
        const aw = ts.find((t) => t.homeAway === "away");
        if (!ho || !aw) return null;
        const dt = new Date(e.date);
        const st = c.status?.type?.name || "STATUS_FINAL";
        return {
          id: e.id,
          week,
          season: year,
          date: dt.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          shortDate: dt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          net: c.broadcasts?.[0]?.names?.[0] || "",
          status: st,
          isPre: st === "STATUS_SCHEDULED",
          isFinal: st === "STATUS_FINAL",
          home: {
            name: ho.team.displayName,
            abbr: ho.team.abbreviation,
            color: "#" + (ho.team.color || "333"),
            logo: ho.team.logo,
            record: ho.records?.[0]?.summary || "",
            score: parseInt(ho.score) || 0,
          },
          away: {
            name: aw.team.displayName,
            abbr: aw.team.abbreviation,
            color: "#" + (aw.team.color || "333"),
            logo: aw.team.logo,
            record: aw.records?.[0]?.summary || "",
            score: parseInt(aw.score) || 0,
          },
          ot: (ho.linescores || []).length > 4,
          diff: Math.abs(
            (parseInt(ho.score) || 0) - (parseInt(aw.score) || 0)
          ),
          total: (parseInt(ho.score) || 0) + (parseInt(aw.score) || 0),
        };
      })
      .filter(Boolean);
  } catch (e) {
    console.error(e);
    return [];
  }
}

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState(18);
  const [year, setYear] = useState(2024);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [tab, setTab] = useState("games");

  const weeks = [18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const years = [2024, 2023, 2022, 2021, 2020];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchWeek(year, week);
      setGames(data);
      setLoading(false);
    }
    load();
  }, [week, year]);

  const filtered = games
    .filter((g) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        g.away.name.toLowerCase().includes(s) ||
        g.home.name.toLowerCase().includes(s) ||
        g.away.abbr.toLowerCase().includes(s) ||
        g.home.abbr.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      if (sort === "score") return b.total - a.total;
      if (sort === "close") return a.diff - b.diff;
      return 0;
    });

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-extrabold text-white">
            <span className="text-red-600">🩸</span> The Nosebleeds
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-3">
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search teams..."
          className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 mb-3"
        />

        {/* Year selector */}
        <div className="flex gap-2 mb-2">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                year === y
                  ? "bg-red-600 text-white"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Week selector */}
        <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
          {weeks.map((w) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                week === w
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex gap-2 mb-4">
          {[
            { id: "date", label: "Date" },
            { id: "score", label: "Score" },
            { id: "close", label: "Closest" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                sort === s.id
                  ? "bg-red-600/10 text-red-400"
                  : "text-zinc-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Games */}
        {loading && (
          <div className="text-center py-16 text-zinc-500">
            Loading {year} Week {week}...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔍</div>
            <div className="text-zinc-500">No games found</div>
          </div>
        )}

        {filtered.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>

      <Nav tab={tab} setTab={setTab} />
    </div>
  );
}