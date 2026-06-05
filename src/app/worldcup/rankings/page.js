"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Confetti from "@/components/Confetti";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import { fetchTeams, fetchResults, rankingPoints, rankingsLocked, nationStrength, WC_TEAMS_FALLBACK } from "@/lib/worldcup";
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
  const [selLeagueId, setSelLeagueId] = useState(null); // null = Global
  const [entries, setEntries] = useState([]);
  const [selEntryId, setSelEntryId] = useState(null);
  const [order, setOrder] = useState([]);
  const [subTab, setSubTab] = useState("leagues");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(0);
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [lgName, setLgName] = useState("");
  const [lgMax, setLgMax] = useState(1);
  const [copied, setCopied] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const teamById = useCallback((id) => teams.find((t) => String(t.id) === String(id)), [teams]);
  const selLeague = leagues.find((l) => (l.id || null) === selLeagueId) || GLOBAL;

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

  const loadEntries = useCallback(async () => {
    if (!user) return;
    const flt = selLeagueId ? `group_id=eq.${selLeagueId}` : "group_id=is.null";
    const rows = await sbJson(await sbFetch(`wc_ranking_entries?${flt}&user_id=eq.${user.id}&select=*&order=created_at.asc`));
    setEntries(rows);
    setSelEntryId((prev) => (rows.find((r) => r.id === prev) ? prev : rows[0]?.id || null));
  }, [user, selLeagueId]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Deep-link from the dedicated league/entry pages: /worldcup/rankings?league=X&entry=Y
  useEffect(() => {
    const lg = searchParams.get("league");
    const en = searchParams.get("entry");
    if (lg != null) { setSelLeagueId(lg === "global" ? null : lg); setSubTab("mine"); }
    if (en) setSelEntryId(en);
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
    const max = selLeague.max_entries || 1;
    if (entries.length >= max) { flash(`Max ${max} ${max === 1 ? "entry" : "entries"} here`); return; }
    const { rows } = await sbInsert("wc_ranking_entries", {
      group_id: selLeagueId, user_id: user.id,
      handle: profile?.handle || user.email?.split("@")[0],
      display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
      label: `Entry ${entries.length + 1}`, ranking: [],
    });
    await loadEntries();
    if (rows[0]) setSelEntryId(rows[0].id);
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
      flash(res.ok ? "Saved ✓" : "Couldn't save");
      await loadEntries();
    } catch (e) { flash("Couldn't save"); } finally { setSaving(false); }
  };

  const createLeague = async () => {
    if (!lgName.trim()) return;
    const g = await createGroup(lgName, "ranking", user.id, profile, lgMax);
    if (g) { setLgName(""); setCreatingLeague(false); await loadLeagues(); setSelLeagueId(g.id); setSubTab("mine"); }
  };

  const copyInvite = () => {
    if (!selLeague.invite_code) return;
    try { navigator.clipboard.writeText(`${window.location.origin}/worldcup/g/${selLeague.invite_code}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const renameEntry = async (label) => {
    if (!selEntryId) return;
    await sbFetch(`wc_ranking_entries?id=eq.${selEntryId}`, { method: "PATCH", body: JSON.stringify({ label }) });
    setEntries((es) => es.map((e) => (e.id === selEntryId ? { ...e, label } : e)));
  };

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">🔢</span>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">World Cup Nations Ranking</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Rank all 48 · {locked ? "locked" : "locks at kickoff Jun 11"}</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["leagues", "Leagues"], ["mine", "Entry"], ["board", "Leaderboard"]].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)} className={`pb-2 font-bold border-b-2 ${subTab === id ? "text-white border-red-500" : "text-zinc-600 border-transparent"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {!user ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 mb-4">Sign in to submit your ranking.</p>
            <button onClick={() => router.push("/login")} className="bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl">Log in</button>
          </div>
        ) : (
          <>
            {subTab === "leagues" ? (
              <>
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your ranking leagues</h3>
                <div className="space-y-2 mb-3">
                  {leagues.map((l) => (
                    <button key={l.id || "global"} onClick={() => router.push(`/worldcup/rankings/${l.id || "global"}`)} className="w-full text-left bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-700">
                      <div>
                        <div className="font-bold">{l.name}</div>
                        <div className="text-[11px] text-zinc-500">{!l.id ? "Open to everyone · one entry each · see who entered" : `Private · up to ${l.max_entries || 1} ${(l.max_entries || 1) === 1 ? "entry" : "entries"} each · see who entered`}</div>
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
                {selLeague.invite_code && (
                  <button onClick={copyInvite} className="w-full text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
                    {copied ? "✓ Invite link copied!" : <>🔗 Invite to <span className="text-zinc-200">{selLeague.name}</span> — tap to copy</>}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="flex gap-1.5 flex-wrap items-center mb-2">
                  {leagues.map((l) => (
                    <button key={l.id || "global"} onClick={() => setSelLeagueId(l.id || null)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${selLeagueId === (l.id || null) ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{l.name}</button>
                  ))}
                  <button onClick={() => setSubTab("leagues")} className="text-[12px] font-bold px-3 py-1 rounded-full bg-zinc-800 text-zinc-400">＋ League</button>
                </div>
                <button onClick={() => router.push("/worldcup/how")} className="text-[11px] text-zinc-400 underline mb-3 block">
                  ℹ️ How scoring works — you earn more for teams you rank higher when they do well
                </button>

            {subTab === "board" ? (
              <Leaderboard selLeagueId={selLeagueId} teamById={teamById} locked={locked} />
            ) : (
              <>
                {/* Entry selector */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                    Your {entries.length > 1 || (selLeague.max_entries || 1) > 1 ? "entries" : "entry"}
                  </h3>
                  {!locked && entries.length < (selLeague.max_entries || 1) && (
                    <button onClick={newEntry} className="text-[12px] bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1 rounded-lg">＋ New entry</button>
                  )}
                </div>
                {entries.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {entries.map((e, i) => (
                      <button key={e.id} onClick={() => setSelEntryId(e.id)} className={`text-[12px] px-3 py-1 rounded-full ${selEntryId === e.id ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{e.label || `Entry ${i + 1}`}</button>
                    ))}
                  </div>
                )}

                {entries.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-zinc-500 text-sm mb-3">No ranking yet for {selLeague.name}.</p>
                    {!locked && <button onClick={newEntry} className="bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl">Start your ranking →</button>}
                  </div>
                ) : (
                  <>
                    {selEntryId && !locked && (
                      <input
                        key={selEntryId}
                        defaultValue={entries.find((e) => e.id === selEntryId)?.label || ""}
                        onBlur={(e) => renameEntry(e.target.value)}
                        placeholder="Name this entry (e.g. Dark Horses)"
                        maxLength={24}
                        className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-zinc-600"
                      />
                    )}
                    <RankEditor
                      teams={teams} ranked={ranked} pool={pool} order={order} locked={locked} saving={saving}
                      onAdd={add} onRemove={removeT} onMove={move} onSuggest={suggestOrder} onSave={save}
                      onAddAll={() => setOrder((o) => [...o, ...pool.map((t) => String(t.id))])}
                      onRetryTeams={loadTeams}
                    />
                  </>
                )}
              </>
            )}
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

function Leaderboard({ selLeagueId, teamById, locked }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const flt = selLeagueId ? `group_id=eq.${selLeagueId}` : "group_id=is.null";
      const [entries, results] = await Promise.all([
        sbJson(await sbFetch(`wc_ranking_entries?${flt}&select=user_id,display_name,handle,label,ranking,created_at`)),
        fetchResults(),
      ]);
      const noGames = (results.events || 0) === 0;
      // Reveal rankings/scores only once the tournament has kicked off (locked) or
      // a match has been played. Before then, just show who's entered.
      const reveal = locked || !noGames;
      const list = entries.map((r) => {
        const submitted = Array.isArray(r.ranking) && r.ranking.length > 0;
        let total = 0, best = null;
        if (submitted) {
          const res = rankingPoints(r.ranking, results);
          total = Math.round(res.total);
          best = [...res.contributions].sort((a, b) => b.points - a.points)[0];
        }
        return { name: r.display_name || r.handle || "Player", handle: r.handle, label: r.label, submitted, total, best, created_at: r.created_at || "" };
      }).sort((a, b) => reveal
        ? (b.total - a.total)
        : ((b.submitted - a.submitted) || a.created_at.localeCompare(b.created_at)));
      if (!cancelled) setRows({ list, reveal, noGames });
    };
    load().catch(() => { if (!cancelled) setRows({ list: [], reveal: false, noGames: true }); });
    const t = setInterval(() => load().catch(() => {}), 45000);
    return () => { cancelled = true; clearInterval(t); };
  }, [selLeagueId, locked]);

  if (!rows) return <p className="text-zinc-600 text-sm py-8">Loading…</p>;
  if (rows.list.length === 0) return <p className="text-zinc-600 text-sm py-8">No one has entered yet.</p>;
  const submittedCount = rows.list.filter((r) => r.submitted).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">{rows.list.length} entered</h3>
        {!rows.reveal && <span className="text-[10px] text-zinc-500">🔒 rankings reveal at kickoff</span>}
      </div>
      {!rows.reveal && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-4 text-[12px] text-zinc-500">
          Everyone&apos;s rankings stay hidden until the first game kicks off (Jun 11). For now you can see who&apos;s in — {submittedCount}/{rows.list.length} have locked in a full ranking.
        </div>
      )}
      <div className="space-y-2">
        {rows.list.map((r, i) => {
          const bt = r.best && teamById(r.best.team_id);
          const NameTag = r.handle ? Link : "div";
          const nameProps = r.handle ? { href: `/u/${r.handle}` } : {};
          return (
            <div key={i} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-zinc-600 font-bold w-5">{rows.reveal ? i + 1 : "•"}</span>
                <div className="min-w-0">
                  <NameTag {...nameProps} className={`font-bold truncate block ${r.handle ? "hover:text-red-400" : ""}`}>
                    {r.name}{r.handle ? <span className="text-[10px] text-zinc-600 font-normal"> ↗</span> : null}
                    {r.label ? <span className="text-[11px] text-zinc-500 font-normal"> · {r.label}</span> : null}
                  </NameTag>
                  {rows.reveal
                    ? (bt && <div className="text-[11px] text-zinc-500">Top pick: {bt.name} (#{r.best.rank})</div>)
                    : <div className={`text-[11px] ${r.submitted ? "text-emerald-400" : "text-zinc-600"}`}>{r.submitted ? "✓ Ranking locked in" : "… hasn't finished ranking"}</div>}
                </div>
              </div>
              {rows.reveal && <span className="font-bold text-red-500 tabular-nums shrink-0">{r.total}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
