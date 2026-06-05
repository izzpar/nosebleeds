"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import WcBackdrop from "@/components/WcBackdrop";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import { fetchResults, rankingPoints, rankingsLocked, fetchTeams, WC_TEAMS_FALLBACK } from "@/lib/worldcup";
import { groupById } from "@/lib/groups";

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
  const [teams, setTeams] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchTeams().then((t) => setTeams(t?.length ? t : WC_TEAMS_FALLBACK)).catch(() => setTeams(WC_TEAMS_FALLBACK)); }, []);
  useEffect(() => { if (!isGlobal) groupById(groupId).then((g) => setGroup(g || GLOBAL)).catch(() => {}); }, [groupId, isGlobal]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const flt = isGlobal ? "group_id=is.null" : `group_id=eq.${groupId}`;
      const [entries, results] = await Promise.all([
        sbJson(await sbFetch(`wc_ranking_entries?${flt}&select=id,user_id,display_name,handle,label,ranking,created_at`)),
        fetchResults(),
      ]);
      const reveal = locked || (results.events || 0) > 0;
      const list = entries.map((r) => {
        const submitted = Array.isArray(r.ranking) && r.ranking.length > 0;
        let total = 0, best = null;
        if (submitted && reveal) {
          const res = rankingPoints(r.ranking, results);
          total = Math.round(res.total);
          best = [...res.contributions].sort((a, b) => b.points - a.points)[0];
        }
        return { id: r.id, user_id: r.user_id, name: r.display_name || r.handle || "Player", handle: r.handle, label: r.label, submitted, total, best, created_at: r.created_at || "" };
      }).sort((a, b) => reveal ? (b.total - a.total) : ((b.submitted - a.submitted) || a.created_at.localeCompare(b.created_at)));
      if (!cancelled) setRows({ list, reveal });
    };
    load().catch(() => { if (!cancelled) setRows({ list: [], reveal: false }); });
    const t = setInterval(() => load().catch(() => {}), 45000);
    return () => { cancelled = true; clearInterval(t); };
  }, [groupId, isGlobal, locked]);

  const teamById = (id) => teams.find((t) => String(t.id) === String(id));
  const copyInvite = () => {
    if (!group?.invite_code) return;
    try { navigator.clipboard.writeText(`${window.location.origin}/worldcup/g/${group.invite_code}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const myEntries = (rows?.list || []).filter((r) => r.user_id === user?.id);
  const submittedCount = (rows?.list || []).filter((r) => r.submitted).length;

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup/rankings")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">🔢</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{group?.name || "League"}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">World Cup Nations Ranking · {locked ? "locked" : "locks at kickoff Jun 11"}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Invite (private leagues) */}
        {group?.invite_code && (
          <button onClick={copyInvite} className="w-full text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 mb-4">
            {copied ? "✓ Invite link copied!" : <>🔗 Invite to <span className="text-zinc-200">{group.name}</span> — tap to copy</>}
          </button>
        )}

        {/* Your entries */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Your {myEntries.length === 1 ? "entry" : "entries"}</h2>
          <button onClick={() => router.push(`/worldcup/rankings?league=${league}`)} className="text-[12px] bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1 rounded-lg">
            {myEntries.length ? "＋ / Edit" : "Start ranking →"}
          </button>
        </div>
        {myEntries.length === 0 ? (
          <p className="text-zinc-600 text-sm mb-5">You haven&apos;t entered yet.</p>
        ) : (
          <div className="space-y-2 mb-5">
            {myEntries.map((r) => (
              <div key={r.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-bold truncate">{r.label || "Your ranking"}</div>
                  <div className={`text-[11px] ${r.submitted ? "text-emerald-400" : "text-zinc-600"}`}>{r.submitted ? "✓ Ranking locked in" : "… not finished"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rows?.reveal && <span className="font-bold text-red-500 tabular-nums">{r.total}</span>}
                  <button onClick={() => router.push(`/worldcup/rankings?league=${league}&entry=${r.id}`)} className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Edit</button>
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
            <div className="space-y-2">
              {rows.list.map((r, i) => {
                const bt = r.best && teamById(r.best.team_id);
                // After kickoff, anyone's entry is viewable; before, only your own.
                const canView = rows.reveal || r.user_id === user?.id;
                return (
                  <div key={r.id} onClick={() => canView && router.push(`/worldcup/rankings/${league}/${r.id}`)} className={`bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-2 ${canView ? "cursor-pointer hover:border-zinc-700" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-600 font-bold w-5">{rows.reveal ? i + 1 : "•"}</span>
                      <div className="min-w-0">
                        <div className="font-bold truncate">
                          {r.name}{r.user_id === user?.id ? <span className="text-[10px] text-emerald-400 font-normal"> · you</span> : null}
                          {r.label ? <span className="text-[11px] text-zinc-500 font-normal"> · {r.label}</span> : null}
                        </div>
                        {rows.reveal
                          ? (bt && <div className="text-[11px] text-zinc-500">Top pick: {bt.name} (#{r.best.rank})</div>)
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
      <Nav />
    </div>
  );
}
