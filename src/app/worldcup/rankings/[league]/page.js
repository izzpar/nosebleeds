"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import WcBackdrop from "@/components/WcBackdrop";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import { fetchResults, rankingPoints, rankingsLocked, fetchTeams, WC_TEAMS_FALLBACK } from "@/lib/worldcup";
import { groupById } from "@/lib/groups";
import { Icon } from "@/components/ui";
import InviteButton from "@/components/InviteButton";

const GLOBAL = { id: null, name: "🌍 Global", max_entries: 1, isGlobal: true };

export default function RankingLeaguePage() {
  const { league } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isGlobal = league === "global";
  const groupId = isGlobal ? null : league;
  const locked = rankingsLocked();

  const [group, setGroup] = useState(isGlobal ? GLOBAL : null);
  const [rows, setRows] = useState(null);
  const [myLib, setMyLib] = useState([]);   // your ranking library (for the add picker)
  const [teams, setTeams] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  useEffect(() => { fetchTeams().then((t) => setTeams(t?.length ? t : WC_TEAMS_FALLBACK)).catch(() => setTeams(WC_TEAMS_FALLBACK)); }, []);
  useEffect(() => { if (!isGlobal) groupById(groupId).then((g) => setGroup(g || GLOBAL)).catch(() => {}); }, [groupId, isGlobal]);

  const load = useCallback(async () => {
    const flt = isGlobal ? "group_id=is.null" : `group_id=eq.${groupId}`;
    const [subs, results, mine] = await Promise.all([
      sbJson(await sbFetch(`wc_ranking_submissions?${flt}&select=id,user_id,entry_id,wc_ranking_entries(id,user_id,display_name,handle,label,ranking,created_at)`)),
      fetchResults(),
      user ? sbJson(await sbFetch(`wc_ranking_entries?user_id=eq.${user.id}&select=id,label,ranking&order=created_at.asc`)) : [],
    ]);
    const reveal = locked || (results.events || 0) > 0;
    const list = subs.map((s) => {
      const e = s.wc_ranking_entries || {};
      const submitted = Array.isArray(e.ranking) && e.ranking.length > 0;
      let total = 0, best = null;
      if (submitted && reveal) {
        const res = rankingPoints(e.ranking, results);
        total = Math.round(res.total);
        best = [...res.contributions].sort((a, b) => b.points - a.points)[0];
      }
      return {
        subId: s.id, id: e.id || s.entry_id, user_id: e.user_id || s.user_id,
        name: e.display_name || e.handle || "Player", handle: e.handle, label: e.label,
        submitted, total, best, topPick: submitted ? String(e.ranking[0]) : null, created_at: e.created_at || "",
      };
    }).sort((a, b) => reveal ? (b.total - a.total) : ((b.submitted - a.submitted) || a.created_at.localeCompare(b.created_at)));
    setMyLib(mine);
    setRows({ list, reveal });
  }, [groupId, isGlobal, locked, user]);

  useEffect(() => {
    let cancelled = false;
    const run = () => load().catch(() => { if (!cancelled) setRows((r) => r || { list: [], reveal: false }); });
    run();
    const t = setInterval(() => { if (!document.hidden) run(); }, 90000);
    return () => { cancelled = true; clearInterval(t); };
  }, [load]);

  const teamById = (id) => teams.find((t) => String(t.id) === String(id));

  const myRows = (rows?.list || []).filter((r) => r.user_id === user?.id);
  const myEntryIds = new Set(myRows.map((r) => r.id));
  const maxEntries = group?.max_entries || 1;
  const addable = myLib.filter((e) => !myEntryIds.has(e.id));
  const canAddMore = !locked && myRows.length < maxEntries && addable.length > 0;
  const submittedCount = (rows?.list || []).filter((r) => r.submitted).length;

  const addEntry = async (entryId) => {
    setAddOpen(false);
    const { res } = await sbInsert("wc_ranking_submissions", { entry_id: entryId, group_id: groupId, user_id: user.id });
    if (res.ok || res.status === 409) { flash("Entered ✓"); await load(); }
    else flash("Couldn't enter — run the entries SQL");
  };
  const removeEntry = async (subId) => { await sbFetch(`wc_ranking_submissions?id=eq.${subId}`, { method: "DELETE" }); await load(); };

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup/rankings")} className="text-zinc-500 text-xl leading-none">‹</button>
          <Icon name="ranking" className="w-5 h-5 text-red-500" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{group?.name || "League"}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">World Cup Nations Ranking · {locked ? "locked" : "locks at kickoff Jun 11"}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {group?.invite_code && <InviteButton code={group.invite_code} name={group.name} className="mb-4" />}

        {/* Your entries in this league */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Your {myRows.length === 1 ? "entry" : "entries"} here</h2>
          {canAddMore && <button onClick={() => setAddOpen((v) => !v)} className="text-[12px] bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1 rounded-lg">＋ Enter a ranking</button>}
        </div>
        {addOpen && (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 mb-3">
            <div className="text-[11px] text-zinc-500 mb-2">Pick which of your rankings to enter in {group?.name || "this league"}:</div>
            <div className="flex flex-wrap gap-1.5">
              {addable.map((e) => (
                <button key={e.id} onClick={() => addEntry(e.id)} className="text-[12px] px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200">{e.label || "Untitled"}</button>
              ))}
            </div>
            <button onClick={() => router.push("/worldcup/rankings")} className="text-[11px] text-zinc-500 underline mt-2">＋ Build a new ranking</button>
          </div>
        )}
        {myRows.length === 0 ? (
          <div className="mb-5">
            <p className="text-zinc-600 text-sm">You haven&apos;t entered a ranking here yet.</p>
            {!locked && myLib.length === 0 && <button onClick={() => router.push("/worldcup/rankings")} className="mt-2 bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-sm">Build a ranking →</button>}
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {myRows.map((r) => (
              <div key={r.subId} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-bold truncate">{r.label || "Your ranking"}</div>
                  {r.topPick && teamById(r.topPick) ? (
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1">👑 #1 {teamById(r.topPick).logo && <img src={teamById(r.topPick).logo} alt="" className="w-3.5 h-3.5 object-contain inline" />} {teamById(r.topPick).name}</div>
                  ) : (
                    <div className={`text-[11px] ${r.submitted ? "text-emerald-400" : "text-zinc-600"}`}>{r.submitted ? "✓ Ranking locked in" : "… not finished"}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rows?.reveal && <span className="font-bold text-red-500 tabular-nums">{r.total}</span>}
                  <button onClick={() => router.push(`/worldcup/rankings?entry=${r.id}`)} className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Edit</button>
                  {!locked && <button onClick={() => removeEntry(r.subId)} className="text-zinc-500 hover:text-red-400 px-1" title="Remove from this league"><Icon name="x" className="w-4 h-4" /></button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Entrants roster */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">{rows?.list.length || 0} entered</h2>
          {!rows?.reveal && <span className="text-[10px] text-zinc-500">🔒 rankings reveal at kickoff</span>}
        </div>
        {!rows ? (
          <p className="text-zinc-600 text-sm py-6">Loading…</p>
        ) : rows.list.length === 0 ? (
          <p className="text-zinc-600 text-sm py-6">No one has entered yet — be the first!</p>
        ) : (
          <>
            {!rows.reveal && (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-3 text-[12px] text-zinc-500">
                Everyone&apos;s rankings stay hidden until the first game kicks off (Jun 11). {submittedCount}/{rows.list.length} have locked in a full ranking.
              </div>
            )}
            {rows.reveal && rows.list.length > 0 && rows.list.every((r) => !r.total) && (
              <div className="bg-amber-500/10 border border-amber-600/30 rounded-xl px-4 py-3 mb-3 text-[12px] text-amber-200/90">
                Scoring starts as results come in — points update within ~30 min of each match finishing.
              </div>
            )}
            {rows.reveal && user && rows.list.length > 1 && rows.list.some((r) => r.total) && (() => {
              const mine = rows.list.filter((r) => r.user_id === user.id).sort((a, b) => b.total - a.total)[0];
              if (!mine) return null;
              const idx = rows.list.indexOf(mine);
              const ahead = rows.list.slice(0, idx).reverse().find((r) => r.user_id !== user.id);
              const behind = rows.list.slice(idx + 1).find((r) => r.user_id !== user.id);
              const top = !ahead;
              return (
                <div className={`rounded-xl px-4 py-3 mb-3 border ${top ? "bg-emerald-500/10 border-emerald-600/30" : "bg-red-500/10 border-red-600/30"}`}>
                  <div className="text-[13px] font-bold">
                    {top ? `🥇 You lead ${group?.name || "this league"}!` : `You're #${idx + 1} of ${rows.list.length}`}
                  </div>
                  <div className="text-[12px] text-zinc-300 mt-0.5">
                    {top
                      ? (behind ? <>{mine.total - behind.total} pt{mine.total - behind.total === 1 ? "" : "s"} ahead of <span className="font-semibold">{behind.name}</span> — keep it up.</> : "Out in front on your own.")
                      : <>{ahead.total - mine.total} pt{ahead.total - mine.total === 1 ? "" : "s"} behind <span className="font-semibold">{ahead.name}</span>. Catch them.</>}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              {rows.list.map((r, i) => {
                const canView = rows.reveal || r.user_id === user?.id;
                return (
                  <div key={r.subId} onClick={() => canView && router.push(`/worldcup/rankings/${league}/${r.id}`)} className={`bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-2 ${canView ? "cursor-pointer hover:border-zinc-700" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-600 font-bold w-5">{rows.reveal ? i + 1 : "•"}</span>
                      <div className="min-w-0">
                        <div className="font-bold truncate">
                          {r.name}{r.user_id === user?.id ? <span className="text-[10px] text-emerald-400 font-normal"> · you</span> : null}
                          {r.label ? <span className="text-[11px] text-zinc-500 font-normal"> · {r.label}</span> : null}
                        </div>
                        {canView
                          ? (r.topPick && teamById(r.topPick)
                              ? <div className="text-[11px] text-zinc-400 flex items-center gap-1">👑 #1 {teamById(r.topPick).logo && <img src={teamById(r.topPick).logo} alt="" className="w-3.5 h-3.5 object-contain inline" />} {teamById(r.topPick).name}</div>
                              : <div className="text-[11px] text-zinc-600">… no ranking yet</div>)
                          : <div className={`text-[11px] ${r.submitted ? "text-emerald-400" : "text-zinc-600"}`}>{r.submitted ? "✓ Ranking locked in" : "… hasn't finished"}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rows.reveal && <span className="font-bold text-red-500 tabular-nums">{r.total}</span>}
                      {r.handle && <Link href={`/u/${r.handle}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-zinc-500 hover:text-red-400">profile ↗</Link>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">{toast}</div>}
      <Nav />
    </div>
  );
}
