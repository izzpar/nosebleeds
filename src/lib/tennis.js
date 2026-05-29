// Tennis helpers. Tennis is tournament/player-shaped (not team-vs-team), spread
// across two leagues (ATP men / WTA women), with matches nested in groupings.
// There's no per-match endpoint, so a match is found by scanning a date's
// tournament scoreboard. These helpers normalize all that into match objects.

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
export const TENNIS_LEAGUES = ["atp", "wta"];

function shapePlayer(c) {
  const a = c?.athlete || {};
  const ls = c?.linescores || [];
  return {
    name: a.displayName || "TBD",
    short: a.shortName || a.displayName || "TBD",
    flag: a.flag?.href || "",
    country: a.flag?.alt || "",
    winner: !!c?.winner,
    sets: ls.map((l) => (l.value != null ? String(Math.round(l.value)) : "")),
    setsWon: ls.filter((l) => l.winner).length,
  };
}

function shapeMatch(comp, tournament, group, league, dateStr) {
  const status = comp.status?.type?.name || "STATUS_SCHEDULED";
  const dt = new Date(comp.date);
  const comps = comp.competitors || [];
  const p1 = shapePlayer(comps[0]);
  const p2 = shapePlayer(comps[1]);
  return {
    id: String(comp.id),
    league,
    sport: "tennis",
    gameDate: dateStr,
    tournament,
    group,
    round: comp.round?.displayName || "",
    status,
    statusDetail: comp.status?.type?.shortDetail || comp.status?.type?.detail || "",
    isPre: status === "STATUS_SCHEDULED",
    isFinal: status === "STATUS_FINAL",
    isLive: status !== "STATUS_SCHEDULED" && status !== "STATUS_FINAL",
    date: dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " · " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    shortDate: dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    net: comp.broadcasts?.[0]?.names?.[0] || "",
    note: (comp.notes || [])[0]?.text || "",
    p1,
    p2,
    total: p1.setsWon + p2.setsWon,
    diff: Math.abs(p1.setsWon - p2.setsWon),
  };
}

async function fetchLeagueDate(league, dateStr) {
  try {
    const param = dateStr.replace(/-/g, "");
    const r = await fetch(`${ESPN_BASE}/tennis/${league}/scoreboard?dates=${param}`);
    if (!r.ok) return [];
    const d = await r.json();
    const out = [];
    (d.events || []).forEach((e) => {
      const tournament = e.name || e.shortName || "";
      (e.groupings || []).forEach((g) => {
        const group = g.grouping?.displayName || "";
        // Singles only — doubles are 2-per-side and don't fit the 1v1 model
        if (!/singles/i.test(group)) return;
        (g.competitions || []).forEach((c) => {
          // The scoreboard returns the whole draw — keep only this date's matches
          if ((c.date || "").slice(0, 10) === dateStr && (c.competitors || []).length === 2) {
            const m = shapeMatch(c, tournament, group, league, dateStr);
            // Skip placeholder matchups where a player isn't decided yet
            if (m.p1.name !== "TBD" && m.p2.name !== "TBD") out.push(m);
          }
        });
      });
    });
    return out;
  } catch (e) { return []; }
}

// All matches across ATP + WTA on a given YYYY-MM-DD.
// At a Grand Slam both tours' scoreboards return the same combined event, so
// de-dupe by match id (first league seen wins).
export async function fetchTennisMatches(dateStr) {
  const results = await Promise.all(TENNIS_LEAGUES.map((l) => fetchLeagueDate(l, dateStr)));
  const seen = new Set();
  const all = [];
  results.flat().forEach((m) => { if (!seen.has(m.id)) { seen.add(m.id); all.push(m); } });
  const rank = (m) => (m.isLive ? 0 : m.isPre ? 1 : 2);
  all.sort((a, b) => rank(a) - rank(b));
  return all;
}

// One match by id. Needs the date to locate it; tries the given league first.
export async function fetchTennisMatch(matchId, dateStr, league) {
  const order = league ? [league, ...TENNIS_LEAGUES.filter((l) => l !== league)] : TENNIS_LEAGUES;
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const date = dateStr || today;
  for (const l of order) {
    const matches = await fetchLeagueDate(l, date);
    const found = matches.find((m) => m.id === String(matchId));
    if (found) return found;
  }
  return null;
}
