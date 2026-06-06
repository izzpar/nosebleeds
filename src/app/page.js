"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import GameCard from "@/components/GameCard";
import TennisCard from "@/components/TennisCard";
import PullToRefresh from "@/components/PullToRefresh";
import ScoresTicker from "@/components/ScoresTicker";
import { fetchTennisMatches } from "@/lib/tennis";
import { useAuth } from "@/components/AuthProvider";
import { DROPS, EMOTE_PACKS, NAME_FLAIR, THEMES, dropsEarned, dropsSpent, nameColor } from "@/lib/drops";
import { repScore, repTier, nextTier, tierProgress } from "@/lib/reputation";
import Link from "next/link";
import WcBackdrop from "@/components/WcBackdrop";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATHS = {
  nfl: "football/nfl",
  mlb: "baseball/mlb",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  wc: "soccer/fifa.world",
};
const ESPN = `${ESPN_BASE}/${SPORT_PATHS.nfl}`; // legacy for any remaining refs
// 2026 World Cup window — used to default the date so the feed isn't empty pre-tournament.
const WC_OPENER = "2026-06-11";
const WC_FINAL = "2026-07-19";
// Keep a YYYY-MM-DD date inside the tournament window (string compare is safe for ISO dates).
const clampWcDate = (d) => (d < WC_OPENER ? WC_OPENER : d > WC_FINAL ? WC_FINAL : d);

// Sport switcher config (also drives diary/profile toggles). Order = display order.
// `team: false` sports (tennis, World Cup) are not favorite-team based — no
// favorite-team picker. World Cup still uses the shared /game/[id] page.
const SPORTS = [
  { id: "wc", emoji: "⚽🏆", label: "World Cup", team: false },
  { id: "nfl", emoji: "🏈", label: "NFL", team: true },
  { id: "mlb", emoji: "⚾", label: "MLB", team: true },
  { id: "nba", emoji: "🏀", label: "NBA", team: true },
  { id: "nhl", emoji: "🏒", label: "NHL", team: true },
  { id: "tennis", emoji: "🎾", label: "Tennis", team: false },
];
const FAV_SPORTS = SPORTS.filter((s) => s.team); // sports that have favorite-team pickers
const VALID_SPORTS = SPORTS.map((s) => s.id);
// NFL is week/season based; everyone else is fetched by calendar date.
const isDateSport = (s) => s !== "nfl";
const sportLabel = (s) => SPORTS.find((x) => x.id === s)?.label || "NFL";
const sportEmoji = (s) => SPORTS.find((x) => x.id === s)?.emoji || "🏈";
// Profiles store the NFL favorite as `favorite_team`; others as `favorite_team_<sport>`.
const favKey = (s) => (s === "nfl" ? "favorite_team" : `favorite_team_${s}`);
// Game-detail href. Tennis has its own player-based detail page; team sports
// carry ?sport so the shared game page hits the right ESPN endpoint.
const gameHref = (gameId, gameSport, date) =>
  gameSport === "tennis" ? `/tennis/${gameId}${date ? `?d=${date}` : ""}`
    : gameSport && gameSport !== "nfl" ? `/game/${gameId}?sport=${gameSport}`
    : `/game/${gameId}`;

const ALL_TEAMS = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WSH"];
const ALL_MLB_TEAMS = ["ARI","ATL","BAL","BOS","CHC","CHW","CIN","CLE","COL","DET","HOU","KC","LAA","LAD","MIA","MIL","MIN","NYM","NYY","OAK","PHI","PIT","SD","SEA","SF","STL","TB","TEX","TOR","WSH"];
const ALL_NBA_TEAMS = ["ATL","BKN","BOS","CHA","CHI","CLE","DAL","DEN","DET","GS","HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NO","NY","OKC","ORL","PHI","PHX","POR","SAC","SA","TOR","UTAH","WSH"];
const ALL_NHL_TEAMS = ["ANA","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL","DET","EDM","FLA","LA","MIN","MTL","NJ","NSH","NYI","NYR","OTT","PHI","PIT","SEA","SJ","STL","TB","TOR","UTAH","VAN","VGK","WPG","WSH"];
const TEAMS_BY_SPORT = { nfl: ALL_TEAMS, mlb: ALL_MLB_TEAMS, nba: ALL_NBA_TEAMS, nhl: ALL_NHL_TEAMS };
const TEAM_NAMES = {
  nfl: { ARI:"Cardinals", ATL:"Falcons", BAL:"Ravens", BUF:"Bills", CAR:"Panthers", CHI:"Bears", CIN:"Bengals", CLE:"Browns", DAL:"Cowboys", DEN:"Broncos", DET:"Lions", GB:"Packers", HOU:"Texans", IND:"Colts", JAX:"Jaguars", KC:"Chiefs", LAC:"Chargers", LAR:"Rams", LV:"Raiders", MIA:"Dolphins", MIN:"Vikings", NE:"Patriots", NO:"Saints", NYG:"Giants", NYJ:"Jets", PHI:"Eagles", PIT:"Steelers", SEA:"Seahawks", SF:"49ers", TB:"Buccaneers", TEN:"Titans", WSH:"Commanders" },
  mlb: { ARI:"D-backs", ATL:"Braves", BAL:"Orioles", BOS:"Red Sox", CHC:"Cubs", CHW:"White Sox", CIN:"Reds", CLE:"Guardians", COL:"Rockies", DET:"Tigers", HOU:"Astros", KC:"Royals", LAA:"Angels", LAD:"Dodgers", MIA:"Marlins", MIL:"Brewers", MIN:"Twins", NYM:"Mets", NYY:"Yankees", OAK:"Athletics", PHI:"Phillies", PIT:"Pirates", SD:"Padres", SEA:"Mariners", SF:"Giants", STL:"Cardinals", TB:"Rays", TEX:"Rangers", TOR:"Blue Jays", WSH:"Nationals" },
  nba: { ATL:"Hawks", BKN:"Nets", BOS:"Celtics", CHA:"Hornets", CHI:"Bulls", CLE:"Cavaliers", DAL:"Mavericks", DEN:"Nuggets", DET:"Pistons", GS:"Warriors", HOU:"Rockets", IND:"Pacers", LAC:"Clippers", LAL:"Lakers", MEM:"Grizzlies", MIA:"Heat", MIL:"Bucks", MIN:"Timberwolves", NO:"Pelicans", NY:"Knicks", OKC:"Thunder", ORL:"Magic", PHI:"76ers", PHX:"Suns", POR:"Trail Blazers", SAC:"Kings", SA:"Spurs", TOR:"Raptors", UTAH:"Jazz", WSH:"Wizards" },
  nhl: { ANA:"Ducks", BOS:"Bruins", BUF:"Sabres", CAR:"Hurricanes", CBJ:"Blue Jackets", CGY:"Flames", CHI:"Blackhawks", COL:"Avalanche", DAL:"Stars", DET:"Red Wings", EDM:"Oilers", FLA:"Panthers", LA:"Kings", MIN:"Wild", MTL:"Canadiens", NJ:"Devils", NSH:"Predators", NYI:"Islanders", NYR:"Rangers", OTT:"Senators", PHI:"Flyers", PIT:"Penguins", SEA:"Kraken", SJ:"Sharks", STL:"Blues", TB:"Lightning", TOR:"Maple Leafs", UTAH:"Mammoth", VAN:"Canucks", VGK:"Golden Knights", WPG:"Jets", WSH:"Capitals" },
};
const teamName = (sport, abbr) => TEAM_NAMES[sport]?.[abbr] || abbr;

// ESPN team IDs (stable) — used to fetch full league rosters for the Players tab.
// The league /teams list endpoint is CORS-blocked in the browser, so IDs are hardcoded.
const ESPN_TEAM_IDS = {
  nfl: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","33","34"],
  mlb: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"],
  nba: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"],
  nhl: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","25","26","27","28","29","30","37","124292","129764"],
};

// Module-level roster cache so the Players tab only fetches once per session
const rosterCache = { nfl: null, mlb: null, nba: null, nhl: null };

