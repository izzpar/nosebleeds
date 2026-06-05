"use client";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import Confetti from "@/components/Confetti";
import { RANKING_LOCK_ISO } from "@/lib/worldcup";
import { fetchMyGroups, createGroup } from "@/lib/groups";
import WcBackdrop from "@/components/WcBackdrop";

const BUDGET = 100;
const SQUAD_REQ = { GK: 2, DEF: 5, MID: 5, FWD: 3 };       // 15 total
const START_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 };       // formation floor
const START_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };       // formation ceiling
const POS = ["GK", "DEF", "MID", "FWD"];
const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };
const GLOBAL = { id: null, name: "🌍 Global", max_entries: 1, isGlobal: true };

function lockLabel(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return "now";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `in ${d}d ${h}h`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `in ${h}h ${m}m`;
}

function SalaryCapInner() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [rounds, setRounds] = useState(null);    // from /api/wc-rounds (with fallback)

  // Leagues + entries (the redesign: salary is now league-based like ranking).
  const [leagues, setLeagues] = useState([GLOBAL]);
  const [selLeagueId, setSelLeagueId] = useState(null); // null = Global
  const [entries, setEntries] = useState([]);
  const [selEntryId, setSelEntryId] = useState(null);
  const [subs, setSubs] = useState([]);          // leagues the selected team is entered in

  // The selected entry's lineup for the round being edited.
  const [squad, setSquad] = useState([]);       // player ids
  const [starters, setStarters] = useState([]); // player ids (subset)
  const [bench, setBench] = useState([]);       // non-starters, in auto-sub order
  const [captain, setCaptain] = useState(null);

  const [subTab, setSubTab] = useState("leagues");
  const [pos, setPos] = useState("GK");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(0);
  const [sel, setSel] = useState(null); // selected squad player (for pitch actions)

  // Leagues-tab UI
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [lgName, setLgName] = useState("");
  const [lgMax, setLgMax] = useState(1);
  const [copied, setCopied] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const selLeague = leagues.find((l) => (l.id || null) === selLeagueId) || GLOBAL;

  // The round you're currently editing = the next one whose lock hasn't passed.
  const editRound = useMemo(() => {
    if (!rounds) return undefined;            // still loading
    return rounds.find((r) => r.lock > Date.now()) || null; // null = all rounds locked
  }, [rounds]);
  const locked = editRound === null;          // no open round left to edit

  // ---- static data ----
  useEffect(() => {
    fetch("/api/wc-players").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.players)) setPool(d.players);
    }).catch(() => {}).finally(() => setPoolLoading(false));
  }, []);

  useEffect(() => {
    const fallback = [{ round_id: "all", index: 0, label: "Tournament", lock: new Date(RANKING_LOCK_ISO).getTime() }];
    fetch("/api/wc-rounds").then((r) => r.json()).then((d) => {
      setRounds(d.rounds && d.rounds.length ? d.rounds : fallback);
    }).catch(() => setRounds(fallback));
  }, []);

  // ---- leagues + entries ----
  const loadLeagues = useCallback(async () => {
    if (!user) return;
    try { setLeagues([GLOBAL, ...(await fetchMyGroups(user.id, "salary"))]); } catch (e) {}
  }, [user]);
  useEffect(() => { loadLeagues(); }, [loadLeagues]);

  // Your team library (reusable across leagues).
  const loadEntries = useCallback(async () => {
    if (!user) return;
    const rows = await sbJson(await sbFetch(`wc_salary_entries?user_id=eq.${user.id}&select=*&order=created_at.asc`));
    setEntries(rows);
    setSelEntryId((prev) => (rows.find((r) => r.id === prev) ? prev : rows[0]?.id || null));
  }, [user]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Which leagues the selected team is entered in.
  const loadSubs = useCallback(async () => {
    if (!user || !selEntryId) { setSubs([]); return; }
    const rows = await sbJson(await sbFetch(`wc_salary_submissions?entry_id=eq.${selEntryId}&user_id=eq.${user.id}&select=id,group_id`));
    setSubs(rows);
  }, [user, selEntryId]);
  useEffect(() => { loadSubs(); }, [loadSubs]);

  // Deep-link from the dedicated league/entry pages: /worldcup/salary?league=X&entry=Y
  useEffect(() => {
    const lg = searchParams.get("league");
    const en = searchParams.get("entry");
    if (lg != null) { setSelLeagueId(lg === "global" ? null : lg); setSubTab("team"); }
    if (en) setSelEntryId(en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the selected entry's lineup for the round being edited (carry it over
  // from the most recent prior round if this round hasn't been set yet).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !selEntryId || editRound === undefined || editRound === null) {
        if (!selEntryId) { setSquad([]); setStarters([]); setBench([]); setCaptain(null); }
        return;
      }
      const idxOf = {};
      (rounds || []).forEach((r) => { idxOf[String(r.round_id)] = r.index; });
      const mine = await sbJson(await sbFetch(`wc_salary_entry_lineups?entry_id=eq.${selEntryId}&select=*`));
      if (cancelled) return;
      let chosen = mine.find((l) => String(l.round_id) === String(editRound.round_id));
      if (!chosen) {
        chosen = mine
          .filter((l) => (idxOf[String(l.round_id)] ?? -1) < editRound.index)
          .sort((a, b) => (idxOf[String(b.round_id)] ?? -1) - (idxOf[String(a.round_id)] ?? -1))[0];
      }
      setSquad((chosen?.squad || []).map(String));
      setStarters((chosen?.starters || []).map(String));
      setBench((chosen?.bench || []).map(String));
      setCaptain(chosen?.captain ? String(chosen.captain) : null);
      setSel(null);
    })();
    return () => { cancelled = true; };
  }, [user, selEntryId, editRound, rounds]);

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
  // Formation string from the starting XI (outfield only), e.g. "4-4-2".
  const formation = ["DEF", "MID", "FWD"].map((g) => posCount(starters, g)).join("-");

  const addPlayer = (p) => {
    if (locked || !selEntryId || squad.includes(String(p.id))) return;
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
  const canSave = squadFull && startersValid && captain && starters.includes(captain) && !locked && !!selEntryId;

  // ---- entry + league actions ----
  const newEntry = async () => {
    if (!user || locked) return;
    const { rows } = await sbInsert("wc_salary_entries", {
      group_id: null, user_id: user.id,
      handle: profile?.handle || user.email?.split("@")[0],
      display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
      label: `Team ${entries.length + 1}`,
    });
    // Auto-enter your FIRST team on the Global board; extra teams you add yourself.
    if (rows[0] && entries.length === 0) await sbInsert("wc_salary_submissions", { entry_id: rows[0].id, group_id: null, user_id: user.id });
    await loadEntries();
    if (rows[0]) setSelEntryId(rows[0].id);
  };

  const renameEntry = async (label) => {
    if (!selEntryId) return;
    await sbFetch(`wc_salary_entries?id=eq.${selEntryId}`, { method: "PATCH", body: JSON.stringify({ label }) });
    setEntries((es) => es.map((e) => (e.id === selEntryId ? { ...e, label } : e)));
  };

  const createLeague = async () => {
    if (!lgName.trim()) return;
    const g = await createGroup(lgName, "salary", user.id, profile, lgMax);
    if (g) { setLgName(""); setCreatingLeague(false); await loadLeagues(); setSelLeagueId(g.id); setSubTab("team"); }
  };

  const copyInvite = () => {
    if (!selLeague.invite_code) return;
    try { navigator.clipboard.writeText(`${window.location.origin}/worldcup/g/${selLeague.invite_code}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const save = async () => {
    if (!editRound) return;
    if (!user || saving || !canSave) { if (!canSave) flash("Complete a valid 15 squad, 11 starters + captain"); return; }
    setSaving(true);
    try {
      // Per-round snapshot — this round's team locks in at its kickoff.
      const res = await sbFetch("wc_salary_entry_lineups?on_conflict=entry_id,round_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          entry_id: selEntryId, round_id: editRound.round_id,
          squad, starters, bench, captain, updated_at: new Date().toISOString(),
        }),
      });
      if (res.ok) setCelebrate((c) => c + 1);
      flash(res.ok ? `Saved for ${editRound.label} ✓` : "Couldn't save");
    } catch (e) { flash("Couldn't save"); } finally { setSaving(false); }
  };

  const slotsLeft = 15 - squad.length;
  const avgPerSlot = slotsLeft > 0 ? Math.floor((remaining / slotsLeft) * 10) / 10 : 0;

  // pool picker list — affordable players first (so you always see ones you can pick)
  const query = q.trim().toLowerCase();
  const available = pool
    .filter((p) => p.role === pos)
    .filter((p) => !squad.includes(String(p.id)))
    .filter((p) => !query || (p.name || "").toLowerCase().includes(query) || (p.team_name || "").toLowerCase().includes(query))
    .sort((a, b) => {
      const aff = (priceOf(b.id) <= remaining + 1e-9 ? 1 : 0) - (priceOf(a.id) <= remaining + 1e-9 ? 1 : 0);
      return aff || (b.proj || 0) - (a.proj || 0);
    })
    .slice(0, 120);

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">💰</span>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">World Cup Salary Cap</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">
              €{BUDGET}m budget · {editRound === undefined ? "…" : editRound ? <>editing <span className="text-zinc-300">{editRound.label}</span> · locks {lockLabel(editRound.lock)}</> : "season locked"}
            </p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["leagues", "Leagues"], ["team", "My Teams"]].map(([id, label]) => (
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
        ) : subTab === "leagues" ? (
          <>
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your salary-cap leagues</h3>
            <div className="space-y-2 mb-3">
              {leagues.map((l) => (
                <button key={l.id || "global"} onClick={() => router.push(`/worldcup/salary/${l.id || "global"}`)} className="w-full text-left bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-700">
                  <div>
                    <div className="font-bold">{l.name}</div>
                    <div className="text-[11px] text-zinc-500">{!l.id ? "Open to everyone · one team each · see who entered" : `Private · up to ${l.max_entries || 1} ${(l.max_entries || 1) === 1 ? "team" : "teams"} each · see who entered`}</div>
                  </div>
                  <span className="text-zinc-600">›</span>
                </button>
              ))}
            </div>
            <button onClick={() => setCreatingLeague((v) => !v)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2.5 rounded-xl mb-3">＋ Create a league</button>
            {creatingLeague && (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 mb-3">
                <input value={lgName} onChange={(e) => setLgName(e.target.value)} placeholder="League name" maxLength={32} className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-zinc-600" />
                <label className="flex items-center justify-between text-[12px] text-zinc-400 mb-2">
                  Max teams per person
                  <input type="number" min={1} max={10} value={lgMax} onChange={(e) => setLgMax(Number(e.target.value))} className="w-16 bg-[#09090b] border border-zinc-800 rounded-md px-2 py-1 text-right" />
                </label>
                <button onClick={createLeague} disabled={!lgName.trim()} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2 rounded-lg text-sm">Create &amp; invite</button>
              </div>
            )}
            {selLeague.invite_code && (
              <button onClick={copyInvite} className="w-full text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
                {copied ? "✓ Invite link copied!" : <>🔗 Invite to <span className="text-zinc-200">{selLeague.name}</span> — tap to copy</>}
              </button>
            )}
          </>
        ) : poolLoading || editRound === undefined ? (
          <p className="text-zinc-600 text-sm py-8">Loading…</p>
        ) : locked ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-8 text-center text-sm text-zinc-400">
            The tournament is over — squads are locked. Check the leaderboard for final standings. 🏆
          </div>
        ) : (
          <>
            {entries.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-zinc-500 text-sm mb-1">No team yet.</p>
                <p className="text-zinc-600 text-[12px] mb-4">Build a 15-player squad under €{BUDGET}m and pick your XI — then enter it in your leagues.</p>
                <button onClick={newEntry} className="bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl">Create your team →</button>
              </div>
            ) : (
              <>
                {/* Team selector + namer */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Your {entries.length > 1 ? "teams" : "team"}</h3>
                  <button onClick={newEntry} className="text-[12px] bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1 rounded-lg">＋ New team</button>
                </div>
                {entries.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {entries.map((e, i) => (
                      <button key={e.id} onClick={() => setSelEntryId(e.id)} className={`text-[12px] px-3 py-1 rounded-full ${selEntryId === e.id ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{e.label || `Team ${i + 1}`}</button>
                    ))}
                  </div>
                )}
                {selEntryId && (
                  <input
                    key={selEntryId}
                    defaultValue={entries.find((e) => e.id === selEntryId)?.label || ""}
                    onBlur={(e) => renameEntry(e.target.value)}
                    placeholder="Name this team (e.g. Group of Death FC)"
                    maxLength={24}
                    className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-zinc-600"
                  />
                )}

                {/* Entered-in leagues (read-only — manage from each league page) */}
                {selEntryId && (
                  <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 mb-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Counts in</div>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {subs.length === 0 && <span className="text-[12px] text-zinc-600">Your first team auto-joins 🌍 Global.</span>}
                      {subs.map((s) => (
                        <span key={s.id} className="text-[12px] bg-zinc-800 rounded-full px-3 py-1">{s.group_id ? (leagues.find((l) => l.id === s.group_id)?.name || "League") : "🌍 Global"}</span>
                      ))}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-1.5">Add this team to private leagues from the <button onClick={() => setSubTab("leagues")} className="underline text-zinc-400">Leagues</button> tab.</div>
                  </div>
                )}

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
                {slotsLeft > 0 && (
                  <p className="text-[11px] text-zinc-500 mb-3 -mt-2 text-center">
                    ≈ <span className="text-zinc-300">€{avgPerSlot}m</span> per player for your {slotsLeft} remaining {slotsLeft === 1 ? "slot" : "slots"}
                  </p>
                )}
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setSubTab("board")} className="flex-1 text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
                    🏆 Leaderboard →
                  </button>
                  <button onClick={() => router.push("/worldcup/how")} className="flex-1 text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
                    ℹ️ Scoring &amp; transfers →
                  </button>
                </div>

                {/* Pitch — starting XI in formation */}
                <div className="rounded-2xl p-3 mb-2 bg-gradient-to-b from-emerald-700/30 via-emerald-800/20 to-emerald-950/30 border border-emerald-900/40">
                  <div className="flex items-center justify-between text-[10px] text-emerald-200/70 font-bold mb-1 px-1">
                    <span>STARTING XI ({starters.length}/11)</span>
                    {startersValid && <span className="text-emerald-300">{formation}</span>}
                    <span>tap a player</span>
                  </div>
                  {["FWD", "MID", "DEF", "GK"].map((g) => {
                    const row = starters.map((id) => byId[id]).filter((p) => p && p.role === g);
                    return (
                      <div key={g} className="flex justify-center items-start gap-1.5 my-1.5 min-h-[3.4rem] flex-wrap">
                        {row.length === 0 && <span className="text-[10px] text-emerald-200/30 self-center">{g}</span>}
                        {row.map((p) => {
                          const id = String(p.id); const isCap = captain === id;
                          return (
                            <button key={id} onClick={() => setSel(sel === id ? null : id)} className={`flex flex-col items-center w-[3.6rem] transition-transform ${sel === id ? "scale-110" : ""}`}>
                              <div className={`relative w-9 h-9 rounded-full overflow-hidden border-2 bg-zinc-800 ${sel === id ? "border-white" : isCap ? "border-red-500" : "border-zinc-600"}`}>
                                {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                                {isCap && <span className="absolute -bottom-0.5 -right-0.5 bg-red-600 text-white text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">C</span>}
                              </div>
                              <span className="text-[9px] text-white truncate w-full text-center leading-tight mt-0.5">{(p.name || "").split(" ").slice(-1)[0]}</span>
                              <span className="text-[8px] text-emerald-200/70">€{p.price}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Bench strip */}
                <div className="mb-2">
                  <div className="text-[10px] text-zinc-500 font-bold mb-1">BENCH (auto-sub order →)</div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {bench.length === 0 && <span className="text-[11px] text-zinc-600">No subs yet.</span>}
                    {bench.map((id, i) => {
                      const p = byId[id]; if (!p) return null;
                      return (
                        <button key={id} onClick={() => setSel(sel === id ? null : id)} className={`flex flex-col items-center w-[3.4rem] shrink-0 bg-zinc-900/60 rounded-lg py-1 border ${sel === id ? "border-white" : "border-zinc-800"}`}>
                          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-zinc-700 bg-zinc-800">
                            {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                            <span className="absolute -top-1 -left-1 bg-zinc-700 text-zinc-300 text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{i + 1}</span>
                          </div>
                          <span className="text-[8px] text-zinc-300 truncate w-full text-center leading-tight">{(p.name || "").split(" ").slice(-1)[0]}</span>
                          <span className={`text-[8px] ${POS_COLOR[p.role]}`}>{p.role}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action bar for the selected player */}
                {sel && byId[sel] && !locked && (
                  <div className="flex items-center gap-2 flex-wrap bg-zinc-900/80 border border-zinc-700 rounded-xl px-3 py-2 mb-3">
                    <span className="text-[12px] font-bold">{byId[sel].name}</span>
                    {starters.includes(sel) ? (
                      <>
                        <button onClick={() => setCaptain(sel)} className={`text-[11px] px-2 py-1 rounded ${captain === sel ? "bg-red-600 text-white" : "bg-zinc-800"}`}>⭐ Captain</button>
                        <button onClick={() => toggleStarter(sel)} className="text-[11px] px-2 py-1 rounded bg-zinc-800">⬇️ Bench</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => toggleStarter(sel)} className="text-[11px] px-2 py-1 rounded bg-zinc-800">⬆️ Start</button>
                        <button onClick={() => moveBench(sel, -1)} className="text-[11px] px-2 py-1 rounded bg-zinc-800">↑</button>
                        <button onClick={() => moveBench(sel, 1)} className="text-[11px] px-2 py-1 rounded bg-zinc-800">↓</button>
                      </>
                    )}
                    <button onClick={() => { removePlayer(sel); setSel(null); }} className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-red-300">✕ Remove</button>
                    <button onClick={() => setSel(null)} className="text-[11px] px-2 py-1 text-zinc-500 ml-auto">done</button>
                  </div>
                )}
                <p className="text-[10px] text-zinc-600 mb-3">Squad: {squad.length}/15 · positions {POS.map((g) => `${posCount(squad, g)}/${SQUAD_REQ[g]} ${g}`).join(" · ")}</p>

                <button onClick={save} disabled={saving} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl my-4">
                  {saving ? "Saving…" : canSave ? "Save team" : "Pick 15 + 11 starters + captain"}
                </button>

                {/* picker */}
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Add players</h3>
                <div className="flex gap-1.5 mb-2">
                  {POS.map((p) => (
                    <button key={p} onClick={() => setPos(p)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${pos === p ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
                      {p} {posCount(squad, p)}/{SQUAD_REQ[p]}
                    </button>
                  ))}
                </div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm mb-1 outline-none focus:border-zinc-600" />
                <p className="text-[10px] text-zinc-600 mb-2">Affordable players first. Numbers per player: <span className="text-zinc-400">projected points</span> · <span className="text-emerald-400">price</span>. Greyed = over budget.</p>
                <div className="space-y-1">
                  {available.map((p) => {
                    const affordable = priceOf(p.id) <= remaining + 1e-9;
                    const slot = posCount(squad, p.role) < SQUAD_REQ[p.role];
                    const ok = affordable && slot;
                    return (
                      <button key={p.id} onClick={() => addPlayer(p)} disabled={!ok}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left ${ok ? "bg-zinc-900 border-zinc-700 hover:border-red-500" : "bg-zinc-900/40 border-zinc-800 opacity-50"}`}>
                        <span className={`text-[10px] font-bold w-8 ${POS_COLOR[p.role]}`}>{p.role}</span>
                        {p.image && <img src={p.image} alt="" className="w-6 h-6 rounded-full object-cover bg-zinc-800 shrink-0" loading="lazy" />}
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
      <Confetti show={celebrate} />
      <Nav />
    </div>
  );
}

export default function SalaryCapPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090b]" />}>
      <SalaryCapInner />
    </Suspense>
  );
}

function SalaryLeaderboard({ selLeagueId, leagues, onSelLeague, onCreateLeague }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const flt = selLeagueId ? `group_id=eq.${selLeagueId}` : "group_id=is.null";
      const entries = await sbJson(await sbFetch(`wc_salary_entries?${flt}&select=id,user_id,display_name,handle,label`));
      const entryIds = entries.map((e) => e.id);
      if (entryIds.length === 0) { if (!cancelled) setRows([]); return; }
      const [roundsRes, lineups, rps] = await Promise.all([
        fetch("/api/wc-rounds").then((r) => r.json()).catch(() => ({ rounds: [] })),
        sbJson(await sbFetch(`wc_salary_entry_lineups?entry_id=in.(${entryIds.join(",")})&select=entry_id,round_id,starters,bench,captain`)),
        sbJson(await sbFetch("wc_player_round_points?select=player_id,round_id,points")),
      ]);
      const rounds = roundsRes.rounds || [];
      const idxOf = {}; rounds.forEach((r) => { idxOf[String(r.round_id)] = r.index; });
      const ptByRound = {};
      for (const r of rps) (ptByRound[String(r.round_id)] = ptByRound[String(r.round_id)] || {})[String(r.player_id)] = Number(r.points || 0);

      const byEntry = {};
      for (const l of lineups) (byEntry[l.entry_id] = byEntry[l.entry_id] || []).push(l);

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

      const scored = entries.map((e) => {
        const ls = byEntry[e.id] || [];
        let total = 0;
        for (const round of rounds) {
          const pts = ptByRound[String(round.round_id)];
          if (!pts) continue; // round not scored yet
          let lu = ls.find((l) => String(l.round_id) === String(round.round_id));
          if (!lu) {
            lu = ls
              .filter((l) => (idxOf[String(l.round_id)] ?? -1) < round.index)
              .sort((a, b) => (idxOf[String(b.round_id)] ?? -1) - (idxOf[String(a.round_id)] ?? -1))[0];
          }
          if (lu) total += scoreRound(lu, pts);
        }
        return { id: e.id, name: e.display_name || e.handle || "Player", label: e.label, total: Math.round(total * 100) / 100 };
      }).sort((a, b) => b.total - a.total);
      if (!cancelled) setRows(scored);
    };
    load().catch(() => { if (!cancelled) setRows((r) => r || []); });
    const t = setInterval(() => load().catch(() => {}), 45000); // live refresh
    return () => { cancelled = true; clearInterval(t); };
  }, [selLeagueId]);

  return (
    <div>
      <div className="flex gap-1.5 flex-wrap items-center mb-3">
        {leagues.map((l) => (
          <button key={l.id || "global"} onClick={() => onSelLeague(l.id || null)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${selLeagueId === (l.id || null) ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{l.name}</button>
        ))}
        <button onClick={onCreateLeague} className="text-[12px] font-bold px-3 py-1 rounded-full bg-zinc-800 text-zinc-400">＋ League</button>
      </div>
      {!rows ? (
        <p className="text-zinc-600 text-sm py-8">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-600 text-sm py-6">No teams here yet — build yours on the My Team tab!</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-zinc-600 font-bold w-5">{i + 1}</span>
                <div>
                  <div className="font-bold">{r.name}{r.label ? <span className="text-[11px] text-zinc-500 font-normal"> · {r.label}</span> : null}</div>
                </div>
              </div>
              <span className="font-bold text-red-500 tabular-nums">{r.total} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
