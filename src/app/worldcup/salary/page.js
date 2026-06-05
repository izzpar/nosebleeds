"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import GroupScope from "@/components/WcGroups";
import { RANKING_LOCK_ISO } from "@/lib/worldcup";

const BUDGET = 100;
const SQUAD_REQ = { GK: 2, DEF: 5, MID: 5, FWD: 3 };       // 15 total
const START_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 };       // formation floor
const START_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };       // formation ceiling
const POS = ["GK", "DEF", "MID", "FWD"];
const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };

function lockLabel(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return "now";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `in ${d}d ${h}h`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `in ${h}h ${m}m`;
}

export default function SalaryCapPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [rounds, setRounds] = useState(null);    // from /api/wc-rounds (with fallback)
  const [squad, setSquad] = useState([]);       // player ids
  const [starters, setStarters] = useState([]); // player ids (subset)
  const [bench, setBench] = useState([]);       // non-starters, in auto-sub order
  const [captain, setCaptain] = useState(null);
  const [subTab, setSubTab] = useState("team");
  const [pos, setPos] = useState("GK");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  // The round you're currently editing = the next one whose lock hasn't passed.
  const editRound = useMemo(() => {
    if (!rounds) return undefined;            // still loading
    return rounds.find((r) => r.lock > Date.now()) || null; // null = all rounds locked
  }, [rounds]);
  const locked = editRound === null;          // no open round left to edit

  // Priced player pool.
  useEffect(() => {
    fetch("/api/wc-players").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.players)) setPool(d.players);
    }).catch(() => {}).finally(() => setPoolLoading(false));
  }, []);

  // Rounds (with a single-round fallback if the API is unavailable).
  useEffect(() => {
    const fallback = [{ round_id: "all", index: 0, label: "Tournament", lock: new Date(RANKING_LOCK_ISO).getTime() }];
    fetch("/api/wc-rounds").then((r) => r.json()).then((d) => {
      setRounds(d.rounds && d.rounds.length ? d.rounds : fallback);
    }).catch(() => setRounds(fallback));
  }, []);

  // Load my lineup for the round being edited (carry over the most recent one).
  useEffect(() => {
    if (!user || editRound === undefined || editRound === null) return;
    (async () => {
      const idxOf = {};
      (rounds || []).forEach((r) => { idxOf[String(r.round_id)] = r.index; });
      const mine = await sbJson(await sbFetch(`wc_fantasy_lineups?user_id=eq.${user.id}&select=*`));
      let chosen = mine.find((l) => String(l.round_id) === String(editRound.round_id));
      if (!chosen) {
        chosen = mine
          .filter((l) => (idxOf[String(l.round_id)] ?? -1) < editRound.index)
          .sort((a, b) => (idxOf[String(b.round_id)] ?? -1) - (idxOf[String(a.round_id)] ?? -1))[0];
      }
      if (!chosen) {
        chosen = (await sbJson(await sbFetch(`wc_fantasy_entries?user_id=eq.${user.id}&select=squad,starters,bench,captain`)))[0];
      }
      if (chosen) {
        setSquad((chosen.squad || []).map(String));
        setStarters((chosen.starters || []).map(String));
        setBench((chosen.bench || []).map(String));
        setCaptain(chosen.captain ? String(chosen.captain) : null);
      }
    })();
  }, [user, editRound, rounds]);

  // Keep the bench list = squad minus starters, preserving the user's order.
  useEffect(() => {
    const nonStarters = squad.filter((id) => !starters.includes(id));
    setBench((prev) => {
      const kept = prev.filter((id) => nonStarters.includes(id));
      const added = nonStarters.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [squad, starters]);

  const byId = useMemo(() => {
    const m = {}; for (const p of pool) m[String(p.id)] = p; return m;
  }, [pool]);
  const squadPlayers = squad.map((id) => byId[id]).filter(Boolean);
  const priceOf = (id) => Number(byId[id]?.price || 0);
  const spent = squad.reduce((s, id) => s + priceOf(id), 0);
  const remaining = Math.round((BUDGET - spent) * 10) / 10;
  const posCount = (arr, pp) => arr.filter((id) => byId[id]?.role === pp).length;

  const addPlayer = (p) => {
    if (locked || squad.includes(String(p.id))) return;
    if (posCount(squad, p.role) >= SQUAD_REQ[p.role]) { flash(`Squad already has ${SQUAD_REQ[p.role]} ${p.role}`); return; }
    if (priceOf(p.id) > remaining + 1e-9) { flash("Not enough budget"); return; }
    if (squad.length >= 15) { flash("Squad is full (15)"); return; }
    setSquad((s) => [...s, String(p.id)]);
  };
  const removePlayer = (id) => {
    if (locked) return;
    setSquad((s) => s.filter((x) => x !== id));
    setStarters((s) => s.filter((x) => x !== id));
    if (captain === id) setCaptain(null);
  };
  const toggleStarter = (id) => {
    if (locked) return;
    const role = byId[id]?.role;
    if (starters.includes(id)) {
      setStarters((s) => s.filter((x) => x !== id));
      if (captain === id) setCaptain(null);
      return;
    }
    if (starters.length >= 11) { flash("11 starters already"); return; }
    if (posCount(starters, role) >= START_MAX[role]) { flash(`Max ${START_MAX[role]} ${role} on the pitch`); return; }
    setStarters((s) => [...s, id]);
  };
  const moveBench = (id, dir) => {
    if (locked) return;
    setBench((b) => {
      const i = b.indexOf(id); const j = i + dir;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const n = [...b]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  };

  const squadFull = squad.length === 15 && POS.every((p) => posCount(squad, p) === SQUAD_REQ[p]);
  const startersValid =
    starters.length === 11 && POS.every((p) => {
      const c = posCount(starters, p);
      return c >= START_MIN[p] && c <= START_MAX[p];
    });
  const canSave = squadFull && startersValid && captain && starters.includes(captain) && !locked;

  const save = async () => {
    if (!editRound) return;
    if (!user || saving || !canSave) { if (!canSave) flash("Complete a valid 15 squad, 11 starters + captain"); return; }
    setSaving(true);
    try {
      // Per-round snapshot — this round's team is locked in at its kickoff.
      const res = await sbFetch("wc_fantasy_lineups?on_conflict=user_id,round_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: user.id, round_id: editRound.round_id,
          squad, starters, bench, captain, updated_at: new Date().toISOString(),
        }),
      });
      flash(res.ok ? `Saved for ${editRound.label} ✓` : "Couldn't save");
    } catch (e) { flash("Couldn't save"); } finally { setSaving(false); }
  };

  // pool picker list
  const query = q.trim().toLowerCase();
  const available = pool
    .filter((p) => p.role === pos)
    .filter((p) => !squad.includes(String(p.id)))
    .filter((p) => !query || (p.name || "").toLowerCase().includes(query) || (p.team_name || "").toLowerCase().includes(query))
    .sort((a, b) => (b.proj || 0) - (a.proj || 0))
    .slice(0, 60);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">💰</span>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">Salary Cap</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">
              €{BUDGET}m budget · {editRound === undefined ? "…" : editRound ? <>editing <span className="text-zinc-300">{editRound.label}</span> · locks {lockLabel(editRound.lock)}</> : "season locked"}
            </p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["team", "My Team"], ["board", "Leaderboard"]].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)} className={`pb-2 font-bold border-b-2 ${subTab === id ? "text-white border-red-500" : "text-zinc-600 border-transparent"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {!user ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 mb-4">Sign in to build your team.</p>
            <button onClick={() => router.push("/login")} className="bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl">Log in</button>
          </div>
        ) : subTab === "board" ? (
          <SalaryLeaderboard />
        ) : poolLoading || editRound === undefined ? (
          <p className="text-zinc-600 text-sm py-8">Loading…</p>
        ) : locked ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-8 text-center text-sm text-zinc-400">
            The tournament is over — squads are locked. Check the leaderboard for final standings. 🏆
          </div>
        ) : (
          <>
            {editRound && (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2 mb-3 text-[11px] text-zinc-400">
                🔁 Editing your <span className="text-zinc-200">{editRound.label}</span> team — unlimited changes until it locks <span className="text-zinc-200">{lockLabel(editRound.lock)}</span>. Your team carries over to each new round.
              </div>
            )}
            {/* budget bar */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[["Budget left", `€${remaining}m`, remaining < 0 ? "text-red-500" : "text-emerald-400"],
                ["Squad", `${squad.length}/15`, squadFull ? "text-emerald-400" : "text-zinc-300"],
                ["Starters", `${starters.length}/11`, startersValid ? "text-emerald-400" : "text-zinc-300"]].map(([l, v, c]) => (
                <div key={l} className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] uppercase text-zinc-500">{l}</div>
                  <div className={`font-bold ${c}`}>{v}</div>
                </div>
              ))}
            </div>

            {/* squad by position */}
            {POS.map((g) => (
              <div key={g} className="mb-2">
                <div className="text-[11px] font-bold mb-1"><span className={POS_COLOR[g]}>{g}</span> <span className="text-zinc-600">({posCount(squad, g)}/{SQUAD_REQ[g]})</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {squadPlayers.filter((p) => p.role === g).map((p) => {
                    const id = String(p.id); const isStart = starters.includes(id); const isCap = captain === id;
                    return (
                      <span key={id} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] border ${isStart ? "bg-zinc-800 border-zinc-600" : "bg-zinc-900/50 border-zinc-800 text-zinc-400"}`}>
                        <button onClick={() => toggleStarter(id)} title="starter" className={isStart ? "text-amber-400" : "text-zinc-600"}>★</button>
                        {isStart && <button onClick={() => setCaptain(id)} title="captain" className={isCap ? "text-red-500 font-bold" : "text-zinc-600"}>C</button>}
                        <span>{p.name}</span>
                        <span className="text-zinc-500">€{p.price}</span>
                        {!locked && <button onClick={() => removePlayer(id)} className="text-zinc-600 ml-0.5">✕</button>}
                      </span>
                    );
                  })}
                  {posCount(squad, g) === 0 && <span className="text-zinc-600 text-[12px]">none yet</span>}
                </div>
              </div>
            ))}

            {/* bench / auto-sub order */}
            {squad.length > starters.length && (
              <div className="mb-4 mt-2">
                <div className="text-[11px] font-bold text-zinc-400 mb-1">
                  Bench <span className="text-zinc-600 font-normal">— if a starter doesn&apos;t play, the first bench sub who played takes their points</span>
                </div>
                <div className="space-y-1">
                  {bench.map((id, i) => {
                    const p = byId[id]; if (!p) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-1.5 text-[12px]">
                        <span className="text-zinc-600 w-4">{i + 1}</span>
                        <span className={`${POS_COLOR[p.role]} font-bold w-8 text-[10px]`}>{p.role}</span>
                        <span className="flex-1 truncate">{p.name}</span>
                        {!locked && (
                          <span className="flex gap-1">
                            <button onClick={() => moveBench(id, -1)} disabled={i === 0} className="w-6 h-6 rounded bg-zinc-800 disabled:opacity-30">↑</button>
                            <button onClick={() => moveBench(id, 1)} disabled={i === bench.length - 1} className="w-6 h-6 rounded bg-zinc-800 disabled:opacity-30">↓</button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!locked && (
              <button onClick={save} disabled={saving} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl my-4">
                {saving ? "Saving…" : canSave ? "Save team" : "Pick 15 + 11 starters + captain"}
              </button>
            )}

            {/* picker */}
            {!locked && (
              <>
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Add players</h3>
                <div className="flex gap-1.5 mb-2">
                  {POS.map((p) => (
                    <button key={p} onClick={() => setPos(p)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${pos === p ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
                      {p} {posCount(squad, p)}/{SQUAD_REQ[p]}
                    </button>
                  ))}
                </div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm mb-2 outline-none focus:border-zinc-600" />
                <div className="space-y-1">
                  {available.map((p) => {
                    const affordable = priceOf(p.id) <= remaining + 1e-9;
                    const slot = posCount(squad, p.role) < SQUAD_REQ[p.role];
                    const ok = affordable && slot;
                    return (
                      <button key={p.id} onClick={() => addPlayer(p)} disabled={!ok}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left ${ok ? "bg-zinc-900 border-zinc-700 hover:border-red-500" : "bg-zinc-900/40 border-zinc-800 opacity-50"}`}>
                        <span className={`text-[10px] font-bold w-8 ${POS_COLOR[p.role]}`}>{p.role}</span>
                        <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                        <span className="text-[11px] text-zinc-500 truncate max-w-[26%]">{p.team_name}</span>
                        <span className="text-[11px] text-zinc-400 w-7 text-right">{p.proj}</span>
                        <span className="text-[11px] text-emerald-400 w-12 text-right">€{p.price}m</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">{toast}</div>}
      <Nav />
    </div>
  );
}

function SalaryLeaderboard() {
  const [rows, setRows] = useState(null);
  const [scopeIds, setScopeIds] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [roundsRes, lineups, rps] = await Promise.all([
        fetch("/api/wc-rounds").then((r) => r.json()).catch(() => ({ rounds: [] })),
        sbJson(await sbFetch("wc_fantasy_lineups?select=user_id,round_id,starters,bench,captain")),
        sbJson(await sbFetch("wc_player_round_points?select=player_id,round_id,points")),
      ]);
      const rounds = roundsRes.rounds || [];
      const idxOf = {}; rounds.forEach((r) => { idxOf[String(r.round_id)] = r.index; });
      // points by round: { round_id: { player_id: points } } (presence = played that round)
      const ptByRound = {};
      for (const r of rps) (ptByRound[String(r.round_id)] = ptByRound[String(r.round_id)] || {})[String(r.player_id)] = Number(r.points || 0);

      const byUser = {};
      for (const l of lineups) (byUser[l.user_id] = byUser[l.user_id] || []).push(l);
      const userIds = Object.keys(byUser);
      const nameOf = {};
      if (userIds.length) {
        const profs = await sbJson(await sbFetch(`profiles?user_id=in.(${userIds.join(",")})&select=user_id,handle,display_name`));
        profs.forEach((p) => { nameOf[p.user_id] = p.display_name || p.handle || "Player"; });
      }

      const scoreRound = (lu, pts) => {
        const starters = (lu.starters || []).map(String);
        const benchAvail = (lu.bench || []).map(String).filter((id) => pts[id] !== undefined);
        let bi = 0;
        const fielded = starters.map((id) => (pts[id] !== undefined ? id : bi < benchAvail.length ? benchAvail[bi++] : null));
        let t = fielded.reduce((s, id) => s + (id ? pts[id] || 0 : 0), 0);
        const cap = lu.captain && String(lu.captain);
        if (cap && fielded.includes(cap)) t += pts[cap] || 0; // captain doubles
        return t;
      };

      const scored = userIds.map((uid) => {
        const ls = byUser[uid];
        let total = 0;
        for (const round of rounds) {
          const pts = ptByRound[String(round.round_id)];
          if (!pts) continue; // round not scored yet
          // applicable lineup = this round's, else carried forward from the latest prior round
          let lu = ls.find((l) => String(l.round_id) === String(round.round_id));
          if (!lu) {
            lu = ls
              .filter((l) => (idxOf[String(l.round_id)] ?? -1) < round.index)
              .sort((a, b) => (idxOf[String(b.round_id)] ?? -1) - (idxOf[String(a.round_id)] ?? -1))[0];
          }
          if (lu) total += scoreRound(lu, pts);
        }
        return { user_id: uid, name: nameOf[uid] || "Player", total: Math.round(total * 100) / 100 };
      }).sort((a, b) => b.total - a.total);
      if (!cancelled) setRows(scored);
    };
    load().catch(() => { if (!cancelled) setRows((r) => r || []); });
    const t = setInterval(() => load().catch(() => {}), 45000); // live refresh
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  if (!rows) return <p className="text-zinc-600 text-sm py-8">Loading…</p>;
  const shown = scopeIds ? rows.filter((r) => scopeIds.includes(r.user_id)) : rows;
  return (
    <div>
      <GroupScope game="salary" onScope={setScopeIds} />
      {shown.length === 0 && <p className="text-zinc-600 text-sm py-6">{scopeIds ? "No one in this group has a team yet." : "No teams yet — build yours!"}</p>}
      <div className="space-y-2">
        {shown.map((r, i) => (
          <div key={r.user_id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="text-zinc-600 font-bold w-5">{i + 1}</span><span className="font-bold">{r.name}</span></div>
            <span className="font-bold text-red-500 tabular-nums">{r.total} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}
