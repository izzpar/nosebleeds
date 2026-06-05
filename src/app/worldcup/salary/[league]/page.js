"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import WcBackdrop from "@/components/WcBackdrop";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import { rankingsLocked } from "@/lib/worldcup";
import { groupById } from "@/lib/groups";

const GLOBAL = { id: null, name: "🌍 Global", max_entries: 1, isGlobal: true };

// One entry's total across rounds (carry-over lineup, captain doubles, auto-subs).
function scoreEntry(lineups, rounds, idxOf, ptByRound) {
  const scoreRound = (lu, pts) => {
    const starters = (lu.starters || []).map(String);
    const benchAvail = (lu.bench || []).map(String).filter((id) => pts[id] !== undefined);
    let bi = 0;
    const fielded = starters.map((id) => (pts[id] !== undefined ? id : bi < benchAvail.length ? benchAvail[bi++] : null));
    let t = fielded.reduce((s, id) => s + (id ? pts[id] || 0 : 0), 0);
    const cap = lu.captain && String(lu.captain);
    if (cap && fielded.includes(cap)) t += pts[cap] || 0;
    return t;
  };
  let total = 0;
  for (const round of rounds) {
    const pts = ptByRound[String(round.round_id)];
    if (!pts) continue;
    let lu = lineups.find((l) => String(l.round_id) === String(round.round_id));
    if (!lu) {
      lu = lineups.filter((l) => (idxOf[String(l.round_id)] ?? -1) < round.index)
        .sort((a, b) => (idxOf[String(b.round_id)] ?? -1) - (idxOf[String(a.round_id)] ?? -1))[0];
    }
    if (lu) total += scoreRound(lu, pts);
  }
  return Math.round(total * 100) / 100;
}

