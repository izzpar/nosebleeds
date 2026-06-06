"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import Confetti from "@/components/Confetti";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import { fetchTeams, rankingsLocked, nationStrength, WC_TEAMS_FALLBACK } from "@/lib/worldcup";
import { fetchMyGroups, createGroup } from "@/lib/groups";
import WcBackdrop from "@/components/WcBackdrop";

const GLOBAL = { id: null, name: "🌍 Global", max_entries: 1, isGlobal: true };

function RankingsInner() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locked = rankingsLocked();

  const [teams, setTeams] = useState([]);
  const [leagues, setLeagues] = useState([GLOBAL]);
  const [entries, setEntries] = useState([]);   // your ranking library
  const [selEntryId, setSelEntryId] = useState(null);
  const [allSubs, setAllSubs] = useState({});    // entry_id -> [submissions] for this user
  const [editingId, setEditingId] = useState(null); // which entry's editor is open (null = list)
  const [expandedId, setExpandedId] = useState(null); // which list row is expanded
  const [order, setOrder] = useState([]);
  const [subTab, setSubTab] = useState("mine");  // 'mine' = My Rankings | 'leagues'
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(0);
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [lgName, setLgName] = useState("");
  const [lgMax, setLgMax] = useState(1);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const teamById = useCallback((id) => teams.find((t) => String(t.id) === String(id)), [teams]);

  // ---- data ----
  const loadTeams = useCallback(async () => {
    try { const t = await fetchTeams(); if (t?.length) { setTeams(t); return; } } catch (e) {}
    setTeams(WC_TEAMS_FALLBACK);
  }, []);
  useEffect(() => { loadTeams(); }, [loadTeams]);

  const loadLeagues = useCallback(async () => {
    if (!user) return;
    try { setLeagues([GLOBAL, ...(await fetchMyGroups(user.id, "ranking"))]); } catch (e) {}
  }, [user]);
  useEffect(() => { loadLeagues(); }, [loadLeagues]);

  // Your ranking library (no longer tied to a single league).
  const loadEntries = useCallback(async () => {
    if (!user) return;
    const rows = await sbJson(await sbFetch(`wc_ranking_entries?user_id=eq.${user.id}&select=*&order=created_at.asc`));
    setEntries(rows);
    setSelEntryId((prev) => (rows.find((r) => r.id === prev) ? prev : rows[0]?.id || null));
  }, [user]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  // All of this user's league submissions, grouped by entry (for the list view).
  const loadAllSubs = useCallback(async () => {
    if (!user) { setAllSubs({}); return; }
    const rows = await sbJson(await sbFetch(`wc_ranking_submissions?user_id=eq.${user.id}&select=id,entry_id,group_id`));
    const m = {}; rows.forEach((r) => { (m[r.entry_id] = m[r.entry_id] || []).push(r); });
    setAllSubs(m);
  }, [user]);
  useEffect(() => { loadAllSubs(); }, [loadAllSubs]);

  // Deep-link to a specific entry: /worldcup/rankings?entry=Y (opens its editor)
  useEffect(() => {
    const en = searchParams.get("entry");
    if (en) { setSelEntryId(en); setEditingId(en); setSubTab("mine"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const e = entries.find((x) => x.id === selEntryId);
    setOrder((e?.ranking || []).map(String));
  }, [selEntryId, entries]);

  // ---- ranking editor ----
  const ranked = order.map(teamById).filter(Boolean);
  const pool = teams.filter((t) => !order.includes(String(t.id))).sort((a, b) => nationStrength(b.name) - nationStrength(a.name));
  const add = (id) => !locked && setOrder((o) => [...o, String(id)]);
  const removeT = (id) => !locked && setOrder((o) => o.filter((x) => x !== String(id)));
  const move = (id, dir) => {
    if (locked) return;
    setOrder((o) => { const i = o.indexOf(String(id)); const j = i + dir; if (i < 0 || j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  };
  const suggestOrder = () => !locked && setOrder([...teams].sort((a, b) => nationStrength(b.name) - nationStrength(a.name)).map((t) => String(t.id)));

  // ---- actions ----
  const newEntry = async () => {
    if (!user || locked) return;
    const { rows } = await sbInsert("wc_ranking_entries", {
      group_id: null, user_id: user.id,
      handle: profile?.handle || user.email?.split("@")[0],
      display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
      label: `Ranking ${entries.length + 1}`, ranking: [],
    });
    // Auto-enter your FIRST ranking on the Global board; extra rankings you add to
    // leagues yourself.
    if (rows[0] && entries.length === 0) await sbInsert("wc_ranking_submissions", { entry_id: rows[0].id, group_id: null, user_id: user.id });
    await loadEntries(); await loadAllSubs();
    if (rows[0]) { setSelEntryId(rows[0].id); setEditingId(rows[0].id); } // jump into the editor
  };

  const save = async () => {
    if (!user || !selEntryId || saving || locked) return;
    if (order.length !== teams.length) { flash(`Rank all ${teams.length} teams first`); return; }
    setSaving(true);
    try {
      const res = await sbFetch(`wc_ranking_entries?id=eq.${selEntryId}`, {
        method: "PATCH",
        body: JSON.stringify({ ranking: order, updated_at: new Date().toISOString() }),
      });
      if (res.ok) setCelebrate((c) => c + 1);
      flash(res.ok ? "Saved ✓ — updates everywhere it's entered" : "Couldn't save");
      await loadEntries();
    } catch (e) { flash("Couldn't save"); } finally { setSaving(false); }
  };

  const renameEntry = async (label) => {
    if (!selEntryId) return;
    await sbFetch(`wc_ranking_entries?id=eq.${selEntryId}`, { method: "PATCH", body: JSON.stringify({ label }) });
    setEntries((es) => es.map((e) => (e.id === selEntryId ? { ...e, label } : e)));
  };

  // Enter / remove a ranking in a league, and delete it entirely (by id).
  const addSub = async (entryId, groupId) => {
    const { res } = await sbInsert("wc_ranking_submissions", { entry_id: entryId, group_id: groupId, user_id: user.id });
    if (res.ok || res.status === 409) { flash("Entered ✓"); await loadAllSubs(); } else flash("Couldn't enter");
  };
  const removeSub = async (subId) => {
    await sbFetch(`wc_ranking_submissions?id=eq.${subId}`, { method: "DELETE" });
    await loadAllSubs();
  };
  const deleteEntryById = async (id) => {
    if (!confirm("Delete this ranking? It'll be removed from every contest it's in.")) return;
    await sbFetch(`wc_ranking_entries?id=eq.${id}`, { method: "DELETE" }); // cascades submissions
    if (editingId === id) setEditingId(null);
    setExpandedId(null);
    await loadEntries(); await loadAllSubs();
    flash("Ranking deleted");
  };

  const createLeague = async () => {
    if (!lgName.trim()) return;
    const g = await createGroup(lgName, "ranking", user.id, profile, lgMax);
    if (g) { setLgName(""); setCreatingLeague(false); await loadLeagues(); router.push(`/worldcup/rankings/${g.id}`); }
  };

  const selEntry = entries.find((e) => e.id === selEntryId);
  const leagueName = (gid) => (gid ? (leagues.find((l) => l.id === gid)?.name || "League") : "🌍 Global");

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">🔢</span>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">World Cup Nations Ranking</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Build rankings · enter them in leagues · {locked ? "locked" : "locks Jun 11"}</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["mine", "My Rankings"], ["leagues", "Leagues"]].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)} className={`pb-2 font-bold border-b-2 ${subTab === id ? "text-white border-red-500" : "text-zinc-600 border-transparent"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {!user ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 mb-4">Sign in to build your rankings.</p>
            <button onClick={() => router.push("/login")} className="bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl">Log in</button>
          </div>
        ) : subTab === "leagues" ? (
          <>
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your ranking leagues</h3>
            <div className="space-y-2 mb-3">
              {leagues.map((l) => (
                <button key={l.id || "global"} onClick={() => router.push(`/worldcup/rankings/${l.id || "global"}`)} className="w-full text-left bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-700">
                  <div>
                    <div className="font-bold">{l.name}</div>
                    <div className="text-[11px] text-zinc-500">{!l.id ? "Open to everyone · see who entered" : `Private · up to ${l.max_entries || 1} ${(l.max_entries || 1) === 1 ? "entry" : "entries"} each`}</div>
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
                  Max entries per person
                  <input type="number" min={1} max={10} value={lgMax} onChange={(e) => setLgMax(Number(e.target.value))} className="w-16 bg-[#09090b] border border-zinc-800 rounded-md px-2 py-1 text-right" />
                </label>
                <button onClick={createLeague} disabled={!lgName.trim()} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2 rounded-lg text-sm">Create &amp; invite</button>
              </div>
            )}
            <p className="text-[11px] text-zinc-600">Join a league from an invite link a friend sends you.</p>
          </>
        ) : editingId ? (
          /* ---- Editor mode: build / rename one ranking ---- */
          <>
            <button onClick={() => { setEditingId(null); setExpandedId(null); }} className="text-[13px] text-zinc-400 hover:text-white mb-3">‹ Back to my rankings</button>
            {!locked && (
              <input
                key={selEntryId}
                defaultValue={selEntry?.label || ""}
                onBlur={(e) => renameEntry(e.target.value)}
                placeholder="Name this ranking (e.g. Dark Horses)"
                maxLength={24}
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-zinc-600"
              />
            )}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => router.push("/worldcup/how")} className="text-[11px] text-zinc-400 underline">ℹ️ How scoring works</button>
              <button onClick={() => deleteEntryById(selEntryId)} className="text-[11px] text-zinc-500 hover:text-red-400">🗑 Delete this ranking</button>
            </div>
            <RankEditor
              teams={teams} ranked={ranked} pool={pool} order={order} locked={locked} saving={saving}
              onAdd={add} onRemove={removeT} onMove={move} onSuggest={suggestOrder} onSave={save}
              onAddAll={() => setOrder((o) => [...o, ...pool.map((t) => String(t.id))])}
              onRetryTeams={loadTeams}
            />
          </>
        ) : (
          /* ---- List mode: tap a ranking to manage where it's entered ---- */
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Your rankings</h3>
              {!locked && <button onClick={newEntry} className="text-[12px] bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1 rounded-lg">＋ New ranking</button>}
            </div>
            {entries.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-zinc-500 text-sm mb-3">No rankings yet.</p>
                {!locked && <button onClick={newEntry} className="bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl">Build your first ranking →</button>}
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((e, i) => {
                  const rk = e.ranking || [];
                  const complete = teams.length > 0 && rk.length === teams.length;
                  const subs = allSubs[e.id] || [];
                  const top = teamById(rk[0]);
                  const open = expandedId === e.id;
                  const inIds = new Set(subs.map((s) => s.group_id || "global"));
                  const addable = leagues.filter((l) => !inIds.has(l.id || "global"));
                  return (
                    <div key={e.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden">
                      <button onClick={() => setExpandedId(open ? null : e.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{e.label || `Ranking ${i + 1}`}</div>
                          <div className="text-[11px] text-zinc-500">
                            {complete ? "✓ Complete" : `${rk.length}/${teams.length || "?"} ranked`}
                            {" · "}{subs.length === 0 ? "not entered" : `in ${subs.length} ${subs.length === 1 ? "contest" : "contests"}`}
                          </div>
                        </div>
                        {top?.logo
                          ? <img src={top.logo} alt="" title={`Your #1: ${top.name}`} className="w-6 h-6 object-contain shrink-0" />
                          : <span className="w-6 h-6 shrink-0" />}
                        <span className={`text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                      </button>
                      {open && (
                        <div className="px-4 pb-3 border-t border-zinc-800/70 pt-3 space-y-3">
                          {!locked && (
                            <button onClick={() => { setSelEntryId(e.id); setEditingId(e.id); }} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 rounded-lg text-sm">✏️ Edit ranking</button>
                          )}
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">Entered in</div>
                            {subs.length === 0 && <p className="text-[12px] text-zinc-600 mb-1.5">Not in any contest yet.</p>}
                            <div className="space-y-1.5">
                              {subs.map((s) => (
                                <div key={s.id} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-1.5">
                                  <span className="text-[13px]">{leagueName(s.group_id)}</span>
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
                                  <button key={l.id || "global"} onClick={() => addSub(e.id, l.id || null)} className="text-[12px] px-3 py-1 rounded-full bg-red-600/20 text-red-300 border border-red-700/40 hover:bg-red-600/30">＋ {l.name}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          <button onClick={() => deleteEntryById(e.id)} className="text-[11px] text-zinc-500 hover:text-red-400">🗑 Delete this ranking</button>
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

export default function RankingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090b]" />}>
      <RankingsInner />
    </Suspense>
  );
}

function RankEditor({ teams, ranked, pool, order, locked, saving, onAdd, onRemove, onMove, onSuggest, onSave, onAddAll, onRetryTeams }) {
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Ranking ({ranked.length}/{teams.length})</h3>
        {!locked && (
          <div className="flex items-center gap-2">
            <button onClick={onSuggest} className="text-[12px] bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1.5 rounded-lg">✨ Suggest</button>
            {order.length === teams.length && (
              <button onClick={onSave} disabled={saving} className="text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded-lg">{saving ? "Saving…" : "Save"}</button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1.5 mb-6">
        {ranked.length === 0 && <p className="text-zinc-600 text-sm">Tap teams below to start ranking.</p>}
        {ranked.map((t, i) => (
          <div key={t.id} className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
            <span className="text-red-500 font-bold w-6 text-sm">{i + 1}</span>
            {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain" />}
            <span className="text-sm font-medium flex-1 truncate">{t.name}</span>
            {!locked && (
              <span className="flex gap-1">
                <button onClick={() => onMove(t.id, -1)} disabled={i === 0} className="w-7 h-7 rounded bg-zinc-800 disabled:opacity-30">↑</button>
                <button onClick={() => onMove(t.id, 1)} disabled={i === ranked.length - 1} className="w-7 h-7 rounded bg-zinc-800 disabled:opacity-30">↓</button>
                <button onClick={() => onRemove(t.id)} className="w-7 h-7 rounded bg-zinc-800 text-zinc-400">✕</button>
              </span>
            )}
          </div>
        ))}
      </div>
      {!locked && teams.length === 0 && (
        <div className="text-center py-8">
          <p className="text-zinc-500 text-sm mb-3">Couldn&apos;t load teams.</p>
          <button onClick={onRetryTeams} className="bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-sm">Retry</button>
        </div>
      )}
      {!locked && pool.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Tap to add ({pool.length})</h3>
            <button onClick={onAddAll} className="text-[12px] text-zinc-400 underline">Add all</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {pool.map((t) => (
              <button key={t.id} onClick={() => onAdd(t.id)} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 hover:border-red-500 rounded-lg px-2 py-2 text-left active:scale-[0.97]">
                {t.logo && <img src={t.logo} alt="" className="w-4 h-4 object-contain shrink-0" />}
                <span className="text-[12px] font-medium truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
