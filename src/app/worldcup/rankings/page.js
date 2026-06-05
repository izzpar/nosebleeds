"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import GroupScope from "@/components/WcGroups";
import Confetti from "@/components/Confetti";
import { fetchTeams, fetchResults, rankingPoints, rankingsLocked, RANKING_LOCK_ISO, nationStrength } from "@/lib/worldcup";

export default function RankingsPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [teams, setTeams] = useState([]);
  const [teamsErr, setTeamsErr] = useState(false);
  const [order, setOrder] = useState([]);      // array of team ids, best→worst
  const [loaded, setLoaded] = useState(false);
  const [subTab, setSubTab] = useState("mine"); // 'mine' | 'board'
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(0);
  const locked = rankingsLocked();

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const teamById = useCallback((id) => teams.find((t) => String(t.id) === String(id)), [teams]);

  // Load the 48 nations (with retry) + this user's saved ranking.
  const loadTeams = useCallback(async () => {
    setTeamsErr(false);
    try {
      let t = await fetchTeams();
      if (!t || !t.length) { await new Promise((r) => setTimeout(r, 600)); t = await fetchTeams(); }
      if (t && t.length) setTeams(t); else setTeamsErr(true);
    } catch (e) { setTeamsErr(true); }
  }, []);
  useEffect(() => { loadTeams(); }, [loadTeams]);
  useEffect(() => {
    if (!user) { setLoaded(true); return; }
    sbFetch(`wc_rankings?user_id=eq.${user.id}&select=ranking`).then(async (res) => {
      const rows = await sbJson(res);
      if (rows[0]?.ranking?.length) setOrder(rows[0].ranking.map(String));
      setLoaded(true);
    });
  }, [user]);

  const ranked = order.map(teamById).filter(Boolean);
  // Pool of unranked teams, strongest first (FIFA-ranking-style seed).
  const pool = teams
    .filter((t) => !order.includes(String(t.id)))
    .sort((a, b) => nationStrength(b.name) - nationStrength(a.name));

  const add = (id) => !locked && setOrder((o) => [...o, String(id)]);
  const remove = (id) => !locked && setOrder((o) => o.filter((x) => x !== String(id)));
  const move = (id, dir) => {
    if (locked) return;
    setOrder((o) => {
      const i = o.indexOf(String(id));
      const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const addAllRemaining = () =>
    !locked && setOrder((o) => [...o, ...pool.map((t) => String(t.id))]);
  // Fill the whole ranking by suggested strength (then the user can tweak).
  const suggestOrder = () =>
    !locked &&
    setOrder([...teams].sort((a, b) => nationStrength(b.name) - nationStrength(a.name)).map((t) => String(t.id)));

  const save = async () => {
    if (!user || saving || locked) return;
    if (order.length !== teams.length) { flash(`Rank all ${teams.length} teams first`); return; }
    setSaving(true);
    try {
      const res = await sbFetch("wc_rankings?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          user_id: user.id,
          handle: profile?.handle,
          display_name: profile?.display_name || profile?.handle,
          ranking: order,
          updated_at: new Date().toISOString(),
        }),
      });
      if (res.ok) setCelebrate((c) => c + 1);
      flash(res.ok ? "Ranking saved ✓" : "Couldn't save");
    } catch (e) {
      flash("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">🔢</span>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">Power Ranking</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">
              Rank all 48 · {locked ? "locked" : "locks at kickoff Jun 11"}
            </p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["mine", "My Ranking"], ["board", "Leaderboard"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`pb-2 font-bold border-b-2 ${subTab === id ? "text-white border-red-500" : "text-zinc-600 border-transparent"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {!user ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 mb-4">Sign in to submit your ranking.</p>
            <button onClick={() => router.push("/login")} className="bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl">Log in</button>
          </div>
        ) : subTab === "mine" ? (
          <>
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-2 text-[12px] text-zinc-400">
              Rank every nation 1–48. Teams score performance points as they play, and you earn more
              for teams you ranked <span className="text-zinc-200">higher</span> when they do well. {locked && <span className="text-amber-400">Rankings are locked.</span>}
            </div>
            <button onClick={() => setSubTab("board")} className="w-full text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 mb-4">
              👥 Play with friends? Create a private mini-league on the <span className="text-zinc-200">Leaderboard</span> tab →
            </button>

            {/* Your ranking */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Your ranking ({ranked.length}/{teams.length})
              </h3>
              {!locked && (
                <div className="flex items-center gap-2">
                  <button onClick={suggestOrder} className="text-[12px] bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-3 py-1.5 rounded-lg">
                    ✨ Suggest
                  </button>
                  {order.length === teams.length && (
                    <button onClick={save} disabled={saving} className="text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded-lg">
                      {saving ? "Saving…" : "Save"}
                    </button>
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
                      <button onClick={() => move(t.id, -1)} disabled={i === 0} className="w-7 h-7 rounded bg-zinc-800 disabled:opacity-30">↑</button>
                      <button onClick={() => move(t.id, 1)} disabled={i === ranked.length - 1} className="w-7 h-7 rounded bg-zinc-800 disabled:opacity-30">↓</button>
                      <button onClick={() => remove(t.id)} className="w-7 h-7 rounded bg-zinc-800 text-zinc-400">✕</button>
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Pool */}
            {!locked && teams.length === 0 && (
              <div className="text-center py-8">
                {teamsErr ? (
                  <>
                    <p className="text-zinc-500 text-sm mb-3">Couldn&apos;t load the teams.</p>
                    <button onClick={loadTeams} className="bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-sm">Retry</button>
                  </>
                ) : (
                  <p className="text-zinc-600 text-sm">Loading teams…</p>
                )}
              </div>
            )}
            {!locked && pool.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Tap to add ({pool.length})</h3>
                  <button onClick={addAllRemaining} className="text-[12px] text-zinc-400 underline">Add all</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {pool.map((t) => (
                    <button key={t.id} onClick={() => add(t.id)} className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 hover:border-red-500 rounded-xl px-3 py-2.5 text-left active:scale-[0.98]">
                      {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain" />}
                      <span className="text-sm font-medium truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <Leaderboard teamById={teamById} />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">{toast}</div>
      )}
      <Confetti show={celebrate} />
      <Nav />
    </div>
  );
}

function Leaderboard({ teamById }) {
  const [rows, setRows] = useState(null);
  const [scopeIds, setScopeIds] = useState(null); // null = global, else group member ids

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [res, results] = await Promise.all([
        sbFetch("wc_rankings?select=user_id,display_name,handle,ranking"),
        fetchResults(),
      ]);
      const rankings = await sbJson(res);
      const scored = rankings
        .filter((r) => Array.isArray(r.ranking) && r.ranking.length)
        .map((r) => {
          const { total, contributions } = rankingPoints(r.ranking, results);
          const best = [...contributions].sort((a, b) => b.points - a.points)[0];
          return {
            user_id: r.user_id,
            name: r.display_name || r.handle || "Player",
            total: Math.round(total),
            best,
          };
        })
        .sort((a, b) => b.total - a.total);
      if (!cancelled) setRows({ scored, noGames: (results.events || 0) === 0 });
    };
    load().catch(() => { if (!cancelled) setRows((r) => r || { scored: [], noGames: true }); });
    const t = setInterval(() => load().catch(() => {}), 45000); // live refresh
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!rows) return <p className="text-zinc-600 text-sm py-8">Loading leaderboard…</p>;
  const shown = scopeIds ? rows.scored.filter((r) => scopeIds.includes(r.user_id)) : rows.scored;

  return (
    <div>
      <GroupScope game="ranking" onScope={setScopeIds} />
      {rows.noGames && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-4 text-[12px] text-zinc-500">
          No matches played yet — the board updates automatically once games kick off.
        </div>
      )}
      {shown.length === 0 && <p className="text-zinc-600 text-sm py-6">{scopeIds ? "No one in this group has ranked yet." : "No rankings submitted yet."}</p>}
      <div className="space-y-2">
        {shown.map((r, i) => {
          const bt = r.best && teamById(r.best.team_id);
          return (
            <div key={r.user_id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-zinc-600 font-bold w-5">{i + 1}</span>
                <div>
                  <div className="font-bold">{r.name}</div>
                  {bt && !rows.noGames && (
                    <div className="text-[11px] text-zinc-500">Top pick: {bt.name} (#{r.best.rank})</div>
                  )}
                </div>
              </div>
              <span className="font-bold text-red-500 tabular-nums">{r.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
