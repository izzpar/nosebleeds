// Shared player-roster loader for the Dream Team builder.
// US sports: ESPN team rosters (the league /teams list is CORS-blocked, so IDs are
// hardcoded). Soccer: the cached World Cup player pool. Cached per session.

const SPORT_PATHS = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
const TEAM_IDS = {
  nfl: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","33","34"],
  mlb: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"],
  nba: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"],
  nhl: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","25","26","27","28","29","30","37","124292","129764"],
};

const cache = {};

async function loadUsRoster(sport) {
  const path = SPORT_PATHS[sport];
  const out = [];
  const seen = new Set();
  await Promise.all(TEAM_IDS[sport].map(async (teamId) => {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/roster`);
      if (!r.ok) return;
      const d = await r.json();
      const abbr = d.team?.abbreviation || "";
      const athletes = [];
      (d.athletes || []).forEach((entry) => {
        if (entry && Array.isArray(entry.items)) athletes.push(...entry.items);
        else if (entry && entry.displayName) athletes.push(entry);
      });
      athletes.forEach((p) => {
        const name = p.displayName;
        if (!name || seen.has(name + abbr)) return;
        seen.add(name + abbr);
        out.push({ id: String(p.id || name), name, team: abbr, position: p.position?.abbreviation || "", headshot: p.headshot?.href || "" });
      });
    } catch (e) { /* skip a team */ }
  }));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function loadSoccerRoster() {
  const d = await (await fetch("/api/wc-players")).json();
  return (d.players || []).map((p) => ({ id: String(p.id), name: p.name, team: p.team_name, position: p.role, headshot: p.image || "" }));
}

export async function loadRoster(sport) {
  if (cache[sport]) return cache[sport];
  const players = sport === "wc" ? await loadSoccerRoster() : await loadUsRoster(sport);
  cache[sport] = players;
  return players;
}
