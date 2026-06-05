// Fantasy World Cup — ESPN data + scoring.
// ESPN's free FIFA World Cup endpoints (league slug "fifa.world", id 606).
// Verified live: returns the 48-team 2026 field and a scoreboard that starts
// 2026-06-11. No API key required, CORS-open for the browser.

export const WC_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

// 2026 tournament window (group stage opener → final). Used to sweep results.
export const WC_START = "20260611";
export const WC_END = "20260719";

export const DEFAULT_SCORING = {
  win: 3,
  draw: 1,
  goal: 1,
  clean_sheet: 2,
  r16: 4, // bonuses are cumulative on the furthest round a team reaches
  qf: 8,
  sf: 12,
  final: 16,
  champion: 25,
};

// Stage name (from ESPN) → rank. Group=0, first knockout (R32)=1, … Final=5.
const STAGE_RANK = {
  group: 0,
  "round of 32": 1,
  "round of 16": 2,
  quarter: 3,
  semi: 4,
  final: 5,
};

function stageRankFromName(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("third")) return null; // third-place playoff: no progression bonus
  if (n.includes("round of 32")) return 1;
  if (n.includes("round of 16")) return 2;
  if (n.includes("quarter")) return 3;
  if (n.includes("semi")) return 4;
  if (n.includes("final")) return 5;
  if (n.includes("group")) return 0;
  return null;
}

// Try hard to find a round label for a single event. Group matches usually have
// none (→ treated as group stage); knockout matches typically carry a headline.
function eventStageRank(event, leagueStageName) {
  const comp = event?.competitions?.[0];
  const candidates = [
    comp?.notes?.[0]?.headline,
    comp?.notes?.[0]?.text,
    event?.season?.type?.name,
    leagueStageName,
  ];
  for (const c of candidates) {
    const r = stageRankFromName(c);
    if (r != null) return r;
  }
  return 0; // default: group stage
}

