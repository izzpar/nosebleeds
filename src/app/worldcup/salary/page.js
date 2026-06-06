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
import { Icon } from "@/components/ui";
import InviteButton from "@/components/InviteButton";

const BUDGET = 100;
const SQUAD_REQ = { GK: 2, DEF: 5, MID: 5, FWD: 3 };       // 15 total
const START_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 };       // formation floor
const START_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };       // formation ceiling
const POS = ["GK", "DEF", "MID", "FWD"];
const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };
// Valid starting formations (GK is always 1; DEF+MID+FWD = 10).
const FORMATIONS = [
  { k: "3-4-3", DEF: 3, MID: 4, FWD: 3 },
  { k: "3-5-2", DEF: 3, MID: 5, FWD: 2 },
  { k: "4-3-3", DEF: 4, MID: 3, FWD: 3 },
  { k: "4-4-2", DEF: 4, MID: 4, FWD: 2 },
  { k: "4-5-1", DEF: 4, MID: 5, FWD: 1 },
  { k: "5-3-2", DEF: 5, MID: 3, FWD: 2 },
  { k: "5-4-1", DEF: 5, MID: 4, FWD: 1 },
];
const DEFAULT_FORM = { DEF: 4, MID: 3, FWD: 3 }; // 4-3-3
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
  const [allSubs, setAllSubs] = useState({});      // entry_id -> [submissions] for this user
  const [editingId, setEditingId] = useState(null); // which team's builder is open (null = list)
  const [expandedId, setExpandedId] = useState(null); // which list row is expanded

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
  const [form, setForm] = useState(DEFAULT_FORM); // chosen starting formation

  // Leagues-tab UI
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [lgName, setLgName] = useState("");
  const [lgMax, setLgMax] = useState(1);

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

  // All of this user's league submissions, grouped by entry (for the list view).
  const loadAllSubs = useCallback(async () => {
    if (!user) { setAllSubs({}); return; }
    const rows = await sbJson(await sbFetch(`wc_salary_submissions?user_id=eq.${user.id}&select=id,entry_id,group_id`));
    const m = {}; rows.forEach((r) => { (m[r.entry_id] = m[r.entry_id] || []).push(r); });
    setAllSubs(m);
  }, [user]);
  useEffect(() => { loadAllSubs(); }, [loadAllSubs]);

  // Deep-link from the dedicated league/entry pages: /worldcup/salary?league=X&entry=Y
  useEffect(() => {
    const lg = searchParams.get("league");
    const en = searchParams.get("entry");
    if (lg != null) { setSelLeagueId(lg === "global" ? null : lg); setSubTab("team"); }
    if (en) { setSelEntryId(en); setEditingId(en); setSubTab("team"); }
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
  const formStart = (g) => (g === "GK" ? 1 : form[g]);            // starting slots for a line
  const formKey = `${form.DEF}-${form.MID}-${form.FWD}`;

  // Keep the formation label in sync with a loaded/edited XI once it's full.
  useEffect(() => {
    if (starters.length === 11 && pool.length) {
      const nf = { DEF: posCount(starters, "DEF"), MID: posCount(starters, "MID"), FWD: posCount(starters, "FWD") };
      if (nf.DEF !== form.DEF || nf.MID !== form.MID || nf.FWD !== form.FWD) setForm(nf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starters, pool.length]);

  const addPlayer = (p) => {
    if (locked || !selEntryId || squad.includes(String(p.id))) return;
    if (posCount(squad, p.role) >= SQUAD_REQ[p.role]) { flash(`Squad already has ${SQUAD_REQ[p.role]} ${p.role}`); return; }
    if (priceOf(p.id) > remaining + 1e-9) { flash("Not enough budget"); return; }
    if (squad.length >= 15) { flash("Squad is full (15)"); return; }
    const id = String(p.id);
    setSquad((s) => [...s, id]);
    // Auto-start into an open formation slot for this position; otherwise it lands
    // on the bench (so building a team is just tapping players, not micro-managing).
    setStarters((st) => {
      if (st.length >= 11) return st;
      if (st.filter((x) => byId[x]?.role === p.role).length >= formStart(p.role)) return st;
      return [...st, id];
    });
  };

  // Switch formation: refit the XI, preferring players already on the pitch.
  const applyFormation = (nf) => {
    if (locked) return;
    setForm(nf);
    const want = { GK: 1, DEF: nf.DEF, MID: nf.MID, FWD: nf.FWD };
    const next = [];
    for (const g of POS) {
      const ofPos = squad.filter((id) => byId[id]?.role === g)
        .sort((a, b) => (starters.includes(a) ? 0 : 1) - (starters.includes(b) ? 0 : 1));
      next.push(...ofPos.slice(0, want[g]));
    }
    setStarters(next);
    if (captain && !next.includes(captain)) setCaptain(null);
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
    if (posCount(starters, role) >= formStart(role)) { flash(`${formKey} has no open ${role} slot. Switch formation`); return; }
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
    await loadEntries(); await loadAllSubs();
    if (rows[0]) { setSelEntryId(rows[0].id); setEditingId(rows[0].id); } // jump into the builder
  };

  const renameEntry = async (label) => {
    if (!selEntryId) return;
    await sbFetch(`wc_salary_entries?id=eq.${selEntryId}`, { method: "PATCH", body: JSON.stringify({ label }) });
    setEntries((es) => es.map((e) => (e.id === selEntryId ? { ...e, label } : e)));
  };

  const addSub = async (entryId, groupId) => {
    const { res } = await sbInsert("wc_salary_submissions", { entry_id: entryId, group_id: groupId, user_id: user.id });
    if (res.ok || res.status === 409) { flash("Entered ✓"); await loadAllSubs(); } else flash("Couldn't enter");
  };
  const removeSub = async (subId) => {
    await sbFetch(`wc_salary_submissions?id=eq.${subId}`, { method: "DELETE" });
    await loadAllSubs();
  };
  const deleteEntryById = async (id) => {
    if (!confirm("Delete this team? It'll be removed from every contest it's in.")) return;
    await sbFetch(`wc_salary_entries?id=eq.${id}`, { method: "DELETE" }); // cascades submissions + lineups
    if (editingId === id) setEditingId(null);
    setExpandedId(null);
    await loadEntries(); await loadAllSubs();
    flash("Team deleted");
  };

  const createLeague = async () => {
    if (!lgName.trim()) return;
    const g = await createGroup(lgName, "salary", user.id, profile, lgMax);
    if (g) { setLgName(""); setCreatingLeague(false); await loadLeagues(); setSelLeagueId(g.id); setSubTab("team"); }
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
          <Icon name="wallet" className="w-5 h-5 text-red-500" />
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
            <button onClick={() => setCreatingLeague((v) => !v)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2.5 rounded-xl mb-3 inline-flex items-center justify-center gap-1.5"><Icon name="plus" className="w-4 h-4" /> Create a league</button>
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
            {selLeague.invite_code && <InviteButton code={selLeague.invite_code} name={selLeague.name} />}
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
                <p className="text-zinc-600 text-[12px] mb-4">Build a 15-player squad under €{BUDGET}m and pick your XI, then enter it in your leagues.</p>
                <button onClick={newEntry} className="bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl">Create your team →</button>
              </div>
            ) : editingId ? (
              /* ---- Editor mode: build one team's squad + XI ---- */
              <>
                <button onClick={() => { setEditingId(null); setExpandedId(null); }} className="text-[13px] text-zinc-400 hover:text-white mb-3">‹ Back to my teams</button>
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

                {editRound && (
                  <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2 mb-3 text-[11px] text-zinc-400">
                    <Icon name="refresh" className="w-3 h-3 inline-block align-[-1px] mr-1" />Editing your <span className="text-zinc-200">{editRound.label}</span> team. Unlimited changes until it locks <span className="text-zinc-200">{lockLabel(editRound.lock)}</span>. Your team carries over to each new round.
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
                <div className="flex gap-2 mb-3">
                  <button onClick={() => router.push("/worldcup/salary/global")} className="flex-1 text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                    <Icon name="trophy" className="w-3.5 h-3.5" /> Leaderboard →
                  </button>
                  <button onClick={() => setSubTab("leagues")} className="flex-1 text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                    <Icon name="users" className="w-3.5 h-3.5" /> Your leagues →
                  </button>
                </div>

                {/* Scoring reminder */}
                <details className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 mb-4 text-[12px]">
                  <summary className="cursor-pointer text-zinc-400 font-semibold flex items-center gap-1.5"><Icon name="info" className="w-3.5 h-3.5" /> How points work</summary>
                  <div className="text-zinc-400 mt-2 space-y-1 leading-relaxed">
                    <p>Per player, per match: <b>60+ min +2</b> (else +1) · <b>Goal</b> GK/DEF +6, MID +5, FWD +4 · Assist +3 · Shot on target +0.5 · Tackle +0.25 · Clean sheet (60+ min) GK/DEF +4, MID +1 · Save +1 per 3.</p>
                    <p>Minus: goals conceded (GK/DEF) −1 per 2 · yellow −1 · red −3 · own goal −2.</p>
                    <p><b>Captain</b> scores double. <b>Auto-subs:</b> if a starter doesn&apos;t play, your first eligible bench sub takes their place. Your team carries over each round; edit until each round&apos;s kickoff.</p>
                  </div>
                </details>

                {/* Formation picker */}
                <div className="flex gap-1 flex-wrap items-center mb-2">
                  <span className="text-[10px] text-zinc-500 font-bold mr-1">FORMATION</span>
                  {FORMATIONS.map((f) => (
                    <button key={f.k} onClick={() => applyFormation(f)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${formKey === f.k ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{f.k}</button>
                  ))}
                </div>

                {/* Pitch — fixed formation slots on a real-looking pitch */}
                <div className="relative overflow-hidden rounded-2xl p-3 pt-2.5 mb-2 border border-emerald-950"
                  style={{ background: "repeating-linear-gradient(180deg, #15803d 0 34px, #16a34a 34px 68px)" }}>
                  {/* pitch markings */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-white/25" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/25" />
                    <div className="absolute left-1/2 -translate-x-1/2 top-0 w-32 h-12 border border-t-0 border-white/20" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-32 h-12 border border-b-0 border-white/20" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30" />
                  </div>
                  <div className="relative">
                    <div className="flex items-center justify-between text-[10px] text-white/80 font-bold mb-1 px-1">
                      <span>STARTING XI ({starters.length}/11)</span>
                      <span className="bg-black/30 rounded px-1.5 py-0.5">{formKey}</span>
                    </div>
                    {["FWD", "MID", "DEF", "GK"].map((g) => {
                      const inRow = starters.map((id) => byId[id]).filter((p) => p && p.role === g);
                      const cells = Array.from({ length: formStart(g) }, (_, i) => inRow[i] || null);
                      return (
                        <div key={g} className="flex justify-center items-start gap-2 my-2 min-h-[3.6rem] flex-wrap">
                          {cells.map((p, i) => {
                            if (!p) {
                              return (
                                <button key={`${g}-${i}`} onClick={() => { setPos(g); flash(`Pick a ${g} below`); }} className="flex flex-col items-center w-[3.7rem]">
                                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white/60 text-base">＋</div>
                                  <span className="text-[8px] text-white/60 mt-1 bg-black/25 rounded px-1">{g}</span>
                                </button>
                              );
                            }
                            const id = String(p.id); const isCap = captain === id;
                            return (
                              <button key={id} onClick={() => setSel(sel === id ? null : id)} className={`flex flex-col items-center w-[3.7rem] transition-transform ${sel === id ? "scale-110" : ""}`}>
                                <div className={`relative w-10 h-10 rounded-full overflow-hidden border-2 bg-zinc-900 shadow-md ${sel === id ? "border-white ring-2 ring-white/40" : isCap ? "border-amber-400" : "border-white/70"}`}>
                                  {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                                  {isCap && <span className="absolute -bottom-1 -right-1 bg-amber-400 text-black text-[8px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center border border-emerald-900">C</span>}
                                </div>
                                <span className="mt-1 text-[9px] font-semibold text-white bg-black/55 rounded px-1 max-w-full truncate leading-tight">{(p.name || "").split(" ").slice(-1)[0]}</span>
                                <span className="text-[8px] text-white/85 font-bold">€{p.price}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
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
                        <button onClick={() => setCaptain(sel)} className={`text-[11px] px-2 py-1 rounded inline-flex items-center gap-1 ${captain === sel ? "bg-red-600 text-white" : "bg-zinc-800"}`}><Icon name="star" className="w-3 h-3" /> Captain</button>
                        <button onClick={() => toggleStarter(sel)} className="text-[11px] px-2 py-1 rounded bg-zinc-800 inline-flex items-center gap-1"><Icon name="chevronDown" className="w-3 h-3" /> Bench</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => toggleStarter(sel)} className="text-[11px] px-2 py-1 rounded bg-zinc-800 inline-flex items-center gap-1"><Icon name="chevronUp" className="w-3 h-3" /> Start</button>
                        <button onClick={() => moveBench(sel, -1)} className="px-2 py-1 rounded bg-zinc-800 inline-flex items-center"><Icon name="chevronUp" className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moveBench(sel, 1)} className="px-2 py-1 rounded bg-zinc-800 inline-flex items-center"><Icon name="chevronDown" className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                    <button onClick={() => { removePlayer(sel); setSel(null); }} className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-red-300 inline-flex items-center gap-1"><Icon name="x" className="w-3 h-3" /> Remove</button>
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
            ) : (
              /* ---- List mode: tap a team to manage where it's entered ---- */
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Your {entries.length > 1 ? "teams" : "team"}</h3>
                  <button onClick={newEntry} className="text-[12px] bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1 rounded-lg inline-flex items-center gap-1"><Icon name="plus" className="w-3.5 h-3.5" /> New team</button>
                </div>
                {entries.map((e, i) => {
                  const subs = allSubs[e.id] || [];
                  const open = expandedId === e.id;
                  const inIds = new Set(subs.map((s) => s.group_id || "global"));
                  const addable = leagues.filter((l) => !inIds.has(l.id || "global"));
                  return (
                    <div key={e.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
                      <button onClick={() => setExpandedId(open ? null : e.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900">
                        <Icon name="wallet" className="w-5 h-5 text-zinc-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{e.label || `Team ${i + 1}`}</div>
                          <div className="text-[11px] text-zinc-500">{subs.length === 0 ? "not entered" : `in ${subs.length} ${subs.length === 1 ? "contest" : "contests"}`}</div>
                        </div>
                        <span className={`text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                      </button>
                      {open && (
                        <div className="px-4 pb-3 border-t border-zinc-800/70 pt-3 space-y-3">
                          <button onClick={() => { setSelEntryId(e.id); setEditingId(e.id); }} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg text-sm inline-flex items-center justify-center gap-1.5"><Icon name="pencil" className="w-3.5 h-3.5" /> Edit team &amp; lineup</button>
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Entered in</div>
                            {subs.length === 0 && <p className="text-[12px] text-zinc-600 mb-1.5">Not in any contest yet.</p>}
                            <div className="space-y-1.5">
                              {subs.map((s) => (
                                <div key={s.id} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-1.5">
                                  <span className="text-[13px]">{s.group_id ? (leagues.find((l) => l.id === s.group_id)?.name || "League") : "🌍 Global"}</span>
                                  <button onClick={() => removeSub(s.id)} className="text-[11px] text-zinc-500 hover:text-red-400 font-semibold">Remove from league</button>
                                </div>
                              ))}
                            </div>
                          </div>
                          {addable.length > 0 && (
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Enter in a contest</div>
                              <div className="flex gap-1.5 flex-wrap">
                                {addable.map((l) => (
                                  <button key={l.id || "global"} onClick={() => addSub(e.id, l.id || null)} className="text-[12px] px-3 py-1 rounded-full bg-red-600/20 text-red-300 border border-red-700/40 hover:bg-red-600/30 inline-flex items-center gap-1"><Icon name="plus" className="w-3 h-3" /> {l.name}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          <button onClick={() => deleteEntryById(e.id)} className="text-[11px] text-zinc-500 hover:text-red-400 inline-flex items-center gap-1"><Icon name="trash" className="w-3 h-3" /> Delete this team</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
    const t = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 90000); // live refresh (paused when tab hidden)
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
        <p className="text-zinc-600 text-sm py-6">No teams here yet. Build yours on the My Team tab!</p>
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