export default function SalaryLeaguePage() {
  const { league } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isGlobal = league === "global";
  const groupId = isGlobal ? null : league;
  const reveal = rankingsLocked();

  const [group, setGroup] = useState(isGlobal ? GLOBAL : null);
  const [rows, setRows] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!isGlobal) groupById(groupId).then((g) => setGroup(g || GLOBAL)).catch(() => {}); }, [groupId, isGlobal]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const flt = isGlobal ? "group_id=is.null" : `group_id=eq.${groupId}`;
      const entries = await sbJson(await sbFetch(`wc_salary_entries?${flt}&select=id,user_id,display_name,handle,label,created_at`));
      const ids = entries.map((e) => e.id);
      let lineupsByEntry = {};
      let scoresById = {};
      if (ids.length) {
        const [roundsRes, lineups, rps] = await Promise.all([
          fetch("/api/wc-rounds").then((r) => r.json()).catch(() => ({ rounds: [] })),
          sbJson(await sbFetch(`wc_salary_entry_lineups?entry_id=in.(${ids.join(",")})&select=entry_id,round_id,starters,bench,captain`)),
          reveal ? sbJson(await sbFetch("wc_player_round_points?select=player_id,round_id,points")) : [],
        ]);
        for (const l of lineups) (lineupsByEntry[l.entry_id] = lineupsByEntry[l.entry_id] || []).push(l);
        if (reveal) {
          const rounds = roundsRes.rounds || [];
          const idxOf = {}; rounds.forEach((r) => { idxOf[String(r.round_id)] = r.index; });
          const ptByRound = {};
          for (const r of rps) (ptByRound[String(r.round_id)] = ptByRound[String(r.round_id)] || {})[String(r.player_id)] = Number(r.points || 0);
          entries.forEach((e) => { scoresById[e.id] = scoreEntry(lineupsByEntry[e.id] || [], rounds, idxOf, ptByRound); });
        }
      }
      const list = entries.map((e) => ({
        id: e.id, user_id: e.user_id, name: e.display_name || e.handle || "Player", handle: e.handle, label: e.label,
        submitted: (lineupsByEntry[e.id] || []).length > 0, total: scoresById[e.id] || 0, created_at: e.created_at || "",
      })).sort((a, b) => reveal ? (b.total - a.total) : ((b.submitted - a.submitted) || a.created_at.localeCompare(b.created_at)));
      if (!cancelled) setRows(list);
    };
    load().catch(() => { if (!cancelled) setRows([]); });
    const t = setInterval(() => load().catch(() => {}), 45000);
    return () => { cancelled = true; clearInterval(t); };
  }, [groupId, isGlobal, reveal]);

  const copyInvite = () => {
    if (!group?.invite_code) return;
    try { navigator.clipboard.writeText(`${window.location.origin}/worldcup/g/${group.invite_code}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  const myEntries = (rows || []).filter((r) => r.user_id === user?.id);
  const submittedCount = (rows || []).filter((r) => r.submitted).length;

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup/salary")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">💰</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{group?.name || "League"}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">World Cup Salary Cap · {reveal ? "live" : "teams hidden until kickoff"}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {group?.invite_code && (
          <button onClick={copyInvite} className="w-full text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 mb-4">
            {copied ? "✓ Invite link copied!" : <>🔗 Invite to <span className="text-zinc-200">{group.name}</span> — tap to copy</>}
          </button>
        )}

        {/* Your teams */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Your {myEntries.length === 1 ? "team" : "teams"}</h2>
          <button onClick={() => router.push(`/worldcup/salary?league=${league}`)} className="text-[12px] bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1 rounded-lg">
            {myEntries.length ? "＋ / Edit" : "Build your team →"}
          </button>
        </div>
        {myEntries.length === 0 ? (
          <p className="text-zinc-600 text-sm mb-5">You haven&apos;t entered yet.</p>
        ) : (
          <div className="space-y-2 mb-5">
            {myEntries.map((r) => (
              <div key={r.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-bold truncate">{r.label || "Your team"}</div>
                  <div className={`text-[11px] ${r.submitted ? "text-emerald-400" : "text-zinc-600"}`}>{r.submitted ? "✓ Team saved" : "… not finished"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {reveal && <span className="font-bold text-red-500 tabular-nums">{r.total} pts</span>}
                  <button onClick={() => router.push(`/worldcup/salary?league=${league}&entry=${r.id}`)} className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Entrants */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">{rows?.length || 0} entered</h2>
          {!reveal && <span className="text-[10px] text-zinc-500">🔒 teams reveal at kickoff</span>}
        </div>
        {!rows ? (
          <p className="text-zinc-600 text-sm py-6">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-zinc-600 text-sm py-6">No teams here yet — be the first!</p>
        ) : (
          <>
            {!reveal && (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-3 text-[12px] text-zinc-500">
                Everyone&apos;s squads stay hidden until the first game kicks off (Jun 11). {submittedCount}/{rows.length} have saved a team.
              </div>
            )}
            <div className="space-y-2">
              {rows.map((r, i) => {
                const canView = reveal || r.user_id === user?.id;
                return (
                  <div key={r.id} onClick={() => canView && router.push(`/worldcup/salary/${league}/${r.id}`)} className={`bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-2 ${canView ? "cursor-pointer hover:border-zinc-700" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-600 font-bold w-5">{reveal ? i + 1 : "•"}</span>
                      <div className="min-w-0">
                        <div className="font-bold truncate">
                          {r.name}{r.user_id === user?.id ? <span className="text-[10px] text-emerald-400 font-normal"> · you</span> : null}
                          {r.label ? <span className="text-[11px] text-zinc-500 font-normal"> · {r.label}</span> : null}
                        </div>
                        <div className={`text-[11px] ${r.submitted ? "text-emerald-400" : "text-zinc-600"}`}>{r.submitted ? "✓ Team saved" : "… hasn't finished"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {reveal && <span className="font-bold text-red-500 tabular-nums">{r.total} pts</span>}
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
