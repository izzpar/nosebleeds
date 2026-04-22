"use client";
import { useState, useEffect, useMemo } from "react";
import Nav from "@/components/Nav";
import GameCard from "@/components/GameCard";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ALL_TEAMS = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WSH"];

const BADGES = [
  { id: "first", n: "First Log", i: "🏈", d: "Log your first game", ck: (l) => l.length >= 1 },
  { id: "five", n: "Starting 5", i: "⭐", d: "Log 5 games", ck: (l) => l.length >= 5 },
  { id: "harsh", n: "Harsh Critic", i: "😤", d: "Rate ≤ 2", ck: (l) => l.some((x) => x.rating <= 2) },
  { id: "fan", n: "True Fan", i: "❤️", d: "Give a 10", ck: (l) => l.some((x) => x.rating >= 10) },
  { id: "writer", n: "Wordsmith", i: "✍️", d: "3+ reviews", ck: (l) => l.filter((x) => x.review).length >= 3 },
  { id: "stad", n: "Live", i: "🏟️", d: "Watch at stadium", ck: (l) => l.some((x) => x.watchHow === "🏟️ Stadium") },
];

const TOP_RATERS = [
  { n: "@GridironGuru", likes: 12400, reviews: 342, avg: 7.2, badge: "🏆" },
  { n: "@NFLAnalytics", likes: 9800, reviews: 289, avg: 6.8, badge: "📊" },
  { n: "@DetroitDan", likes: 8200, reviews: 256, avg: 7.9, badge: "🔥" },
  { n: "@SportsJunkie99", likes: 6500, reviews: 198, avg: 7.4, badge: "⭐" },
  { n: "@BillsMafia", likes: 5100, reviews: 167, avg: 8.1, badge: "💪" },
];

const COMMUNITY_LISTS = [
  { name: "Best Games of 2024", by: "@GridironGuru", count: 5, likes: 2400, icon: "🏆" },
  { name: "Heartbreakers", by: "@DetroitDan", count: 8, likes: 1800, icon: "💔" },
  { name: "Defensive Masterclasses", by: "@NFLAnalytics", count: 6, likes: 950, icon: "🛡️" },
  { name: "OT Thrillers", by: "@SportsJunkie99", count: 4, likes: 1200, icon: "⏱️" },
];

const FRIENDS = [
  { n: "Marcus", a: "M", c: "#3b82f6", logs: [{ g: "KC 27 — BUF 31", r: 9.5, w: 18, t: "2h" }, { g: "DET 31 — SF 24", r: 8, w: 17, t: "1d" }] },
  { n: "Sarah", a: "S", c: "#ec4899", logs: [{ g: "DET 31 — MIN 28", r: 7, w: 18, t: "3h", rv: "Ugly blowout" }] },
  { n: "Tyler", a: "T", c: "#22c55e", logs: [{ g: "PHI 20 — NYG 13", r: 4, w: 18, t: "5h", rv: "Ugly but a W" }] },
  { n: "Jess", a: "J", c: "#f59e0b", logs: [{ g: "BAL 35 — CLE 10", r: 3.5, w: 17, t: "1d" }] },
];

function rc(r) {
  if (r >= 9) return "#22c55e";
  if (r >= 7) return "#dc2626";
  if (r >= 5) return "#eab308";
  if (r >= 3) return "#f97316";
  return "#ef4444";
}