async function loadFullRoster(sport, onProgress) {
  if (rosterCache[sport]) return rosterCache[sport];
  const sportPath = SPORT_PATHS[sport] || SPORT_PATHS.nfl;
  const ids = ESPN_TEAM_IDS[sport] || [];
  const players = [];
  const seen = new Set();
  let done = 0;
  for (const teamId of ids) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/roster`);
      if (r.ok) {
        const d = await r.json();
        const abbr = d.team?.abbreviation || "";
        // Grouped (NFL/MLB/NHL) vs flat (NBA) roster shapes — flatten both.
        const athletes = [];
        (d.athletes || []).forEach((entry) => {
          if (entry && Array.isArray(entry.items)) athletes.push(...entry.items);
          else if (entry && entry.displayName) athletes.push(entry);
        });
        athletes.forEach((p) => {
          const name = p.displayName;
          if (!name || seen.has(name)) return;
          seen.add(name);
          players.push({
            id: p.id || "",
            name,
            team: abbr,
            position: p.position?.abbreviation || "",
            headshot: p.headshot?.href || "",
          });
        });
      }
    } catch (e) { /* skip a failed team */ }
    done++;
    if (onProgress) onProgress(done, ids.length);
  }
  rosterCache[sport] = players;
  return players;
}


// Each badge's `ck` receives a context: { logs (rated), reviews, sports (Set),
// streak, rep, drops, mvpPicks }.
const BADGES = [
  { id: "first", n: "First Log", i: "📝", d: "Log your first game", ck: (c) => c.logs.length >= 1 },
  { id: "five", n: "Starting 5", i: "⭐", d: "Log 5 games", ck: (c) => c.logs.length >= 5 },
  { id: "ten", n: "Double Digits", i: "🔟", d: "Log 10 games", ck: (c) => c.logs.length >= 10 },
  { id: "fifty", n: "Half Century", i: "🏅", d: "Log 50 games", ck: (c) => c.logs.length >= 50 },
  { id: "hundred", n: "Centurion", i: "💯", d: "Log 100 games", ck: (c) => c.logs.length >= 100 },
  { id: "harsh", n: "Harsh Critic", i: "😤", d: "Rate a game ≤ 2", ck: (c) => c.logs.some((x) => x.rating <= 2) },
  { id: "fan", n: "True Fan", i: "❤️", d: "Give a perfect 10", ck: (c) => c.logs.some((x) => x.rating >= 10) },
  { id: "coaster", n: "Rollercoaster", i: "🎢", d: "Give both a ≤2 and a ≥9", ck: (c) => c.logs.some((x) => x.rating <= 2) && c.logs.some((x) => x.rating >= 9) },
  { id: "writer", n: "Wordsmith", i: "✍️", d: "Write 3 reviews", ck: (c) => c.reviews >= 3 },
  { id: "critic", n: "The Critic", i: "🎙️", d: "Write 15 reviews", ck: (c) => c.reviews >= 15 },
  { id: "stad", n: "Live & Loud", i: "🏟️", d: "Watch one at the stadium", ck: (c) => c.logs.some((x) => x.watchHow === "🏟️ Stadium") },
  { id: "scout", n: "Talent Scout", i: "🌟", d: "Pick 5 MVPs", ck: (c) => c.mvpPicks >= 5 },
  { id: "multi", n: "Multi-Sport", i: "🔀", d: "Rate 2+ sports", ck: (c) => c.sports.size >= 2 },
  { id: "omni", n: "Omnivore", i: "🏆", d: "Rate all 5 sports", ck: (c) => c.sports.size >= 5 },
  { id: "streak3", n: "On Fire", i: "🔥", d: "3-day rating streak", ck: (c) => c.streak >= 3 },
  { id: "streak7", n: "Unmissable", i: "📆", d: "7-day rating streak", ck: (c) => c.streak >= 7 },
  { id: "vet", n: "Respected", i: "🎯", d: "Reach Veteran reputation", ck: (c) => c.rep >= 200 },
  { id: "allstar", n: "All-Star", i: "🥇", d: "Reach All-Star reputation", ck: (c) => c.rep >= 500 },
  { id: "roller", n: "High Roller", i: "🩸", d: "Earn 250 Drops", ck: (c) => c.drops >= 250 },
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
  // Smooth gradient: red (low) → orange → yellow → lime → green (high)
  const n = Math.round(r);
  if (n <= 1) return "#7f1d1d"; // dark red
  if (n === 2) return "#dc2626"; // red
  if (n === 3) return "#f87171"; // light red
  if (n === 4) return "#fb923c"; // orange
  if (n === 5) return "#fbbf24"; // amber
  if (n === 6) return "#facc15"; // yellow
  if (n === 7) return "#a3e635"; // lime
  if (n === 8) return "#4ade80"; // green
  if (n === 9) return "#22c55e"; // bright green
  return "#15803d"; // dark green for 10
}

function RBars({ dist, onBarClick }) {
  const mx = Math.max(...dist, 1);
  const total = dist.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="flex gap-1 mb-1" style={{ height: "64px" }}>
        {dist.map((c, i) => {
          const fillPct = c > 0 ? Math.max((c / mx) * 100, 8) : 0;
          const pct = total > 0 ? Math.round((c / total) * 100) : 0;
          const clickable = c > 0 && onBarClick;
          return (
            <div
              key={i}
              className={`group flex-1 relative ${clickable ? "cursor-pointer" : "cursor-help"}`}
              onClick={() => clickable && onBarClick(i + 1)}
            >
              {/* Tooltip - sits OUTSIDE the clipped track */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-zinc-800 border border-zinc-700 text-white text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap z-30 shadow-lg">
                {c} {c === 1 ? "game" : "games"} ({pct}%){clickable && " · click"}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-700" />
              </div>
              {/* Track - clipped */}
              <div className={`absolute inset-0 bg-zinc-800/40 rounded overflow-hidden ${clickable ? "hover:ring-2 hover:ring-red-600 transition-all" : ""}`}>
                <div className="absolute bottom-0 left-0 right-0 transition-all" style={{ height: `${fillPct}%`, backgroundColor: rc(i + 1) }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {dist.map((_, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] text-zinc-500 font-bold">{i + 1}</span>
          </div>
        ))}
      </div>
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


async function fetchNflWeek(year, week) {
  try {
    const r = await fetch(`${ESPN_BASE}/${SPORT_PATHS.nfl}/scoreboard?seasontype=2&week=${week}&dates=${year}`);
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
        id: e.id, sport: "nfl", week, season: year, startISO: e.date,
        date: dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        shortDate: dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        net: c.broadcasts?.[0]?.names?.[0] || "", status: st,
        statusDetail: c.status?.type?.shortDetail || c.status?.type?.detail || "",
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

// Period count that signals overtime/extras, per date-based sport
// (MLB = 9 innings, NBA = 4 quarters, NHL = 3 periods)
const DATE_SPORT_OT = { mlb: 9, nba: 4, nhl: 3 };

// Generic calendar-date scoreboard fetch — shared by MLB / NBA / NHL.
async function fetchSportDate(sport, dateStr) {
  try {
    const sportPath = SPORT_PATHS[sport] || SPORT_PATHS.mlb;
    // dateStr is YYYY-MM-DD; ESPN wants YYYYMMDD
    const dateParam = dateStr.replace(/-/g, "");
    const r = await fetch(`${ESPN_BASE}/${sportPath}/scoreboard?dates=${dateParam}`);
    const d = await r.json();
    const otThreshold = DATE_SPORT_OT[sport] ?? 4;
    return (d.events || []).map((e) => {
      const c = e.competitions?.[0];
      if (!c) return null;
      const ts = c.competitors || [];
      const ho = ts.find((t) => t.homeAway === "home");
      const aw = ts.find((t) => t.homeAway === "away");
      if (!ho || !aw) return null;
      const dt = new Date(e.date);
      // Use ESPN's reliable lifecycle state (pre|in|post) so soccer's status names
      // (full-time, etc.) normalize to the canonical strings the UI expects.
      const state = c.status?.type?.state;
      const rawName = c.status?.type?.name || "STATUS_FINAL";
      const isPre = state ? state === "pre" : rawName === "STATUS_SCHEDULED";
      const isFinal = state ? state === "post" : rawName === "STATUS_FINAL";
      const st = state === "in" ? "STATUS_IN_PROGRESS" : state === "post" ? "STATUS_FINAL" : state === "pre" ? "STATUS_SCHEDULED" : rawName;
      const dateStrLocal = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return {
        id: e.id, sport, startISO: e.date,
        // Synthesize "week" as day-of-year so existing sort logic still works
        week: Math.floor((dt - new Date(dt.getFullYear(), 0, 0)) / 86400000),
        season: dt.getFullYear(),
        gameDate: dateStr,
        date: `${dateStrLocal} · ${timeStr}`,
        shortDate: dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        net: c.broadcasts?.[0]?.names?.[0] || "", status: st,
        statusDetail: c.status?.type?.shortDetail || c.status?.type?.detail || "",
        isPre, isFinal,
        home: { name: ho.team.displayName, abbr: ho.team.abbreviation, color: "#" + (ho.team.color || "333"), logo: ho.team.logo, record: ho.records?.[0]?.summary || "", score: parseInt(ho.score) || 0 },
        away: { name: aw.team.displayName, abbr: aw.team.abbreviation, color: "#" + (aw.team.color || "333"), logo: aw.team.logo, record: aw.records?.[0]?.summary || "", score: parseInt(aw.score) || 0 },
        ot: (ho.linescores || []).length > otThreshold,
        diff: Math.abs((parseInt(ho.score) || 0) - (parseInt(aw.score) || 0)),
        total: (parseInt(ho.score) || 0) + (parseInt(aw.score) || 0),
      };
    }).filter(Boolean);
  } catch (e) { console.error(e); return []; }
}

// Legacy alias - some old code may still call fetchWeek
const fetchWeek = fetchNflWeek;

function HomeContent() {
  const { user, profile, signOut, refreshProfile, loading: authLoading } = useAuth();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); // bumped by pull-to-refresh to re-run the games load effect
  const [sport, setSportInternal] = useState("wc"); // wc | nfl | mlb | nba | nhl | tennis
  const [week, setWeek] = useState(18);
  const [year, setYear] = useState(2024);
  // Date-based sports (MLB/NBA/NHL) use a date string YYYY-MM-DD instead of week/year
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  // Profile tab: which sport's stats to show (defaults to global sport)
  const [profileSport, setProfileSport] = useState("nfl");
  // Persist sport choice
  const setSport = (s) => {
    setSportInternal(s);
    setProfileSport(s);
    setMyTeams([]); // clear team filter - different teams per sport
    setGameStatus("all");
    if (s === "wc") setSelectedDate((d) => clampWcDate(d)); // jump into the tournament window
    try { localStorage.setItem("nb_sport", s); } catch (e) {}
  };
  useEffect(() => {
    let s = "wc";
    try {
      const saved = localStorage.getItem("nb_sport");
      if (VALID_SPORTS.includes(saved)) { s = saved; setSportInternal(saved); setProfileSport(saved); }
    } catch (e) {}
    if (s === "wc") setSelectedDate((d) => clampWcDate(d));
  }, []);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  // Onboarding: prompt new users (no favorite teams) to set up their profile
  const [onboardDismissed, setOnboardDismissed] = useState(true);
  useEffect(() => { try { setOnboardDismissed(localStorage.getItem("nb_onboard_done") === "1"); } catch (e) {} }, []);
  const dismissOnboard = () => { setOnboardDismissed(true); try { localStorage.setItem("nb_onboard_done", "1"); } catch (e) {} };
  // Notifications: new ratings from people you follow since your last visit
  const [notifs, setNotifs] = useState([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "games";
  const [tab, setTabInternal] = useState(initialTab);
  const setTab = (newTab) => {
    setTabInternal(newTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", newTab);
    window.history.replaceState({}, "", url.toString());
  };
  const [myTeams, setMyTeams] = useState([]);
  const [showTeams, setShowTeams] = useState(false);
  const [gameStatus, setGameStatus] = useState("all"); // all | upcoming | live | finished
  const [logs, setLogs] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [myPredictions, setMyPredictions] = useState([]);
  const [likesReceived, setLikesReceived] = useState(0); // reactions on this user's comments (Drops + Rep)
  const [commentsPosted, setCommentsPosted] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [buyingDrops, setBuyingDrops] = useState(null);  // pack id currently being purchased
  const [lists, setLists] = useState([]);
  const [listGames, setListGames] = useState({});
  const [selectedListId, setSelectedListId] = useState(null);
  const [showNewList, setShowNewList] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editHandle, setEditHandle] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  // Favorite team per sport while editing: { nfl, mlb, nba, nhl } → abbr
  const [editTeams, setEditTeams] = useState({});
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [latestRecap, setLatestRecap] = useState(null); // { season, week } of most recent week with ratings
  const [barDrilldown, setBarDrilldown] = useState(null); // { rating: int, games: [] }
  const [wrappedSeason, setWrappedSeason] = useState("all"); // Season Wrapped drill-in
  const [handleError, setHandleError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [followed, setFollowed] = useState([]);
  const [topRaters, setTopRaters] = useState([]);
  const [hotGames, setHotGames] = useState([]);
  const [topRatedGames, setTopRatedGames] = useState([]);
  const [divisiveGames, setDivisiveGames] = useState([]);
  const [communityLists, setCommunityLists] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [playersList, setPlayersList] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [rosterProgress, setRosterProgress] = useState(0);
  const [following, setFollowing] = useState([]);
  const [friendsFeed, setFriendsFeed] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState([]);

  // Direct REST helper with JWT auto-refresh
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
    // If JWT expired (401), try to refresh once and retry
    if (res.status === 401 && !retried && session?.refresh_token) {
      try {
        const refreshRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (refreshRes.ok) {
          const newSession = await refreshRes.json();
          // Merge new tokens into stored session
          const merged = { ...session, ...newSession };
          localStorage.setItem(tokenKey, JSON.stringify(merged));
          return sbFetch(path, options, true);
        } else {
          // Refresh failed - session truly dead, send to login
          console.warn("Session refresh failed, redirecting to login");
        }
      } catch (e) { console.error("Refresh error:", e); }
    }
    return res;
  };

  // Array-safe JSON parse - returns [] for error responses
  const sbJson = async (res) => {
    try {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  };

  const weeks = [18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const years = [2024, 2023, 2022, 2021, 2020];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (sport === "nfl") {
        const data = await fetchNflWeek(year, week);
        if (cancelled) return;
        setGames((prev) => [...prev.filter((g) => !(g.sport === "nfl" && g.week === week && g.season === year)), ...data]);
      } else if (sport === "tennis") {
        const data = await fetchTennisMatches(selectedDate);
        if (cancelled) return;
        setGames((prev) => [...prev.filter((g) => !(g.sport === "tennis" && g.gameDate === selectedDate)), ...data]);
      } else {
        // MLB / NBA / NHL — calendar-date based
        const data = await fetchSportDate(sport, selectedDate);
        if (cancelled) return;
        setGames((prev) => [...prev.filter((g) => !(g.sport === sport && g.gameDate === selectedDate)), ...data]);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [sport, week, year, selectedDate, refreshKey]);

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && urlTab !== tab) setTab(urlTab);
  }, [searchParams]);

  // If user lands on profile tab without being logged in, redirect to /login
  useEffect(() => {
    if (tab === "profile" && !authLoading && user === null) {
      router.push("/login");
    }
    // The profile stats are per-sport; "wc" only exists on the diary, so reset it here.
    if (tab === "profile" && profileSport === "wc") setProfileSport("nfl");
  }, [tab, user, authLoading, profileSport]);

  // Load the user's predictions for the profile picks section
  useEffect(() => {
    if (tab !== "profile" || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await sbFetch(`predictions?user_id=eq.${user.id}&mode=eq.pickem&order=created_at.desc&select=*`);
        const data = await sbJson(res);
        if (!cancelled) setMyPredictions(data);
      } catch (e) { console.error("Profile predictions:", e); }
    })();
    return () => { cancelled = true; };
  }, [tab, user]);

  // Reputation/Drops inputs: comments posted, reactions received, followers
  useEffect(() => {
    if (tab !== "profile" || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const cRes = await sbFetch(`comments?user_id=eq.${user.id}&select=id`);
        const myComments = await sbJson(cRes);
        const ids = myComments.map((c) => c.id);
        if (!cancelled) setCommentsPosted(ids.length);
        if (ids.length > 0) {
          const rRes = await sbFetch(`comment_reactions?comment_id=in.(${ids.join(",")})&select=user_id`);
          const reacts = await sbJson(rRes);
          if (!cancelled) setLikesReceived(reacts.filter((r) => r.user_id !== user.id).length);
        } else if (!cancelled) setLikesReceived(0);
        const fRes = await sbFetch(`follows?following_id=eq.${user.id}&select=follower_id`);
        const followers = await sbJson(fRes);
        if (!cancelled) setFollowerCount(followers.length);
      } catch (e) { /* leave at defaults */ }
    })();
    return () => { cancelled = true; };
  }, [tab, user]);

  // Build the per-sport favorite-team map from a profile row
  const teamsFromProfile = (p) => Object.fromEntries(FAV_SPORTS.map((s) => [s.id, p?.[favKey(s.id)] || ""]));

  useEffect(() => {
    if (profile) {
      setEditHandle(profile.handle || "");
      setEditDisplayName(profile.display_name || "");
      setEditBio(profile.bio || "");
      setEditTeams(teamsFromProfile(profile));
      setEditAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  // Re-sync form fields each time the modal opens (in case profile changed)
  useEffect(() => {
    if (showEditProfile && profile) {
      setEditHandle(profile.handle || "");
      setEditDisplayName(profile.display_name || "");
      setEditBio(profile.bio || "");
      setEditTeams(teamsFromProfile(profile));
      setEditAvatarUrl(profile.avatar_url || "");
      setAvatarPreview(null);
      setHandleError("");
    }
  }, [showEditProfile]);

  // Upload a chosen image: resize via canvas, upload to Supabase Storage, save URL
  const uploadAvatar = async (file) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      setHandleError("Only images allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setHandleError("Image too big (max 5MB)");
      return;
    }
    setAvatarUploading(true);
    setHandleError("");
    try {
      // Resize to max 256x256 via canvas
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = URL.createObjectURL(file);
      });
      const maxSide = 256;
      const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));

      // Upload to Storage. Path: {user_id}/avatar-{timestamp}.jpg (timestamp busts cache)
      const tokenKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
      const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
      const token = session?.access_token;
      const fileName = `${user.id}/avatar-${Date.now()}.jpg`;
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/avatars/${fileName}`, {
        method: "POST",
        headers: {
          "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
        },
        body: blob,
      });
      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        setHandleError(`Upload failed: ${t.substring(0, 100)}`);
        setAvatarUploading(false);
        return;
      }
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${fileName}`;
      setEditAvatarUrl(publicUrl);
      setAvatarPreview(publicUrl);
      setHandleError("✓ Photo uploaded — click Save to apply");
    } catch (e) {
      setHandleError(`Upload error: ${e.message}`);
    }
    setAvatarUploading(false);
  };

  const clearAvatar = () => {
    setEditAvatarUrl("");
    setAvatarPreview(null);
    setHandleError("Photo cleared — click Save to apply");
  };

  // Load all of the user's ratings from Supabase whenever user changes OR tab is visited
  useEffect(() => {
    async function loadRatings() {
      if (!user) { setLogs([]); return; }
      try {
        const res = await sbFetch(`ratings?user_id=eq.${user.id}&select=*`);
        const data = await sbJson(res);
        if (data) {
          const mapped = data.map(r => ({
            gameId: r.game_id,
            sport: r.sport || "nfl",
            awayTeam: r.away_team || "",
            homeTeam: r.home_team || "",
            awayScore: r.away_score || 0,
            homeScore: r.home_score || 0,
            favorited: r.favorited || false,
            pinned: r.pinned || false,
            rating: parseFloat(r.rating) || 0,
            refRating: parseFloat(r.ref_rating) || 5,
            entRating: parseFloat(r.ent_rating) || 7,
            mvp: r.mvp || "",
            letdown: r.letdown || "",
            watchHow: r.watch_how || "",
            worthIt: r.worth_it || "",
            review: r.review || "",
            week: r.week || 0,
            season: r.season || 0,
            gameDate: r.game_date || "",
            createdAt: r.created_at || "",
          }));
          setLogs(mapped);
          setPinned(mapped.filter(l => l.pinned).map(l => l.gameId));
        }
      } catch (e) { console.error("Load ratings exception:", e); }
    }
    async function loadLists() {
      if (!user) { setLists([]); setListGames({}); return; }
      try {
        const lRes = await sbFetch(`lists?user_id=eq.${user.id}&order=created_at.asc&select=*`);
        const listData = await sbJson(lRes);
        if (listData) setLists(listData);
        const gRes = await sbFetch(`list_games?user_id=eq.${user.id}&select=*`);
        const gameData = await sbJson(gRes);
        if (gameData) {
          const byList = {};
          gameData.forEach(lg => {
            if (!byList[lg.list_id]) byList[lg.list_id] = [];
            byList[lg.list_id].push(lg);
          });
          setListGames(byList);
        }
      } catch (e) { console.error("Load lists:", e); }
    }
    loadRatings();
    loadLists();
  }, [user, tab]);

  // Load Discover tab data from real users
  useEffect(() => {
    if (tab !== "discover") return;
    let cancelled = false;
    async function loadDiscover() {
      setDiscoverLoading(true);
      try {
        const arRes = await sbFetch(`ratings?public=eq.true&rating=not.is.null&sport=eq.${sport}&select=user_id,game_id,rating,review,away_team,home_team,away_score,home_score,week,season,created_at,sport`);
        const allRatings = await sbJson(arRes);
        if (cancelled) return;

        if (allRatings && allRatings.length > 0) {
          // Top Raters by rating count
          const byUser = {};
          allRatings.forEach(r => {
            if (!byUser[r.user_id]) byUser[r.user_id] = { count: 0, sum: 0, reviews: 0 };
            byUser[r.user_id].count++;
            byUser[r.user_id].sum += parseFloat(r.rating);
            if (r.review) byUser[r.user_id].reviews++;
          });
          const raterIds = Object.keys(byUser);
          let profiles = [];
          if (raterIds.length > 0) {
            const pRes = await sbFetch(`profiles?user_id=in.(${raterIds.join(",")})&select=user_id,handle,display_name,avatar_url`);
            profiles = await sbJson(pRes);
          }
          if (cancelled) return;
          const profMap = {};
          profiles.forEach(p => { profMap[p.user_id] = p; });
          const raters = raterIds.map(uid => ({
            user_id: uid,
            profile: profMap[uid],
            count: byUser[uid].count,
            reviews: byUser[uid].reviews,
            avg: (byUser[uid].sum / byUser[uid].count).toFixed(1),
          })).sort((a, b) => b.count - a.count).slice(0, 10);
          setTopRaters(raters);

          // Hot Games this Week
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const recent = allRatings.filter(r => r.created_at >= weekAgo);
          const byGameRecent = {};
          recent.forEach(r => {
            if (!byGameRecent[r.game_id]) byGameRecent[r.game_id] = { count: 0, sum: 0, sample: r };
            byGameRecent[r.game_id].count++;
            byGameRecent[r.game_id].sum += parseFloat(r.rating);
          });
          setHotGames(Object.entries(byGameRecent).map(([gid, d]) => ({
            game_id: gid, count: d.count, avg: (d.sum / d.count).toFixed(1), sample: d.sample,
          })).sort((a, b) => b.count - a.count).slice(0, 5));

          // Highest Rated Of All Time + Most Divisive (rating spread)
          const byGameAll = {};
          allRatings.forEach(r => {
            if (!byGameAll[r.game_id]) byGameAll[r.game_id] = { count: 0, sum: 0, vals: [], sample: r };
            byGameAll[r.game_id].count++;
            byGameAll[r.game_id].sum += parseFloat(r.rating);
            byGameAll[r.game_id].vals.push(parseFloat(r.rating));
          });
          setTopRatedGames(Object.entries(byGameAll).map(([gid, d]) => ({
            game_id: gid, count: d.count, avg: (d.sum / d.count).toFixed(1), sample: d.sample,
          })).sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg)).slice(0, 5));

          // Most Divisive — highest standard deviation among games with 3+ raters
          const stdev = (vals, mean) => Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
          setDivisiveGames(Object.entries(byGameAll)
            .filter(([, d]) => d.count >= 3)
            .map(([gid, d]) => { const avg = d.sum / d.count; return { game_id: gid, count: d.count, avg: avg.toFixed(1), spread: stdev(d.vals, avg), sample: d.sample }; })
            .sort((a, b) => b.spread - a.spread)
            .slice(0, 5));
        } else {
          setDivisiveGames([]);
        }

        // Community Lists
        const alRes = await sbFetch(`lists?order=created_at.desc&limit=30&select=id,name,icon,user_id,created_at`);
        const allLists = await sbJson(alRes);
        if (cancelled) return;
        if (allLists && allLists.length > 0) {
          const listIds = allLists.map(l => l.id);
          const lgRes = await sbFetch(`list_games?list_id=in.(${listIds.join(",")})&select=list_id`);
          const listGameRows = await sbJson(lgRes);
          const userIdsL = [...new Set(allLists.map(l => l.user_id))];
          const lpRes = await sbFetch(`profiles?user_id=in.(${userIdsL.join(",")})&select=user_id,handle,display_name`);
          const lProfiles = await sbJson(lpRes);
          const lProfMap = {};
          (lProfiles || []).forEach(p => { lProfMap[p.user_id] = p; });
          const countByList = {};
          (listGameRows || []).forEach(lg => { countByList[lg.list_id] = (countByList[lg.list_id] || 0) + 1; });
          setCommunityLists(allLists
            .map(l => ({ ...l, gameCount: countByList[l.id] || 0, profile: lProfMap[l.user_id] }))
            .filter(l => l.gameCount > 0)
            .sort((a, b) => b.gameCount - a.gameCount)
            .slice(0, 10));
        }
      } catch (e) { console.error("Discover load:", e); }
      if (!cancelled) setDiscoverLoading(false);
    }
    loadDiscover();
    return () => { cancelled = true; };
  }, [tab, sport]);

  // Load players list — full league roster merged with community MVP/Letdown picks
  useEffect(() => {
    if (tab !== "players") return;
    let cancelled = false;
    async function loadPlayers() {
      setPlayersLoading(true);
      setRosterProgress(rosterCache[sport] ? 100 : 0);
      try {
        // 1. Community picks from Supabase
        const res = await sbFetch(`ratings?public=eq.true&sport=eq.${sport}&or=(mvp.not.is.null,letdown.not.is.null)&select=mvp,letdown,rating,game_id`);
        const rows = await sbJson(res);
        if (cancelled) return;
        const picks = {};
        rows.forEach(r => {
          if (r.mvp) {
            const p = picks[r.mvp] || (picks[r.mvp] = { mvp: 0, letdown: 0, games: new Set(), ratingSum: 0, ratingN: 0 });
            p.mvp++;
            if (r.game_id) p.games.add(r.game_id);
            if (r.rating != null) { p.ratingSum += parseFloat(r.rating); p.ratingN++; }
          }
          if (r.letdown) {
            const p = picks[r.letdown] || (picks[r.letdown] = { mvp: 0, letdown: 0, games: new Set(), ratingSum: 0, ratingN: 0 });
            p.letdown++;
            if (r.game_id) p.games.add(r.game_id);
          }
        });

        // 2. Full league roster (cached after first load)
        const roster = await loadFullRoster(sport, (done, total) => {
          if (!cancelled) setRosterProgress(Math.round((done / total) * 100));
        });
        if (cancelled) return;

        // 3. Merge — roster players, enriched with any community pick data
        const rosterNames = new Set(roster.map(p => p.name));
        const merged = roster.map(p => {
          const pk = picks[p.name];
          const total = pk ? pk.mvp + pk.letdown : 0;
          return {
            name: p.name,
            team: p.team,
            position: p.position,
            headshot: p.headshot,
            mvp: pk?.mvp || 0,
            letdown: pk?.letdown || 0,
            total,
            gameCount: pk ? pk.games.size : 0,
            mvpRate: total > 0 ? Math.round((pk.mvp / total) * 100) : 0,
            hasPicks: total > 0,
          };
        });
        // Any picked players NOT on a current roster (traded, retired, name variant) — keep them too
        Object.keys(picks).forEach(name => {
          if (!rosterNames.has(name)) {
            const pk = picks[name];
            const total = pk.mvp + pk.letdown;
            merged.push({
              name, team: "", position: "", headshot: "",
              mvp: pk.mvp, letdown: pk.letdown, total,
              gameCount: pk.games.size,
              mvpRate: total > 0 ? Math.round((pk.mvp / total) * 100) : 0,
              hasPicks: total > 0,
            });
          }
        });
        // Sort: picked players first (by activity), then the rest alphabetically
        merged.sort((a, b) => {
          if (a.hasPicks !== b.hasPicks) return a.hasPicks ? -1 : 1;
          if (a.hasPicks) return b.total - a.total || b.mvp - a.mvp;
          return a.name.localeCompare(b.name);
        });
        if (!cancelled) setPlayersList(merged);
      } catch (e) { console.error("Players load:", e); }
      if (!cancelled) setPlayersLoading(false);
    }
    loadPlayers();
    return () => { cancelled = true; };
  }, [tab, sport]);

  // Compute the latest (season, week) with any ratings - for the recap banner
  useEffect(() => {
    let cancelled = false;
    async function loadLatest() {
      try {
        // Only NFL ratings — recaps are NFL-week-based; MLB recaps are a separate (future) feature
        const res = await sbFetch(`ratings?public=eq.true&rating=not.is.null&sport=eq.nfl&order=created_at.desc&limit=50&select=season,week`);
        const data = await sbJson(res);
        if (cancelled || data.length === 0) return;
        // NFL weeks are 1-18; guard against any bad data
        const valid = data.filter(r => r.season > 0 && r.week >= 1 && r.week <= 18);
        if (valid.length === 0) return;
        const maxSeason = Math.max(...valid.map(r => r.season));
        const inSeason = valid.filter(r => r.season === maxSeason);
        const maxWeek = Math.max(...inSeason.map(r => r.week));
        setLatestRecap({ season: maxSeason, week: maxWeek });
      } catch (e) {}
    }
    loadLatest();
    return () => { cancelled = true; };
  }, []);

  // Load my "following" list whenever user changes
  useEffect(() => {
    if (!user) { setFollowing([]); return; }
    let cancelled = false;
    async function loadFollowing() {
      try {
        const r = await sbFetch(`follows?follower_id=eq.${user.id}&select=following_id`);
        const data = await sbJson(r);
        if (cancelled) return;
        if (data) setFollowing(data.map(f => f.following_id));
      } catch (e) { console.error("Following:", e); }
    }
    loadFollowing();
    return () => { cancelled = true; };
  }, [user]);

  // Notifications — recent ratings from people you follow. Polls while the app
  // is open and fires a native browser notification for genuinely-new activity
  // (if the user opted in). Background push when the app is CLOSED needs server
  // infra (VAPID keys) — see notes.
  useEffect(() => {
    if (!user) { setNotifs([]); setNotifUnread(0); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const items = [];
        const profileIds = new Set();

        // 1) Ratings from people you follow
        if (following.length > 0) {
          const rows = await sbJson(await sbFetch(`ratings?user_id=in.(${following.join(",")})&public=eq.true&rating=not.is.null&order=created_at.desc&limit=20&select=id,user_id,game_id,sport,away_team,home_team,away_score,home_score,rating,created_at,game_date`));
          rows.forEach((x) => { items.push({ type: "rating", id: "r-" + x.id, actor: x.user_id, created_at: x.created_at, data: x }); profileIds.add(x.user_id); });
        }
        if (cancelled) return;

        // 2) New followers
        const fr = await sbJson(await sbFetch(`follows?following_id=eq.${user.id}&order=created_at.desc&limit=20&select=id,follower_id,created_at`));
        fr.forEach((f) => { items.push({ type: "follow", id: "f-" + f.id, actor: f.follower_id, created_at: f.created_at, data: f }); profileIds.add(f.follower_id); });
        if (cancelled) return;

        // 3) Reactions on your comments
        const myComments = await sbJson(await sbFetch(`comments?user_id=eq.${user.id}&select=id`));
        const myCommentIds = myComments.map((c) => c.id);
        if (myCommentIds.length > 0) {
          const rx = await sbJson(await sbFetch(`comment_reactions?comment_id=in.(${myCommentIds.join(",")})&order=created_at.desc&limit=20&select=id,comment_id,user_id,emoji,created_at`));
          rx.filter((x) => x.user_id !== user.id).forEach((x) => { items.push({ type: "reaction", id: "x-" + x.id, actor: x.user_id, created_at: x.created_at, data: x }); profileIds.add(x.user_id); });
        }
        if (cancelled) return;

        let profs = [];
        if (profileIds.size) profs = await sbJson(await sbFetch(`profiles?user_id=in.(${[...profileIds].join(",")})&select=user_id,handle,display_name,avatar_url`));
        const pmap = {};
        profs.forEach((p) => { pmap[p.user_id] = p; });
        if (cancelled) return;

        const merged = items
          .map((it) => ({ ...it, profile: pmap[it.actor] }))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 30);
        setNotifs(merged);

        let seen = "";
        try { seen = localStorage.getItem("nb_notif_seen") || ""; } catch (e) {}
        setNotifUnread(merged.filter((x) => !seen || x.created_at > seen).length);

        // Fire an OS notification for new activity since we last fired (opt-in)
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          let firedAt = "";
          try { firedAt = localStorage.getItem("nb_notif_fired") || ""; } catch (e) {}
          const fresh = merged.filter((x) => x.created_at > firedAt);
          if (firedAt && fresh.length > 0) {
            const top = fresh[0];
            const who = top.profile?.display_name || (top.profile?.handle ? `@${top.profile.handle}` : "Someone");
            const body = top.type === "follow" ? `${who} followed you`
              : top.type === "reaction" ? `${who} reacted ${top.data.emoji} to your comment`
              : `${who} rated ${top.data.away_team}–${top.data.home_team}`;
            try { new Notification("🩸 The Nosebleeds", { body: fresh.length === 1 ? body : `${fresh.length} new notifications`, tag: "nb-activity" }); } catch (e) {}
          }
          if (merged[0]) { try { localStorage.setItem("nb_notif_fired", merged[0].created_at); } catch (e) {} }
        }
      } catch (e) { console.error("Notifications:", e); }
    };
    load();
    const timer = setInterval(load, 90000); // poll every 90s while open
    return () => { cancelled = true; clearInterval(timer); };
  }, [user, following]);

  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const enableNotifs = async () => {
    if (typeof Notification === "undefined") return;
    try { const p = await Notification.requestPermission(); setNotifPerm(p); } catch (e) {}
  };

  const openNotifs = () => {
    setShowNotifs(true);
    setNotifUnread(0);
    try { localStorage.setItem("nb_notif_seen", new Date().toISOString()); } catch (e) {}
  };

  // Load Friends tab data
  useEffect(() => {
    if (tab !== "friends" || !user) return;
    let cancelled = false;
    async function loadFriends() {
      setFriendsLoading(true);
      try {
        // Followings
        const fRes = await sbFetch(`follows?follower_id=eq.${user.id}&select=following_id`);
        const follows = await sbJson(fRes);
        const followingIds = (follows || []).map(f => f.following_id);
        if (cancelled) return;

        if (followingIds.length > 0) {
          // Get recent ratings from followed users
          const frRes = await sbFetch(`ratings?user_id=in.(${followingIds.join(",")})&public=eq.true&rating=not.is.null&sport=eq.${sport}&order=created_at.desc&limit=50&select=*`);
          const feedRatings = await sbJson(frRes);
          if (cancelled) return;
          if (feedRatings && feedRatings.length > 0) {
            const userIds = [...new Set(feedRatings.map(r => r.user_id))];
            let profiles = [];
            if (userIds.length > 0) {
              const fpRes = await sbFetch(`profiles?user_id=in.(${userIds.join(",")})&select=user_id,handle,display_name,avatar_url`);
              profiles = await sbJson(fpRes);
            }
            const pmap = {};
            profiles.forEach(p => { pmap[p.user_id] = p; });
            setFriendsFeed(feedRatings.map(r => ({ ...r, profile: pmap[r.user_id] })));
          } else {
            setFriendsFeed([]);
          }
        } else {
          setFriendsFeed([]);
        }

        // Suggested users: top raters that I don't follow yet (and not me)
        const arRes2 = await sbFetch(`ratings?public=eq.true&rating=not.is.null&select=user_id`);
        const allRatings = await sbJson(arRes2);
        if (cancelled) return;
        if (allRatings.length > 0) {
          const counts = {};
          allRatings.forEach(r => {
            if (r.user_id !== user.id && !followingIds.includes(r.user_id)) {
              counts[r.user_id] = (counts[r.user_id] || 0) + 1;
            }
          });
          const sugIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([uid]) => uid);
          if (sugIds.length > 0) {
            const spRes = await sbFetch(`profiles?user_id=in.(${sugIds.join(",")})&select=user_id,handle,display_name,avatar_url`);
            const sugProfiles = await sbJson(spRes);
            const psug = {};
            sugProfiles.forEach(p => { psug[p.user_id] = p; });
            setSuggestedUsers(sugIds.map(uid => ({ user_id: uid, profile: psug[uid], count: counts[uid] })).filter(s => s.profile));
          } else {
            setSuggestedUsers([]);
          }
        }
      } catch (e) { console.error("Friends:", e); }
      if (!cancelled) setFriendsLoading(false);
    }
    loadFriends();
    return () => { cancelled = true; };
  }, [tab, user, sport]);

  const toggleFollow = async (targetUserId) => {
    if (!user) { router.push("/login"); return; }
    if (targetUserId === user.id) return;
    const isFollowing = following.includes(targetUserId);
    try {
      if (isFollowing) {
        await sbFetch(`follows?follower_id=eq.${user.id}&following_id=eq.${targetUserId}`, { method: "DELETE" });
        setFollowing(following.filter(id => id !== targetUserId));
      } else {
        await sbFetch(`follows`, { method: "POST", body: JSON.stringify({ follower_id: user.id, following_id: targetUserId }) });
        setFollowing([...following, targetUserId]);
      }
    } catch (e) { console.error("Follow toggle:", e); }
  };

  // Game-detail href that carries sport so the page hits the right ESPN endpoint
  const gh = (gameId, gameSport) => gameHref(gameId, gameSport || sport);

  // Is this game in the currently-selected scope (NFL week/season, or a date)?
  // Sports with favorite-team filters / rosters (NFL/MLB/NBA/NHL). Tennis & World
  // Cup are team-less for the purpose of the team chips and the Players browser.
  const hasTeams = !!SPORTS.find((s) => s.id === sport)?.team;

  const inCurrentScope = (x) => sport === "nfl"
    ? (x.sport === "nfl" && x.week === week && x.season === year)
    : (x.sport === sport && x.gameDate === selectedDate);

  const filtered = useMemo(() => {
    let g = games.filter(inCurrentScope);
    if (search) {
      const s = search.toLowerCase();
      g = g.filter((x) => x.sport === "tennis"
        ? `${x.p1?.name || ""} ${x.p2?.name || ""}`.toLowerCase().includes(s)
        : (x.away.name.toLowerCase().includes(s) || x.home.name.toLowerCase().includes(s) || x.away.abbr.toLowerCase().includes(s) || x.home.abbr.toLowerCase().includes(s)));
    }
    if (myTeams.length > 0) g = g.filter((x) => x.sport === "tennis" ? true : (myTeams.includes(x.away.abbr) || myTeams.includes(x.home.abbr)));
    if (gameStatus === "upcoming") g = g.filter((x) => x.status === "STATUS_SCHEDULED");
    else if (gameStatus === "live") g = g.filter((x) => x.status === "STATUS_IN_PROGRESS" || x.status === "STATUS_HALFTIME" || x.status === "STATUS_END_PERIOD" || x.status === "STATUS_END_OF_INNING");
    else if (gameStatus === "finished") g = g.filter((x) => x.status === "STATUS_FINAL");
    if (sort === "score") g = [...g].sort((a, b) => b.total - a.total);
    else if (sort === "close") g = [...g].sort((a, b) => a.diff - b.diff);
    return g;
  }, [games, sport, week, year, selectedDate, search, sort, myTeams, gameStatus]);

  // Counts for status pills
  const statusCounts = useMemo(() => {
    const inScope = games.filter(inCurrentScope);
    return {
      all: inScope.length,
      upcoming: inScope.filter(g => g.status === "STATUS_SCHEDULED").length,
      live: inScope.filter(g => g.status === "STATUS_IN_PROGRESS" || g.status === "STATUS_HALFTIME" || g.status === "STATUS_END_PERIOD" || g.status === "STATUS_END_OF_INNING").length,
      finished: inScope.filter(g => g.status === "STATUS_FINAL").length,
    };
  }, [games, sport, week, year, selectedDate]);

  const ratedLogs = logs.filter(l => l.rating > 0);
  // Sport-filtered logs for the Profile tab (default 'nfl' for rows without sport set)
  const sportLogs = logs.filter(l => (l.sport || "nfl") === profileSport);
  const sportRatedLogs = sportLogs.filter(l => l.rating > 0);

  const gl = (id) => logs.find((l) => l.gameId === id);
  // For diary: show all rated games even if not in current games list
  const diaryEntries = [...logs].sort((a, b) => (b.week || 0) - (a.week || 0));

  // Quick-rate from a game card: upsert the rating and update local logs.
  const quickRate = async (g, rating) => {
    if (!user) { router.push("/login"); return; }
    const existing = gl(g.id);
    const base = {
      game_id: g.id, user_id: user.id, sport: g.sport,
      away_team: g.away.abbr, home_team: g.home.abbr,
      away_score: g.away.score, home_score: g.home.score,
      season: g.season, week: g.week,
      game_date: g.gameDate || null,
      rating,
    };
    try {
      const rows = await sbJson(await sbFetch(`ratings?game_id=eq.${g.id}&user_id=eq.${user.id}&select=id`));
      if (rows.length > 0) {
        await sbFetch(`ratings?id=eq.${rows[0].id}`, { method: "PATCH", body: JSON.stringify({ rating }) });
      } else {
        await sbFetch(`ratings`, { method: "POST", body: JSON.stringify(base) });
      }
      // Update local logs so the card + diary reflect it immediately
      setLogs((prev) => {
        if (prev.some((l) => l.gameId === g.id)) {
          return prev.map((l) => l.gameId === g.id ? { ...l, rating } : l);
        }
        return [...prev, {
          gameId: g.id, sport: g.sport, awayTeam: g.away.abbr, homeTeam: g.home.abbr,
          awayScore: g.away.score, homeScore: g.home.score, favorited: false, pinned: false,
          rating, refRating: 5, entRating: 7, mvp: "", letdown: "", watchHow: "", worthIt: "",
          review: "", week: g.week || 0, season: g.season || 0, gameDate: g.gameDate || "",
          createdAt: new Date().toISOString(),
        }];
      });
    } catch (e) { console.error("Quick rate:", e); }
  };

  // 🩸 Drops currency — earned from activity, spent on unlocked emote packs.
  // `unlocked` only exists once the migration has run; absence = store dormant.
  const dropsUnlocked = profile?.unlocked || [];
  const dropsStoreReady = !!profile && "unlocked" in profile;
  const reviewCount = logs.filter((l) => l.review).length;
  const dropsEarnedTotal = dropsEarned({ ratings: ratedLogs.length, reviews: reviewCount, likes: likesReceived });
  const dropsBalance = dropsEarnedTotal - dropsSpent(dropsUnlocked);

  // Reputation (derived standing). Tier shown on profile + as comment flair.
  const myRep = repScore({ ratings: ratedLogs.length, reviews: reviewCount, comments: commentsPosted, likes: likesReceived, followers: followerCount });
  const myTier = repTier(myRep);
  const myNextTier = nextTier(myRep);

  // Daily rating streak — consecutive days (ending today or yesterday) with a rating
  const ratingStreak = (() => {
    const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const days = new Set(ratedLogs.map((l) => (l.createdAt || "").slice(0, 10)).filter(Boolean));
    if (days.size === 0) return 0;
    const cur = new Date();
    let streak = 0;
    if (!days.has(ymd(cur))) { cur.setDate(cur.getDate() - 1); if (!days.has(ymd(cur))) return 0; }
    while (days.has(ymd(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
    return streak;
  })();

  // Achievements — earned badges, computed from a rich activity context
  const badgeCtx = {
    logs: ratedLogs,
    reviews: reviewCount,
    sports: new Set(ratedLogs.map((l) => l.sport || "nfl")),
    streak: ratingStreak,
    rep: myRep,
    drops: dropsEarnedTotal,
    mvpPicks: ratedLogs.filter((l) => l.mvp).length,
  };
  const earned = BADGES.filter((b) => b.ck(badgeCtx));

  // "On This Day" — your own ratings logged on this calendar date in past years
  const onThisDay = (() => {
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return ratedLogs
      .filter((l) => l.createdAt && l.createdAt.slice(5, 10) === mmdd && new Date(l.createdAt).getFullYear() < now.getFullYear())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  })();

  const buyPack = async (pack) => {
    if (!user) { router.push("/login"); return; }
    if (!dropsStoreReady || dropsUnlocked.includes(pack.id) || dropsBalance < pack.cost) return;
    setBuyingDrops(pack.id);
    try {
      const res = await sbFetch(`profiles?user_id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ unlocked: [...dropsUnlocked, pack.id] }),
      });
      if (res.ok) await refreshProfile();
    } catch (e) { console.error("buyPack:", e); }
    setBuyingDrops(null);
  };

  return (
    <div className="min-h-screen pb-24">
      {sport === "wc" && <WcBackdrop />}
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b border-zinc-800 ${sport === "wc" ? "bg-[#09090b]/70" : "bg-[#09090b]/90"}`}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-extrabold text-white">
            <span className="text-red-600">🩸</span> The Nosebleeds
          </h1>
          <div className="flex items-center gap-2">
            {/* Notifications bell */}
            {user && (
              <button onClick={openNotifs} className="relative w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm hover:border-zinc-600 transition-colors shrink-0">
                🔔
                {notifUnread > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">{notifUnread > 9 ? "9+" : notifUnread}</span>}
              </button>
            )}
            {/* Sport switcher - hidden on Diary/Profile which have their own profileSport toggle */}
            {tab !== "diary" && tab !== "profile" && (
              <div className="flex gap-0.5 p-0.5 rounded-full bg-zinc-900 border border-zinc-800">
                {SPORTS.map((s) => (
                  <button key={s.id} onClick={() => setSport(s.id)}
                    className={`px-2 sm:px-3 py-1 rounded-full text-xs font-bold transition-all ${sport === s.id ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"}`}>
                    {s.emoji}<span className="hidden sm:inline ml-1">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-3">
        {/* Fantasy World Cup promo — flagship games hub */}
        {(tab === "games" || tab === "discover") && (
          <button
            onClick={() => router.push("/worldcup")}
            className="w-full text-left rounded-2xl p-4 mb-3 bg-gradient-to-r from-red-700 via-red-800 to-zinc-900 border border-red-500/40 flex items-center gap-3 active:scale-[0.99] transition-transform"
          >
            <div className="text-3xl">🏆</div>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-white">Fantasy World Cup 2026 is here</div>
              <div className="text-[11px] text-red-100/80 mt-0.5">Draft nations or players, run a live auction, build a salary-cap XI, rank all 48 — and climb leaderboards with friends.</div>
            </div>
            <div className="text-white text-xl">›</div>
          </button>
        )}
        {/* Onboarding — nudge new users to pick favorite teams */}
        {tab === "games" && user && profile && !onboardDismissed && !FAV_SPORTS.some((s) => profile[favKey(s.id)]) && (
          <div className="rounded-2xl p-4 mb-3 bg-gradient-to-br from-red-900/50 via-zinc-900 to-zinc-900 border border-red-600/30">
            <div className="flex items-start gap-3">
              <div className="text-2xl">👋</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">Welcome to The Nosebleeds!</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Pick your favorite teams to personalize your feed and unlock fandom filters.</div>
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => { setTab("profile"); setShowEditProfile(true); }} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">Set up profile →</button>
                  <button onClick={dismissOnboard} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-bold">Maybe later</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* On This Day — your ratings from this date in past years */}
        {tab === "games" && onThisDay.length > 0 && (
          <div className="rounded-2xl p-3 mb-3 bg-zinc-900 border border-zinc-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📆</span>
              <span className="text-sm font-bold text-white">On This Day</span>
            </div>
            <div className="space-y-1.5">
              {onThisDay.slice(0, 3).map((l) => {
                const yrsAgo = new Date().getFullYear() - new Date(l.createdAt).getFullYear();
                return (
                  <Link key={l.gameId} href={gameHref(l.gameId, l.sport, l.gameDate)} className="flex items-center gap-2.5 p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 transition-colors">
                    <span className="w-9 h-9 flex items-center justify-center rounded-lg text-white font-extrabold text-sm shrink-0" style={{ backgroundColor: rc(l.rating) }}>{l.rating}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{l.awayTeam} {l.awayScore} — {l.homeTeam} {l.homeScore}</div>
                      <div className="text-[10px] text-zinc-500">{sportEmoji(l.sport)} {yrsAgo} {yrsAgo === 1 ? "year" : "years"} ago today</div>
                    </div>
                    <span className="text-zinc-600 text-xs shrink-0">→</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Now banner — Games tab, all sports */}
        {tab === "games" && (
          <Link href="/live" className="block w-full mb-3">
            <div className="rounded-2xl p-3 flex items-center gap-3 transition-all bg-zinc-900 border border-zinc-800 hover:border-red-600/40">
              <div className="text-2xl">🔴</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">Live Now</div>
                <div className="text-[10px] text-zinc-400">Every in-progress game across all sports, one page</div>
              </div>
              <span className="text-zinc-500">→</span>
            </div>
          </Link>
        )}

        {/* Players banner — Games tab (team sports only; tennis has no roster) */}
        {tab === "games" && hasTeams && (
          <button onClick={() => setTab("players")} className="block w-full mb-3 text-left">
            <div className="rounded-2xl p-3 flex items-center gap-3 transition-all bg-zinc-900 border border-zinc-800 hover:border-red-600/40">
              <div className="text-2xl">🧢</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">Browse Players</div>
                <div className="text-[10px] text-zinc-400">Search any player, see ratings, MVP picks & stats</div>
              </div>
              <span className="text-zinc-500">→</span>
            </div>
          </button>
        )}

        {/* Dream Team side game — Games tab, all team sports */}
        {tab === "games" && (hasTeams || sport === "wc") && (
          <button onClick={() => router.push("/dream")} className="block w-full mb-3 text-left">
            <div className="rounded-2xl p-3 flex items-center gap-3 transition-all bg-gradient-to-r from-violet-950/50 to-zinc-900 border border-violet-900/40 hover:border-violet-700/60">
              <div className="text-2xl">🌟</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">Build your Dream Team</div>
                <div className="text-[10px] text-zinc-400">Pick your all-time XI / starting lineup &amp; share it</div>
              </div>
              <span className="text-zinc-500">→</span>
            </div>
          </button>
        )}

        {/* Recap banner: Games tab + NFL only (recaps are NFL-week-based) */}
        {latestRecap && tab === "games" && sport === "nfl" && (
          <Link href={`/recap/${latestRecap.season}/${latestRecap.week}`} className="block mb-3">
            <div className={`rounded-2xl p-3 flex items-center gap-3 transition-all ${new Date().getDay() === 2 ? "bg-gradient-to-r from-red-900/60 via-red-800/30 to-zinc-900 border-2 border-red-600/40 hover:border-red-600" : "bg-zinc-900 border border-zinc-800 hover:border-red-600/40"}`}>
              <div className="text-2xl">📰</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">
                  {new Date().getDay() === 2 ? "Tuesday Recap is live!" : "Latest Recap"}
                </div>
                <div className="text-[10px] text-zinc-500">Week {latestRecap.week} · {latestRecap.season} — best games, top MVPs, biggest letdowns</div>
              </div>
              <span className="text-zinc-500">→</span>
            </div>
          </Link>
        )}

        {/* Daily Recap banner — team date-sports link to yesterday's recap (no tennis recap) */}
        {tab === "games" && isDateSport(sport) && hasTeams && (() => {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          const yday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const ydayLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
          return (
            <Link href={`/recap/${sport}/${yday}`} className="block mb-3">
              <div className="rounded-2xl p-3 flex items-center gap-3 transition-all bg-zinc-900 border border-zinc-800 hover:border-red-600/40">
                <div className="text-2xl">{sportEmoji(sport)}</div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">Yesterday&apos;s Recap</div>
                  <div className="text-[10px] text-zinc-500">{ydayLabel} — best games, top MVPs, biggest letdowns</div>
                </div>
                <span className="text-zinc-500">→</span>
              </div>
            </Link>
          );
        })()}


        {/* ===== GAMES TAB ===== */}
        {tab === "games" && (
          <div>
            <PullToRefresh enabled={tab === "games"} onRefresh={async () => {
              setRefreshKey((k) => k + 1);
              await new Promise((r) => setTimeout(r, 900));
            }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search teams..."
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 mb-3" />

            {sport === "nfl" && (
              <>
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
              </>
            )}

            {isDateSport(sport) && (() => {
              // Build a +/- 3 day window around the chosen date for quick nav
              const base = new Date(selectedDate + "T12:00:00");
              const days = [];
              for (let i = -3; i <= 3; i++) {
                const d = new Date(base);
                d.setDate(d.getDate() + i);
                const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                const today = new Date();
                const isToday = ds === `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
                days.push({ ds, isToday, label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) });
              }
              const shiftDay = (delta) => {
                const d = new Date(selectedDate + "T12:00:00");
                d.setDate(d.getDate() + delta);
                setSelectedDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
              };
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
              return (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => shiftDay(-1)} className="px-3 py-1.5 rounded-full text-xs font-bold bg-zinc-900 text-zinc-400 hover:text-white shrink-0">← Prev</button>
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 text-center" />
                    <button onClick={() => shiftDay(1)} className="px-3 py-1.5 rounded-full text-xs font-bold bg-zinc-900 text-zinc-400 hover:text-white shrink-0">Next →</button>
                    {selectedDate !== todayStr && (
                      <button onClick={() => setSelectedDate(todayStr)} className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-600 text-white shrink-0">Today</button>
                    )}
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {days.map(d => (
                      <button key={d.ds} onClick={() => setSelectedDate(d.ds)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${selectedDate === d.ds ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-500"}`}>
                        {d.isToday ? "Today" : d.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-between items-center mb-3">
              <div className="flex gap-2">
                {[{ id: "date", l: "Date" }, { id: "score", l: "Score" }, { id: "close", l: "Closest" }].map((s) => (
                  <button key={s.id} onClick={() => setSort(s.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${sort === s.id ? "bg-red-600/10 text-red-400" : "text-zinc-500"}`}>{s.l}</button>
                ))}
              </div>
              {hasTeams && (
                <button onClick={() => setShowTeams(!showTeams)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold border ${myTeams.length ? "bg-red-600/10 text-red-400 border-red-600/30" : "text-zinc-500 border-zinc-800"}`}>
                  {myTeams.length ? `My Teams (${myTeams.length})` : "My Teams"}
                </button>
              )}
            </div>

            {/* Live/Finished/Upcoming filter - only show when there's variety */}
            {(statusCounts.upcoming > 0 || statusCounts.live > 0) && statusCounts.all > 0 && (
              <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                {[
                  { v: "all", l: "All", count: statusCounts.all, color: "" },
                  ...(statusCounts.live > 0 ? [{ v: "live", l: "🔴 Live", count: statusCounts.live, color: "red" }] : []),
                  ...(statusCounts.upcoming > 0 ? [{ v: "upcoming", l: "⏰ Upcoming", count: statusCounts.upcoming, color: "" }] : []),
                  ...(statusCounts.finished > 0 ? [{ v: "finished", l: "✓ Finished", count: statusCounts.finished, color: "" }] : []),
                ].map(f => (
                  <button key={f.v} onClick={() => setGameStatus(f.v)} className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${gameStatus === f.v ? (f.color === "red" ? "bg-red-600 text-white animate-pulse" : "bg-red-600 text-white") : "bg-zinc-900 text-zinc-500 border border-zinc-800"}`}>
                    {f.l} <span className="opacity-60">({f.count})</span>
                  </button>
                ))}
              </div>
            )}

            {showTeams && hasTeams && (
              <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800 mb-3">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-semibold text-white">Follow Teams</span>
                  {myTeams.length > 0 && <button onClick={() => setMyTeams([])} className="text-[10px] text-red-400">Clear</button>}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {(TEAMS_BY_SPORT[sport] || ALL_TEAMS).map((t) => (
                    <button key={t} onClick={() => setMyTeams((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                      className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${myTeams.includes(t) ? "bg-red-600/10 text-red-400 border-red-600" : "bg-zinc-950 text-zinc-500 border-zinc-800"}`}>{t}</button>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="animate-pulse">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-2xl bg-zinc-900 border border-zinc-800 mb-3 overflow-hidden">
                    <div className="h-[3px] bg-zinc-800" />
                    <div className="p-3.5">
                      <div className="h-3 w-32 rounded bg-zinc-800 mb-3" />
                      <div className="flex items-center gap-2.5 mb-2"><div className="w-7 h-7 rounded-lg bg-zinc-800" /><div className="h-3.5 flex-1 max-w-[140px] rounded bg-zinc-800" /><div className="w-6 h-5 rounded bg-zinc-800" /></div>
                      <div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-zinc-800" /><div className="h-3.5 flex-1 max-w-[120px] rounded bg-zinc-800" /><div className="w-6 h-5 rounded bg-zinc-800" /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && filtered.length === 0 && <div className="text-center py-16"><div className="text-5xl mb-3">🔍</div><div className="text-zinc-500">No games found</div></div>}
            {!loading && sport !== "tennis" && <ScoresTicker games={filtered} />}
            {filtered.map((g) => g.sport === "tennis"
              ? <TennisCard key={g.id} match={g} logged={!!(gl(g.id) && gl(g.id).rating > 0)} />
              : <GameCard key={g.id} game={g} logged={!!(gl(g.id) && gl(g.id).rating > 0)}
                  myRating={user ? (gl(g.id)?.rating > 0 ? gl(g.id).rating : null) : null}
                  onQuickRate={user ? quickRate : null} />)}
          </div>
        )}

        {/* ===== DISCOVER TAB ===== */}
        {tab === "discover" && (
          <div>
            <h2 className="text-xl font-extrabold text-white mb-1">Discover</h2>
            <p className="text-sm text-zinc-500 mb-4">What the community is rating</p>

            <Link href="/trending" className="block mb-4">
              <div className="rounded-2xl p-3 flex items-center gap-3 transition-all bg-zinc-900 border border-zinc-800 hover:border-red-600/40">
                <div className="text-2xl">📈</div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white">Trending</div>
                  <div className="text-[10px] text-zinc-400">Most-rated games across every sport — 24h / 48h / week</div>
                </div>
                <span className="text-zinc-500">→</span>
              </div>
            </Link>

            {discoverLoading && <div className="text-center py-8 text-zinc-500 text-sm">Loading community...</div>}

            {/* Hot This Week */}
            {hotGames.length > 0 && (
              <div className="mb-5">
                <h3 className="text-base font-bold text-white mb-3">🔥 Hot This Week</h3>
                {hotGames.map((g, i) => (
                  <Link key={g.game_id} href={gh(g.game_id, g.sample?.sport)} className="block">
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                      <span className="text-lg font-extrabold w-6 text-center text-red-500">#{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{g.sample.away_team} {g.sample.away_score} — {g.sample.home_team} {g.sample.home_score}</div>
                        <div className="text-[10px] text-zinc-500">Wk {g.sample.week || "?"} · {g.count} {g.count === 1 ? "rater" : "raters"}</div>
                      </div>
                      <div className="w-11 h-11 flex items-center justify-center font-bold rounded-xl text-base text-white" style={{ backgroundColor: parseFloat(g.avg) >= 9 ? "#22c55e" : parseFloat(g.avg) >= 7.5 ? "#84cc16" : parseFloat(g.avg) >= 6 ? "#eab308" : parseFloat(g.avg) >= 4 ? "#f97316" : parseFloat(g.avg) >= 2 ? "#ef4444" : "#991b1b" }}>{g.avg}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Highest Rated */}
            {topRatedGames.length > 0 && (
              <div className="mb-5">
                <h3 className="text-base font-bold text-white mb-3">⭐ Highest Rated</h3>
                {topRatedGames.map((g, i) => (
                  <Link key={g.game_id} href={gh(g.game_id, g.sample?.sport)} className="block">
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                      <span className="text-base font-extrabold w-5 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{g.sample.away_team} {g.sample.away_score} — {g.sample.home_team} {g.sample.home_score}</div>
                        <div className="text-[10px] text-zinc-500">Wk {g.sample.week || "?"} · {g.count} {g.count === 1 ? "rater" : "raters"}</div>
                      </div>
                      <div className="w-11 h-11 flex items-center justify-center font-bold rounded-xl text-base text-white" style={{ backgroundColor: parseFloat(g.avg) >= 9 ? "#22c55e" : parseFloat(g.avg) >= 7.5 ? "#84cc16" : parseFloat(g.avg) >= 6 ? "#eab308" : parseFloat(g.avg) >= 4 ? "#f97316" : parseFloat(g.avg) >= 2 ? "#ef4444" : "#991b1b" }}>{g.avg}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Most Divisive */}
            {divisiveGames.length > 0 && (
              <div className="mb-5">
                <h3 className="text-base font-bold text-white mb-1">⚔️ Most Divisive</h3>
                <p className="text-xs text-zinc-500 mb-3">Games the community can&apos;t agree on</p>
                {divisiveGames.map((g, i) => (
                  <Link key={g.game_id} href={gh(g.game_id, g.sample?.sport)} className="block">
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                      <span className="text-base font-extrabold w-5 text-center" style={{ color: i === 0 ? "#a855f7" : "#52525b" }}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{g.sample.away_team} {g.sample.away_score} — {g.sample.home_team} {g.sample.home_score}</div>
                        <div className="text-[10px] text-zinc-500">{g.count} {g.count === 1 ? "rater" : "raters"} · avg {g.avg} · ±{g.spread.toFixed(1)} spread</div>
                      </div>
                      <div className="w-11 h-11 flex flex-col items-center justify-center font-bold rounded-xl text-purple-300 bg-purple-500/15 border border-purple-500/30 shrink-0">
                        <span className="text-sm leading-none">±{g.spread.toFixed(1)}</span>
                        <span className="text-[8px] text-purple-400/70 leading-none mt-0.5">SPLIT</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Top Raters */}
            {topRaters.length > 0 && (
              <div className="mb-5">
                <h3 className="text-base font-bold text-white mb-3">🏆 Top Raters</h3>
                {topRaters.map((r, i) => (
                  <div key={r.user_id} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                    <Link href={r.profile?.handle ? `/u/${r.profile.handle}` : "#"} className="flex items-center gap-3 flex-1">
                      <span className="text-base font-extrabold w-5 text-center" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                      {r.profile?.avatar_url ? (
                        <img src={r.profile.avatar_url} referrerPolicy="no-referrer" className="w-9 h-9 rounded-full" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-xs font-bold text-white">
                          {(r.profile?.display_name || r.profile?.handle || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{r.profile?.display_name || (r.profile?.handle ? `@${r.profile.handle}` : "Anonymous")}</div>
                        <div className="text-[10px] text-zinc-500">{r.count} {r.count === 1 ? "rating" : "ratings"} · avg {r.avg}{r.reviews > 0 && ` · ${r.reviews} reviews`}</div>
                      </div>
                    </Link>
                    {user && r.user_id !== user.id && (
                      <button onClick={() => toggleFollow(r.user_id)} className={`text-xs px-3 py-1.5 rounded-full font-bold whitespace-nowrap ${following.includes(r.user_id) ? "bg-zinc-700 text-zinc-300" : "bg-red-600/10 text-red-400"}`}>
                        {following.includes(r.user_id) ? "Following" : "+ Follow"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Community Lists */}
            {communityLists.length > 0 && (
              <div className="mb-5">
                <h3 className="text-base font-bold text-white mb-3">📋 Community Lists</h3>
                {communityLists.map(l => (
                  <Link key={l.id} href={`/list/${l.id}`} className="block">
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                      <span className="text-2xl">{l.icon || "📋"}</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">{l.name}</div>
                        <div className="text-[10px] text-zinc-500">by {l.profile?.display_name || (l.profile?.handle ? `@${l.profile.handle}` : "anon")} · {l.gameCount} {l.gameCount === 1 ? "game" : "games"}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!discoverLoading && hotGames.length === 0 && topRatedGames.length === 0 && topRaters.length === 0 && communityLists.length === 0 && (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">🌱</div>
                <div className="text-base font-bold text-white">Nothing here yet</div>
                <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">Rate some games and they&apos;ll show up here for everyone to discover</div>
                <button onClick={() => setTab("games")} className="mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</button>
              </div>
            )}
          </div>
        )}

        {/* ===== PLAYERS TAB ===== */}
        {tab === "players" && (() => {
          const q = playerSearch.trim().toLowerCase();
          const pickedPlayers = playersList.filter(p => p.hasPicks);
          // When searching, show all matches; otherwise just the picked players
          const searchResults = q ? playersList.filter(p => p.name.toLowerCase().includes(q)).slice(0, 60) : [];
          const showList = q ? searchResults : pickedPlayers;

          const renderRow = (p, i, showRank) => (
            <Link key={p.name} href={`/player/${encodeURIComponent(p.name)}`} className="block">
              <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                {showRank && (
                  <span className="text-sm font-extrabold w-5 text-center shrink-0" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                )}
                {p.headshot ? (
                  <img src={p.headshot} alt={p.name} referrerPolicy="no-referrer" className="w-9 h-9 rounded-xl object-cover bg-zinc-800 shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-[11px] font-extrabold text-white shrink-0">
                    {p.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                    {(p.team || p.position) && <span>{p.team}{p.team && p.position && " · "}{p.position}</span>}
                    {p.hasPicks && <span className="text-green-400">🌟 {p.mvp}</span>}
                    {p.hasPicks && <span className="text-red-400">😤 {p.letdown}</span>}
                  </div>
                </div>
                {p.hasPicks ? (
                  <div className="text-right shrink-0">
                    <div className="text-sm font-extrabold" style={{ color: p.mvpRate >= 50 ? "#22c55e" : "#ef4444" }}>{p.mvpRate}%</div>
                    <div className="text-[8px] text-zinc-600 font-bold tracking-wider">MVP RATE</div>
                  </div>
                ) : (
                  <span className="text-zinc-700 text-xs shrink-0">→</span>
                )}
              </div>
            </Link>
          );

          return (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-extrabold text-white">{sportEmoji(sport)} Players</h2>
                {!playersLoading && <span className="text-[10px] text-zinc-600 font-semibold">{playersList.length} players</span>}
              </div>
              <p className="text-xs text-zinc-500 mb-3">Search any player in the league, or browse the most-picked below.</p>

              {/* Search */}
              <input
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder={`Search all ${sportLabel(sport)} players…`}
                className="w-full px-3 py-2.5 mb-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 placeholder:text-zinc-600"
              />

              {/* Loading with progress */}
              {playersLoading && (
                <div className="text-center py-10">
                  <div className="inline-block w-6 h-6 border-2 border-zinc-700 border-t-red-500 rounded-full animate-spin mb-3" />
                  <div className="text-sm text-zinc-400">Loading league rosters…</div>
                  {rosterProgress > 0 && rosterProgress < 100 && (
                    <div className="mt-2 max-w-[200px] mx-auto">
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-red-600 transition-all" style={{ width: `${rosterProgress}%` }} />
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-1">{rosterProgress}%</div>
                    </div>
                  )}
                </div>
              )}

              {/* Search results */}
              {!playersLoading && q && (
                <>
                  <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2">
                    {searchResults.length} {searchResults.length === 1 ? "result" : "results"}
                  </div>
                  {searchResults.length === 0 && (
                    <div className="text-center py-10 text-zinc-600 text-sm">No players match &quot;{playerSearch}&quot;</div>
                  )}
                  {searchResults.map((p, i) => renderRow(p, i, false))}
                </>
              )}

              {/* Default: most-picked players */}
              {!playersLoading && !q && (
                <>
                  {pickedPlayers.length > 0 ? (
                    <>
                      <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2">🔥 Most Picked by Community</div>
                      {pickedPlayers.map((p, i) => renderRow(p, i, true))}
                      <div className="text-[10px] text-zinc-600 text-center mt-3">Search above to find any other player in the league</div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-5xl mb-3">🧢</div>
                      <div className="text-base font-bold text-white">No community picks yet</div>
                      <div className="text-sm text-zinc-500 mt-1">Search for any player above, or pick MVPs when you rate games.</div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* ===== FRIENDS TAB ===== */}
        {tab === "friends" && (
          <div>
            <h2 className="text-xl font-extrabold text-white mb-1">Friends</h2>
            <p className="text-sm text-zinc-500 mb-4">See what your crew is watching</p>

            {!user && (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">👥</div>
                <div className="text-base font-bold text-white">Sign in to follow friends</div>
                <button onClick={() => router.push("/login")} className="mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Sign In →</button>
              </div>
            )}

            {user && friendsLoading && <div className="text-center py-8 text-zinc-500 text-sm">Loading feed...</div>}

            {user && !friendsLoading && (
              <>
                {/* Following avatars row */}
                {friendsFeed.length > 0 && (
                  <div className="flex gap-3 mb-5 overflow-x-auto pb-1">
                    {[...new Map(friendsFeed.map(r => [r.user_id, r])).values()].slice(0, 10).map((r) => (
                      <Link key={r.user_id} href={r.profile?.handle ? `/u/${r.profile.handle}` : "#"} className="text-center shrink-0">
                        {r.profile?.avatar_url ? (
                          <img src={r.profile.avatar_url} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full border-2 border-zinc-800" />
                        ) : (
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white border-2 border-zinc-800 bg-gradient-to-br from-red-600 to-red-900">
                            {(r.profile?.display_name || r.profile?.handle || "?")[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="text-[10px] font-semibold text-zinc-400 mt-1 truncate w-12">{r.profile?.display_name || r.profile?.handle || "?"}</div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Activity feed */}
                {friendsFeed.length === 0 && suggestedUsers.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-3">👋</div>
                    <div className="text-base font-bold text-white">No one to follow yet</div>
                    <div className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">As more people join, you can follow them to see their ratings here</div>
                  </div>
                )}

                {friendsFeed.map((r) => (
                  <Link key={r.id} href={gh(r.game_id, r.sport)} className="block">
                    <div className="flex gap-3 p-3.5 rounded-2xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                      {r.profile?.avatar_url ? (
                        <img src={r.profile.avatar_url} referrerPolicy="no-referrer" className="w-9 h-9 rounded-full shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-gradient-to-br from-red-600 to-red-900">
                          {(r.profile?.display_name || r.profile?.handle || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm text-white">
                          <span className="font-bold">{r.profile?.display_name || `@${r.profile?.handle || "anon"}`}</span>
                          <span className="text-zinc-500"> rated</span>
                        </div>
                        <div className="text-sm font-bold text-white mt-0.5">{r.away_team} {r.away_score} — {r.home_team} {r.home_score}</div>
                        {r.review && <div className="text-xs text-zinc-400 italic mt-1">&quot;{r.review}&quot;</div>}
                        <div className="text-[10px] text-zinc-600 mt-1">Wk {r.week || "?"} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      </div>
                      <div className="w-11 h-11 flex items-center justify-center font-bold rounded-xl text-base text-white shrink-0" style={{ backgroundColor: parseFloat(r.rating) >= 9 ? "#22c55e" : parseFloat(r.rating) >= 7.5 ? "#84cc16" : parseFloat(r.rating) >= 6 ? "#eab308" : parseFloat(r.rating) >= 4 ? "#f97316" : parseFloat(r.rating) >= 2 ? "#ef4444" : "#991b1b" }}>{parseFloat(r.rating).toFixed(1)}</div>
                    </div>
                  </Link>
                ))}

                {/* Suggested users to follow */}
                {suggestedUsers.length > 0 && (
                  <div className="mt-6 mb-5">
                    <h3 className="text-base font-bold text-white mb-3">👀 People to Follow</h3>
                    {suggestedUsers.map((s) => (
                      <div key={s.user_id} className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800">
                        <Link href={s.profile?.handle ? `/u/${s.profile.handle}` : "#"} className="flex items-center gap-3 flex-1">
                          {s.profile?.avatar_url ? (
                            <img src={s.profile.avatar_url} referrerPolicy="no-referrer" className="w-9 h-9 rounded-full" />
                          ) : (
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-red-600 to-red-900">
                              {(s.profile?.display_name || s.profile?.handle || "?")[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="text-sm font-bold text-white">{s.profile?.display_name || `@${s.profile?.handle}`}</div>
                            <div className="text-[10px] text-zinc-500">{s.count} {s.count === 1 ? "rating" : "ratings"}</div>
                          </div>
                        </Link>
                        <button onClick={() => toggleFollow(s.user_id)} className={`text-xs px-3 py-1.5 rounded-full font-bold ${following.includes(s.user_id) ? "bg-zinc-700 text-zinc-300" : "bg-red-600 text-white"}`}>
                          {following.includes(s.user_id) ? "Following" : "+ Follow"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== DIARY TAB ===== */}
        {tab === "diary" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-extrabold text-white">Your Diary</h2>
              <div className="flex gap-0.5 p-0.5 rounded-full bg-zinc-900 border border-zinc-800">
                {SPORTS.map((s) => (
                  <button key={s.id} onClick={() => setProfileSport(s.id)} className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all ${profileSport === s.id ? "bg-red-600 text-white" : "text-zinc-500"}`}>{s.emoji}<span className="hidden sm:inline ml-1">{s.label}</span></button>
                ))}
              </div>
            </div>
            {sportRatedLogs.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">📓</div>
                <div className="text-base font-bold text-white">No {sportLabel(profileSport)} games logged yet</div>
                <div className="text-sm text-zinc-500 mt-1">Rate {sportLabel(profileSport)} games to build your diary</div>
                <button onClick={() => { setSport(profileSport); setTab("games"); }} className="mt-4 px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-bold">Browse Games →</button>
              </div>
            )}
            {/* Activity heatmap — last 26 weeks, colored by that day's avg rating */}
            {sportRatedLogs.length > 0 && (() => {
              const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
              const byDay = {};
              sportRatedLogs.forEach((l) => {
                const d = (l.createdAt || "").slice(0, 10);
                if (!d) return;
                if (!byDay[d]) byDay[d] = { sum: 0, n: 0 };
                byDay[d].sum += l.rating; byDay[d].n++;
              });
              const WEEKS = 26;
              const today = new Date();
              // Start on the Sunday WEEKS-1 weeks before this week
              const start = new Date(today);
              start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
              const cols = [];
              let monthMarks = [];
              for (let w = 0; w < WEEKS; w++) {
                const col = [];
                for (let dow = 0; dow < 7; dow++) {
                  const cell = new Date(start);
                  cell.setDate(cell.getDate() + w * 7 + dow);
                  const key = ymd(cell);
                  const day = byDay[key];
                  col.push({ key, future: cell > today, avg: day ? day.sum / day.n : null, n: day ? day.n : 0 });
                  if (dow === 0) monthMarks.push(cell.getDate() <= 7 ? cell.toLocaleDateString("en-US", { month: "short" }) : "");
                }
                cols.push(col);
              }
              const activeDays = Object.keys(byDay).length;
              return (
                <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white">📅 Activity</h3>
                    <span className="text-[10px] text-zinc-500">{activeDays} active {activeDays === 1 ? "day" : "days"} · 26 wks</span>
                  </div>
                  <div className="overflow-x-auto pb-1">
                    <div className="flex gap-[3px] min-w-max">
                      {cols.map((col, wi) => (
                        <div key={wi} className="flex flex-col gap-[3px]">
                          {col.map((cell) => (
                            <div key={cell.key} title={cell.n > 0 ? `${cell.key}: ${cell.n} rated · avg ${cell.avg.toFixed(1)}` : cell.key}
                              className="w-[10px] h-[10px] rounded-[2px]"
                              style={{ backgroundColor: cell.future ? "transparent" : cell.avg != null ? rc(cell.avg) : "#27272a" }} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-2 text-[9px] text-zinc-600">
                    <span>Low</span>
                    {[2, 4, 6, 8, 10].map((r) => <span key={r} className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: rc(r) }} />)}
                    <span>High</span>
                  </div>
                </div>
              );
            })()}

            {[...sportRatedLogs].sort((a, b) => (b.season || 0) - (a.season || 0) || (b.week || 0) - (a.week || 0)).map((l) => {
              const g = games.find((x) => x.id === l.gameId);
              return (
                <Link key={l.gameId} href={gameHref(l.gameId, l.sport, l.gameDate)} className="block">
                <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 cursor-pointer hover:-translate-y-0.5 transition-transform">
                  <Bdg r={l.rating} />
                  <div className="flex-1">
                    {g ? (
                      <>
                        <div className="text-sm font-bold text-white">{g.away.abbr} {g.away.score} — {g.home.abbr} {g.home.score}</div>
                        <div className="text-[10px] text-zinc-600">{isDateSport(l.sport) ? g.shortDate : `Wk ${g.week} · ${g.shortDate}`}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-bold text-white">{l.awayTeam && l.homeTeam ? `${l.awayTeam} ${l.awayScore} — ${l.homeTeam} ${l.homeScore}` : "Game rated"}</div>
                        <div className="text-[10px] text-zinc-600">{isDateSport(l.sport) ? (l.season || "") : `Wk ${l.week || "?"} · ${l.season || ""}`}</div>
                      </>
                    )}
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {l.mvp && <span className="text-[10px] text-green-400">🌟 {l.mvp}</span>}
                      {l.watchHow && <span className="text-[10px] text-zinc-500">{l.watchHow}</span>}
                      {l.worthIt && <span className="text-[10px]" style={{ color: l.worthIt === "yes" ? "#22c55e" : l.worthIt === "no" ? "#ef4444" : "#eab308" }}>{l.worthIt === "yes" ? "👍" : l.worthIt === "no" ? "👎" : "😐"}</span>}
                    </div>
                    {l.review && <div className="text-[11px] text-zinc-400 italic mt-1">&quot;{l.review}&quot;</div>}
                  </div>
                </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* ===== PROFILE TAB ===== */}
        {tab === "profile" && (
          <div>
            {!user && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">👤</div>
                <div className="text-base font-bold text-white">Sign in to track your games</div>
                <div className="text-xs text-zinc-500 mt-1">Rate games, build your diary, and earn badges</div>
                <Link href="/login" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Sign In →</Link>
              </div>
            )}
            {user && <>
            {/* User card - sleeker design */}
            <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-4">
              {/* Banner gradient */}
              <div className="h-16 bg-gradient-to-br from-red-900/40 via-red-700/20 to-zinc-900" />
              <div className="px-5 pb-5 -mt-10">
                {/* Avatar centered */}
                <div className="flex justify-center mb-3">
                  {(profile?.avatar_url || user?.user_metadata?.avatar_url) ? (
                    <img src={profile?.avatar_url || user.user_metadata.avatar_url} referrerPolicy="no-referrer" className="w-20 h-20 rounded-full border-4 border-zinc-900 object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-full border-4 border-zinc-900 bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white text-2xl font-extrabold">{(profile?.display_name || user?.user_metadata?.full_name || "U")[0]?.toUpperCase()}</div>
                  )}
                </div>
                {/* Name & handle */}
                <div className="text-center mb-1">
                  <div className="text-xl font-extrabold" style={{ color: nameColor(profile?.unlocked) || "#fafafa" }}>{profile?.display_name || user?.user_metadata?.full_name || "User"}</div>
                  {profile?.handle ? (
                    <div className="text-sm text-red-400 mt-0.5">@{profile.handle}</div>
                  ) : (
                    <div className="text-xs text-zinc-500 mt-0.5">{user?.email || ""}</div>
                  )}
                </div>
                {/* Team badges */}
                {FAV_SPORTS.some((s) => profile?.[favKey(s.id)]) && (
                  <div className="flex justify-center gap-1.5 mb-2 flex-wrap">
                    {FAV_SPORTS.filter((s) => profile?.[favKey(s.id)]).map((s) => (
                      <span key={s.id} className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-600/15 text-red-300 border border-red-600/30">{s.emoji} {teamName(s.id, profile[favKey(s.id)])}</span>
                    ))}
                  </div>
                )}
                {/* Bio */}
                {profile?.bio && <div className="text-sm text-zinc-400 text-center mb-3 max-w-xs mx-auto">{profile.bio}</div>}
                {/* Streak + Joined date */}
                {ratingStreak > 1 && (
                  <div className="flex justify-center mb-2">
                    <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">🔥 {ratingStreak}-day rating streak</span>
                  </div>
                )}
                {profile?.created_at && (
                  <div className="text-[10px] text-zinc-600 text-center mb-3">Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                )}
                {/* Profile sport switcher */}
                <div className="flex gap-0.5 p-0.5 mb-3 rounded-full bg-zinc-950 border border-zinc-800 mx-auto w-fit">
                  {SPORTS.map((s) => (
                    <button key={s.id} onClick={() => setProfileSport(s.id)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${profileSport === s.id ? "bg-red-600 text-white" : "text-zinc-500"}`}>{s.emoji}<span className="hidden sm:inline ml-1">{s.label}</span></button>
                  ))}
                </div>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  {[
                    { v: sportRatedLogs.length, l: "RATED", action: () => setTab("diary") },
                    { v: sportLogs.filter((l) => l.review).length, l: "WROTE", action: () => setTab("diary") },
                    { v: sportRatedLogs.length ? (sportRatedLogs.reduce((s, l) => s + l.rating, 0) / sportRatedLogs.length).toFixed(1) : "—", l: "AVG", action: () => { document.getElementById("rating-dist")?.scrollIntoView({ behavior: "smooth" }); } },
                  ].map((s) => (
                    <button key={s.l} onClick={s.action} className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 transition-colors cursor-pointer text-center">
                      <div className="text-2xl font-extrabold text-white">{s.v}</div>
                      <div className="text-[10px] text-zinc-500 font-bold tracking-widest">{s.l}</div>
                    </button>
                  ))}
                </div>
                {/* Action buttons */}
                <div className={profile?.handle ? "grid grid-cols-2 gap-2" : ""}>
                  {profile?.handle && (
                    <Link href={`/u/${profile.handle}`} className="py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold text-center hover:bg-zinc-700 transition-all">
                      👁️ View Public
                    </Link>
                  )}
                  <button onClick={() => setShowEditProfile(true)} className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold hover:bg-zinc-700 transition-all">
                    ✏️ Edit Profile
                  </button>
                </div>
                <button onClick={() => { setProfileSport("wc"); setTab("diary"); }} className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-red-950/60 to-zinc-950 border border-red-900/40 text-zinc-300 text-xs font-semibold hover:border-red-700/60 transition-all text-center">
                  🏆 World Cup ratings{logs.filter((l) => l.sport === "wc" && l.rating > 0).length ? ` · ${logs.filter((l) => l.sport === "wc" && l.rating > 0).length}` : ""} →
                </button>
                <Link href="/about" className="block w-full mt-2 py-2 rounded-xl bg-zinc-950 text-zinc-500 text-xs font-semibold hover:bg-zinc-800 hover:text-zinc-300 transition-all text-center">ℹ️ How It Works</Link>
                <button onClick={async () => { await signOut(); router.push("/login"); }} className="w-full mt-2 py-2 rounded-xl bg-zinc-950 text-zinc-500 text-xs font-semibold hover:bg-zinc-800 hover:text-zinc-300 transition-all">Sign Out</button>
              </div>
            </div>

            {/* Your Picks — prediction record + recent */}
            {myPredictions.length > 0 && (() => {
              const settled = myPredictions.filter(p => p.status !== "pending");
              const pending = myPredictions.filter(p => p.status === "pending");
              const w = settled.filter(p => p.status === "won").length;
              const l = settled.filter(p => p.status === "lost").length;
              const pu = settled.filter(p => p.status === "push").length;
              const wpct = (w + l) > 0 ? Math.round((w / (w + l)) * 100) : 0;
              const units = settled.reduce((s, p) => s + (parseFloat(p.units) || 0), 0);
              const uStr = (units >= 0 ? "+" : "") + units.toFixed(2);
              const recent = myPredictions.slice(0, 4);
              const statusStyle = (st) => st === "won" ? { bg: "bg-green-500/15", tx: "text-green-400", lbl: "W" }
                : st === "lost" ? { bg: "bg-red-500/15", tx: "text-red-400", lbl: "L" }
                : st === "push" ? { bg: "bg-zinc-800", tx: "text-zinc-400", lbl: "P" }
                : { bg: "bg-zinc-800", tx: "text-zinc-500", lbl: "•" };
              return (
                <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-white">🔮 Your Picks</h3>
                    <Link href="/predictions/breakdown" className="text-[10px] font-bold text-red-400 hover:text-red-300">Full history ›</Link>
                  </div>
                  {/* Record row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-xl bg-zinc-950 p-3 text-center">
                      <div className="text-xl font-extrabold text-white">{w}-{l}{pu > 0 && `-${pu}`}</div>
                      <div className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase">Record</div>
                    </div>
                    <div className="rounded-xl bg-zinc-950 p-3 text-center">
                      <div className="text-xl font-extrabold" style={{ color: wpct >= 50 ? "#22c55e" : "#ef4444" }}>{wpct}%</div>
                      <div className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase">Win Rate</div>
                    </div>
                    <Link href="/predictions/breakdown" className="rounded-xl bg-zinc-950 p-3 text-center hover:bg-zinc-800 transition-colors">
                      <div className="text-xl font-extrabold" style={{ color: units > 0 ? "#22c55e" : units < 0 ? "#ef4444" : "#a1a1aa" }}>{uStr}u</div>
                      <div className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase">Units</div>
                    </Link>
                  </div>
                  {/* Recent picks */}
                  <div className="space-y-1.5">
                    {recent.map(p => {
                      const s = statusStyle(p.status);
                      return (
                        <Link key={p.id} href={gameHref(p.game_id, p.sport)}
                          className="flex items-center gap-2.5 p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 transition-colors">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold shrink-0 ${s.bg} ${s.tx}`}>{s.lbl}</span>
                          <span className="text-xs font-semibold text-white flex-1 truncate">{p.pick_label}</span>
                          <span className="text-[9px] text-zinc-600">{sportEmoji(p.sport)}</span>
                        </Link>
                      );
                    })}
                  </div>
                  {pending.length > 0 && (
                    <div className="text-[10px] text-zinc-500 text-center mt-2">{pending.length} pick{pending.length === 1 ? "" : "s"} pending</div>
                  )}
                </div>
              );
            })()}

            {/* 🏅 Reputation */}
            <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">🏅 Reputation</h3>
                <span className="text-xs font-extrabold px-2.5 py-1 rounded-full" style={{ background: myTier.color + "22", color: myTier.color }}>{myTier.emoji} {myTier.name}</span>
              </div>
              <div className="flex items-end justify-between mb-1">
                <div className="text-3xl font-extrabold text-white">{myRep.toLocaleString()}<span className="text-sm font-bold text-zinc-500 ml-1">Cred</span></div>
                {myNextTier && <div className="text-[10px] text-zinc-500 text-right">{(myNextTier.min - myRep).toLocaleString()} to {myNextTier.emoji} {myNextTier.name}</div>}
              </div>
              {/* Progress to next tier */}
              <div className="h-2 rounded-full bg-zinc-950 overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(tierProgress(myRep) * 100)}%`, backgroundColor: myTier.color }} />
              </div>
              {/* Breakdown */}
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {[
                  { v: ratedLogs.length, l: "Rated" },
                  { v: reviewCount, l: "Reviews" },
                  { v: commentsPosted, l: "Comments" },
                  { v: likesReceived, l: "Likes" },
                  { v: followerCount, l: "Followers" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg bg-zinc-950 p-2">
                    <div className="text-base font-extrabold text-white">{s.v}</div>
                    <div className="text-[8px] font-bold text-zinc-500 tracking-wider uppercase">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-zinc-600 mt-2">Earn Cred from rating games, writing reviews, and the likes your comments get.</div>
            </div>

            {/* 🩸 Drops — currency + emote store */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-red-950/40 via-zinc-900 to-zinc-900 border border-zinc-800 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">🩸 Drops</h3>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-white leading-none">{dropsBalance.toLocaleString()}</div>
                  <div className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase">Balance</div>
                </div>
              </div>
              {/* Earning breakdown */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { v: ratedLogs.length, l: "Ratings", sub: `+${DROPS.perRating} ea` },
                  { v: reviewCount, l: "Reviews", sub: `+${DROPS.perReview} ea` },
                  { v: likesReceived, l: "Likes", sub: `+${DROPS.perLike} ea` },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl bg-zinc-950 p-2.5 text-center">
                    <div className="text-lg font-extrabold text-white">{s.v}</div>
                    <div className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase">{s.l}</div>
                    <div className="text-[9px] text-red-400/80 font-semibold">{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2">Emote Store</div>
              <div className="space-y-2">
                {EMOTE_PACKS.map((pack) => {
                  const owned = dropsUnlocked.includes(pack.id);
                  const affordable = dropsBalance >= pack.cost;
                  return (
                    <div key={pack.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-950">
                      <div className="text-xl shrink-0">{pack.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white">{pack.name}</div>
                        <div className="text-sm tracking-wide">{pack.emotes.join(" ")}</div>
                      </div>
                      <button
                        onClick={() => buyPack(pack)}
                        disabled={owned || !dropsStoreReady || !affordable || buyingDrops === pack.id}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${owned ? "bg-green-600/15 text-green-400" : affordable && dropsStoreReady ? "bg-red-600 text-white hover:bg-red-700" : "bg-zinc-800 text-zinc-500"}`}
                      >
                        {owned ? "✓ Owned" : buyingDrops === pack.id ? "…" : `🩸 ${pack.cost}`}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-zinc-600 mt-2">Unlocked emotes become extra reactions on game comments.</div>

              {/* Name flair */}
              <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mt-4 mb-2">Name Flair</div>
              <div className="flex flex-wrap gap-2">
                {NAME_FLAIR.map((f) => {
                  const owned = dropsUnlocked.includes(f.id);
                  const affordable = dropsBalance >= f.cost;
                  return (
                    <button
                      key={f.id}
                      onClick={() => buyPack(f)}
                      disabled={owned || !dropsStoreReady || !affordable || buyingDrops === f.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${owned ? "border-current" : "border-zinc-800 bg-zinc-950"}`}
                      style={{ color: f.color }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                      {f.name}
                      <span className="text-[10px] text-zinc-500">{owned ? "✓" : `🩸${f.cost}`}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-zinc-600 mt-2">Your priciest unlocked flair colors your name everywhere.</div>

              {/* Accent themes */}
              <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mt-4 mb-2">Accent Theme</div>
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => {
                  const owned = dropsUnlocked.includes(t.id);
                  const affordable = dropsBalance >= t.cost;
                  return (
                    <button
                      key={t.id}
                      onClick={() => buyPack(t)}
                      disabled={owned || !dropsStoreReady || !affordable || buyingDrops === t.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all border-zinc-800 bg-zinc-950"
                      style={{ color: t.color }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                      <span className="text-[10px] text-zinc-500">{owned ? "✓" : `🩸${t.cost}`}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-zinc-600 mt-2">Recolors the app&apos;s accent. Priciest unlocked theme wins.</div>
              {!dropsStoreReady && (
                <div className="text-[10px] text-orange-400/80 mt-1">Spending activates once the Drops migration is run.</div>
              )}
            </div>

            {/* Pinned */}
            {pinned.length > 0 && (
              <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
                <h3 className="text-base font-bold text-white mb-3">📌 Pinned Games</h3>
                <div className="grid grid-cols-2 gap-2">
                  {pinned.slice(0, 4).map((id) => {
                    const g = games.find((x) => x.id === id);
                    const l = gl(id);
                    // Use ESPN game data if available, otherwise fall back to log metadata
                    const awayAbbr = g?.away?.abbr || l?.awayTeam || "?";
                    const homeAbbr = g?.home?.abbr || l?.homeTeam || "?";
                    const awayScore = g?.away?.score ?? l?.awayScore ?? "—";
                    const homeScore = g?.home?.score ?? l?.homeScore ?? "—";
                    const week = g?.week || l?.week || "?";
                    return (
                      <Link key={id} href={`/game/${id}`} className="block">
                        <div className="p-2.5 rounded-lg bg-zinc-950 border-l-2 border-red-600 hover:bg-zinc-900 transition-colors">
                          <div className="text-xs font-bold text-white">{awayAbbr} {awayScore}—{homeAbbr} {homeScore}</div>
                          <div className="text-[10px] text-zinc-600">Wk {week}</div>
                          {l?.rating > 0 && <div className="text-base font-extrabold mt-1" style={{ color: rc(l.rating) }}>{l.rating}</div>}
                        </div>
                      </Link>
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
              {lists.length === 0 && <div className="text-[11px] text-zinc-500 text-center py-4">No lists yet. Create one above or while rating a game.</div>}
              {lists.map((l) => {
                const games = listGames[l.id] || [];
                return (
                  <div key={l.id} onClick={() => setSelectedListId(selectedListId === l.id ? null : l.id)} className="p-2.5 rounded-lg bg-zinc-950 mb-2 cursor-pointer hover:bg-zinc-900 transition-colors">
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-bold text-white">{l.icon} {l.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-600">{games.length} games</span>
                        <Link href={`/list/${l.id}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-red-400 hover:text-red-300 font-semibold">Open ↗</Link>
                        <span className="text-zinc-600 text-xs">{selectedListId === l.id ? "▼" : "▶"}</span>
                      </div>
                    </div>
                    {selectedListId === l.id && (
                      <div className="mt-2 pt-2 border-t border-zinc-800">
                        {games.length === 0 && <div className="text-[11px] text-zinc-500 py-2">No games in this list yet.</div>}
                        {games.map((gm) => (
                          <Link key={gm.id} href={`/game/${gm.game_id}`} className="block">
                            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800 transition-colors">
                              <div>
                                <div className="text-xs font-bold text-white">{gm.away_team} {gm.away_score} — {gm.home_team} {gm.home_score}</div>
                                <div className="text-[10px] text-zinc-600">Wk {gm.week || "?"} · {gm.season}</div>
                              </div>
                              <button onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                try {
                                  await sbFetch(`list_games?id=eq.${gm.id}`, { method: "DELETE" });
                                  setListGames(prev => ({ ...prev, [l.id]: (prev[l.id] || []).filter(x => x.id !== gm.id) }));
                                } catch (err) { console.error(err); }
                              }} className="text-[10px] text-zinc-600 hover:text-red-400">remove</button>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                          <div className="text-[10px] text-zinc-500">{b.d}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Season Wrapped — reflects the selected profile sport, drillable by season */}
            {sportRatedLogs.length >= 3 && (() => {
              // Seasons this sport has ratings in (most recent first)
              const seasons = [...new Set(sportRatedLogs.map((l) => l.season).filter(Boolean))].sort((a, b) => b - a);
              const wrapLogs = wrappedSeason === "all" ? sportRatedLogs : sportRatedLogs.filter((l) => String(l.season) === String(wrappedSeason));
              if (wrapLogs.length === 0) return null;
              const avg = (wrapLogs.reduce((s, l) => s + l.rating, 0) / wrapLogs.length).toFixed(1);
              const best = [...wrapLogs].sort((a, b) => b.rating - a.rating)[0];
              const mvpCounts = {};
              wrapLogs.forEach((l) => { if (l.mvp) mvpCounts[l.mvp] = (mvpCounts[l.mvp] || 0) + 1; });
              const topMvp = Object.entries(mvpCounts).sort((a, b) => b[1] - a[1])[0];
              const label = wrappedSeason === "all" ? "All-Time" : wrappedSeason;
              return (
                <div className="rounded-2xl p-5 mb-4 bg-gradient-to-br from-red-600 via-red-800 to-red-950 text-white relative overflow-hidden">
                  <div className="absolute -top-5 -right-5 text-8xl opacity-5">{sportEmoji(profileSport)}</div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-[10px] font-bold opacity-80 tracking-widest uppercase">{sportEmoji(profileSport)} {sportLabel(profileSport)} Wrapped</div>
                      <div className="text-lg font-extrabold mt-0.5">Your {label} {wrappedSeason === "all" ? "Recap" : "Season"}</div>
                    </div>
                  </div>
                  {/* Season selector */}
                  {seasons.length > 1 && (
                    <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
                      <button onClick={() => setWrappedSeason("all")} className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all ${wrappedSeason === "all" ? "bg-white text-red-700" : "bg-white/15 text-white"}`}>All-Time</button>
                      {seasons.map((yr) => (
                        <button key={yr} onClick={() => setWrappedSeason(yr)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all ${String(wrappedSeason) === String(yr) ? "bg-white text-red-700" : "bg-white/15 text-white"}`}>{yr}</button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: wrapLogs.length, l: "Games" },
                      { v: avg, l: "Avg Rating" },
                      { v: wrapLogs.filter((l) => l.worthIt === "yes").length, l: "Worth It" },
                      { v: wrappedSeason === "all" ? `${earned.length}/${BADGES.length}` : wrapLogs.filter((l) => l.review).length, l: wrappedSeason === "all" ? "Badges" : "Reviews" },
                    ].map((s, i) => (
                      <div key={i} className="bg-white/10 rounded-lg p-2">
                        <div className="text-xl font-extrabold">{s.v}</div>
                        <div className="text-[10px] opacity-80">{s.l}</div>
                      </div>
                    ))}
                  </div>
                  {/* Highlights */}
                  {(best || topMvp) && (
                    <div className="mt-2 space-y-1.5">
                      {best && (
                        <Link href={gameHref(best.gameId, best.sport, best.gameDate)} className="flex items-center gap-2 bg-white/10 rounded-lg p-2 hover:bg-white/15 transition-colors">
                          <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider w-16 shrink-0">Top game</span>
                          <span className="text-xs font-bold flex-1 truncate">{best.awayTeam} {best.awayScore}–{best.homeTeam} {best.homeScore}</span>
                          <span className="text-sm font-extrabold shrink-0">{best.rating}</span>
                        </Link>
                      )}
                      {topMvp && (
                        <Link href={`/player/${encodeURIComponent(topMvp[0])}`} className="flex items-center gap-2 bg-white/10 rounded-lg p-2 hover:bg-white/15 transition-colors">
                          <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider w-16 shrink-0">Your MVP</span>
                          <span className="text-xs font-bold flex-1 truncate">🌟 {topMvp[0]}</span>
                          <span className="text-[10px] opacity-80 shrink-0">×{topMvp[1]}</span>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Your Stats */}
            {logs.filter(l => l.rating > 0).length > 0 && (() => {
              const rated = logs.filter(l => l.rating > 0);
              const total = rated.length;
              const avgRating = (rated.reduce((s, l) => s + l.rating, 0) / total).toFixed(1);

              // Per-team breakdown (combine home + away appearances)
              const teamStats = {};
              rated.forEach(l => {
                [l.awayTeam, l.homeTeam].forEach(t => {
                  if (!t) return;
                  if (!teamStats[t]) teamStats[t] = { count: 0, sum: 0 };
                  teamStats[t].count++;
                  teamStats[t].sum += l.rating;
                });
              });
              const topTeams = Object.entries(teamStats)
                .filter(([, s]) => s.count >= 1)
                .map(([t, s]) => ({ team: t, count: s.count, avg: (s.sum / s.count).toFixed(1) }))
                .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));
              const bestTeams = topTeams.slice(0, 3);
              const worstTeams = [...topTeams].reverse().slice(0, 3);

              // Worth-it breakdown (only those with answers)
              const withWorth = rated.filter(l => l.worthIt);
              const yesCount = withWorth.filter(l => l.worthIt === "yes").length;
              const noCount = withWorth.filter(l => l.worthIt === "no").length;
              const mehCount = withWorth.filter(l => l.worthIt === "meh").length;
              const worthPct = withWorth.length > 0 ? Math.round((yesCount / withWorth.length) * 100) : 0;

              // Watch-how breakdown
              const watchCounts = {};
              rated.forEach(l => { if (l.watchHow) watchCounts[l.watchHow] = (watchCounts[l.watchHow] || 0) + 1; });
              const topWatch = Object.entries(watchCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

              // By season
              const seasonStats = {};
              rated.forEach(l => {
                const s = l.season || "?";
                if (!seasonStats[s]) seasonStats[s] = { count: 0, sum: 0 };
                seasonStats[s].count++;
                seasonStats[s].sum += l.rating;
              });
              const seasonRows = Object.entries(seasonStats)
                .map(([s, v]) => ({ season: s, count: v.count, avg: (v.sum / v.count).toFixed(1) }))
                .sort((a, b) => parseInt(b.season) - parseInt(a.season));

              // Top rated of all-time
              const topRated = [...rated].sort((a, b) => b.rating - a.rating).slice(0, 5);

              return (
                <div className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 mb-4">
                  <h3 className="text-base font-bold text-white mb-3">📊 Your Stats</h3>

                  {/* Worth-it pie */}
                  {withWorth.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-zinc-950">
                      <div className="flex justify-between items-baseline mb-2">
                        <span className="text-sm font-semibold text-white">👀 Worth Watching</span>
                        <span className="text-2xl font-extrabold text-green-400">{worthPct}%</span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden bg-zinc-900">
                        {yesCount > 0 && <div style={{ width: `${(yesCount / withWorth.length) * 100}%`, backgroundColor: "#22c55e" }} />}
                        {mehCount > 0 && <div style={{ width: `${(mehCount / withWorth.length) * 100}%`, backgroundColor: "#eab308" }} />}
                        {noCount > 0 && <div style={{ width: `${(noCount / withWorth.length) * 100}%`, backgroundColor: "#ef4444" }} />}
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
                        <span>👍 {yesCount}</span>
                        <span>😐 {mehCount}</span>
                        <span>👎 {noCount}</span>
                      </div>
                    </div>
                  )}

                  {/* Best & Worst teams */}
                  {topTeams.length > 1 && (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="p-3 rounded-xl bg-zinc-950">
                        <div className="text-[10px] font-bold text-green-400 tracking-widest uppercase mb-2">Most Fun</div>
                        {bestTeams.map(t => (
                          <div key={t.team} className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-white">{t.team}</span>
                            <span className="text-sm font-bold" style={{ color: rc(parseFloat(t.avg)) }}>{t.avg}</span>
                          </div>
                        ))}
                      </div>
                      <div className="p-3 rounded-xl bg-zinc-950">
                        <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mb-2">Most Painful</div>
                        {worstTeams.map(t => (
                          <div key={t.team} className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-white">{t.team}</span>
                            <span className="text-sm font-bold" style={{ color: rc(parseFloat(t.avg)) }}>{t.avg}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Where you watch */}
                  {topWatch.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-zinc-950">
                      <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2">How You Watch</div>
                      {topWatch.map(([w, count]) => (
                        <div key={w} className="flex justify-between items-center mb-1">
                          <span className="text-sm text-white">{w}</span>
                          <span className="text-xs font-bold text-zinc-400">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* By season */}
                  {seasonRows.length > 1 && (
                    <div className="mb-4 p-3 rounded-xl bg-zinc-950">
                      <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2">By Season</div>
                      {seasonRows.map(r => (
                        <div key={r.season} className="flex justify-between items-center mb-1">
                          <span className="text-sm text-white">{r.season} <span className="text-zinc-600 text-xs">({r.count})</span></span>
                          <span className="text-sm font-bold" style={{ color: rc(parseFloat(r.avg)) }}>{r.avg}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Your top rated */}
                  {topRated.length > 0 && (
                    <div className="p-3 rounded-xl bg-zinc-950">
                      <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-2">⭐ Your Top Rated</div>
                      {topRated.map((l, i) => (
                        <Link key={l.gameId} href={`/game/${l.gameId}`} className="flex items-center gap-2 py-1.5 hover:bg-zinc-900 rounded-lg px-1.5 -mx-1.5 transition-colors">
                          <span className="text-xs font-extrabold w-4" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#a1a1aa" : i === 2 ? "#b45309" : "#52525b" }}>{i + 1}</span>
                          <div className="flex-1 text-xs font-bold text-white">{l.awayTeam} {l.awayScore}—{l.homeTeam} {l.homeScore}</div>
                          <span className="text-xs text-zinc-500">Wk {l.week || "?"}</span>
                          <span className="text-sm font-extrabold" style={{ color: rc(l.rating) }}>{l.rating}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Rating Distribution */}
            {sportLogs.length > 0 && (
              <div id="rating-dist" className="rounded-2xl p-4 bg-zinc-900 border border-zinc-800 scroll-mt-20">
                <h3 className="text-base font-bold text-white mb-3">{profileSport === "mlb" ? "⚾" : "🏈"} Rating Distribution</h3>
                <RBars
                  dist={Array(10).fill(0).map((_, i) => sportLogs.filter((l) => l.rating > 0 && Math.round(l.rating) === i + 1).length)}
                  onBarClick={(rating) => {
                    const games = sportLogs.filter(l => l.rating > 0 && Math.round(l.rating) === rating);
                    setBarDrilldown({ rating, games });
                  }}
                />
              </div>
            )}
            </>}
          </div>
        )}
      </div>

      {/* Bar drilldown modal */}
      {barDrilldown && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" onClick={() => setBarDrilldown(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-zinc-800 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-zinc-950 px-5 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Games You Rated</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-lg font-bold text-white">{barDrilldown.games.length} {barDrilldown.games.length === 1 ? "game" : "games"} at</span>
                  <span className="text-xl font-extrabold px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor: rc(barDrilldown.rating) }}>{barDrilldown.rating}</span>
                </div>
              </div>
              <button onClick={() => setBarDrilldown(null)} className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-lg font-bold">×</button>
            </div>
            <div className="p-5">
              {barDrilldown.games.map(l => (
                <Link key={l.gameId} href={`/game/${l.gameId}`} onClick={() => setBarDrilldown(null)} className="block">
                  <div className="flex items-center gap-3 p-3 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{l.awayTeam} {l.awayScore}—{l.homeTeam} {l.homeScore}</div>
                      <div className="text-[10px] text-zinc-500">Wk {l.week || "?"} · {l.season || "?"}</div>
                      {l.review && <div className="text-xs text-zinc-400 italic mt-1 line-clamp-2">&quot;{l.review}&quot;</div>}
                    </div>
                    <div className="w-11 h-11 flex items-center justify-center text-white font-extrabold rounded-xl text-base shrink-0" style={{ backgroundColor: rc(l.rating) }}>{l.rating}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          {/* Success overlay */}
          {profileSaved && (
            <>
              <style>{`
                @keyframes nbCheckPop {
                  0% { opacity: 0; transform: scale(0.3); }
                  60% { opacity: 1; transform: scale(1.15); }
                  100% { opacity: 1; transform: scale(1); }
                }
                @keyframes nbCheckRing {
                  0% { transform: scale(0.6); opacity: 0.8; }
                  100% { transform: scale(1.8); opacity: 0; }
                }
                @keyframes nbFadeIn { from { opacity: 0; } to { opacity: 1; } }
              `}</style>
              <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ animation: "nbFadeIn 0.2s ease-out" }}>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-green-500/40" style={{ animation: "nbCheckRing 0.9s ease-out" }} />
                    <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center text-white text-4xl font-bold" style={{ animation: "nbCheckPop 0.45s cubic-bezier(0.34,1.56,0.64,1)" }}>
                      ✓
                    </div>
                  </div>
                  <div className="mt-4 text-lg font-extrabold text-white" style={{ animation: "nbFadeIn 0.3s ease-out 0.2s both" }}>Profile Saved</div>
                </div>
              </div>
            </>
          )}
          <div className="w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-zinc-800 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-zinc-950 px-5 pt-5 pb-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="text-lg font-bold text-white">Edit Profile</div>
              <button onClick={() => setShowEditProfile(false)} className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-lg font-bold">×</button>
            </div>
            <div className="p-5">{/* scrollable body */}

            {/* Status banner */}
            {handleError && (
              <>
                <style>{`
                  @keyframes nbBannerIn {
                    0% { opacity: 0; transform: translateY(-8px); }
                    100% { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
                <div
                  className={`mb-4 px-3 py-2.5 rounded-lg text-sm font-bold text-center flex items-center justify-center gap-2 ${
                    handleError.startsWith("✓") ? "bg-green-600/90 text-white" :
                    handleError === "Saving..." ? "bg-zinc-800 text-zinc-200" :
                    "bg-red-600/90 text-white"
                  }`}
                  style={{ animation: "nbBannerIn 0.22s ease-out" }}
                >
                  {handleError === "Saving..." && (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                  )}
                  {handleError.startsWith("✓") && <span className="text-base leading-none">✓</span>}
                  <span>{handleError.replace("✓ ", "").replace("...", "…")}</span>
                </div>
              </>
            )}

            {/* Avatar upload */}
            <div className="mb-4 flex items-center gap-4">
              <div className="relative shrink-0">
                {editAvatarUrl ? (
                  <img src={editAvatarUrl} referrerPolicy="no-referrer" className="w-20 h-20 rounded-full border-2 border-zinc-800 object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full border-2 border-zinc-800 bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white text-2xl font-extrabold">
                    {(editDisplayName || profile?.handle || "U")[0]?.toUpperCase()}
                  </div>
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center text-white text-xs font-bold">...</div>
                )}
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Profile Photo</label>
                <div className="flex gap-2 mt-1.5">
                  <label className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer hover:bg-red-700 transition-colors">
                    📷 Upload
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) uploadAvatar(e.target.files[0]); e.target.value = ""; }} />
                  </label>
                  {editAvatarUrl && (
                    <button onClick={clearAvatar} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors">
                      Remove
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-zinc-600 mt-1">JPG, PNG, or WEBP · max 5MB</div>
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Handle</label>
              <div className="flex items-center mt-1 rounded-xl bg-zinc-900 border border-zinc-800 px-3">
                <span className="text-zinc-500 text-sm">@</span>
                <input value={editHandle} onChange={(e) => { setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setHandleError(""); }}
                  className="flex-1 py-2.5 bg-transparent text-white text-sm outline-none" />
              </div>
              <div className="text-xs text-zinc-600 mt-1">3-20 chars, letters/numbers/underscores only</div>
            </div>

            <div className="mb-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Display Name</label>
              <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600" />
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Bio</label>
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value.slice(0, 160))} rows={3} placeholder="Tell people about yourself..."
                className="w-full mt-1 px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 resize-none" />
              <div className="text-xs text-zinc-600 mt-1">{editBio.length}/160</div>
            </div>

            {FAV_SPORTS.map((s) => {
              const sel = editTeams[s.id] || "";
              const pick = (t) => setEditTeams((prev) => ({ ...prev, [s.id]: t }));
              return (
                <div key={s.id} className="mb-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{s.emoji} Favorite {s.label} Team</label>
                    <span className="text-xs font-bold text-red-400">{sel ? teamName(s.id, sel) : "Not set"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-2 mt-1 rounded-xl bg-zinc-900 border border-zinc-800">
                    <button onClick={() => pick("")} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${sel === "" ? "bg-zinc-700 text-white border-zinc-600" : "bg-zinc-950 text-zinc-500 border-transparent"}`}>None</button>
                    {(TEAMS_BY_SPORT[s.id] || []).map((t) => (
                      <button key={t} onClick={() => pick(t)} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${sel === t ? "bg-red-600 text-white border-red-600" : "bg-zinc-950 text-zinc-500 border-transparent"}`}>{t}</button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="text-[10px] text-zinc-600 mb-4 -mt-2">Used for fandom filters on each sport&apos;s games.</div>

            <div className="flex gap-2">
              <button onClick={() => setShowEditProfile(false)} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 font-semibold text-sm">Cancel</button>
              <button onClick={async () => {
                if (!editHandle.trim() || editHandle.length < 3) {
                  setHandleError("Handle must be at least 3 characters");
                  return;
                }
                if (editHandle.length > 20) {
                  setHandleError("Handle max 20 characters");
                  return;
                }
                setHandleError("Saving...");
                try {
                  const tRes = await sbFetch(`profiles?handle=eq.${editHandle}&select=user_id`);
                  const tArr = await tRes.json();
                  const taken = tArr && tArr[0];
                  if (taken && taken.user_id !== user.id) {
                    setHandleError("Handle already taken");
                    return;
                  }
                  const uRes = await sbFetch(`profiles?user_id=eq.${user.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      handle: editHandle,
                      display_name: editDisplayName || null,
                      bio: editBio || null,
                      ...Object.fromEntries(FAV_SPORTS.map((s) => [favKey(s.id), editTeams[s.id] || null])),
                      avatar_url: editAvatarUrl || null,
                      updated_at: new Date().toISOString(),
                    }),
                  });
                  if (!uRes.ok) {
                    const errTxt = await uRes.text();
                    setHandleError(`Save failed: ${errTxt.substring(0, 80)}`);
                    return;
                  }
                  await refreshProfile();
                  setHandleError("");
                  setProfileSaved(true);
                  setTimeout(() => { setProfileSaved(false); setShowEditProfile(false); }, 1500);
                } catch (e) { console.error(e); setHandleError(`Error: ${e.message}`); }
              }} disabled={handleError === "Saving..."} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {handleError === "Saving..." && <span className="inline-block w-3.5 h-3.5 border-2 border-red-300 border-t-white rounded-full animate-spin" />}
                {handleError === "Saving..." ? "Saving…" : "Save Changes"}
              </button>
            </div>
            </div>{/* /scrollable body */}
          </div>
        </div>
      )}

      {/* New List Modal */}
      {showNewList && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-5" onClick={() => setShowNewList(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <div className="text-base font-bold text-white mb-3">Create New List</div>
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name..." autoFocus
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm outline-none mb-3" />
            <div className="flex gap-2">
              <button onClick={async () => {
                if (!newListName.trim() || !user) return;
                try {
                  const cRes = await sbFetch(`lists`, {
                    method: "POST",
                    headers: { "Prefer": "return=representation" },
                    body: JSON.stringify({ user_id: user.id, name: newListName.trim(), icon: "📋" })
                  });
                  if (cRes.ok) {
                    const arr = await sbJson(cRes);
                    const data = Array.isArray(arr) ? arr[0] : arr;
                    if (data) setLists([...lists, data]);
                  }
                } catch (e) { console.error("Create list:", e); }
                setNewListName("");
                setShowNewList(false);
              }}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm">Create</button>
              <button onClick={() => setShowNewList(false)} className="px-4 py-2.5 bg-zinc-800 text-zinc-400 rounded-xl font-semibold text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications panel */}
      {showNotifs && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" onClick={() => setShowNotifs(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-zinc-800 max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-zinc-950 px-5 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="text-base font-bold text-white">🔔 Notifications</div>
              <button onClick={() => setShowNotifs(false)} className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-lg font-bold">×</button>
            </div>
            <div className="p-4">
              {notifPerm === "default" && (
                <button onClick={enableNotifs} className="w-full mb-3 py-2.5 rounded-xl bg-red-600/10 border border-red-600/30 text-red-400 text-xs font-bold">
                  🔔 Enable browser alerts for new activity
                </button>
              )}
              {notifPerm === "denied" && (
                <div className="mb-3 text-[10px] text-zinc-600 text-center">Browser alerts are blocked — enable them in your browser&apos;s site settings.</div>
              )}
              {notifs.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-2">🔕</div>
                  <div className="text-sm font-bold text-white">Nothing yet</div>
                  <div className="text-xs text-zinc-500 mt-1">Follow people, rate games, and join discussions to see activity here.</div>
                </div>
              ) : notifs.map((n) => {
                const name = n.profile?.display_name || `@${n.profile?.handle || "someone"}`;
                const when = new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const avatar = n.profile?.avatar_url ? (
                  <img src={n.profile.avatar_url} referrerPolicy="no-referrer" className="w-9 h-9 rounded-full shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-xs font-bold text-white shrink-0">{(n.profile?.display_name || n.profile?.handle || "?")[0]?.toUpperCase()}</div>
                );
                if (n.type === "follow") {
                  return (
                    <Link key={n.id} href={n.profile?.handle ? `/u/${n.profile.handle}` : "#"} onClick={() => setShowNotifs(false)} className="block">
                      <div className="flex items-center gap-3 p-2.5 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                        {avatar}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white"><span className="font-bold">{name}</span><span className="text-zinc-500"> followed you</span></div>
                          <div className="text-[10px] text-zinc-600">{when}</div>
                        </div>
                        <span className="text-lg shrink-0">👤</span>
                      </div>
                    </Link>
                  );
                }
                if (n.type === "reaction") {
                  return (
                    <div key={n.id} className="flex items-center gap-3 p-2.5 rounded-xl mb-2 bg-zinc-900 border border-zinc-800">
                      {avatar}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white"><span className="font-bold">{name}</span><span className="text-zinc-500"> reacted to your comment</span></div>
                        <div className="text-[10px] text-zinc-600">{when}</div>
                      </div>
                      <span className="text-xl shrink-0">{n.data.emoji}</span>
                    </div>
                  );
                }
                const r = n.data;
                return (
                  <Link key={n.id} href={gameHref(r.game_id, r.sport, r.game_date)} onClick={() => setShowNotifs(false)} className="block">
                    <div className="flex items-center gap-3 p-2.5 rounded-xl mb-2 bg-zinc-900 border border-zinc-800 hover:border-red-600/40 transition-all">
                      {avatar}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white"><span className="font-bold">{name}</span> <span className="text-zinc-500">rated</span></div>
                        <div className="text-sm font-bold text-white truncate">{r.away_team} {r.away_score} — {r.home_team} {r.home_score}</div>
                        <div className="text-[10px] text-zinc-600">{when}</div>
                      </div>
                      <div className="w-9 h-9 flex items-center justify-center text-white font-extrabold rounded-lg text-sm shrink-0" style={{ backgroundColor: rc(parseFloat(r.rating)) }}>{parseFloat(r.rating).toFixed(1)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Nav tab={tab} setTab={setTab} />
    </div>
  );
}


// For now the World Cup is the front door: a bare visit to "/" lands on the
// Cup to hook people. The games feed still lives here — the bottom-nav "Games"
// tab and in-app links reach it via /?tab=games, which renders normally.
function RootGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasTab = searchParams.has("tab");
  useEffect(() => {
    if (!hasTab) router.replace("/worldcup");
  }, [hasTab, router]);
  if (!hasTab) return <div className="min-h-screen bg-[#09090b]" />;
  return <HomeContent />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090b]" />}>
      <RootGate />
    </Suspense>
  );
}