// ---- Teams ---------------------------------------------------------------
export async function fetchTeams() {
  const r = await fetch(`${WC_BASE}/teams`);
  const d = await r.json();
  const list = d?.sports?.[0]?.leagues?.[0]?.teams || [];
  return list
    .map(({ team }) => ({
      id: String(team.id),
      abbr: team.abbreviation,
      name: team.displayName,
      color: team.color,
      logo: team.logos?.[0]?.href || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Results -------------------------------------------------------------
// One range fetch gives every event + result for match scoring. We also read a
// per-event round label so deep-run bonuses work once knockout data exists.
export async function fetchResults() {
  const byTeam = {}; // teamId -> aggregate
  const ensure = (c) => {
    const id = String(c.team?.id);
    if (!byTeam[id]) {
      byTeam[id] = {
        id,
        name: c.team?.displayName,
        abbr: c.team?.abbreviation,
        played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0,
        furthestStage: 0,
        champion: false,
      };
    }
    return byTeam[id];
  };

  let events = [];
  let leagueStageName = null;
  try {
    const r = await fetch(`${WC_BASE}/scoreboard?dates=${WC_START}-${WC_END}&limit=200`);
    const d = await r.json();
    events = d?.events || [];
    leagueStageName = d?.leagues?.[0]?.season?.type?.name || null;
  } catch (e) {
    return { byTeam, events: 0 };
  }

  let completed = 0;
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    if (!comp?.status?.type?.completed) continue;
    const cs = comp.competitors || [];
    if (cs.length !== 2) continue;
    completed++;

    const stage = eventStageRank(ev, leagueStageName);
    const [a, b] = cs;
    const as = parseInt(a.score, 10);
    const bs = parseInt(b.score, 10);

    for (const [self, opp, sc, oppSc] of [
      [a, b, as, bs],
      [b, a, bs, as],
    ]) {
      const t = ensure(self);
      t.played++;
      t.gf += Number.isFinite(sc) ? sc : 0;
      t.ga += Number.isFinite(oppSc) ? oppSc : 0;
      if (Number.isFinite(oppSc) && oppSc === 0) t.cs++;
      // ESPN flags the advancing/winning side via competitor.winner (covers PKs).
      const won = self.winner === true;
      const lost = opp.winner === true;
      if (won) t.w++;
      else if (lost) t.l++;
      else t.d++;
      if (stage > t.furthestStage) t.furthestStage = stage;
      if (stage === 5 && won) t.champion = true; // won the Final
    }
  }

  return { byTeam, events: completed };
}

// ---- Scoring -------------------------------------------------------------
export function teamPoints(t, scoring = DEFAULT_SCORING) {
  if (!t) return 0;
  let pts = 0;
  pts += t.w * scoring.win + t.d * scoring.draw;
  pts += t.gf * scoring.goal;
  pts += t.cs * scoring.clean_sheet;
  // Cumulative progression bonuses by furthest round reached.
  if (t.furthestStage >= 2) pts += scoring.r16;
  if (t.furthestStage >= 3) pts += scoring.qf;
  if (t.furthestStage >= 4) pts += scoring.sf;
  if (t.furthestStage >= 5) pts += scoring.final;
  if (t.champion) pts += scoring.champion;
  return pts;
}

// Standings for a league: total points per member from their drafted teams.
export function computeStandings(members, picks, results, scoring = DEFAULT_SCORING) {
  const byTeam = results?.byTeam || {};
  const rows = members.map((m) => {
    const myPicks = picks.filter((p) => p.user_id === m.user_id);
    const teams = myPicks.map((p) => {
      const t = byTeam[String(p.team_id)] || null;
      return {
        team_id: p.team_id,
        team_name: p.team_name,
        team_abbr: p.team_abbr,
        points: teamPoints(t, scoring),
        stat: t,
      };
    });
    const total = teams.reduce((s, x) => s + x.points, 0);
    return {
      user_id: m.user_id,
      name: m.display_name || m.handle || "Player",
      total,
      teams: teams.sort((x, y) => y.points - x.points),
    };
  });
  return rows.sort((a, b) => b.total - a.total);
}

// ---- Snake draft order ---------------------------------------------------
// Which draft_position (0-based) is on the clock for pick `pickIndex`, given N
// managers. Even rounds go 0→N-1, odd rounds reverse (snake).
export function onClockPosition(pickIndex, n) {
  if (n <= 0) return 0;
  const round = Math.floor(pickIndex / n);
  const idx = pickIndex % n;
  return round % 2 === 0 ? idx : n - 1 - idx;
}

// Teams each manager gets (everyone equal) and total picks in the draft.
export function draftPlan(n, teamCount = 48) {
  if (n <= 0) return { perManager: 0, totalPicks: 0 };
  const perManager = Math.floor(teamCount / n);
  return { perManager, totalPicks: perManager * n };
}

// ---- Power Ranking (1–48) -------------------------------------------------
// You rank every nation; each team earns performance points (teamPoints above),
// weighted by where YOU ranked it — higher rank = more weight when it does well.
// weight(rank 1) = N, weight(rank N) = 1. Score = Σ teamPts × weight.
export function rankingPoints(orderedTeamIds, results, scoring = DEFAULT_SCORING) {
  const byTeam = results?.byTeam || {};
  const N = orderedTeamIds.length;
  let total = 0;
  const contributions = [];
  orderedTeamIds.forEach((tid, i) => {
    const weight = N - i;
    const teamPts = teamPoints(byTeam[String(tid)], scoring);
    const points = teamPts * weight;
    total += points;
    contributions.push({ team_id: String(tid), rank: i + 1, weight, teamPts, points });
  });
  return { total, contributions };
}

// The lock moment — rankings freeze at the opening kickoff (2026-06-11).
export const RANKING_LOCK_ISO = "2026-06-11T16:00:00Z";
export function rankingsLocked(now = new Date()) {
  return now >= new Date(RANKING_LOCK_ISO);
}

// ---- Draft guidance (interim heuristic) ----------------------------------
// A pre-tournament strength seed per nation (0–100), used to suggest a draft
// order so users don't sort manually. This is a starting heuristic; it gets
// replaced by real form/market data once the live stats engine is wired in.
const NATION_STRENGTH = {
  argentina: 95, france: 95, spain: 93, brazil: 92, england: 91, portugal: 89,
  netherlands: 87, germany: 86, belgium: 82, croatia: 80, uruguay: 80,
  colombia: 79, morocco: 78, switzerland: 74, japan: 74, senegal: 73,
  turkiye: 73, unitedstates: 72, norway: 72, austria: 72, mexico: 71,
  egypt: 70, ecuador: 70, southkorea: 70, algeria: 70, ivorycoast: 69,
  sweden: 68, czechia: 67, canada: 67, ghana: 66, iran: 66, scotland: 66,
  bosnia: 66, paraguay: 64, australia: 64, congodr: 63, tunisia: 63,
  qatar: 60, saudiarabia: 60, southafrica: 60, panama: 58, iraq: 56,
  uzbekistan: 56, capeverde: 55, jordan: 55, newzealand: 55, haiti: 52,
  curacao: 50,
};

// Normalize a nation name (strip accents/punctuation, map aliases) to a key.
function nationKey(name) {
  let s = (name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z]/g, "");
  const alias = {
    cotedivoire: "ivorycoast",
    bosniaandherzegovina: "bosnia", bosniaherzegovina: "bosnia",
    turkey: "turkiye",
    usa: "unitedstates", unitedstatesofamerica: "unitedstates",
    korearepublic: "southkorea", republicofkorea: "southkorea", korea: "southkorea",
    drcongo: "congodr", democraticrepublicofcongo: "congodr", congokinshasa: "congodr",
    czechrepublic: "czechia",
    caboverde: "capeverde",
  };
  return alias[s] || s;
}

export function nationStrength(name) {
  return NATION_STRENGTH[nationKey(name)] ?? 55;
}

// Interim per-player projection: nation strength weighted by position.
const POS_WEIGHT = { FWD: 1.0, MID: 0.85, DEF: 0.72, GK: 0.6 };
export function playerProjection(player) {
  const w = POS_WEIGHT[player?.role] ?? 0.8;
  return Math.round(nationStrength(player?.team_name) * w);
}

