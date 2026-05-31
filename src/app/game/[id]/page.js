"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { emotesFor, nameColor } from "@/lib/drops";
import { makeRatingCard } from "@/lib/shareCard";
import { repScore, repTier } from "@/lib/reputation";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SPORT_PATHS = {
  nfl: "football/nfl",
  mlb: "baseball/mlb",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
};
const ALL_SPORTS = ["nfl", "mlb", "nba", "nhl"];
// Period count that signals overtime/extras (MLB innings, NBA quarters, NHL periods)
const OT_THRESHOLD = { mlb: 9, nba: 4, nhl: 3, nfl: 4 };
const ESPN = `${ESPN_BASE}/${SPORT_PATHS.nfl}`; // legacy

// NFL stadium coordinates for weather lookups (Open-Meteo)
const STADIUM_COORDS = {
  ARI: { lat: 33.5276, lon: -112.2626, indoor: true },
  ATL: { lat: 33.7553, lon: -84.4006, indoor: true },
  BAL: { lat: 39.2779, lon: -76.6228, indoor: false },
  BUF: { lat: 42.7738, lon: -78.7867, indoor: false },
  CAR: { lat: 35.2258, lon: -80.8528, indoor: false },
  CHI: { lat: 41.8623, lon: -87.6167, indoor: false },
  CIN: { lat: 39.0954, lon: -84.5160, indoor: false },
  CLE: { lat: 41.5061, lon: -81.6995, indoor: false },
  DAL: { lat: 32.7473, lon: -97.0945, indoor: true },
  DEN: { lat: 39.7439, lon: -105.0201, indoor: false },
  DET: { lat: 42.3400, lon: -83.0456, indoor: true },
  GB:  { lat: 44.5013, lon: -88.0622, indoor: false },
  HOU: { lat: 29.6847, lon: -95.4107, indoor: true },
  IND: { lat: 39.7601, lon: -86.1639, indoor: true },
  JAX: { lat: 30.3239, lon: -81.6373, indoor: false },
  KC:  { lat: 39.0489, lon: -94.4839, indoor: false },
  LAC: { lat: 33.9534, lon: -118.3392, indoor: true },
  LAR: { lat: 33.9534, lon: -118.3392, indoor: true },
  LV:  { lat: 36.0909, lon: -115.1833, indoor: true },
  MIA: { lat: 25.9580, lon: -80.2388, indoor: false },
  MIN: { lat: 44.9737, lon: -93.2581, indoor: true },
  NE:  { lat: 42.0909, lon: -71.2643, indoor: false },
  NO:  { lat: 29.9510, lon: -90.0814, indoor: true },
  NYG: { lat: 40.8135, lon: -74.0745, indoor: false },
  NYJ: { lat: 40.8135, lon: -74.0745, indoor: false },
  PHI: { lat: 39.9008, lon: -75.1675, indoor: false },
  PIT: { lat: 40.4468, lon: -80.0158, indoor: false },
  SEA: { lat: 47.5952, lon: -122.3316, indoor: false },
  SF:  { lat: 37.4030, lon: -121.9697, indoor: false },
  TB:  { lat: 27.9759, lon: -82.5033, indoor: false },
  TEN: { lat: 36.1665, lon: -86.7713, indoor: false },
  WSH: { lat: 38.9077, lon: -76.8645, indoor: false },
  // MLB stadiums (using same key when team abbr overlaps with NFL is fine - sport disambiguates)
  BOS: { lat: 42.3467, lon: -71.0972, indoor: false },     // Fenway Park
  CHC: { lat: 41.9484, lon: -87.6553, indoor: false },     // Wrigley Field
  CHW: { lat: 41.8300, lon: -87.6338, indoor: false },     // Guaranteed Rate Field
  COL: { lat: 39.7559, lon: -104.9942, indoor: false },    // Coors Field
  LAA: { lat: 33.8003, lon: -117.8827, indoor: false },    // Angel Stadium
  LAD: { lat: 34.0739, lon: -118.2400, indoor: false },    // Dodger Stadium
  MIL: { lat: 43.0280, lon: -87.9712, indoor: true },      // American Family Field (retractable)
  NYM: { lat: 40.7571, lon: -73.8458, indoor: false },     // Citi Field
  NYY: { lat: 40.8296, lon: -73.9262, indoor: false },     // Yankee Stadium
  OAK: { lat: 37.7516, lon: -122.2003, indoor: false },    // Sutter Health Park / Coliseum
  SD:  { lat: 32.7073, lon: -117.1566, indoor: false },    // Petco Park
  STL: { lat: 38.6226, lon: -90.1928, indoor: false },     // Busch Stadium
  TEX: { lat: 32.7475, lon: -97.0828, indoor: true },      // Globe Life Field (retractable)
  TOR: { lat: 43.6414, lon: -79.3894, indoor: true },      // Rogers Centre (retractable)
  // Note: NFL has ARI/ATL/BAL/CIN/CLE/DET/HOU/KC/MIA/MIN/PHI/PIT/SEA/SF/TB/WSH overlapping abbrs with MLB.
  // For these, the stadium coords listed above (NFL stadiums) won't match the MLB ballpark exactly,
  // but they're in the same city so weather will still be very close. Acceptable tradeoff.
};

// Open-Meteo weather code → label + emoji
function weatherInfo(code) {
  if (code === undefined || code === null) return { label: "Unknown", emoji: "❓" };
  if (code === 0) return { label: "Clear", emoji: "☀️" };
  if (code <= 3) return { label: "Partly Cloudy", emoji: "⛅" };
  if (code <= 48) return { label: "Foggy", emoji: "🌫️" };
  if (code <= 57) return { label: "Drizzle", emoji: "🌦️" };
  if (code <= 67) return { label: "Rain", emoji: "🌧️" };
  if (code <= 77) return { label: "Snow", emoji: "❄️" };
  if (code <= 82) return { label: "Showers", emoji: "🌧️" };
  if (code <= 86) return { label: "Snow Showers", emoji: "🌨️" };
  if (code >= 95) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "Cloudy", emoji: "☁️" };
}

// Smooth gradient: red (low) → orange → yellow → lime → green (high)
function rc(r) {
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

function ratingLabel(r) {
  if (r >= 9) return "INSTANT CLASSIC";
  if (r >= 7.5) return "GREAT GAME";
  if (r >= 6) return "GOOD";
  if (r >= 4) return "MEDIOCRE";
  if (r >= 2) return "BAD";
  return "TERRIBLE";
}

function autoMoods(g) {
  const m = [];
  if (g?.sport === "mlb") {
    if (g.total >= 15) m.push("💣 Slugfest");
    if (g.diff <= 1 && g.isFinal) m.push("🎯 Nail-biter");
    if (g.diff >= 8) m.push("💨 Blowout");
    if (g.ot) m.push("🔟 Extras");
    if (g.total <= 4 && g.isFinal) m.push("⚡ Pitcher's Duel");
  } else if (g?.sport === "nba") {
    if (g.total >= 240) m.push("🔥 Shootout");
    if (g.diff <= 3 && g.isFinal) m.push("🎯 Clutch");
    if (g.diff >= 20) m.push("💨 Blowout");
    if (g.ot) m.push("⏱️ OT");
    if (g.total <= 190 && g.isFinal) m.push("🛡️ Defensive");
  } else if (g?.sport === "nhl") {
    if (g.total >= 9) m.push("🚨 Goal Fest");
    if (g.diff <= 1 && g.isFinal) m.push("🎯 Nail-biter");
    if (g.diff >= 5) m.push("💨 Blowout");
    if (g.ot) m.push("⏱️ OT");
    if (g.total <= 3 && g.isFinal) m.push("🥅 Goalie Duel");
  } else {
    if (g.total >= 55) m.push("🔥 Shootout");
    if (g.diff <= 3 && g.isFinal) m.push("🎯 Clutch");
    if (g.diff >= 21) m.push("💨 Blowout");
    if (g.ot) m.push("⏱️ OT");
    if (g.total <= 30 && g.isFinal) m.push("🛡️ Defensive");
  }
  return m;
}

async function fetchGame(id, sport = "nfl") {
  // Try the requested sport first, then fall back to the others (handles cases
  // where the user lands on /game/X without a matching ?sport= param)
  const order = [sport, ...ALL_SPORTS.filter((s) => s !== sport)];
  for (const trySport of order) {
    const result = await fetchGameForSport(id, trySport);
    if (result) return result;
  }
  return null;
}

async function fetchGameForSport(id, sport) {
  try {
    const sportPath = SPORT_PATHS[sport] || SPORT_PATHS.nfl;
    const r = await fetch(`${ESPN_BASE}/${sportPath}/summary?event=${id}`);
    const d = await r.json();
    const c = d.header?.competitions?.[0];
    if (!c) return null;
    const ts = c.competitors || [];
    const ho = ts.find((t) => t.homeAway === "home");
    const aw = ts.find((t) => t.homeAway === "away");
    if (!ho || !aw) return null;

    const players = [];
    (d.leaders || []).forEach((tl) => {
      const tm = tl.team?.abbreviation || "";
      (tl.leaders || []).forEach((cat) => {
        (cat.leaders || []).slice(0, 2).forEach((l) => {
          const name = l.athlete?.displayName;
          if (name && !players.find((p) => p.name === name))
            players.push({ name, tm, stat: l.displayValue });
        });
      });
    });

    if (players.length < 4) {
      (d.boxscore?.players || []).forEach((team) => {
        const tm = team.team?.abbreviation || "";
        (team.statistics || []).forEach((sg) => {
          (sg.athletes || []).slice(0, 3).forEach((a) => {
            const name = a.athlete?.displayName;
            if (name && !players.find((p) => p.name === name))
              players.push({ name, tm, stat: (a.stats || []).join(", ") });
          });
        });
      });
    }

    // Extract team-level stats from boxscore (NFL = flat, MLB = nested in categories)
    const teamStats = { away: {}, home: {} };
    (d.boxscore?.teams || []).forEach((team) => {
      const abbr = team.team?.abbreviation;
      const side = abbr === ho.team?.abbreviation ? "home" : "away";
      (team.statistics || []).forEach((stat) => {
        if (Array.isArray(stat.stats)) {
          // MLB-style: stat is a category (batting/pitching/fielding) containing stats[]
          stat.stats.forEach((s) => {
            teamStats[side][s.name] = {
              label: s.shortDisplayName || s.abbreviation || s.displayName || s.name,
              value: s.displayValue,
            };
          });
        } else {
          // NFL-style: stat is flat
          teamStats[side][stat.name] = {
            label: stat.label || stat.abbreviation || stat.name,
            value: stat.displayValue,
          };
        }
      });
    });

    // Full player stats by category, per team. NFL uses category.name (passing/
    // rushing/…), MLB category.type (batting/pitching), NHL category.name
    // (forwards/defenses/goalies). NBA is a single, often-unnamed flat category.
    const fullPlayerStats = { away: {}, home: {} };
    (d.boxscore?.players || []).forEach((team) => {
      const abbr = team.team?.abbreviation;
      const side = abbr === ho.team?.abbreviation ? "home" : "away";
      (team.statistics || []).forEach((category) => {
        const catName = category.name || category.type || (sport === "nba" ? "stats" : "");
        const players = (category.athletes || []).map(a => ({
          name: a.athlete?.displayName || "",
          jersey: a.athlete?.jersey || "",
          position: a.athlete?.position?.abbreviation || "",
          stats: a.stats || [],
        })).filter(p => p.name);
        if (players.length > 0 && catName) {
          fullPlayerStats[side][catName] = {
            label: category.text || category.name || category.type,
            keys: category.keys || [],
            labels: category.labels || category.names || category.descriptions || [],
            players,
          };
        }
      });
    });

    // Injuries by team
    const injuries = { away: [], home: [] };
    (d.injuries || []).forEach((teamInj) => {
      const abbr = teamInj.team?.abbreviation;
      const side = abbr === ho.team?.abbreviation ? "home" : "away";
      (teamInj.injuries || []).forEach((inj) => {
        injuries[side].push({
          name: inj.athlete?.displayName || "",
          position: inj.athlete?.position?.abbreviation || "",
          status: inj.status || "",
          statusAbbr: inj.type?.abbreviation || "",
          injuryType: inj.details?.type || inj.details?.detail || "",
          returnDate: inj.details?.returnDate || "",
        });
      });
      // Sort by severity: Out > Doubtful > Questionable > IR > others
      const severityOrder = { "Out": 0, "Doubtful": 1, "Questionable": 2, "IR": 3 };
      injuries[side].sort((a, b) => (severityOrder[a.status] ?? 99) - (severityOrder[b.status] ?? 99));
    });

    // ATS records per team
    const atsRecords = { away: [], home: [] };
    (d.againstTheSpread || []).forEach((teamAts) => {
      const abbr = teamAts.team?.abbreviation;
      const side = abbr === ho.team?.abbreviation ? "home" : "away";
      atsRecords[side] = (teamAts.atsRecords || []).map(rec => ({
        type: rec.type || "",
        wins: rec.wins ?? 0,
        losses: rec.losses ?? 0,
        ties: rec.ties ?? 0,
      }));
    });

    // Standings position lookup
    const standingsPos = { away: null, home: null };
    (d.standings?.groups || []).forEach((group) => {
      const entries = group.standings?.entries || [];
      // group.header looks like "2025 AFC North Standings" - extract just the division name
      const rawName = group.header || group.name || "";
      const divName = rawName.replace(/^\d{4}\s+/, "").replace(/\s+Standings$/, "").trim();
      entries.forEach((entry, idx) => {
        const teamId = entry.id || entry.team?.id;
        if (teamId === ho.team?.id) standingsPos.home = { rank: idx + 1, division: divName };
        if (teamId === aw.team?.id) standingsPos.away = { rank: idx + 1, division: divName };
      });
    });

    // Build MVP candidate roster from boxscore — every player who appeared, with a headline stat line
    const mvpCandidates = [];
    const seenNames = new Set();
    const addCandidates = (side, teamAbbr, teamColor) => {
      const cats = fullPlayerStats[side] || {};
      // Stat-line formatters per category
      const fmtStatLine = (catName, labels, stats) => {
        const get = (label) => {
          const idx = labels.indexOf(label);
          return idx >= 0 ? stats[idx] : null;
        };
        if (sport === "mlb") {
          if (catName === "batting") {
            const h = get("H"), ab = get("AB"), hr = get("HR"), rbi = get("RBI"), r = get("R");
            const bits = [];
            if (h != null && ab != null) bits.push(`${h}-${ab}`);
            if (hr && hr !== "0") bits.push(`${hr} HR`);
            if (rbi && rbi !== "0") bits.push(`${rbi} RBI`);
            if (r && r !== "0") bits.push(`${r} R`);
            return bits.join(" · ");
          }
          if (catName === "pitching") {
            const ip = get("IP"), k = get("K"), er = get("ER"), h = get("H");
            const bits = [];
            if (ip != null) bits.push(`${ip} IP`);
            if (k != null) bits.push(`${k} K`);
            if (er != null) bits.push(`${er} ER`);
            return bits.join(" · ");
          }
        } else if (sport === "nba") {
          // Flat box score — headline with points / rebounds / assists
          const pts = get("PTS"), reb = get("REB"), ast = get("AST");
          const bits = [];
          if (pts != null) bits.push(`${pts} PTS`);
          if (reb != null && reb !== "0") bits.push(`${reb} REB`);
          if (ast != null && ast !== "0") bits.push(`${ast} AST`);
          return bits.join(" · ");
        } else if (sport === "nhl") {
          if (catName === "goalies") {
            const sv = get("SV") ?? get("SAVES"), ga = get("GA"), svpct = get("SV%");
            const bits = [];
            if (sv != null) bits.push(`${sv} SV`);
            if (ga != null) bits.push(`${ga} GA`);
            if (svpct != null) bits.push(`${svpct} SV%`);
            return bits.join(" · ");
          } else {
            // Skaters (forwards / defenses): goals, assists, shots
            const g_ = get("G"), a = get("A"), sog = get("SOG") ?? get("S");
            const bits = [];
            if (g_ != null && g_ !== "0") bits.push(`${g_} G`);
            if (a != null && a !== "0") bits.push(`${a} A`);
            if (sog != null && sog !== "0") bits.push(`${sog} SOG`);
            return bits.join(" · ") || `${g_ || 0}G ${a || 0}A`;
          }
        } else {
          if (catName === "passing") {
            const ca = get("C/ATT"), yds = get("YDS"), td = get("TD"), int = get("INT");
            const bits = [];
            if (ca) bits.push(ca);
            if (yds) bits.push(`${yds} YDS`);
            if (td && td !== "0") bits.push(`${td} TD`);
            if (int && int !== "0") bits.push(`${int} INT`);
            return bits.join(" · ");
          }
          if (catName === "rushing") {
            const car = get("CAR"), yds = get("YDS"), td = get("TD");
            const bits = [];
            if (car) bits.push(`${car} CAR`);
            if (yds) bits.push(`${yds} YDS`);
            if (td && td !== "0") bits.push(`${td} TD`);
            return bits.join(" · ");
          }
          if (catName === "receiving") {
            const rec = get("REC"), yds = get("YDS"), td = get("TD");
            const bits = [];
            if (rec) bits.push(`${rec} REC`);
            if (yds) bits.push(`${yds} YDS`);
            if (td && td !== "0") bits.push(`${td} TD`);
            return bits.join(" · ");
          }
          if (catName === "defensive") {
            const tot = get("TOT"), sacks = get("SACKS"), int = get("INT");
            const bits = [];
            if (tot) bits.push(`${tot} TKL`);
            if (sacks && sacks !== "0") bits.push(`${sacks} SACK`);
            if (int && int !== "0") bits.push(`${int} INT`);
            return bits.join(" · ");
          }
        }
        return "";
      };
      // Priority categories first (the "skill" positions)
      const catOrder = sport === "mlb"
        ? ["batting", "pitching"]
        : sport === "nba"
        ? Object.keys(cats)
        : sport === "nhl"
        ? ["forwards", "defenses", "goalies"]
        : ["passing", "rushing", "receiving", "defensive"];
      catOrder.forEach((catName) => {
        const cat = cats[catName];
        if (!cat) return;
        cat.players.forEach((p) => {
          if (!p.name || seenNames.has(p.name)) return;
          seenNames.add(p.name);
          const statLine = fmtStatLine(catName, cat.labels || [], p.stats || []);
          mvpCandidates.push({
            name: p.name,
            team: teamAbbr,
            teamColor,
            position: p.position || "",
            category: catName,
            statLine,
          });
        });
      });
    };
    addCandidates("away", aw.team?.abbreviation || "", "#" + (aw.team?.color || "333"));
    addCandidates("home", ho.team?.abbreviation || "", "#" + (ho.team?.color || "333"));

    // Probable starting pitchers (MLB) — from header competition competitors
    const probablePitchers = { away: null, home: null };
    if (sport === "mlb") {
      const hc = d.header?.competitions?.[0];
      (hc?.competitors || []).forEach((comp) => {
        const side = comp.homeAway === "home" ? "home" : "away";
        const prob = (comp.probables || [])[0];
        if (prob?.athlete) {
          const cats = prob.statistics?.splits?.categories || [];
          const stat = (name) => {
            const c2 = cats.find(x => x.name === name || x.abbreviation === name);
            return c2 ? c2.displayValue : null;
          };
          probablePitchers[side] = {
            name: prob.athlete.displayName || "",
            headshot: prob.athlete.headshot?.href || "",
            jersey: prob.athlete.jersey || "",
            throws: prob.athlete.throws?.abbreviation || "",
            wins: stat("wins") || stat("W"),
            losses: stat("losses") || stat("L"),
            era: stat("ERA"),
            whip: stat("WHIP"),
            strikeouts: stat("strikeouts") || stat("K"),
          };
        }
      });
    }

    const st = c.status?.type?.name || "STATUS_FINAL";
    const statusDetail = c.status?.type?.shortDetail || c.status?.type?.detail || "";
    return {
      id, sport, status: st, statusDetail,
      isPre: st === "STATUS_SCHEDULED", isFinal: st === "STATUS_FINAL",
      isLive: st === "STATUS_IN_PROGRESS" || st === "STATUS_HALFTIME" || st === "STATUS_END_PERIOD" || st === "STATUS_END_OF_INNING" || st === "STATUS_DELAYED" || st === "STATUS_RAIN_DELAY",
      date: c.date, venue: d.gameInfo?.venue?.fullName || "",
      venueCity: d.gameInfo?.venue?.address?.city || "",
      venueState: d.gameInfo?.venue?.address?.state || "",
      attendance: d.gameInfo?.attendance,
      week: d.header?.week || 0, season: d.header?.season?.year || 2024,
      net: c.broadcasts?.[0]?.names?.[0] || "",
      home: {
        name: ho.team?.displayName || "", abbr: ho.team?.abbreviation || "",
        color: "#" + (ho.team?.color || "333"), logo: ho.team?.logos?.[0]?.href || "",
        record: ho.record?.[0]?.displayValue || "", score: parseInt(ho.score) || 0,
        q: (ho.linescores || []).map((q) => q.displayValue),
        leaders: players.filter((p) => p.tm === ho.team?.abbreviation).slice(0, 3),
      },
      away: {
        name: aw.team?.displayName || "", abbr: aw.team?.abbreviation || "",
        color: "#" + (aw.team?.color || "333"), logo: aw.team?.logos?.[0]?.href || "",
        record: aw.record?.[0]?.displayValue || "", score: parseInt(aw.score) || 0,
        q: (aw.linescores || []).map((q) => q.displayValue),
        leaders: players.filter((p) => p.tm === aw.team?.abbreviation).slice(0, 3),
      },
      players,
      mvpCandidates,
      teamStats,
      fullPlayerStats,
      injuries,
      atsRecords,
      standingsPos,
      probablePitchers,
      ot: (ho.linescores || []).length > (OT_THRESHOLD[sport] ?? 4),
      diff: Math.abs((parseInt(ho.score) || 0) - (parseInt(aw.score) || 0)),
      total: (parseInt(ho.score) || 0) + (parseInt(aw.score) || 0),
      odds: d.pickcenter?.[0]?.details || "", ou: d.pickcenter?.[0]?.overUnder || "",
    };
  } catch (e) { console.error(e); return null; }
}

const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "😡"];