function RBars({ dist }) {
  const mx = Math.max(...dist, 1);
  return (
    <div className="flex items-end gap-1 h-12">
      {dist.map((c, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max((c / mx) * 100, 0)}%`,
              minHeight: c > 0 ? 4 : 0,
              backgroundColor: rc(i + 1),
              opacity: c > 0 ? 1 : 0.12,
            }}
          />
          <span className="text-[8px] text-zinc-600 font-semibold">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function Bdg({ r, size = "md" }) {
  const s = size === "sm" ? "w-7 h-7 text-[10px] rounded-lg" : "w-9 h-9 text-xs rounded-xl";
  return (
    <div className={`${s} flex items-center justify-center text-white font-bold shrink-0`} style={{ backgroundColor: rc(r) }}>
      {r.toFixed(1)}
    </div>
  );
}

async function fetchWeek(year, week) {
  try {
    const r = await fetch(`${ESPN}/scoreboard?seasontype=2&week=${week}&dates=${year}`);
    const d = await r.json();
    return (d.events || []).map((e) => {
      const c = e.competitions?.[0];
      if (!c) return null;
      const ts = c.competitors || [];
      const ho = ts.find((t) => t.homeAway === "home");
      const aw = ts.find((t) => t.homeAway === "away");
      if (!ho || !aw) return null;
      const dt = new Date(e.date);
      const st = c.status?.type?.name || "STATUS_FINAL";
      return {
        id: e.id, week, season: year,
        date: dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        shortDate: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        net: c.broadcasts?.[0]?.names?.[0] || "", status: st,
        isPre: st === "STATUS_SCHEDULED", isFinal: st === "STATUS_FINAL",
        home: { name: ho.team.displayName, abbr: ho.team.abbreviation, color: "#" + (ho.team.color || "333"), logo: ho.team.logo, record: ho.records?.[0]?.summary || "", score: parseInt(ho.score) || 0 },
        away: { name: aw.team.displayName, abbr: aw.team.abbreviation, color: "#" + (aw.team.color || "333"), logo: aw.team.logo, record: aw.records?.[0]?.summary || "", score: parseInt(aw.score) || 0 },
        ot: (ho.linescores || []).length > 4,
        diff: Math.abs((parseInt(ho.score) || 0) - (parseInt(aw.score) || 0)),
        total: (parseInt(ho.score) || 0) + (parseInt(aw.score) || 0),
      };
    }).filter(Boolean);
  } catch (e) { console.error(e); return []; }
}

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState(18);
  const [year, setYear] = useState(2024);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [tab, setTab] = useState("games");
  const [myTeams, setMyTeams] = useState([]);
  const [showTeams, setShowTeams] = useState(false);
  const [logs, setLogs] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [lists, setLists] = useState([
    { name: "Best Games Ever", icon: "🏆", games: [] },
    { name: "Heartbreakers", icon: "💔", games: [] },
  ]);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [followed, setFollowed] = useState([]);

  const weeks = [18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const years = [2024, 2023, 2022, 2021, 2020];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchWeek(year, week);
      setGames((prev) => [...prev.filter((g) => !(g.week === week && g.season === year)), ...data]);
      setLoading(false);
    }
    load();
  }, [week, year]);

  const filtered = useMemo(() => {
    let g = games.filter((g) => g.week === week && g.season === year);
    if (search) {
      const s = search.toLowerCase();
      g = g.filter((x) => x.away.name.toLowerCase().includes(s) || x.home.name.toLowerCase().includes(s) || x.away.abbr.toLowerCase().includes(s) || x.home.abbr.toLowerCase().includes(s));
    }
    if (myTeams.length > 0) g = g.filter((x) => myTeams.includes(x.away.abbr) || myTeams.includes(x.home.abbr));
    if (sort === "score") g = [...g].sort((a, b) => b.total - a.total);
    else if (sort === "close") g = [...g].sort((a, b) => a.diff - b.diff);
    return g;
  }, [games, week, year, search, sort, myTeams]);

  const earned = BADGES.filter((b) => b.ck(logs));
  const gl = (id) => logs.find((l) => l.gameId === id);

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
        {/* ===== GAMES TAB ===== */}
        {tab === "games" && (
          <div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search teams..."
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 mb-3" />

            <div className="flex gap-2 mb-2">
              {years.map((y) => (
                <button key={y} onClick={() => setYear(y)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${year === y ? "bg-red-600 text-white" : "bg-zinc-900 text-zinc-500"}`}>{y}</button>
              ))}
            </div>

            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
              {weeks.map((w) => (
                <button key={w} onClick={() => setWeek(w)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${week === w ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-500"}`}>{w}</button>
              ))}
            </div>

            <div className="flex justify-between items-center mb-3">
              <div className="flex gap-2">
                {[{ id: "date", l: "Date" }, { id: "score", l: "Score" }, { id: "close", l: "Closest" }].map((s) => (
                  <button key={s.id} onClick={() => setSort(s.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${sort === s.id ? "bg-red-600/10 text-red-400" : "text-zinc-500"}`}>{s.l}</button>
                ))}
              </div>
              <button onClick={() => setShowTeams(!showTeams)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold border ${myTeams.length ? "bg-red-600/10 text-red-400 border-red-600/30" : "text-zinc-500 border-zinc-800"}`}>
                {myTeams.length ? `My Teams (${myTeams.length})` : "My Teams"}
              </button>
            </div>

            {showTeams && (
              <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800 mb-3">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-semibold text-white">Follow Teams</span>
                  {myTeams.length > 0 && <button onClick={() => setMyTeams([])} className="text-[10px] text-red-400">Clear</button>}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {ALL_TEAMS.map((t) => (
                    <button key={t} onClick={() => setMyTeams((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                      className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${myTeams.includes(t) ? "bg-red-600/10 text-red-400 border-red-600" : "bg-zinc-950 text-zinc-500 border-zinc-800"}`}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            {loading && <div className="text-center py-16 text-zinc-500">Loading {year} Week {week}...</div>}
            {!loading && filtered.length === 0 && <div className="text-center py-16"><div className="text-5xl mb-3">🔍</div><div className="text-zinc-500">No games found</div></div>}
            {filtered.map((g) => <GameCard key={g.id} game={g} logged={!!gl(g.id)} />)}
          </div>
        )}

        {/* ===== DISCOVER TAB ===== */}
        {tab === "discover" && (
          <div>
            <h2 className="text-xl font-extrabold text-white mb-4">Discover</h2>

            {/* Top Raters */}
            <div className="mb-5">
              <h3 className="text-sm font-bold text-white mb-3">🏆 Top Raters</h3>
              {TOP_RATERS.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800">
                  <span className="text-base font-extrabold w-5 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-xs font-bold text-white">{r.badge}</div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">{r.n}</div>
                    <div className="text-[10px] text-zinc-500">{r.reviews} reviews · avg {r.avg}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">❤️ {(r.likes / 1000).toFixed(1)}k</div>
                    <button onClick={() => setFollowed((p) => p.includes(r.n) ? p.filter((x) => x !== r.n) : [...p, r.n])}
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold mt-0.5 ${followed.includes(r.n) ? "bg-zinc-700 text-zinc-300" : "bg-red-600/10 text-red-400"}`}>
                      {followed.includes(r.n) ? "Following" : "Follow"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Community Lists */}
            <div className="mb-5">
              <h3 className="text-sm font-bold text-white mb-3">📋 Community Lists</h3>
              {COMMUNITY_LISTS.map((l, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 cursor-pointer hover:-translate-y-0.5 transition-transform">
                  <span className="text-2xl">{l.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">{l.name}</div>
                    <div className="text-[10px] text-zinc-500">by {l.by} · {l.count} games</div>
                  </div>
                  <div className="text-[11px] text-zinc-500">❤️ {l.likes > 999 ? (l.likes / 1000).toFixed(1) + "k" : l.likes}</div>
                </div>
              ))}
            </div>

            {/* Rankings */}
            {[
              { t: "🔥 Highest Scoring", d: [...games].sort((a, b) => b.total - a.total).slice(0, 5), v: (g) => g.total, c: "#dc2626" },
              { t: "🎯 Nail-Biters", d: [...games].filter((g) => g.diff > 0 && g.isFinal).sort((a, b) => a.diff - b.diff).slice(0, 5), v: (g) => "+" + g.diff, c: "#22c55e" },
            ].map((sec) => (
              <div key={sec.t} className="mb-5">
                <h3 className="text-sm font-bold text-white mb-3">{sec.t}</h3>
                {sec.d.map((g, i) => (
                  <div key={g.id} className="flex items-center gap-2 p-2.5 rounded-xl mb-1.5 bg-zinc-900 border border-zinc-800 cursor-pointer hover:-translate-y-0.5 transition-transform">
                    <span className="text-sm font-extrabold w-5 text-center" style={{ color: i === 0 ? sec.c : "#52525b" }}>{i + 1}</span>
                    {g.away.logo && <img src={g.away.logo} className="w-5 h-5 object-contain" />}
                    {g.home.logo && <img src={g.home.logo} className="w-5 h-5 object-contain" />}
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-white">{g.away.abbr} {g.away.score} — {g.home.abbr} {g.home.score}</div>
                      <div className="text-[9px] text-zinc-600">Wk {g.week}</div>
                    </div>
                    <span className="text-sm font-extrabold" style={{ color: sec.c }}>{sec.v(g)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ===== FRIENDS TAB ===== */}
        {tab === "friends" && (
          <div>
            <h2 className="text-xl font-extrabold text-white mb-1">Friends</h2>
            <p className="text-xs text-zinc-500 mb-4">See what your crew is watching</p>

            <div className="flex gap-3 mb-5 overflow-x-auto pb-1">
              {FRIENDS.map((f) => (
                <div key={f.n} className="text-center shrink-0">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white border-2 border-zinc-800" style={{ backgroundColor: f.c }}>{f.a}</div>
                  <div className="text-[10px] font-semibold text-zinc-400 mt-1">{f.n}</div>
                </div>
              ))}
              <div className="text-center shrink-0">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl text-zinc-600 bg-zinc-800">+</div>
                <div className="text-[10px] font-semibold text-zinc-600 mt-1">Add</div>
              </div>
            </div>

            {FRIENDS.flatMap((f) => f.logs.map((l) => ({ ...l, fr: f }))).sort((a, b) => a.t.localeCompare(b.t)).map((item, i) => (
              <div key={i} className="flex gap-3 p-3.5 rounded-2xl mb-2 bg-zinc-900 border border-zinc-800">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: item.fr.c }}>{item.fr.a}</div>
                <div className="flex-1">
                  <div className="text-sm text-white"><span className="font-bold">{item.fr.n}</span> <span className="text-zinc-500">rated</span></div>
                  <div className="text-sm font-bold text-white mt-0.5">{item.g}</div>
                  {item.rv && <div className="text-xs text-zinc-400 italic mt-1">&quot;{item.rv}&quot;</div>}
                  <div className="text-[10px] text-zinc-600 mt-1">Wk {item.w} · {item.t}</div>
                </div>
                <Bdg r={item.r} />
              </div>
            ))}
          </div>
        )}

        {/* ===== DIARY TAB ===== */}
        {tab === "diary" && (
          <div>
            <h2 className="text-xl font-extrabold text-white mb-4">Your Diary</h2>
            {logs.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">📓</div>
                <div className="text-base font-bold text-white">Start logging games</div>
                <div className="text-xs text-zinc-500 mt-1">Rate games to build your football memory book</div>
                <button onClick={() => setTab("games")} className="mt-4 px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</button>
              </div>
            )}
            {[...logs].sort((a, b) => (b.week || 0) - (a.week || 0)).map((l) => {
              const g = games.find((x) => x.id === l.gameId);
              if (!g) return null;
              return (
                <div key={l.gameId} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 cursor-pointer hover:-translate-y-0.5 transition-transform">
                  <Bdg r={l.rating} />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">{g.away.abbr} {g.away.score} — {g.home.abbr} {g.home.score}</div>
                    <div className="text-[10px] text-zinc-600">Wk {g.week} · {g.shortDate}</div>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {l.mvp && <span className="text-[10px] text-green-400">🌟 {l.mvp}</span>}
                      {l.watchHow && <span className="text-[10px] text-zinc-500">{l.watchHow}</span>}
                      {l.worthIt && <span className="text-[10px]" style={{ color: l.worthIt === "yes" ? "#22c55e" : l.worthIt === "no" ? "#ef4444" : "#eab308" }}>{l.worthIt === "yes" ? "👍" : l.worthIt === "no" ? "👎" : "😐"}</span>}
                    </div>
                    {l.review && <div className="text-[11px] text-zinc-400 italic mt-1">&quot;{l.review}&quot;</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== PROFILE TAB ===== */}
        {tab === "profile" && (
          <div>
            {/* User card */}
            <div className="rounded-2xl p-5 bg-zinc-900 border border-zinc-800 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white text-lg font-extrabold">I</div>
                <div>
                  <div className="text-lg font-extrabold text-white">Isaac</div>
                  <div className="text-xs text-zinc-500">@isaac</div>
                  {myTeams.length > 0 && <div className="text-[10px] text-red-400 mt-0.5">{myTeams.join(" · ")}</div>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { v: logs.length, l: "GAMES" },
                  { v: logs.filter((l) => l.review).length, l: "REVIEWS" },
                  { v: logs.length ? (logs.reduce((s, l) => s + l.rating, 0) / logs.length).toFixed(1) : "—", l: "AVG" },
                ].map((s) => (
                  <div key={s.l} className="p-2 rounded-lg bg-zinc-950">
                    <div className="text-xl font-extrabold text-white">{s.v}</div>
                    <div className="text-[8px] text-zinc-600 font-bold">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pinned */}
            {pinned.length > 0 && (
              <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
                <h3 className="text-sm font-bold text-white mb-3">📌 Pinned Games</h3>
                <div className="grid grid-cols-2 gap-2">
                  {pinned.slice(0, 4).map((id) => {
                    const g = games.find((x) => x.id === id);
                    const l = gl(id);
                    if (!g) return null;
                    return (
                      <div key={id} className="p-2.5 rounded-lg bg-zinc-950 border-l-2 border-red-600">
                        <div className="text-xs font-bold text-white">{g.away.abbr} {g.away.score}—{g.home.abbr} {g.home.score}</div>
                        <div className="text-[10px] text-zinc-600">Wk {g.week}</div>
                        {l && <div className="text-base font-extrabold mt-1" style={{ color: rc(l.rating) }}>{l.rating}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Your Lists */}
            <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-white">📋 Your Lists</h3>
                <button onClick={() => setShowNewList(true)} className="text-[11px] text-red-400 font-semibold">+ New List</button>
              </div>
              {lists.map((l, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-zinc-950 mb-2">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-bold text-white">{l.icon} {l.name}</div>
                    <span className="text-[11px] text-zinc-600">{l.games.length} games</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Badges */}
            <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
              <h3 className="text-sm font-bold text-white mb-3">🏆 Badges</h3>
              <div className="grid grid-cols-2 gap-2">
                {BADGES.map((b) => {
                  const e = earned.includes(b);
                  return (
                    <div key={b.id} className={`p-2.5 rounded-lg bg-zinc-950 ${e ? "border border-red-600/30" : "opacity-30"}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{b.i}</span>
                        <div>
                          <div className="text-[11px] font-bold text-white">{b.n}</div>
                          <div className="text-[9px] text-zinc-500">{b.d}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Season Wrapped */}
            {logs.length >= 3 && (
              <div className="rounded-2xl p-5 mb-4 bg-gradient-to-br from-red-600 via-red-800 to-red-950 text-white relative overflow-hidden">
                <div className="absolute -top-5 -right-5 text-8xl opacity-5">🏈</div>
                <div className="text-[9px] font-bold opacity-80 tracking-widest uppercase">Season Wrapped</div>
                <div className="text-lg font-extrabold mt-1 mb-3">Your {year} Season</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: logs.length, l: "Games" },
                    { v: (logs.reduce((s, l) => s + l.rating, 0) / logs.length).toFixed(1), l: "Avg Rating" },
                    { v: logs.filter((l) => l.worthIt === "yes").length, l: "Worth It" },
                    { v: earned.length + "/" + BADGES.length, l: "Badges" },
                  ].map((s, i) => (
                    <div key={i} className="bg-white/10 rounded-lg p-2">
                      <div className="text-xl font-extrabold">{s.v}</div>
                      <div className="text-[9px] opacity-80">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rating Distribution */}
            {logs.length > 0 && (
              <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800">
                <h3 className="text-sm font-bold text-white mb-3">Rating Distribution</h3>
                <RBars dist={Array(10).fill(0).map((_, i) => logs.filter((l) => Math.floor(l.rating) === i + 1).length)} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* New List Modal */}
      {showNewList && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-5" onClick={() => setShowNewList(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <div className="text-base font-bold text-white mb-3">Create New List</div>
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name..." autoFocus
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm outline-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => { if (newListName.trim()) { setLists((p) => [...p, { name: newListName, icon: "📋", games: [] }]); setNewListName(""); setShowNewList(false); } }}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm">Create</button>
              <button onClick={() => setShowNewList(false)} className="px-4 py-2.5 bg-zinc-800 text-zinc-400 rounded-xl font-semibold text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <Nav tab={tab} setTab={setTab} />
    </div>
  );
}
