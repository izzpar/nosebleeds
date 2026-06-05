// Round / matchday model for the World Cup. A "round" = a set of matches that
// share a SportMonks round_id (group matchday MD1/MD2/MD3, then each knockout
// round). Each round's `lock` is its first kickoff — transfers and waivers for
// that round close at that moment ("game day"). Pure functions.

export function buildRounds(fixtures) {
  const byRound = {};
  for (const f of fixtures || []) {
    const rid = String(f.round_id ?? f.stage_id ?? "0");
    (byRound[rid] = byRound[rid] || []).push(f);
  }
  const rounds = Object.entries(byRound)
    .map(([rid, fx]) => {
      const times = fx.map((f) => Date.parse(f.starting_at)).filter(Number.isFinite);
      const name = fx[0]?.round?.name || fx[0]?.stage?.name || null;
      return {
        round_id: rid,
        name,
        lock: times.length ? Math.min(...times) : null,
        end: times.length ? Math.max(...times) : null,
        fixture_ids: fx.map((f) => f.id),
        count: fx.length,
      };
    })
    .filter((r) => r.lock != null)
    .sort((a, b) => a.lock - b.lock);
  // Friendly labels: group matchdays are named "1/2/3"; knockouts come back
  // nameless, so infer from match count (with the two 1-match rounds being the
  // third-place playoff then the final, in date order).
  const KO = { 16: "Round of 32", 8: "Round of 16", 4: "Quarter-finals", 2: "Semi-finals" };
  let finalSeen = false;
  rounds.forEach((r, i) => {
    r.index = i;
    if (r.name && /^\d+$/.test(r.name)) r.label = `Group Matchday ${r.name}`;
    else if (KO[r.count]) r.label = KO[r.count];
    else if (r.count === 1) { r.label = finalSeen ? "Final" : "Third Place"; finalSeen = true; }
    else r.label = r.name || `Round ${i + 1}`;
  });
  return rounds;
}

// fixture_id -> round_id, for attributing match points to a round.
export function fixtureRoundMap(rounds) {
  const m = {};
  for (const r of rounds) for (const fid of r.fixture_ids) m[String(fid)] = r.round_id;
  return m;
}

// Index of the round currently underway (its lock has passed). -1 before kickoff.
export function currentRoundIndex(rounds, now = Date.now()) {
  let idx = -1;
  rounds.forEach((r, i) => { if (r.lock <= now) idx = i; });
  return idx;
}

// The next round still open for edits (lock in the future), or null if none.
export function nextOpenRound(rounds, now = Date.now()) {
  return rounds.find((r) => r.lock > now) || null;
}