function CommentItem({ comment, replies, user, replyingTo, setReplyingTo, replyText, setReplyText, onPostReply, onDelete, onReact, submitting, isReply, teamEmoji = "🏈", reactionEmojis = REACTION_EMOJIS, repMap = {} }) {
  const c = comment;
  const [showPicker, setShowPicker] = useState(false);
  // Group reactions by emoji
  const reactionCounts = {};
  (c.reactions || []).forEach(r => {
    if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, mine: false };
    reactionCounts[r.emoji].count++;
    if (user && r.user_id === user.id) reactionCounts[r.emoji].mine = true;
  });
  const sortedReactions = Object.entries(reactionCounts).sort((a, b) => b[1].count - a[1].count);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (!e.target.closest(`[data-picker="${c.id}"]`)) setShowPicker(false);
    };
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [showPicker, c.id]);

  const pickReaction = (emoji) => {
    onReact(c.id, emoji);
    setShowPicker(false);
  };

  return (
    <div className={`p-3 rounded-xl bg-zinc-950 border ${c.rating != null ? "border-l-2" : "border-zinc-800"} ${isReply ? "mt-2" : ""}`}
      style={c.rating != null ? { borderColor: "#27272a", borderLeftColor: rc(parseFloat(c.rating)) } : undefined}>
      <div className="flex items-start gap-2">
        <Link href={c.profile?.handle ? `/u/${c.profile.handle}` : "#"} className="shrink-0">
          {c.profile?.avatar_url ? (
            <img src={c.profile.avatar_url} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-xs font-bold text-white">
              {(c.profile?.display_name || c.profile?.handle || "?")[0]?.toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Link href={c.profile?.handle ? `/u/${c.profile.handle}` : "#"} className="text-sm font-bold text-white hover:text-red-400" style={nameColor(c.profile?.unlocked) ? { color: nameColor(c.profile.unlocked) } : undefined}>
              {c.profile?.display_name || (c.profile?.handle ? `@${c.profile.handle}` : "Anonymous")}
            </Link>
            {c.rating != null && (
              <span title="Rated this game" className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md text-white" style={{ backgroundColor: rc(parseFloat(c.rating)) }}>★ {parseFloat(c.rating)}</span>
            )}
            {repMap[c.user_id] && (
              <span title={`${repMap[c.user_id].name} · reputation`} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: repMap[c.user_id].color + "22", color: repMap[c.user_id].color }}>{repMap[c.user_id].emoji} {repMap[c.user_id].name}</span>
            )}
            {c.profile?.favorite_team && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-600/20 text-red-300 border border-red-600/30">{teamEmoji} {c.profile.favorite_team}</span>
            )}
            <span className="text-[10px] text-zinc-600">
              {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            {user?.id === c.user_id && (
              <button onClick={() => onDelete(c.id)} className="text-[10px] text-zinc-600 hover:text-red-400 ml-auto">delete</button>
            )}
          </div>
          <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{c.content}</div>

          {/* Reactions row */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {sortedReactions.map(([emoji, { count, mine }]) => (
              <button
                key={emoji}
                onClick={() => onReact(c.id, emoji)}
                className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 transition-all ${mine ? "bg-red-600/20 border border-red-600/40 text-red-300" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}
              >
                <span>{emoji}</span>
                <span className="font-bold">{count}</span>
              </button>
            ))}
            {/* Add reaction button */}
            <div className="relative" data-picker={c.id}>
              <button onClick={() => setShowPicker(!showPicker)} className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 hover:bg-zinc-800">
                {showPicker ? "×" : "+ 😀"}
              </button>
              {showPicker && (
                <div className="absolute bottom-full left-0 mb-1 flex flex-wrap max-w-[240px] bg-zinc-800 border border-zinc-700 rounded-2xl px-2 py-1.5 gap-1 z-20 shadow-xl">
                  {reactionEmojis.map(emoji => (
                    <button key={emoji} onClick={(e) => { e.stopPropagation(); pickReaction(emoji); }} className="text-lg hover:scale-125 transition-transform px-1">{emoji}</button>
                  ))}
                </div>
              )}
            </div>
            {!isReply && user && (
              <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText(""); }} className="text-[11px] text-zinc-500 hover:text-red-400 ml-1">
                {replyingTo === c.id ? "Cancel" : "Reply"}
              </button>
            )}
          </div>

          {/* Reply composer */}
          {replyingTo === c.id && (
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
                placeholder={`Reply to ${c.profile?.display_name || c.profile?.handle || "user"}...`}
                rows={2}
                className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-sm outline-none resize-none focus:border-red-600"
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] text-zinc-600">{replyText.length}/500</span>
                <button
                  onClick={() => onPostReply(c.id, replyText)}
                  disabled={!replyText.trim() || submitting}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-40">
                  {submitting ? "Posting..." : "Reply"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {replies && replies.length > 0 && (
        <div className="ml-10 mt-2 space-y-2 border-l-2 border-zinc-800 pl-3">
          {replies.map(r => (
            <CommentItem
              key={r.id}
              comment={r}
              replies={[]}
              user={user}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              replyText={replyText}
              setReplyText={setReplyText}
              onPostReply={onPostReply}
              onDelete={onDelete}
              onReact={onReact}
              submitting={submitting}
              isReply={true}
              teamEmoji={teamEmoji}
              reactionEmojis={reactionEmojis}
              repMap={repMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GamePage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const sportParam = searchParams.get("sport");
  const sport = ALL_SPORTS.includes(sportParam) ? sportParam : "nfl";
  // Fandom filters key off the favorite team for THIS sport. NFL lives in
  // `favorite_team`; others in `favorite_team_<sport>`. Alias it back to
  // `favorite_team` via PostgREST so downstream filtering stays uniform.
  const favSelect = sport === "nfl" ? "favorite_team" : `favorite_team:favorite_team_${sport}`;
  const sportTeamEmoji = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒" }[sport] || "🏈";
  const { user, profile } = useAuth();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Direct fetch helper - bypasses the supabase client (which hangs on this page)
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sbFetch = async (path, options = {}, retried = false) => {
    const tokenKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
    const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
    const token = session?.access_token;
    const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        "apikey": SUPA_KEY,
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 401 && !retried && session?.refresh_token) {
      try {
        const refreshRes = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "apikey": SUPA_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (refreshRes.ok) {
          const newSession = await refreshRes.json();
          const merged = { ...session, ...newSession };
          localStorage.setItem(tokenKey, JSON.stringify(merged));
          return sbFetch(path, options, true);
        }
      } catch (e) { console.error("Refresh error:", e); }
    }
    return res;
  };
  const sbJson = async (res) => {
    try {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  };
  const [phase, setPhase] = useState("post");
  const [showWiz, setShowWiz] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [step, setStep] = useState(0);

  // Rating state
  const [rating, setRating] = useState(7);
  const [refR, setRefR] = useState(5);
  const [entR, setEntR] = useState(7);
  const [mvp, setMvp] = useState("");
  const [letdown, setLetdown] = useState("");
  const [mvpSearch, setMvpSearch] = useState("");
  const [letdownSearch, setLetdownSearch] = useState("");
  const [watchHow, setWatchHow] = useState("");
  const [worthIt, setWorthIt] = useState("");
  const [review, setReview] = useState("");
  const [logged, setLogged] = useState(false);
  const [fav, setFav] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [userMoods, setUserMoods] = useState([]);

  // Hype / anticipation (for upcoming games)
  const [hype, setHype] = useState(0);          // this user's anticipation 1-10, 0 = not set
  const [showHype, setShowHype] = useState(false);
  const [hypeDraft, setHypeDraft] = useState(7);
  const [savingHype, setSavingHype] = useState(false);
  const [communityHype, setCommunityHype] = useState([]); // array of anticipation values

  // Rooting poll ("who are you rooting for?"). rootingReady=false hides the
  // feature gracefully when the `rooting_for` column hasn't been added yet.
  const [rootingFor, setRootingFor] = useState("");       // this user's pick (team abbr)
  const [rootingCounts, setRootingCounts] = useState({}); // { abbr: count }
  const [rootingReady, setRootingReady] = useState(false);

  // Lists
  const [lists, setLists] = useState([]);
  const [selectedLists, setSelectedLists] = useState([]);
  const [newListInline, setNewListInline] = useState("");

  // Community
  const [communityAvg, setCommunityAvg] = useState(null);
  const [communityCount, setCommunityCount] = useState(0);
  const [allCommunityRatings, setAllCommunityRatings] = useState([]);
  const [fandomFilter, setFandomFilter] = useState("all"); // all | home | away | neutral
  const [boxTab, setBoxTab] = useState("team"); // team | passing | rushing | receiving | defensive
  const [weather, setWeather] = useState(null); // { temp, wind, code, label, emoji, indoor, source }

  // Saving feedback
  const [saveStatus, setSaveStatus] = useState("");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [commentRep, setCommentRep] = useState({}); // user_id -> rep tier (for comment flair)
  const [commentSort, setCommentSort] = useState("top"); // 'top' (most reactions) | 'new'

  // Load game
  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchGame(id, sport);
      setGame(data);
      // Default to the phase that matches the game's state
      if (data) {
        if (data.isPre) setPhase("pre");
        else if (data.isLive) setPhase("live");
        else setPhase("post");
      }
      setLoading(false);
    }
    load();
  }, [id, sport]);

  // Load user rating + lists + selected lists
  useEffect(() => {
    if (!user) { setLogged(false); return; }
    let cancelled = false;
    async function loadUserData() {
      try {
        const rRes = await sbFetch(`ratings?game_id=eq.${id}&user_id=eq.${user.id}&select=*`);
        const rArr = await sbJson(rRes);
        const rData = rArr && rArr[0];
        if (cancelled) return;
        if (rData) {
          if (rData.rating) {
            setRating(parseFloat(rData.rating));
            setLogged(true);
          }
          setRefR(parseFloat(rData.ref_rating) || 5);
          setEntR(parseFloat(rData.ent_rating) || 7);
          setMvp(rData.mvp || "");
          setLetdown(rData.letdown || "");
          setWatchHow(rData.watch_how || "");
          setWorthIt(rData.worth_it || "");
          setReview(rData.review || "");
          setFav(rData.favorited || false);
          setPinned(rData.pinned || false);
          setUserMoods(rData.moods || []);
          if (rData.rooting_for) setRootingFor(rData.rooting_for);
          if (rData.anticipation != null) {
            setHype(parseFloat(rData.anticipation));
            setHypeDraft(parseFloat(rData.anticipation));
          }
        }
        const lRes = await sbFetch(`lists?user_id=eq.${user.id}&order=created_at.asc&select=*`);
        const lData = await sbJson(lRes);
        if (cancelled) return;
        if (lData) setLists(lData);
        const lgRes = await sbFetch(`list_games?user_id=eq.${user.id}&game_id=eq.${id}&select=list_id`);
        const lgData = await sbJson(lgRes);
        if (cancelled) return;
        if (lgData) setSelectedLists(lgData.map(l => l.list_id));
      } catch (e) { console.error("Load user data:", e); }
    }
    loadUserData();
    return () => { cancelled = true; };
  }, [user, id]);

  // Load community ratings
  useEffect(() => {
    let cancelled = false;
    async function loadCommunity() {
      try {
        const res = await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&rating=not.is.null&select=rating,user_id`);
        const data = await sbJson(res);
        if (cancelled) return;
        if (data && data.length > 0) {
          // Fetch profiles to get favorite_team for each rater
          const userIds = [...new Set(data.map(r => r.user_id))];
          const pRes = await sbFetch(`profiles?user_id=in.(${userIds.join(",")})&select=user_id,${favSelect}`);
          const profiles = await sbJson(pRes);
          const pmap = {};
          (profiles || []).forEach(p => { pmap[p.user_id] = p; });
          const enriched = data.map(r => ({ ...r, favorite_team: pmap[r.user_id]?.favorite_team || null }));
          setAllCommunityRatings(enriched);
        } else {
          setAllCommunityRatings([]);
        }
      } catch (e) { console.error("Community:", e); }
    }
    loadCommunity();
    // Community hype (anticipation) — for upcoming games
    (async () => {
      try {
        const hRes = await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&anticipation=not.is.null&select=anticipation`);
        const hData = await sbJson(hRes);
        if (!cancelled && hData) setCommunityHype(hData.map(x => parseFloat(x.anticipation)).filter(n => !isNaN(n)));
      } catch (e) {}
    })();
    // Also preload comment count for the badge
    (async () => {
      try {
        const cRes = await sbFetch(`comments?game_id=eq.${id}&order=created_at.desc&select=*`);
        const cData = await sbJson(cRes);
        if (!cancelled && cData && cData.length > 0) {
          // Just set count via comments state (we'll re-fetch with profiles when Discussion opens)
          setComments(cData.map(c => ({ ...c, profile: null })));
        }
      } catch (e) {}
    })();
    // Rooting poll counts — dormant until the `rooting_for` column is added
    (async () => {
      try {
        const res = await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&rooting_for=not.is.null&select=rooting_for`);
        if (!res.ok) { if (!cancelled) setRootingReady(false); return; }
        const rows = await sbJson(res);
        if (cancelled) return;
        const counts = {};
        rows.forEach(r => { if (r.rooting_for) counts[r.rooting_for] = (counts[r.rooting_for] || 0) + 1; });
        setRootingCounts(counts);
        setRootingReady(true);
      } catch (e) { if (!cancelled) setRootingReady(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Weather loader for Pre-Game card (uses Open-Meteo, no API key).
  // Only outdoor leagues (NFL/MLB) — NBA/NHL play in arenas, and their team
  // abbreviations can collide with the NFL/MLB stadium-coords table.
  useEffect(() => {
    if (!game) return;
    if (sport !== "nfl" && sport !== "mlb") { setWeather(null); return; }
    const homeAbbr = game.home?.abbr;
    const coords = STADIUM_COORDS[homeAbbr];
    if (!coords) { setWeather(null); return; }
    // Indoor stadium: skip API
    if (coords.indoor) {
      setWeather({ indoor: true, label: "Indoors", emoji: "🏟️" });
      return;
    }
    let cancelled = false;
    async function loadWeather() {
      try {
        const gameDate = game.date ? new Date(game.date) : new Date();
        const now = new Date();
        const daysAgo = (now - gameDate) / 86400000;
        const yyyy = gameDate.getUTCFullYear();
        const mm = String(gameDate.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(gameDate.getUTCDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;

        let url, source;
        if (daysAgo > 7) {
          // Archive API: reliable for games more than ~a week old
          url = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
          source = "historical";
        } else if (daysAgo > 0) {
          // Recent past (last week): forecast API keeps recent days; use past_days
          url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,wind_speed_10m,weather_code&past_days=7&temperature_unit=fahrenheit&wind_speed_unit=mph`;
          source = "recent";
        } else {
          // Future / live game: current conditions
          url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
          source = "forecast";
        }

        const r = await fetch(url);
        if (!r.ok) { console.warn("Weather API returned", r.status); return; }
        const d = await r.json();
        if (cancelled) return;

        const pickHourly = (hourly) => {
          if (!hourly?.time) return null;
          // Find the index matching the game's date+hour
          const target = `${dateStr}T${String(gameDate.getUTCHours()).padStart(2, "0")}:00`;
          let idx = hourly.time.indexOf(target);
          if (idx === -1) {
            // fall back to the closest hour on the same date
            idx = hourly.time.findIndex(t => t.startsWith(dateStr));
            if (idx !== -1) idx += Math.min(gameDate.getUTCHours(), 23 - 0);
          }
          if (idx === -1 || idx >= hourly.time.length) idx = Math.min(15, hourly.time.length - 1);
          return {
            temp: Math.round(hourly.temperature_2m?.[idx]),
            wind: Math.round(hourly.wind_speed_10m?.[idx]),
            code: hourly.weather_code?.[idx],
          };
        };

        if ((source === "historical" || source === "recent") && d.hourly) {
          const picked = pickHourly(d.hourly);
          if (picked && picked.temp != null && !isNaN(picked.temp)) {
            const info = weatherInfo(picked.code);
            setWeather({ indoor: false, source, ...picked, label: info.label, emoji: info.emoji });
          }
        } else if (source === "forecast" && d.current) {
          const info = weatherInfo(d.current.weather_code);
          setWeather({
            indoor: false, source,
            temp: Math.round(d.current.temperature_2m),
            wind: Math.round(d.current.wind_speed_10m),
            code: d.current.weather_code, label: info.label, emoji: info.emoji,
          });
        }
      } catch (e) {
        // Network failure / API down — just don't show weather, don't break the page
        console.warn("Weather unavailable:", e.message);
      }
    }
    loadWeather();
    return () => { cancelled = true; };
  }, [game?.id]);

  // Load comments when Discussion tab is shown
  useEffect(() => {
    if (phase !== "live") return;
    let cancelled = false;
    async function loadComments() {
      setCommentLoading(true);
      try {
        const cRes = await sbFetch(`comments?game_id=eq.${id}&order=created_at.asc&select=*`);
        const cData = await sbJson(cRes);
        if (cancelled) return;
        if (cData && cData.length > 0) {
          const userIds = [...new Set(cData.map(c => c.user_id))];
          const pRes = await sbFetch(`profiles?user_id=in.(${userIds.join(",")})&select=user_id,handle,display_name,avatar_url,unlocked,${favSelect}`);
          const profiles = await sbJson(pRes);
          const pmap = {};
          (profiles || []).forEach(p => { pmap[p.user_id] = p; });

          // Load reactions for all these comments
          const commentIds = cData.map(c => c.id);
          const rRes = await sbFetch(`comment_reactions?comment_id=in.(${commentIds.join(",")})&select=*`);
          const reactions = await sbJson(rRes);
          const rmap = {};
          (reactions || []).forEach(r => {
            if (!rmap[r.comment_id]) rmap[r.comment_id] = [];
            rmap[r.comment_id].push(r);
          });

          setComments(cData.map(c => ({ ...c, profile: pmap[c.user_id], reactions: rmap[c.id] || [] })));

          // Compute commenter reputation tiers (flair next to names) in the
          // background, so comments render immediately and tiers pop in after.
          (async () => {
            try {
              const stats = {};
              userIds.forEach((u) => { stats[u] = { ratings: 0, reviews: 0, comments: 0, likes: 0, followers: 0 }; });
              const rt = await sbJson(await sbFetch(`ratings?user_id=in.(${userIds.join(",")})&select=user_id,review,rating`));
              rt.forEach((r) => { if (!stats[r.user_id]) return; if (r.rating != null) stats[r.user_id].ratings++; if (r.review) stats[r.user_id].reviews++; });
              const cm = await sbJson(await sbFetch(`comments?user_id=in.(${userIds.join(",")})&select=id,user_id`));
              const ownerByComment = {};
              cm.forEach((c) => { if (stats[c.user_id]) { stats[c.user_id].comments++; ownerByComment[c.id] = c.user_id; } });
              const allCommentIds = Object.keys(ownerByComment);
              if (allCommentIds.length > 0) {
                const rx = await sbJson(await sbFetch(`comment_reactions?comment_id=in.(${allCommentIds.join(",")})&select=comment_id,user_id`));
                rx.forEach((r) => { const owner = ownerByComment[r.comment_id]; if (owner && r.user_id !== owner && stats[owner]) stats[owner].likes++; });
              }
              const fl = await sbJson(await sbFetch(`follows?following_id=in.(${userIds.join(",")})&select=following_id`));
              fl.forEach((f) => { if (stats[f.following_id]) stats[f.following_id].followers++; });
              if (cancelled) return;
              const tiers = {};
              userIds.forEach((u) => { tiers[u] = repTier(repScore(stats[u])); });
              setCommentRep(tiers);
            } catch (e) { /* flair is best-effort */ }
          })();
        } else {
          setComments([]);
        }
      } catch (e) { console.error("Comments:", e); }
      if (!cancelled) setCommentLoading(false);
    }
    loadComments();
    return () => { cancelled = true; };
  }, [phase, id]);

  const postComment = async (parentId = null, contentOverride = null) => {
    if (!user) { window.location.href = "/login"; return; }
    const content = (contentOverride !== null ? contentOverride : newComment).trim();
    if (!content || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const res = await sbFetch(`comments`, {
        method: "POST",
        headers: { "Prefer": "return=representation" },
        body: JSON.stringify({
          game_id: id,
          user_id: user.id,
          content: content.slice(0, 500),
          parent_id: parentId,
        }),
      });
      if (res.ok) {
        const arr = await sbJson(res);
        const created = Array.isArray(arr) ? arr[0] : arr;
        const myProf = profile ? { user_id: user.id, handle: profile.handle, display_name: profile.display_name, avatar_url: profile.avatar_url } : null;
        setComments([...comments, { ...created, profile: myProf, reactions: [] }]);
        if (parentId) {
          setReplyText("");
          setReplyingTo(null);
        } else {
          setNewComment("");
        }
      } else {
        const t = await res.text();
        setSaveStatus(`Comment failed: ${t.substring(0, 60)}`);
      }
    } catch (e) {
      setSaveStatus(`Comment error: ${e.message}`);
    }
    setCommentSubmitting(false);
  };

  const deleteComment = async (commentId) => {
    if (!user) return;
    if (!confirm("Delete this comment?")) return;
    try {
      await sbFetch(`comments?id=eq.${commentId}`, { method: "DELETE" });
      // Remove the comment and any replies to it
      setComments(comments.filter(c => c.id !== commentId && c.parent_id !== commentId));
    } catch (e) { console.error(e); }
  };

  const toggleReaction = async (commentId, emoji) => {
    if (!user) { window.location.href = "/login"; return; }
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    const existing = (comment.reactions || []).find(r => r.user_id === user.id && r.emoji === emoji);
    try {
      if (existing) {
        await sbFetch(`comment_reactions?id=eq.${existing.id}`, { method: "DELETE" });
        setComments(comments.map(c => c.id === commentId
          ? { ...c, reactions: c.reactions.filter(r => r.id !== existing.id) }
          : c));
      } else {
        const res = await sbFetch(`comment_reactions`, {
          method: "POST",
          headers: { "Prefer": "return=representation" },
          body: JSON.stringify({ comment_id: commentId, user_id: user.id, emoji }),
        });
        if (res.ok) {
          const arr = await sbJson(res);
          const created = Array.isArray(arr) ? arr[0] : arr;
          setComments(comments.map(c => c.id === commentId
            ? { ...c, reactions: [...(c.reactions || []), created] }
            : c));
        }
      }
    } catch (e) { console.error("Reaction:", e); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading game...</div>;
  if (!game) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="text-4xl">😕</div>
      <div className="text-zinc-500">Game not found</div>
      <Link href="/" className="text-red-400 text-sm font-semibold">← Back to games</Link>
    </div>
  );

  const g = game, a = g.away, h = g.home;
  // Default reactions + any emote packs this user has unlocked with Drops
  const reactionPalette = [...new Set([...REACTION_EMOJIS, ...emotesFor(profile?.unlocked)])];

  // Fandom filter: filter community ratings by selected lens
  const filterByFandom = (items) => {
    if (fandomFilter === "all") return items;
    if (fandomFilter === "home") return items.filter(x => x.favorite_team === h.abbr);
    if (fandomFilter === "away") return items.filter(x => x.favorite_team === a.abbr);
    if (fandomFilter === "neutral") return items.filter(x => x.favorite_team !== h.abbr && x.favorite_team !== a.abbr);
    return items;
  };
  const filteredRatings = filterByFandom(allCommunityRatings);
  const filteredCount = filteredRatings.length;
  const filteredAvg = filteredCount > 0 ? (filteredRatings.reduce((s, r) => s + parseFloat(r.rating), 0) / filteredCount).toFixed(1) : null;
  // Distribution of 1-10 buckets (rounded)
  const ratingDist = Array(10).fill(0).map((_, i) => filteredRatings.filter(r => Math.round(parseFloat(r.rating)) === i + 1).length);
  // Comment count by fandom
  const filteredComments = filterByFandom(comments.map(c => ({ ...c, favorite_team: c.profile?.favorite_team })));
  const moods = autoMoods(g);
  // Hot take — your rating is far from the community consensus
  const allAvg = allCommunityRatings.length > 0 ? allCommunityRatings.reduce((s, r) => s + parseFloat(r.rating), 0) / allCommunityRatings.length : null;
  const isHotTake = logged && allCommunityRatings.length >= 3 && allAvg != null && Math.abs(rating - allAvg) >= 3;
  const leagueLabel = { nfl: "NFL", mlb: "MLB", nba: "NBA", nhl: "NHL" }[sport] || "";
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(sport === "nfl" ? `${a.name} vs ${h.name} Week ${g.week} ${g.season} highlights NFL` : `${a.name} vs ${h.name} ${g.season} highlights ${leagueLabel}`)}`;
  const steps = ["Rating", "Details", "MVP", "Extras"];
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/game/${id}` : "";
  const shareText = `I rated ${a.abbr} ${a.score} - ${h.abbr} ${h.score} ${logged ? `a ${rating}/10` : ""} on The Nosebleeds 🩸`;

  // ===== ACTIONS =====
  const requireAuth = () => {
    if (!user) { window.location.href = "/login"; return false; }
    return true;
  };

  const upsertRating = async (updates, successLabel = "Saved ✓") => {
    if (!requireAuth()) return;
    setSaveStatus("Saving...");
    const base = {
      game_id: id, user_id: user.id,
      sport,
      away_team: a.abbr, home_team: h.abbr,
      away_score: a.score, home_score: h.score,
      season: g.season, week: g.week,
      game_date: g.date ? new Date(g.date).toISOString().slice(0, 10) : null,
      ...updates,
    };
    try {
      // Check if rating exists
      const existRes = await sbFetch(`ratings?game_id=eq.${id}&user_id=eq.${user.id}&select=id`);
      const existing = await sbJson(existRes);
      if (existing && existing.length > 0) {
        const updRes = await sbFetch(`ratings?id=eq.${existing[0].id}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        if (!updRes.ok) {
          const errText = await updRes.text();
          setSaveStatus(`Error: ${errText.substring(0, 80)}`);
          return;
        }
      } else {
        const insRes = await sbFetch(`ratings`, {
          method: "POST",
          headers: { "Prefer": "return=representation" },
          body: JSON.stringify(base),
        });
        if (!insRes.ok) {
          const errText = await insRes.text();
          setSaveStatus(`Error: ${errText.substring(0, 80)}`);
          return;
        }
      }
      setSaveStatus(successLabel);
      setTimeout(() => setSaveStatus(""), 1200);
    } catch (e) {
      setSaveStatus(`Error: ${e.message}`);
    }
  };

  const pickRooting = async (abbr) => {
    if (!requireAuth()) return;
    const prev = rootingFor;
    const next = rootingFor === abbr ? "" : abbr; // tap your team again to clear
    setRootingFor(next);
    setRootingCounts((c) => {
      const n = { ...c };
      if (prev) n[prev] = Math.max(0, (n[prev] || 0) - 1);
      if (next) n[next] = (n[next] || 0) + 1;
      return n;
    });
    await upsertRating({ rooting_for: next || null }, next ? "Rooting locked in 🙌" : "Cleared");
  };

  const toggleFav = async () => { const next = !fav; setFav(next); await upsertRating({ favorited: next }, next ? "Favorited" : "Unfavorited"); };
  const togglePin = async () => { const next = !pinned; setPinned(next); await upsertRating({ pinned: next }, next ? "Pinned" : "Unpinned"); };
  const toggleMood = async (m) => {
    const next = userMoods.includes(m) ? userMoods.filter(x => x !== m) : [...userMoods, m];
    setUserMoods(next);
    await upsertRating({ moods: next }, "Mood updated");
  };

  const saveHype = async () => {
    if (!requireAuth()) return;
    setSavingHype(true);
    await upsertRating({ anticipation: hypeDraft }, "Hype saved 🔥");
    const wasSet = hype > 0;
    setHype(hypeDraft);
    setSavingHype(false);
    setShowHype(false);
    // Refresh community hype
    try {
      const hRes = await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&anticipation=not.is.null&select=anticipation`);
      const hData = await sbJson(hRes);
      if (hData) setCommunityHype(hData.map(x => parseFloat(x.anticipation)).filter(n => !isNaN(n)));
    } catch (e) {}
  };

  const createListInline = async () => {
    if (!requireAuth()) return;
    const name = newListInline.trim();
    if (!name) return;
    try {
      const res = await sbFetch(`lists`, {
        method: "POST",
        headers: { "Prefer": "return=representation" },
        body: JSON.stringify({ user_id: user.id, name, icon: "📋" }),
      });
      if (!res.ok) {
        const t = await res.text();
        setSaveStatus(`List error: ${t.substring(0, 80)}`);
        return;
      }
      const created = await sbJson(res);
      const list = Array.isArray(created) ? created[0] : created;
      setLists([...lists, list]);
      setSelectedLists([...selectedLists, list.id]);
      setNewListInline("");
    } catch (e) { setSaveStatus(`List error: ${e.message}`); }
  };

  // Auto-post (or update) the user's review into the discussion as a comment
  // tagged with their rating. A review-comment is identified by rating != null.
  // Resilient: if the comments.rating column doesn't exist yet, it no-ops.
  const syncReviewComment = async () => {
    try {
      const existing = await sbJson(await sbFetch(`comments?game_id=eq.${id}&user_id=eq.${user.id}&rating=not.is.null&select=id`));
      const text = (review || "").trim();
      if (!text) {
        // Review cleared — remove any existing review-comment
        for (const c of existing) await sbFetch(`comments?id=eq.${c.id}`, { method: "DELETE" });
        setComments((prev) => prev.filter((c) => !(c.user_id === user.id && c.rating != null)));
        return;
      }
      if (existing.length > 0) {
        await sbFetch(`comments?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify({ content: text.slice(0, 500), rating }) });
        setComments((prev) => prev.map((c) => c.id === existing[0].id ? { ...c, content: text.slice(0, 500), rating } : c));
      } else {
        const res = await sbFetch(`comments`, {
          method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ game_id: id, user_id: user.id, content: text.slice(0, 500), rating, parent_id: null }),
        });
        if (res.ok) {
          const created = (await sbJson(res))[0];
          const myProf = profile ? { user_id: user.id, handle: profile.handle, display_name: profile.display_name, avatar_url: profile.avatar_url, unlocked: profile.unlocked } : null;
          if (created) setComments((prev) => [...prev, { ...created, profile: myProf, reactions: [] }]);
        }
      }
    } catch (e) { /* column not present yet — review still saved on the rating */ }
  };

  const submitLog = async () => {
    if (!requireAuth()) return;
    setSaveStatus("Saving...");
    try {
      // Save rating
      await upsertRating({
        rating, ref_rating: refR, ent_rating: entR,
        mvp: mvp || null, letdown: letdown || null,
        watch_how: watchHow || null, worth_it: worthIt || null,
        review: review || null,
      });
      // Mirror the review into the discussion as a rating-tagged comment
      await syncReviewComment();
      // Sync list assignments via direct fetch
      const linkRes = await sbFetch(`list_games?user_id=eq.${user.id}&game_id=eq.${id}&select=id,list_id`);
      const existingLinks = await sbJson(linkRes);
      const existingIds = (existingLinks || []).map(l => l.list_id);
      const toRemove = (existingLinks || []).filter(l => !selectedLists.includes(l.list_id));
      const toAdd = selectedLists.filter(lid => !existingIds.includes(lid));
      for (const lg of toRemove) {
        await sbFetch(`list_games?id=eq.${lg.id}`, { method: "DELETE" });
      }
      for (const listId of toAdd) {
        await sbFetch(`list_games`, {
          method: "POST",
          body: JSON.stringify({
            list_id: listId, user_id: user.id, game_id: id,
            away_team: a.abbr, home_team: h.abbr,
            away_score: a.score, home_score: h.score,
            week: g.week, season: g.season,
          }),
        });
      }
      setLogged(true);
      setShowWiz(false);
      setStep(0);
      // Refresh community via direct fetch
      try {
        const cRes = await sbFetch(`ratings?game_id=eq.${id}&public=eq.true&rating=not.is.null&select=rating,user_id`);
        const refreshed = await sbJson(cRes);
        if (refreshed && refreshed.length > 0) {
          const userIds = [...new Set(refreshed.map(r => r.user_id))];
          const pRes = await sbFetch(`profiles?user_id=in.(${userIds.join(",")})&select=user_id,${favSelect}`);
          const profiles = await sbJson(pRes);
          const pmap = {};
          (profiles || []).forEach(p => { pmap[p.user_id] = p; });
          const enriched = refreshed.map(r => ({ ...r, favorite_team: pmap[r.user_id]?.favorite_team || null }));
          setAllCommunityRatings(enriched);
        }
      } catch (e) {}
    } catch (e) {
      setSaveStatus(`Error: ${e.message}`);
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (e) {}
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "The Nosebleeds", text: shareText, url: shareUrl }); } catch (e) {}
    } else copyShareLink();
  };

  // Generate a PNG rating card and share it (or download as a fallback)
  const saveRatingCard = async () => {
    if (cardBusy) return;
    setCardBusy(true);
    try {
      const { blob, dataUrl } = await makeRatingCard({
        title: sport === "nfl" ? `NFL · Week ${g.week} · ${g.season}` : `${leagueLabel} · ${g.season}`,
        leftLabel: a.abbr, leftScore: g.isPre ? null : a.score, leftColor: a.color,
        rightLabel: h.abbr, rightScore: g.isPre ? null : h.score, rightColor: h.color,
        rating, ratingLabel: ratingLabel(rating),
        handle: profile?.handle || "",
      });
      const file = blob ? new File([blob], "nosebleeds-rating.png", { type: "image/png" }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl; link.download = "nosebleeds-rating.png";
        document.body.appendChild(link); link.click(); link.remove();
      }
    } catch (e) { console.error("rating card:", e); }
    setCardBusy(false);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">{a.abbr} vs {h.abbr}{sport === "nfl" ? ` · Wk ${g.week}` : ""}</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Scoreboard */}
        <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-4">
          <div className="h-1" style={{ background: `linear-gradient(90deg, ${a.color}, ${h.color})` }} />
          <div className="p-5">
            <div className="text-center text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-1">
              {sport === "nfl" ? `Week ${g.week} · ` : ""}{g.net ? `${g.net} · ` : ""}{new Date(g.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </div>
            {g.venue && <div className="text-center text-[10px] text-zinc-600 mb-4">{g.venue}</div>}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center flex-1">
                {a.logo && <img src={a.logo} className="w-14 h-14 object-contain mx-auto" />}
                <div className="text-4xl font-extrabold mt-2 tabular-nums" style={{ color: a.score < h.score ? "#52525b" : "#fafafa" }}>{g.isPre ? "—" : a.score}</div>
                <Link href={`/team/${sport}/${a.abbr}`} className="text-sm font-semibold text-zinc-400 mt-1 hover:text-white transition-colors inline-block">{a.name}</Link>
                <div className="text-[10px] text-zinc-600">{a.record}</div>
              </div>
              <div className="text-[10px] font-bold tracking-widest">
                {g.isLive ? (
                  <span className="text-white px-2 py-1 rounded-full bg-red-600 animate-pulse">🔴 {g.statusDetail || "LIVE"}</span>
                ) : g.isPre ? (
                  <span className="text-zinc-500">{g.statusDetail || "UPCOMING"}</span>
                ) : (
                  <span className="text-zinc-600">{`FINAL${g.ot ? (sport === "mlb" ? "/" + (g.home.q?.length || g.away.q?.length || "EXTRAS") : "/OT") : ""}`}</span>
                )}
              </div>
              <div className="text-center flex-1">
                {h.logo && <img src={h.logo} className="w-14 h-14 object-contain mx-auto" />}
                <div className="text-4xl font-extrabold mt-2 tabular-nums" style={{ color: h.score > a.score ? "#fafafa" : "#52525b" }}>{g.isPre ? "—" : h.score}</div>
                <Link href={`/team/${sport}/${h.abbr}`} className="text-sm font-semibold text-zinc-400 mt-1 hover:text-white transition-colors inline-block">{h.name}</Link>
                <div className="text-[10px] text-zinc-600">{h.record}</div>
              </div>
            </div>
            {h.q.length > 0 && (
              <div className="flex justify-center gap-0 mt-4 pt-3 border-t border-zinc-800 overflow-x-auto">
                {h.q.map((q, i) => {
                  // Sport-aware period label
                  let label;
                  if (sport === "mlb") {
                    label = String(i + 1); // Innings: 1, 2, 3...
                  } else if (sport === "nhl") {
                    // 3 periods, then OT, then shootout
                    label = i < 3 ? `P${i + 1}` : i === 3 ? "OT" : "SO";
                  } else {
                    // NFL / NBA: 4 quarters, then OT
                    label = i < 4 ? `Q${i + 1}` : "OT";
                  }
                  return (
                    <div key={i} className="text-center px-2 shrink-0" style={{ borderRight: i < h.q.length - 1 ? "1px solid #27272a" : "none" }}>
                      <div className="text-[10px] text-zinc-600 font-bold">{label}</div>
                      <div className="text-[11px] font-semibold text-zinc-400">{a.q[i] ?? "-"}</div>
                      <div className="text-[11px] font-semibold text-zinc-400">{q ?? "-"}</div>
                    </div>
                  );
                })}
                <div className="text-center px-2 shrink-0">
                  <div className="text-[10px] text-zinc-600 font-bold">{sport === "mlb" ? "R" : "F"}</div>
                  <div className="text-[11px] font-extrabold text-white">{a.score}</div>
                  <div className="text-[11px] font-extrabold text-white">{h.score}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rating row: Community + Your rating / Hype side-by-side */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {g.isPre ? (
            /* ===== UPCOMING GAME: Community Hype tile ===== */
            (() => {
              const hypeAvg = communityHype.length > 0
                ? (communityHype.reduce((s, x) => s + x, 0) / communityHype.length)
                : null;
              return (
                <div className="rounded-2xl bg-gradient-to-br from-orange-950/40 to-zinc-900 border border-zinc-800 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase">🔥 Hype</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{communityHype.length} {communityHype.length === 1 ? "fan" : "fans"}</div>
                  </div>
                  <div className="w-14 h-14 flex items-center justify-center font-extrabold rounded-xl text-lg shrink-0"
                    style={{ backgroundColor: hypeAvg != null ? "#ea580c" : "rgba(63,63,70,0.4)", color: hypeAvg != null ? "#fff" : "#52525b" }}>
                    {hypeAvg != null ? hypeAvg.toFixed(1) : "—"}
                  </div>
                </div>
              );
            })()
          ) : filteredCount > 0 ? (
            <div className="rounded-2xl bg-gradient-to-br from-red-950/40 to-zinc-900 border border-zinc-800 p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Community</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{filteredCount} {filteredCount === 1 ? "rater" : "raters"}</div>
              </div>
              <div className="w-14 h-14 flex items-center justify-center text-white font-extrabold rounded-xl text-lg shrink-0" style={{ backgroundColor: rc(parseFloat(filteredAvg)) }}>{filteredAvg}</div>
            </div>
          ) : (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Community</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{allCommunityRatings.length === 0 ? "No ratings yet" : "None from this group"}</div>
              </div>
              <div className="w-14 h-14 flex items-center justify-center text-zinc-700 font-extrabold rounded-xl text-lg shrink-0 bg-zinc-800/40">—</div>
            </div>
          )}

          {g.isPre ? (
            /* ===== UPCOMING GAME: rating disabled, Hype this game instead ===== */
            user ? (
              <button onClick={() => { setHypeDraft(hype > 0 ? hype : 7); setShowHype(true); }}
                className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-orange-600/30 p-3 flex items-center justify-between text-left hover:border-orange-600 transition-all">
                <div>
                  <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase">Your Hype</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{hype > 0 ? "Tap to edit ✏️" : "How hyped are you?"}</div>
                </div>
                <div className="w-14 h-14 flex items-center justify-center font-extrabold rounded-xl text-lg shrink-0"
                  style={{ backgroundColor: hype > 0 ? "#ea580c" : "rgba(63,63,70,0.4)", color: hype > 0 ? "#fff" : "#52525b" }}>
                  {hype > 0 ? hype : "+"}
                </div>
              </button>
            ) : (
              <Link href="/login" className="rounded-2xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-3 flex items-center justify-center text-zinc-500 text-xs font-semibold hover:border-orange-600 hover:text-orange-400 transition-all">
                Sign in to set hype →
              </Link>
            )
          ) : logged ? (
            <button onClick={() => setShowWiz(true)} className="rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-red-600/30 p-3 flex items-center justify-between text-left hover:border-red-600 transition-all">
              <div>
                <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase">Your Rating</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Tap to edit ✏️</div>
              </div>
              <div className="w-14 h-14 flex items-center justify-center text-white font-extrabold rounded-xl text-lg shrink-0" style={{ backgroundColor: rc(rating) }}>{rating}</div>
            </button>
          ) : user ? (
            <button onClick={() => setShowWiz(true)} className="rounded-2xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-3 flex items-center justify-center text-zinc-500 text-xs font-semibold hover:border-red-600 hover:text-red-400 transition-all">
              + Rate this game
            </button>
          ) : (
            <Link href="/login" className="rounded-2xl bg-zinc-900 border-2 border-dashed border-zinc-700 p-3 flex items-center justify-center text-zinc-500 text-xs font-semibold hover:border-red-600 hover:text-red-400 transition-all">
              Sign in to rate →
            </Link>
          )}
        </div>

        {/* Upcoming-game note: rating not yet available */}
        {g.isPre && (
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 mb-3 text-center">
            <span className="text-[11px] text-zinc-500">⏳ This game hasn't happened yet — rate your <span className="text-orange-400 font-bold">anticipation</span> now, then come back to rate the game after.</span>
          </div>
        )}

        {/* Rooting poll — who's pulling for who */}
        {rootingReady && (() => {
          const awayRoot = rootingCounts[a.abbr] || 0;
          const homeRoot = rootingCounts[h.abbr] || 0;
          const totalRoot = awayRoot + homeRoot;
          const awayPct = totalRoot > 0 ? Math.round((awayRoot / totalRoot) * 100) : 50;
          const homePct = 100 - awayPct;
          const canPick = !g.isFinal;
          return (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">🙌 {g.isFinal ? "Who fans rooted for" : "Who are you rooting for?"}</div>
                <div className="text-[10px] text-zinc-600">{totalRoot} {totalRoot === 1 ? "fan" : "fans"}</div>
              </div>
              {/* Split bar */}
              <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-950 mb-2">
                {totalRoot > 0 ? (
                  <>
                    <div style={{ width: `${awayPct}%`, backgroundColor: a.color }} />
                    <div style={{ width: `${homePct}%`, backgroundColor: h.color }} />
                  </>
                ) : <div className="w-full bg-zinc-800/40" />}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[{ team: a, count: awayRoot, pct: awayPct }, { team: h, count: homeRoot, pct: homePct }].map(({ team, count, pct }) => {
                  const mine = rootingFor === team.abbr;
                  return (
                    <button
                      key={team.abbr}
                      onClick={() => canPick && pickRooting(team.abbr)}
                      disabled={!canPick}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 transition-all ${mine ? "border-red-600 bg-red-600/10" : "border-zinc-800 bg-zinc-950"} ${canPick ? "hover:border-zinc-600" : "cursor-default"}`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {team.logo && <img src={team.logo} alt="" className="w-5 h-5 object-contain shrink-0" />}
                        <span className="text-sm font-bold text-white truncate">{team.abbr}</span>
                        {mine && <span className="text-[10px] text-red-400 font-bold shrink-0">✓</span>}
                      </span>
                      <span className="text-xs font-extrabold shrink-0" style={{ color: team.color === "#333" ? "#a1a1aa" : team.color }}>{totalRoot > 0 ? `${pct}%` : "—"}</span>
                    </button>
                  );
                })}
              </div>
              {!user && <div className="text-[10px] text-zinc-600 text-center mt-2">Sign in to pick your side</div>}
            </div>
          );
        })()}

        {/* Community rating distribution with embedded fandom filter */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Rating Distribution</div>
          </div>
          {allCommunityRatings.length > 0 && (
            <div className="flex gap-1 mb-3 overflow-x-auto -mx-1 px-1 pb-1">
              {[
                { v: "all", l: "All", count: allCommunityRatings.length },
                { v: "home", l: `${h.abbr}`, count: allCommunityRatings.filter(x => x.favorite_team === h.abbr).length },
                { v: "away", l: `${a.abbr}`, count: allCommunityRatings.filter(x => x.favorite_team === a.abbr).length },
                { v: "neutral", l: "Neutral", count: allCommunityRatings.filter(x => x.favorite_team !== h.abbr && x.favorite_team !== a.abbr).length },
              ].map(f => (
                <button key={f.v} onClick={() => setFandomFilter(f.v)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-all ${fandomFilter === f.v ? "bg-red-600 text-white" : "bg-zinc-950 text-zinc-500 border border-zinc-800"}`}>
                  {f.l} <span className="opacity-60">{f.count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 mb-1" style={{ height: "64px" }}>
            {ratingDist.map((c, i) => {
              const mx = Math.max(...ratingDist, 1);
              const fillPct = c > 0 ? Math.max((c / mx) * 100, 8) : 0;
              const realPct = filteredCount > 0 ? Math.round((c / filteredCount) * 100) : 0;
              return (
                <div key={i} className="group flex-1 relative cursor-help">
                  {/* Tooltip OUTSIDE clipped track */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-zinc-800 border border-zinc-700 text-white text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap z-30 shadow-lg">
                    {c} {c === 1 ? "rating" : "ratings"} ({realPct}%)
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-700" />
                  </div>
                  <div className="absolute inset-0 bg-zinc-800/40 rounded overflow-hidden">
                    <div className="absolute bottom-0 left-0 right-0 transition-all" style={{ height: `${fillPct}%`, backgroundColor: rc(i + 1) }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {ratingDist.map((_, i) => (
              <div key={i} className="flex-1 text-center">
                <span className="text-[10px] text-zinc-500 font-bold">{i + 1}</span>
              </div>
            ))}
          </div>
          {filteredCount === 0 && (
            <div className="text-[10px] text-zinc-600 text-center mt-2">{allCommunityRatings.length === 0 ? "No ratings yet — be the first!" : "No ratings from this group"}</div>
          )}
        </div>

        {/* Phase tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-900 p-1 rounded-full">
          {[
            { id: "pre", l: "📋 Pre-Game" },
            { id: "live", l: g.isPre ? "🔮 Pre-Game Chat" : g.isFinal ? "💬 Discussion" : "💬 Live Chat", showCount: filteredComments.length > 0 },
            ...(g.isPre ? [] : [{ id: "post", l: "📊 Post-Game" }])
          ].map((p) => (
            <button key={p.id} onClick={() => setPhase(p.id)} className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all ${phase === p.id ? "bg-red-600 text-white" : "text-zinc-500"}`}>
              {p.l}{p.showCount && <span className="ml-1 text-[10px] opacity-80">({filteredComments.length})</span>}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        {!showWiz && (
          <div className="flex gap-2 mb-4">
            {g.isPre ? (
              <button onClick={() => { if (!requireAuth()) return; setHypeDraft(hype > 0 ? hype : 7); setShowHype(true); }} className={`flex-1 py-3 rounded-xl font-bold text-sm ${hype > 0 ? "border-2 border-orange-600 text-orange-400" : "bg-orange-600 text-white"}`}>
                {hype > 0 ? `🔥 Edit Hype (${hype})` : "🔥 Set Your Hype"}
              </button>
            ) : (
              <button onClick={() => { if (!requireAuth()) return; setShowWiz(true); }} className={`flex-1 py-3 rounded-xl font-bold text-sm ${logged ? "border-2 border-red-600 text-red-400" : "bg-red-600 text-white"}`}>
                {logged ? `✓ Edit Rating (${rating})` : "⭐ Rate Game"}
              </button>
            )}
            <button onClick={toggleFav} className="px-3 py-3 rounded-xl border border-zinc-800 flex flex-col items-center" style={{ backgroundColor: fav ? "rgba(239,68,68,0.1)" : "transparent" }}>
              <span className="text-base">{fav ? "❤️" : "🤍"}</span>
              <span className={`text-[10px] font-bold ${fav ? "text-red-400" : "text-zinc-600"}`}>Fave</span>
            </button>
            <button onClick={togglePin} className="px-3 py-3 rounded-xl border border-zinc-800 flex flex-col items-center" style={{ backgroundColor: pinned ? "rgba(220,38,38,0.1)" : "transparent" }}>
              <span className="text-base">📌</span>
              <span className={`text-[10px] font-bold ${pinned ? "text-red-400" : "text-zinc-600"}`}>Pin</span>
            </button>
            <button onClick={() => setShowShare(true)} className="px-3 py-3 rounded-xl border border-zinc-800 flex flex-col items-center">
              <span className="text-base">🔗</span>
              <span className="text-[10px] font-bold text-zinc-600">Share</span>
            </button>
          </div>
        )}

        {/* PRE-GAME */}
        {phase === "pre" && (
          <div>
            {/* Matchup Preview */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <h3 className="font-bold text-white text-sm mb-3">Matchup Preview</h3>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                {[
                  { team: a, pos: g.standingsPos?.away, pp: g.probablePitchers?.away },
                  null, // VS divider placeholder
                  { team: h, pos: g.standingsPos?.home, pp: g.probablePitchers?.home },
                ].map((col, ci) => {
                  if (col === null) {
                    return <div key="vs" className="text-xs font-bold text-zinc-600 pt-8">VS</div>;
                  }
                  const { team, pos, pp } = col;
                  return (
                    <div key={ci} className="text-center p-3 rounded-xl bg-zinc-950">
                      {team.logo && <img src={team.logo} className="w-10 h-10 mx-auto" />}
                      <div className="text-lg font-extrabold text-white mt-2">{team.record}</div>
                      <div className="text-[10px] text-zinc-400">{team.name}</div>
                      {pos && <div className="text-xs font-bold text-red-400 mt-1.5 px-2 py-0.5 rounded-md bg-red-600/10 inline-block">#{pos.rank} in {pos.division}</div>}
                      {/* Probable starter for this team */}
                      {sport === "mlb" && (
                        <div className="mt-3 pt-3 border-t border-zinc-800">
                          <div className="text-[9px] font-bold text-zinc-600 tracking-widest uppercase mb-1.5">⚾ Probable SP</div>
                          {pp ? (
                            <Link href={`/player/${encodeURIComponent(pp.name)}`} className="flex flex-col items-center hover:opacity-80 transition-opacity">
                              {pp.headshot ? (
                                <img src={pp.headshot} alt={pp.name} referrerPolicy="no-referrer" className="w-9 h-9 rounded-lg object-cover bg-zinc-800" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-white">
                                  {pp.name.split(" ").map(w => w[0]).slice(0, 2).join("")}
                                </div>
                              )}
                              <div className="text-[11px] font-bold text-white mt-1 leading-tight">
                                {pp.name}
                                {pp.throws && <span className="text-[8px] text-zinc-600 ml-1">{pp.throws}HP</span>}
                              </div>
                              <div className="text-[9px] text-zinc-500 leading-tight mt-0.5">
                                {(pp.wins != null && pp.losses != null) && <span>{pp.wins}-{pp.losses}</span>}
                                {pp.era != null && <span> · {pp.era} ERA</span>}
                              </div>
                              {(pp.strikeouts != null || pp.whip != null) && (
                                <div className="text-[9px] text-zinc-600 leading-tight">
                                  {pp.strikeouts != null && <span>{pp.strikeouts} K</span>}
                                  {pp.strikeouts != null && pp.whip != null && <span> · </span>}
                                  {pp.whip != null && <span>{pp.whip} WHIP</span>}
                                </div>
                              )}
                            </Link>
                          ) : (
                            <div className="text-[11px] text-zinc-600 font-semibold">TBD</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {g.odds && (
                <div className="mt-3 p-3 rounded-xl bg-zinc-950 flex justify-between">
                  <div><div className="text-[10px] font-bold text-zinc-600">SPREAD</div><div className="text-sm font-bold text-white">{g.odds}</div></div>
                  {g.ou && <div className="text-right"><div className="text-[10px] font-bold text-zinc-600">O/U</div><div className="text-sm font-bold text-white">{g.ou}</div></div>}
                </div>
              )}
            </div>

            {/* Weather */}
            {weather && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <h3 className="font-bold text-white text-base mb-0.5">
                  {weather.indoor ? "🏟️ Conditions" : g.isPre ? "🌤️ Weather Forecast" : "🌤️ Conditions at Kickoff"}
                </h3>
                {(g.venue || g.venueCity) && (
                  <div className="text-[11px] text-zinc-500 mb-3">
                    📍 {g.venue}{g.venue && g.venueCity && " · "}{g.venueCity}{g.venueCity && g.venueState && `, ${g.venueState}`}
                  </div>
                )}
                {!g.venue && !g.venueCity && <div className="mb-3" />}
                {weather.indoor ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950">
                    <div className="text-3xl">{weather.emoji}</div>
                    <div>
                      <div className="text-sm font-bold text-white">Played indoors</div>
                      <div className="text-[10px] text-zinc-500">{g.venue || "Domed stadium"}</div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-xl bg-zinc-950 text-center">
                      <div className="text-2xl mb-1">{weather.emoji}</div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{weather.label}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 text-center">
                      <div className="text-2xl font-extrabold text-white">{weather.temp ?? "—"}°</div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Temp</div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 text-center">
                      <div className="text-2xl font-extrabold text-white">{weather.wind ?? "—"}<span className="text-xs text-zinc-500"> mph</span></div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Wind</div>
                    </div>
                  </div>
                )}
                <div className="text-[9px] text-zinc-600 text-center mt-2">Powered by Open-Meteo</div>
              </div>
            )}

            {/* Injury Reports - NFL only for now */}
            {(g.injuries?.away.length > 0 || g.injuries?.home.length > 0) && (() => {
              const statusColor = (status) => {
                if (status === "Out" || status === "IR") return { bg: "#dc2626", text: "#fecaca" };
                if (status === "Doubtful") return { bg: "#ea580c", text: "#fed7aa" };
                if (status === "Questionable") return { bg: "#facc15", text: "#1f2937" };
                return { bg: "#52525b", text: "#d4d4d8" };
              };
              const InjuryList = ({ side, team }) => {
                const list = g.injuries?.[side] || [];
                if (list.length === 0) return <div className="text-xs text-zinc-600 py-2">No reported injuries 💪</div>;
                return (
                  <div className="space-y-1.5">
                    {list.map((inj, i) => {
                      const col = statusColor(inj.status);
                      return (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-zinc-950">
                          <div className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0 mt-0.5" style={{ backgroundColor: col.bg, color: col.text }}>
                            {inj.statusAbbr || inj.status?.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white truncate">{inj.name}</div>
                            <div className="text-[10px] text-zinc-500">
                              {inj.position && <span>{inj.position} · </span>}
                              {inj.injuryType || inj.status}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              };
              return (
                <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                  <h3 className="font-bold text-white text-base mb-3">🏥 Injury Report</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-extrabold tracking-widest uppercase mb-2 flex items-center justify-between" style={{ color: a.color }}>
                        <span>{a.abbr}</span>
                        <span className="text-zinc-600">{g.injuries.away.length}</span>
                      </div>
                      <InjuryList side="away" team={a} />
                    </div>
                    <div>
                      <div className="text-[10px] font-extrabold tracking-widest uppercase mb-2 flex items-center justify-between" style={{ color: h.color }}>
                        <span>{h.abbr}</span>
                        <span className="text-zinc-600">{g.injuries.home.length}</span>
                      </div>
                      <InjuryList side="home" team={h} />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap text-[9px] text-zinc-600">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#dc2626" }} /> Out / IR</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#ea580c" }} /> Doubtful</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#facc15" }} /> Questionable</span>
                  </div>
                </div>
              );
            })()}

            {/* ATS Records (Against The Spread) - NFL only */}
            {sport === "nfl" && (g.atsRecords?.away.length > 0 || g.atsRecords?.home.length > 0) && (() => {
              // Find the "Overall" or season-long record for each team
              const findKey = (recs, types) => {
                for (const t of types) {
                  const r = recs.find(x => x.type?.toLowerCase().includes(t));
                  if (r) return r;
                }
                return null;
              };
              const awayOverall = findKey(g.atsRecords.away, ["overall", "atsovrl"]);
              const homeOverall = findKey(g.atsRecords.home, ["overall", "atsovrl"]);
              const awayHome = findKey(g.atsRecords.away, ["away"]);
              const homeHome = findKey(g.atsRecords.home, ["home"]);
              const fmt = (r) => r ? `${r.wins}-${r.losses}${r.ties > 0 ? "-" + r.ties : ""}` : "—";
              return (
                <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                  <h3 className="font-bold text-white text-base mb-3">📈 Against the Spread</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-zinc-950">
                      <div className="text-[10px] font-extrabold tracking-widest uppercase mb-2" style={{ color: a.color }}>{a.abbr}</div>
                      <div className="space-y-1">
                        <div className="flex justify-between"><span className="text-[10px] text-zinc-500">Overall ATS</span><span className="text-sm font-bold text-white">{fmt(awayOverall)}</span></div>
                        <div className="flex justify-between"><span className="text-[10px] text-zinc-500">As Away</span><span className="text-sm font-bold text-white">{fmt(awayHome)}</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950">
                      <div className="text-[10px] font-extrabold tracking-widest uppercase mb-2" style={{ color: h.color }}>{h.abbr}</div>
                      <div className="space-y-1">
                        <div className="flex justify-between"><span className="text-[10px] text-zinc-500">Overall ATS</span><span className="text-sm font-bold text-white">{fmt(homeOverall)}</span></div>
                        <div className="flex justify-between"><span className="text-[10px] text-zinc-500">As Home</span><span className="text-sm font-bold text-white">{fmt(homeHome)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Pre-Game Chat preview — surface the chat from inside the pre-game phase */}
            {g.isPre && (
              <button onClick={() => setPhase("live")} className="w-full text-left rounded-2xl bg-gradient-to-br from-orange-950/40 to-zinc-900 border border-orange-600/30 p-4 mb-4 hover:border-orange-600 transition-all">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl">🔮</div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">Pre-Game Chat</div>
                    <div className="text-[10px] text-zinc-500">
                      {filteredComments.length > 0
                        ? `${filteredComments.length} ${filteredComments.length === 1 ? "comment" : "comments"} so far — join in`
                        : "Be the first to talk predictions and share the hype"}
                    </div>
                  </div>
                  <span className="text-zinc-500">→</span>
                </div>
                {/* Last 2 comment previews — top-level only */}
                {filteredComments.filter(c => !c.parent_id).slice(0, 2).map(c => (
                  <div key={c.id} className="text-[11px] text-zinc-400 pl-9 py-1 border-t border-zinc-800/50 mt-1 truncate">
                    <span className="font-bold text-zinc-300">{c.profile?.display_name || `@${c.profile?.handle || "anon"}`}:</span> {c.content}
                  </div>
                ))}
              </button>
            )}
          </div>
        )}

        {/* DISCUSSION */}
        {phase === "live" && (
          <div>
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <h3 className="font-bold text-white text-base mb-1">
                {g.isPre ? "🔮 Pre-Game Chat" : g.isFinal ? "💬 Discussion" : "💬 Live Chat"}
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                {filteredComments.length === 0
                  ? (fandomFilter !== "all"
                    ? `No comments from this group`
                    : g.isPre
                      ? `Talk predictions, share your hype, call your shot${hype > 0 ? ` — you're at ${hype}/10 hyped` : ""}`
                      : "Be the first to leave a comment")
                  : `${filteredComments.length} ${filteredComments.length === 1 ? "comment" : "comments"}`}
              </p>

              {/* Fandom filter for comments */}
              {comments.length > 0 && (
                <div className="flex gap-1 mb-3 overflow-x-auto -mx-1 px-1 pb-1">
                  {[
                    { v: "all", l: "All", count: comments.length },
                    { v: "home", l: `${h.abbr}`, count: comments.filter(x => x.profile?.favorite_team === h.abbr).length },
                    { v: "away", l: `${a.abbr}`, count: comments.filter(x => x.profile?.favorite_team === a.abbr).length },
                    { v: "neutral", l: "Neutral", count: comments.filter(x => x.profile?.favorite_team !== h.abbr && x.profile?.favorite_team !== a.abbr).length },
                  ].map(f => (
                    <button key={f.v} onClick={() => setFandomFilter(f.v)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-all ${fandomFilter === f.v ? "bg-red-600 text-white" : "bg-zinc-950 text-zinc-500 border border-zinc-800"}`}>
                      {f.l} <span className="opacity-60">{f.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Top-level composer */}
              {user ? (
                <div className="mb-4">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value.slice(0, 500))}
                    placeholder={g.isPre ? "Predict the score, call out a hot take, share the hype…" : "Add a comment..."}
                    rows={2}
                    className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm outline-none resize-none focus:border-red-600"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] text-zinc-600">{newComment.length}/500</span>
                    <button
                      onClick={() => postComment()}
                      disabled={!newComment.trim() || commentSubmitting}
                      className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40">
                      {commentSubmitting ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>
              ) : (
                <Link href="/login" className="block text-center py-3 mb-4 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-red-400 hover:text-red-300">
                  Sign in to join the discussion →
                </Link>
              )}

              {/* Comments thread */}
              {commentLoading && <div className="text-center text-zinc-500 text-sm py-4">Loading comments...</div>}
              {!commentLoading && comments.length === 0 && (
                <div className="text-center py-6 text-zinc-600 text-sm">No comments yet</div>
              )}
              {/* Sort toggle */}
              {filteredComments.filter(c => !c.parent_id).length > 1 && (
                <div className="flex gap-1 mb-3">
                  {[{ id: "top", l: "🔝 Top" }, { id: "new", l: "🕐 Newest" }].map((o) => (
                    <button key={o.id} onClick={() => setCommentSort(o.id)} className={`text-[11px] font-bold px-3 py-1 rounded-full transition-all ${commentSort === o.id ? "bg-red-600 text-white" : "bg-zinc-950 text-zinc-500 border border-zinc-800"}`}>{o.l}</button>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {(() => {
                  const reactionTotal = (c) => (c.reactions || []).length;
                  const topLevel = filteredComments.filter(c => !c.parent_id);
                  const sorted = commentSort === "top"
                    ? [...topLevel].sort((a, b) => reactionTotal(b) - reactionTotal(a) || new Date(b.created_at) - new Date(a.created_at))
                    : [...topLevel].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                  return sorted;
                })().map((c) => {
                  const replies = filteredComments.filter(r => r.parent_id === c.id);
                  return (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      replies={replies}
                      user={user}
                      replyingTo={replyingTo}
                      setReplyingTo={setReplyingTo}
                      replyText={replyText}
                      setReplyText={setReplyText}
                      onPostReply={postComment}
                      onDelete={deleteComment}
                      onReact={toggleReaction}
                      submitting={commentSubmitting}
                      teamEmoji={sportTeamEmoji}
                      reactionEmojis={reactionPalette}
                      repMap={commentRep}
                    />
                  );
                })}
                {fandomFilter !== "all" && filteredComments.filter(c => !c.parent_id).length === 0 && comments.length > 0 && (
                  <div className="text-center text-zinc-600 text-sm py-4">No comments from this fan group</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* POST-GAME */}
        {phase === "post" && (
          <div>
            {g.isFinal && (
              <div onClick={() => window.open(ytUrl, "_blank")} className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 mb-4 hover:-translate-y-0.5 transition-transform cursor-pointer">
                <div className="w-12 h-9 rounded-lg bg-red-600 flex items-center justify-center text-xl shrink-0">▶</div>
                <div>
                  <div className="text-sm font-bold text-white">Watch Highlights</div>
                  <div className="text-xs text-zinc-500">{a.abbr} vs {h.abbr}{sport === "nfl" ? ` Week ${g.week}` : ""} highlights on YouTube</div>
                </div>
              </div>
            )}

            {/* Box Score */}
            {(() => {
              // Sport-specific team-stat comparison keys
              const CURATED_TEAM_KEYS = {
                mlb: [
                  { key: "hits", label: "Hits" },
                  { key: "runs", label: "Runs" },
                  { key: "homeRuns", label: "Home Runs" },
                  { key: "RBIs", label: "RBIs" },
                  { key: "doubles", label: "Doubles" },
                  { key: "walks", label: "Walks" },
                  { key: "strikeouts", label: "Strikeouts", lowerBetter: true },
                  { key: "stolenBases", label: "Stolen Bases" },
                  { key: "runnersLeftOnBase", label: "Left on Base", lowerBetter: true },
                  { key: "totalBases", label: "Total Bases" },
                ],
                nba: [
                  { key: "fieldGoalsMade-fieldGoalsAttempted", label: "FG" },
                  { key: "fieldGoalPct", label: "FG%" },
                  { key: "threePointFieldGoalsMade-threePointFieldGoalsAttempted", label: "3PT" },
                  { key: "freeThrowsMade-freeThrowsAttempted", label: "FT" },
                  { key: "totalRebounds", label: "Rebounds" },
                  { key: "offensiveRebounds", label: "Off Reb" },
                  { key: "assists", label: "Assists" },
                  { key: "steals", label: "Steals" },
                  { key: "blocks", label: "Blocks" },
                  { key: "totalTurnovers", label: "Turnovers", lowerBetter: true },
                ],
                nhl: [
                  { key: "goals", label: "Goals" },
                  { key: "assists", label: "Assists" },
                  { key: "shotsTotal", label: "Shots" },
                  { key: "powerPlayGoals", label: "PP Goals" },
                  { key: "faceoffsWon", label: "Faceoffs Won" },
                  { key: "penaltyMinutes", label: "Penalty Min", lowerBetter: true },
                  { key: "hits", label: "Hits" },
                  { key: "blockedShots", label: "Blocked Shots" },
                  { key: "takeaways", label: "Takeaways" },
                  { key: "giveaways", label: "Giveaways", lowerBetter: true },
                  { key: "saves", label: "Saves" },
                ],
                nfl: [
                  { key: "firstDowns", label: "1st Downs" },
                  { key: "totalYards", label: "Total Yards" },
                  { key: "netPassingYards", label: "Pass Yards" },
                  { key: "rushingYards", label: "Rush Yards" },
                  { key: "turnovers", label: "Turnovers", lowerBetter: true },
                  { key: "thirdDownEff", label: "3rd Down" },
                  { key: "totalPenaltiesYards", label: "Penalties", lowerBetter: true },
                  { key: "possessionTime", label: "Possession" },
                ],
              };
              let compareKeys = CURATED_TEAM_KEYS[sport] || CURATED_TEAM_KEYS.nfl;
              // NBA/NHL key names are less predictable across ESPN versions — keep
              // only curated keys that exist, and if too few survive, fall back to
              // showing every team stat ESPN provided (labeled from the data).
              if (sport === "nba" || sport === "nhl") {
                const present = compareKeys.filter((ck) => g.teamStats?.away?.[ck.key] || g.teamStats?.home?.[ck.key]);
                if (present.length >= 3) {
                  compareKeys = present;
                } else {
                  const allKeys = [...new Set([...Object.keys(g.teamStats?.away || {}), ...Object.keys(g.teamStats?.home || {})])];
                  compareKeys = allKeys.map((k) => ({ key: k, label: g.teamStats?.away?.[k]?.label || g.teamStats?.home?.[k]?.label || k }));
                }
              }
              const hasTeamStats = g.teamStats && (Object.keys(g.teamStats.away).length > 0 || Object.keys(g.teamStats.home).length > 0);
              const hasFullStats = g.fullPlayerStats && (Object.keys(g.fullPlayerStats.away).length > 0 || Object.keys(g.fullPlayerStats.home).length > 0);
              if (!hasTeamStats && !hasFullStats) {
                // Fallback to Top Performers if no boxscore data
                return (
                  <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                    <h3 className="font-bold text-white text-base mb-3">🏆 Top Performers</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {[a, h].map((t) => (
                        <div key={t.abbr}>
                          <div className="text-[10px] font-extrabold tracking-widest uppercase mb-2" style={{ color: t.color }}>{t.abbr}</div>
                          {t.leaders.filter((l) => l.name && !l.name.includes("Defense")).map((p, i) => (
                            <Link key={i} href={`/player/${encodeURIComponent(p.name)}`} className="block mb-2 p-2.5 rounded-lg bg-zinc-950 hover:bg-zinc-900 transition-colors">
                              <div className="text-xs font-bold text-white hover:text-red-400 transition-colors">{p.name}</div>
                              <div className="text-[10px] text-zinc-500">{p.stat}</div>
                            </Link>
                          ))}
                          {t.leaders.filter((l) => l.name && !l.name.includes("Defense")).length === 0 && <div className="text-xs text-zinc-600 p-2">No data</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // Available player stat categories (intersection of both teams)
              const cats = [...new Set([
                ...Object.keys(g.fullPlayerStats?.away || {}),
                ...Object.keys(g.fullPlayerStats?.home || {}),
              ])];
              const tabs = [{ id: "team", label: "Team Stats", emoji: "📊" }];
              if (sport === "mlb") {
                if (cats.includes("batting")) tabs.push({ id: "batting", label: "Batting", emoji: "🏏" });
                if (cats.includes("pitching")) tabs.push({ id: "pitching", label: "Pitching", emoji: "⚾" });
                if (cats.includes("fielding")) tabs.push({ id: "fielding", label: "Fielding", emoji: "🥎" });
              } else if (sport === "nba") {
                // Single flat category (id varies by ESPN version) — one Player Stats tab
                cats.forEach((cn) => tabs.push({ id: cn, label: "Player Stats", emoji: "🏀" }));
              } else if (sport === "nhl") {
                const nhlMeta = { forwards: { label: "Forwards", emoji: "🏒" }, defenses: { label: "Defense", emoji: "🛡️" }, goalies: { label: "Goalies", emoji: "🥅" } };
                ["forwards", "defenses", "goalies"].forEach((k) => { if (cats.includes(k)) tabs.push({ id: k, ...nhlMeta[k] }); });
                // Fallback if ESPN labels the skater groups differently
                if (tabs.length === 1) cats.forEach((cn) => tabs.push({ id: cn, label: cn.charAt(0).toUpperCase() + cn.slice(1), emoji: "🏒" }));
              } else {
                if (cats.includes("passing")) tabs.push({ id: "passing", label: "Passing", emoji: "🎯" });
                if (cats.includes("rushing")) tabs.push({ id: "rushing", label: "Rushing", emoji: "🏃" });
                if (cats.includes("receiving")) tabs.push({ id: "receiving", label: "Receiving", emoji: "🤲" });
                if (cats.includes("defensive")) tabs.push({ id: "defensive", label: "Defense", emoji: "🛡️" });
              }

              const renderCategoryTable = (catName) => {
                const awayCategory = g.fullPlayerStats?.away?.[catName];
                const homeCategory = g.fullPlayerStats?.home?.[catName];
                const rawLabels = (awayCategory?.labels && awayCategory.labels.length > 0 ? awayCategory.labels : homeCategory?.labels) || [];
                // For NHL skaters, lead with the stats fans care about: Goals, Assists, Shots, Hits.
                // NB: ESPN's "S" is shots (shotsTotal); "SOG" is shootout goals, not shots on goal.
                const priority = (sport === "nhl" && (catName === "forwards" || catName === "defenses")) ? ["G", "A", "S", "HT"] : [];
                const front = [];
                priority.forEach((tok) => { const idx = rawLabels.indexOf(tok); if (idx >= 0 && !front.includes(idx)) front.push(idx); });
                // `order` reorders both the header labels and each player's stat cells in lockstep
                const order = [...front, ...rawLabels.map((_, i) => i).filter((i) => !front.includes(i))];
                const labels = order.map((i) => rawLabels[i]);
                return (
                  <div className="space-y-4">
                    {[
                      { side: "away", team: a, cat: awayCategory },
                      { side: "home", team: h, cat: homeCategory },
                    ].map(({ side, team, cat }) => (
                      <div key={side}>
                        <div className="text-[10px] font-extrabold tracking-widest uppercase mb-2" style={{ color: team.color }}>{team.abbr}</div>
                        {!cat || cat.players.length === 0 ? (
                          <div className="text-xs text-zinc-600 p-2 bg-zinc-950 rounded-lg">No {catName} stats</div>
                        ) : (
                          <div className="rounded-lg bg-zinc-950 overflow-x-auto">
                            <div className="min-w-max">
                              {/* Header */}
                              <div className="flex items-center px-2 py-1.5 bg-zinc-900 border-b border-zinc-800">
                                <div className="w-32 shrink-0 text-[9px] font-bold text-zinc-500 uppercase tracking-wider sticky left-0 bg-zinc-900 z-10">Player</div>
                                {labels.map((label, i) => (
                                  <div key={i} className="w-11 shrink-0 text-[9px] font-bold text-zinc-500 uppercase tracking-wider text-right">{label}</div>
                                ))}
                              </div>
                              {/* Rows */}
                              {cat.players.map((p, i) => (
                                <div key={i} className="flex items-center px-2 py-1.5 border-b border-zinc-900 last:border-b-0">
                                  <Link
                                    href={`/player/${encodeURIComponent(p.name)}`}
                                    className="w-32 shrink-0 text-xs font-semibold text-white truncate sticky left-0 bg-zinc-950 z-10 pr-2 hover:text-red-400 transition-colors"
                                  >
                                    {p.name}
                                    {p.position && <span className="text-[9px] text-zinc-600 ml-1">{p.position}</span>}
                                  </Link>
                                  {order.map((oi, idx) => (
                                    <div key={idx} className="w-11 shrink-0 text-[11px] font-bold text-zinc-300 text-right tabular-nums">{p.stats[oi] || "—"}</div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="text-[9px] text-zinc-600 text-center">← swipe table to see all stats →</div>
                  </div>
                );
              };

              return (
                <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                  <h3 className="font-bold text-white text-base mb-3">📋 Box Score</h3>
                  {/* Tabs */}
                  <div className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
                    {tabs.map(t => (
                      <button key={t.id} onClick={() => setBoxTab(t.id)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${boxTab === t.id ? "bg-red-600 text-white" : "bg-zinc-950 text-zinc-500 border border-zinc-800"}`}>
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab content - fades in when switching */}
                  <style>{`
                    @keyframes nbBoxFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
                  `}</style>
                  <div key={boxTab} style={{ animation: "nbBoxFade 0.22s ease-out" }}>
                    {/* Team Stats tab */}
                    {boxTab === "team" && hasTeamStats && (
                      <div>
                        {/* Header row */}
                        <div className="flex items-center justify-between mb-2 px-1">
                          <div className="text-base font-extrabold" style={{ color: a.color }}>{a.abbr}</div>
                          <div className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">vs</div>
                          <div className="text-base font-extrabold" style={{ color: h.color }}>{h.abbr}</div>
                        </div>
                        {compareKeys.map(({ key, label, lowerBetter }) => {
                          const awayStat = g.teamStats.away[key];
                          const homeStat = g.teamStats.home[key];
                          if (!awayStat && !homeStat) return null;
                          const awayNum = parseFloat((awayStat?.value || "").split("-")[0]) || 0;
                          const homeNum = parseFloat((homeStat?.value || "").split("-")[0]) || 0;
                          let awayWin = false, homeWin = false;
                          if (awayNum !== homeNum) {
                            if (lowerBetter) {
                              awayWin = awayNum < homeNum;
                              homeWin = homeNum < awayNum;
                            } else {
                              awayWin = awayNum > homeNum;
                              homeWin = homeNum > awayNum;
                            }
                          }
                          return (
                            <div key={key} className="grid grid-cols-3 items-center py-1.5 border-b border-zinc-800 last:border-b-0">
                              <div className={`text-sm font-bold text-left ${awayWin ? "text-white" : "text-zinc-500"}`}>{awayStat?.value || "—"}</div>
                              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center">{label}</div>
                              <div className={`text-sm font-bold text-right ${homeWin ? "text-white" : "text-zinc-500"}`}>{homeStat?.value || "—"}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {boxTab === "team" && !hasTeamStats && (
                      <div className="text-xs text-zinc-600 p-2 text-center">No team stats available</div>
                    )}

                    {/* Category tabs */}
                    {boxTab !== "team" && renderCategoryTable(boxTab)}
                  </div>
                </div>
              );
            })()}

            {/* Game Mood */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <h3 className="font-bold text-white text-base mb-1">🎭 Game Mood</h3>
              <p className="text-xs text-zinc-500 mb-3">{user ? "Tap to tag this game's vibe" : "Sign in to tag your moods"}</p>
              <div className="flex gap-1.5 flex-wrap">
                {(sport === "mlb"
                  ? ["💣 Slugfest", "⚡ Pitcher's Duel", "🔟 Extras", "💪 Comeback", "🎯 Nail-biter", "💨 Blowout", "🌟 Classic", "😤 Controversial"]
                  : sport === "nba"
                  ? ["🔥 Shootout", "💪 Comeback", "⏱️ OT", "🛡️ Defensive", "💨 Blowout", "🎯 Clutch", "🌟 Classic", "😤 Controversial"]
                  : sport === "nhl"
                  ? ["🚨 Goal Fest", "💪 Comeback", "⏱️ OT", "🥅 Goalie Duel", "💨 Blowout", "🎯 Nail-biter", "🌟 Classic", "😤 Controversial"]
                  : ["🔥 Shootout", "💪 Comeback", "⏱️ OT", "🛡️ Defensive", "💨 Blowout", "🎯 Clutch", "🌟 Classic", "😤 Controversial"]
                ).map((m) => {
                  const userSel = userMoods.includes(m);
                  const auto = moods.includes(m);
                  const active = userSel || (auto && userMoods.length === 0);
                  return (
                    <button key={m} onClick={() => user && toggleMood(m)} disabled={!user}
                      className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${active ? "bg-red-600/10 text-red-400 border border-red-600/30" : "bg-zinc-950 text-zinc-500 border border-transparent hover:border-zinc-700"}`}>
                      {m}{userSel && " ✓"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Logged summary card */}
            {logged && !showWiz && (
              <div onClick={() => setShowWiz(true)} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4 cursor-pointer hover:border-red-600/40 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-red-400">Your Rating · Tap to edit ✏️</div>
                  {isHotTake && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">🌶️ Hot Take</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[{ l: "Overall", v: rating }, { l: sport === "mlb" ? "Umpires" : "Refs", v: refR }, { l: "Entertain", v: entR }].map((x) => (
                    <div key={x.l} className="text-center p-2.5 rounded-xl bg-zinc-950">
                      <div className="text-[10px] text-zinc-600 font-bold">{x.l}</div>
                      <div className="text-xl font-extrabold" style={{ color: rc(x.v) }}>{x.v}</div>
                    </div>
                  ))}
                </div>
                {worthIt && <div className="text-xs font-semibold mb-1" style={{ color: worthIt === "yes" ? "#22c55e" : worthIt === "no" ? "#ef4444" : "#eab308" }}>Worth watching: {worthIt === "yes" ? "👍 Yes" : worthIt === "no" ? "👎 No" : "😐 Meh"}</div>}
                <div className="flex gap-2 flex-wrap text-xs">
                  {mvp && <span className="text-green-400">🌟 {mvp}</span>}
                  {letdown && <span className="text-red-400">😤 {letdown}</span>}
                  {watchHow && <span className="text-zinc-500">{watchHow}</span>}
                </div>
                {review && <div className="text-xs text-zinc-400 italic mt-2">&quot;{review}&quot;</div>}
              </div>
            )}
          </div>
        )}

        {/* Save status indicator */}
        {saveStatus && (
          <>
            <style>{`
              @keyframes nbToastIn {
                0% { opacity: 0; transform: translateY(16px) scale(0.92); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div className="fixed bottom-24 left-0 right-0 z-[150] flex justify-center pointer-events-none">
              <div
                className={`px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 backdrop-blur-md shadow-xl ${
                  saveStatus.startsWith("Saved")
                    ? "bg-green-600/90 text-white"
                    : saveStatus.includes("Error")
                    ? "bg-red-600/90 text-white"
                    : "bg-zinc-800/95 text-zinc-200"
                }`}
                style={{ animation: "nbToastIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}
              >
                {saveStatus.includes("Saving") && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                )}
                {saveStatus.startsWith("Saved") && <span className="text-base leading-none">✓</span>}
                {saveStatus.includes("Error") && <span className="text-base leading-none">⚠</span>}
                {!saveStatus.includes("Saving") && !saveStatus.includes("Error") && !saveStatus.startsWith("Saved") && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
                <span>{saveStatus.replace(" ✓", "").replace("...", "…")}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===== RATING MODAL ===== */}
      {showWiz && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-zinc-800 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-zinc-950 px-5 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Rating</div>
                <div className="text-sm font-bold text-white">{a.abbr} vs {h.abbr}{sport === "nfl" ? ` · Wk ${g.week}` : ""}</div>
              </div>
              <button onClick={() => { setShowWiz(false); setStep(0); }} className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-lg font-bold">×</button>
            </div>
            <div className="p-5">
              {/* Step tabs - clickable */}
              <div className="flex items-center justify-center gap-2 mb-5">
                {steps.map((s, i) => (
                  <button key={s} onClick={() => setStep(i)} className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${i === step ? "bg-red-600 text-white" : i < step ? "bg-red-600/20 text-red-400" : "bg-zinc-900 text-zinc-600"}`}>
                    {s}
                  </button>
                ))}
              </div>

              {step === 0 && (
                <div>
                  <div className="text-center mb-4">
                    <div className="text-6xl font-extrabold" style={{ color: rc(rating) }}>{rating}</div>
                    <div className="text-sm font-bold mt-1" style={{ color: rc(rating) }}>{ratingLabel(rating)}</div>
                  </div>
                  <input type="range" min="1" max="10" step="0.5" value={rating} onChange={(e) => setRating(parseFloat(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, ${rc(rating)} ${((rating - 1) / 9) * 100}%, #27272a ${((rating - 1) / 9) * 100}%)` }} />
                  <div className="flex justify-between mt-1"><span className="text-xs text-zinc-600">1</span><span className="text-xs text-zinc-600">10</span></div>
                  <div className="mt-5">
                    <div className="text-sm font-semibold text-white text-center mb-3">Was it worth watching?</div>
                    <div className="flex gap-2 justify-center">
                      {[{ v: "yes", l: "👍 Yes", c: "#22c55e" }, { v: "no", l: "👎 No", c: "#ef4444" }, { v: "meh", l: "😐 Meh", c: "#eab308" }].map((o) => (
                        <button key={o.v} onClick={() => setWorthIt(o.v)} className="px-5 py-2.5 rounded-xl text-sm font-bold"
                          style={{ border: worthIt === o.v ? `2px solid ${o.c}` : "2px solid #27272a", backgroundColor: worthIt === o.v ? o.c + "15" : "transparent", color: worthIt === o.v ? o.c : "#71717a" }}>{o.l}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <div className="text-sm font-bold text-white text-center mb-4">How were the details?</div>
                  {[{ l: sport === "mlb" ? "⚾ Umpire Performance" : "🏁 Ref Performance", v: refR, s: setRefR }, { l: "🎬 Entertainment Value", v: entR, s: setEntR }].map(({ l, v, s }) => (
                    <div key={l} className="mb-5 p-4 rounded-xl bg-zinc-900">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-white">{l}</span>
                        <span className="text-2xl font-extrabold" style={{ color: rc(v) }}>{v}</span>
                      </div>
                      <input type="range" min="1" max="10" step="0.5" value={v} onChange={(e) => s(parseFloat(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, ${rc(v)} ${((v - 1) / 9) * 100}%, #27272a ${((v - 1) / 9) * 100}%)` }} />
                    </div>
                  ))}
                </div>
              )}

              {step === 2 && (() => {
                // Players who actually have boxscore stats, grouped by team
                const candidates = g.mvpCandidates || [];
                const hasCandidates = candidates.length > 0;

                const renderPicker = (kind) => {
                  const isMvp = kind === "mvp";
                  const selected = isMvp ? mvp : letdown;
                  const setSelected = isMvp ? setMvp : setLetdown;
                  const search = isMvp ? mvpSearch : letdownSearch;
                  const setSearch = isMvp ? setMvpSearch : setLetdownSearch;
                  const accent = isMvp
                    ? { sel: "bg-green-500/15 text-green-400 border-green-500/50", dot: "#22c55e" }
                    : { sel: "bg-red-500/15 text-red-400 border-red-500/50", dot: "#ef4444" };

                  // Filter by search, then group by team (away first, home second)
                  const q = search.trim().toLowerCase();
                  const filtered = q
                    ? candidates.filter(c => c.name.toLowerCase().includes(q))
                    : candidates;
                  const byTeam = {};
                  filtered.forEach(c => { (byTeam[c.team] = byTeam[c.team] || []).push(c); });
                  const teamOrder = [a.abbr, h.abbr].filter(t => byTeam[t]);

                  return (
                    <div>
                      <div className="text-sm font-bold text-white mb-2">
                        {isMvp ? "🌟 Game MVP" : "😤 Biggest Letdown"}
                      </div>
                      {/* Selected pill */}
                      {selected && (
                        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent.dot }} />
                          <span className="text-xs font-bold text-white flex-1">{selected}</span>
                          <button onClick={() => setSelected("")} className="text-[10px] text-zinc-500 hover:text-white">Clear</button>
                        </div>
                      )}
                      {/* Search box */}
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search players…"
                        className="w-full px-3 py-2 mb-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs outline-none focus:border-zinc-600 placeholder:text-zinc-600"
                      />
                      {/* Grouped list */}
                      <div className="max-h-52 overflow-y-auto rounded-lg bg-zinc-950 border border-zinc-900">
                        {teamOrder.length === 0 && (
                          <div className="text-xs text-zinc-600 p-3 text-center">No players match "{search}"</div>
                        )}
                        {teamOrder.map((teamAbbr) => (
                          <div key={teamAbbr}>
                            <div className="sticky top-0 px-3 py-1 bg-zinc-900 text-[10px] font-extrabold tracking-widest uppercase"
                              style={{ color: byTeam[teamAbbr][0]?.teamColor || "#888" }}>
                              {teamAbbr}
                            </div>
                            {byTeam[teamAbbr].map((c, i) => {
                              const isSel = selected === c.name;
                              return (
                                <button
                                  key={c.name + i}
                                  onClick={() => setSelected(isSel ? "" : c.name)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-zinc-900 last:border-b-0 transition-colors ${isSel ? accent.sel : "hover:bg-zinc-900"}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-xs font-bold truncate ${isSel ? "" : "text-white"}`}>
                                      {c.name}
                                      {c.position && <span className="text-[9px] text-zinc-600 ml-1.5 font-semibold">{c.position}</span>}
                                    </div>
                                    {c.statLine && <div className="text-[10px] text-zinc-500 truncate">{c.statLine}</div>}
                                  </div>
                                  {isSel && <span className="text-xs shrink-0">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                };

                return (
                  <div>
                    {!hasCandidates ? (
                      // Fallback for games with no boxscore (upcoming / no data)
                      <>
                        <div className="mb-5">
                          <div className="text-sm font-bold text-white mb-2">🌟 Game MVP</div>
                          <input value={mvp} onChange={(e) => setMvp(e.target.value)} placeholder="Type a player name…"
                            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-green-600" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white mb-2">😤 Biggest Letdown</div>
                          <input value={letdown} onChange={(e) => setLetdown(e.target.value)} placeholder="Type a player name…"
                            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600" />
                        </div>
                        <div className="text-[10px] text-zinc-600 mt-3 text-center">Player stats aren't available for this game yet — type a name.</div>
                      </>
                    ) : (
                      <div className="space-y-5">
                        {renderPicker("mvp")}
                        {renderPicker("letdown")}
                      </div>
                    )}
                  </div>
                );
              })()}

              {step === 3 && (
                <div>
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-white mb-2">📺 How did you watch?</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {["🛋️ Couch", "🍺 Bar", "🏟️ Stadium", "📱 Phone", ...(sport === "nfl" ? ["📺 RedZone"] : []), "🎬 Highlights"].map((w) => (
                        <button key={w} onClick={() => setWatchHow(watchHow === w ? "" : w)}
                          className={`px-3.5 py-2 rounded-full text-xs font-semibold border-2 ${watchHow === w ? "bg-red-600/10 text-red-400 border-red-600" : "bg-zinc-900 text-zinc-500 border-transparent"}`}>{w}</button>
                      ))}
                    </div>
                  </div>
                  <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Write your review..." rows={3}
                    className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none resize-none focus:border-red-600 mb-4" />

                  {/* Add to Lists */}
                  <div className="p-3 rounded-xl bg-zinc-900">
                    <div className="text-sm font-semibold text-white mb-2">📋 Add to Lists</div>
                    {lists.length === 0 ? (
                      <div className="text-xs text-zinc-500 mb-2">No lists yet. Create one below.</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {lists.map(list => {
                          const sel = selectedLists.includes(list.id);
                          return (
                            <button key={list.id} onClick={() => setSelectedLists(sel ? selectedLists.filter(id => id !== list.id) : [...selectedLists, list.id])}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${sel ? "bg-red-600/15 text-red-400 border-red-600/40" : "bg-zinc-950 text-zinc-500 border-transparent"}`}>
                              {list.icon} {list.name} {sel && "✓"}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input value={newListInline} onChange={(e) => setNewListInline(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createListInline())} placeholder="New list name..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-white text-xs outline-none" />
                      <button onClick={createListInline} className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 text-xs font-bold whitespace-nowrap">+ Create</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                {step > 0 && <button onClick={() => setStep(step - 1)} className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 font-semibold text-sm">Back</button>}
                <div className="flex-1" />
                {step < 3 && <button onClick={() => setStep(step + 1)} className="px-6 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm">Next →</button>}
                {step === 3 && <button onClick={submitLog} className="px-6 py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm">{logged ? "Update ✓" : "Log Game ✓"}</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SHARE MODAL ===== */}
      {/* Hype Meter modal */}
      {showHype && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowHype(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-[10px] font-bold text-orange-400 tracking-widest uppercase">🔥 Hype Meter</div>
                <div className="text-base font-bold text-white">{a.abbr} vs {h.abbr}</div>
              </div>
              <button onClick={() => setShowHype(false)} className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-lg font-bold">×</button>
            </div>
            <p className="text-xs text-zinc-500 mb-5">How hyped are you for this game? Rate your anticipation before it kicks off.</p>

            <div className="text-center mb-4">
              <div className="text-6xl font-extrabold mb-1" style={{ color: "#ea580c" }}>{hypeDraft}</div>
              <div className="text-[11px] font-bold text-zinc-500 tracking-wider uppercase">
                {hypeDraft <= 2 ? "Barely watching" : hypeDraft <= 4 ? "Mild interest" : hypeDraft <= 6 ? "Worth a look" : hypeDraft <= 8 ? "Genuinely hyped" : "Can't wait 🍿"}
              </div>
            </div>

            <input
              type="range" min="1" max="10" step="1" value={hypeDraft}
              onChange={(e) => setHypeDraft(parseInt(e.target.value, 10))}
              className="w-full accent-orange-600 mb-2"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 mb-5 px-0.5">
              {[1,2,3,4,5,6,7,8,9,10].map(n => <span key={n}>{n}</span>)}
            </div>

            <button
              onClick={saveHype}
              disabled={savingHype}
              className="w-full py-3 rounded-xl bg-orange-600 text-white font-bold text-sm hover:bg-orange-500 disabled:opacity-50 transition-colors"
            >
              {savingHype ? "Saving…" : hype > 0 ? "Update Hype" : "Lock in Hype 🔥"}
            </button>
          </div>
        </div>
      )}

      {showShare && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowShare(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Share</div>
                <div className="text-base font-bold text-white">{a.abbr} vs {h.abbr}</div>
              </div>
              <button onClick={() => setShowShare(false)} className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-lg font-bold">×</button>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900 mb-4">
              <div className="text-sm text-zinc-300">{shareText}</div>
              <div className="text-xs text-red-400 mt-2 break-all">{shareUrl}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={copyShareLink} className="py-3 rounded-xl bg-zinc-800 text-white text-sm font-bold hover:bg-zinc-700 transition-colors">
                {shareCopied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
              <button onClick={nativeShare} className="py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors">📤 Share</button>
            </div>
            {/* Image rating card */}
            <button onClick={saveRatingCard} disabled={cardBusy} className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-800 text-white text-sm font-bold hover:opacity-90 transition-opacity mb-3 flex items-center justify-center gap-2 disabled:opacity-60">
              {cardBusy && <span className="inline-block w-3.5 h-3.5 border-2 border-red-300 border-t-white rounded-full animate-spin" />}
              {cardBusy ? "Making card…" : "🖼️ Rating Card Image"}
            </button>
            <div className="grid grid-cols-3 gap-2">
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="py-2.5 rounded-xl bg-zinc-900 text-center text-xs font-bold text-white hover:bg-zinc-800 transition-colors">𝕏 Tweet</a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="py-2.5 rounded-xl bg-zinc-900 text-center text-xs font-bold text-white hover:bg-zinc-800 transition-colors">f Facebook</a>
              <a href={`sms:?body=${encodeURIComponent(shareText + " " + shareUrl)}`} className="py-2.5 rounded-xl bg-zinc-900 text-center text-xs font-bold text-white hover:bg-zinc-800 transition-colors">💬 Text</a>
            </div>
            {profile?.handle && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <Link href={`/u/${profile.handle}`} className="block text-center text-sm text-red-400 hover:text-red-300">
                  View my public profile →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <Nav />
    </div>
  );
}
