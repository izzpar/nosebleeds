// Fantasy player scoring — shared by the player-draft AND salary-cap modes.
// One engine: points are computed per player per match from SportMonks stats,
// then summed. Every value here is a league-configurable default.

import { STAT } from "@/lib/sportmonks";

// Default scoring (FPL-flavored, tuned to the stats SportMonks actually gives).
export const DEFAULT_PLAYER_SCORING = {
  play_60: 2,            // played 60+ minutes
  play_1: 1,             // played 1–59 minutes
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  clean_sheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 }, // requires 60+ min, team conceded 0
  conceded_2: { GK: -1, DEF: -1, MID: 0, FWD: 0 }, // per 2 goals conceded
  saves_per_point: 3,    // +1 per N saves (GK)
  shot_on_target: 0.5,   // you asked for shots to count
  tackle: 0.25,          // and tackles
  save_points: 1,        // points per 3 saves
  yellow: -1,
  red: -3,
  own_goal: -2,
  pen_won: 1,
  pen_committed: -1,
  pen_scored: 0,         // already counts as a goal
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ---- Component-based scoring -------------------------------------------------
// The cron stores per-player cumulative scoring "components" (counts) so a league
// can re-score with custom values. Per-match thresholds (60 min, clean sheet,
// conceded/2, saves/3) are baked here; the point VALUES stay configurable.
export function playerComponents(p) {
  if (!p || !p.played) return null;
  const s = p.stats || {};
  const conceded = n(s[STAT.GOALS_CONCEDED] || s[STAT.GK_GOALS_CONCEDED]);
  return {
    play60: p.minutes >= 60 ? 1 : 0,
    play1: p.minutes > 0 && p.minutes < 60 ? 1 : 0,
    goals: n(s[STAT.GOALS]),
    assists: n(s[STAT.ASSISTS]),
    sot: n(s[STAT.SHOTS_ON_TARGET]),
    tackles: n(s[STAT.TACKLES]),
    cs: p.minutes >= 60 && conceded === 0 ? 1 : 0,
    conceded2: Math.floor(conceded / 2),
    saves3: Math.floor(n(s[STAT.SAVES]) / 3),
    yellow: n(s[STAT.YELLOW]),
    red: n(s[STAT.RED]),
    og: n(s[STAT.OWN_GOAL]),
    penWon: n(s[STAT.PEN_WON]),
    penCommitted: n(s[STAT.PEN_COMMITTED]),
  };
}

export function addComponents(a, b) {
  const r = { ...(a || {}) };
  for (const k of Object.keys(b || {})) r[k] = (r[k] || 0) + b[k];
  return r;
}

export function pointsFromComponents(c, role = "MID", scoring = DEFAULT_PLAYER_SCORING) {
  if (!c) return 0;
  let p = 0;
  p += (c.play60 || 0) * scoring.play_60 + (c.play1 || 0) * scoring.play_1;
  p += (c.goals || 0) * (scoring.goal[role] ?? scoring.goal.MID);
  p += (c.assists || 0) * scoring.assist;
  p += (c.sot || 0) * scoring.shot_on_target + (c.tackles || 0) * scoring.tackle;
  p += (c.cs || 0) * (scoring.clean_sheet[role] ?? 0);
  p += (c.conceded2 || 0) * (scoring.conceded_2[role] ?? 0);
  p += (c.saves3 || 0) * (scoring.save_points ?? 1);
  p += (c.yellow || 0) * scoring.yellow + (c.red || 0) * scoring.red + (c.og || 0) * scoring.own_goal;
  p += (c.penWon || 0) * scoring.pen_won + (c.penCommitted || 0) * scoring.pen_committed;
  return Math.round(p * 100) / 100;
}

// Is this object a player-scoring config (vs the team default)?
export function isPlayerScoring(s) {
  return !!s && s.play_60 != null;
}

// Compute one player's points for one match.
// `p` is a row from parsePlayerStats(); `scoring` is a league config.
export function playerMatchPoints(p, scoring = DEFAULT_PLAYER_SCORING) {
  if (!p || !p.played) return 0;
  const s = p.stats || {};
  const role = p.role || "MID";
  let pts = 0;

  // Minutes / appearance
  pts += p.minutes >= 60 ? scoring.play_60 : scoring.play_1;

  // Attacking
  pts += n(s[STAT.GOALS]) * (scoring.goal[role] ?? scoring.goal.MID);
  pts += n(s[STAT.ASSISTS]) * scoring.assist;
  pts += n(s[STAT.SHOTS_ON_TARGET]) * scoring.shot_on_target;
  pts += n(s[STAT.TACKLES]) * scoring.tackle;

  // Defensive: clean sheet + goals conceded (position-aware)
  const conceded = n(s[STAT.GOALS_CONCEDED] || s[STAT.GK_GOALS_CONCEDED]);
  if (p.minutes >= 60 && conceded === 0) pts += scoring.clean_sheet[role] ?? 0;
  if (conceded > 0) pts += Math.floor(conceded / 2) * (scoring.conceded_2[role] ?? 0);

  // Goalkeeping
  const saves = n(s[STAT.SAVES]);
  if (saves) pts += Math.floor(saves / scoring.saves_per_point);

  // Discipline & misc
  pts += n(s[STAT.YELLOW]) * scoring.yellow;
  pts += n(s[STAT.RED]) * scoring.red;
  pts += n(s[STAT.OWN_GOAL]) * scoring.own_goal;
  pts += n(s[STAT.PEN_WON]) * scoring.pen_won;
  pts += n(s[STAT.PEN_COMMITTED]) * scoring.pen_committed;

  return Math.round(pts * 100) / 100;
}

// Human-readable breakdown for a player's match (for the UI tooltip/expander).
export function pointsBreakdown(p, scoring = DEFAULT_PLAYER_SCORING) {
  if (!p || !p.played) return [];
  const s = p.stats || {};
  const role = p.role || "MID";
  const rows = [];
  const add = (label, value) => value && rows.push({ label, value: Math.round(value * 100) / 100 });

  add(p.minutes >= 60 ? "60+ mins" : "Played", p.minutes >= 60 ? scoring.play_60 : scoring.play_1);
  add("Goals", n(s[STAT.GOALS]) * (scoring.goal[role] ?? scoring.goal.MID));
  add("Assists", n(s[STAT.ASSISTS]) * scoring.assist);
  add("Shots on target", n(s[STAT.SHOTS_ON_TARGET]) * scoring.shot_on_target);
  add("Tackles", n(s[STAT.TACKLES]) * scoring.tackle);
  const conceded = n(s[STAT.GOALS_CONCEDED] || s[STAT.GK_GOALS_CONCEDED]);
  if (p.minutes >= 60 && conceded === 0) add("Clean sheet", scoring.clean_sheet[role] ?? 0);
  if (conceded > 0) add("Goals conceded", Math.floor(conceded / 2) * (scoring.conceded_2[role] ?? 0));
  const saves = n(s[STAT.SAVES]);
  if (saves) add("Saves", Math.floor(saves / scoring.saves_per_point));
  add("Yellow card", n(s[STAT.YELLOW]) * scoring.yellow);
  add("Red card", n(s[STAT.RED]) * scoring.red);
  add("Own goal", n(s[STAT.OWN_GOAL]) * scoring.own_goal);
  return rows;
}
