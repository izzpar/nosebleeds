"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import WcBackdrop from "@/components/WcBackdrop";
import { Icon } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import { fetchMyGroups, createGroup, groupMemberIds } from "@/lib/groups";
import { WC_BASE, WC_START, WC_END } from "@/lib/worldcup";

const GLOBAL = { id: null, name: "🌍 Global" };

// Result of a finished match → 'home' | 'draw' | 'away' (PK winner counts).
function matchResult(home, away) {
  if (home.winner) return "home";
  if (away.winner) return "away";
  if (home.score === away.score) return "draw";
  return home.score > away.score ? "home" : "away";
}
const dayLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const timeLabel = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const pickAbbr = (p) => (p.pick === "draw" ? "Draw" : p.pick === "home" ? p.home_abbr : p.away_abbr);

export default function WcPredictionsPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [matches, setMatches] = useState(null);
  const [picks, setPicks] = useState({});      // match_id -> pick row
  const [subTab, setSubTab] = useState("fixtures");

  // leagues
  const [leagues, setLeagues] = useState([GLOBAL]);
  const [selLeagueId, setSelLeagueId] = useState(null);
  const [board, setBoard] = useState(null);
  const [creating, setCreating] = useState(false);
  const [lgName, setLgName] = useState("");
  const [copied, setCopied] = useState(false);

  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  // ---- fixtures from ESPN ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${WC_BASE}/scoreboard?dates=${WC_START}-${WC_END}&limit=200`);
        const d = await r.json();
        const list = (d.events || []).map((ev) => {
          const comp = ev.competitions?.[0]; const cs = comp?.competitors || [];
          const h = cs.find((c) => c.homeAway === "home") || cs[0];
          const a = cs.find((c) => c.homeAway === "away") || cs[1];
          if (!h || !a) return null;
          const side = (c) => ({ id: String(c.team?.id), abbr: c.team?.abbreviation, name: c.team?.displayName, logo: c.team?.logo || c.team?.logos?.[0]?.href, score: parseInt(c.score, 10), winner: c.winner === true });
          return { id: String(ev.id), date: ev.date, state: comp?.status?.type?.state || "pre", completed: !!comp?.status?.type?.completed, home: side(h), away: side(a) };
        }).filter(Boolean).sort((x, y) => new Date(x.date) - new Date(y.date));
        if (!cancelled) setMatches(list);
      } catch (e) { if (!cancelled) setMatches([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- my picks + self-settle ----
  const loadPicks = useCallback(async () => {
    if (!user) { setPicks({}); return; }
    const rows = await sbJson(await sbFetch(`wc_predictions?user_id=eq.${user.id}&select=*`));
    const m = {}; rows.forEach((r) => { m[r.match_id] = r; });
    setPicks(m);
  }, [user]);
  useEffect(() => { loadPicks(); }, [loadPicks]);

  // my leagues
  const loadLeagues = useCallback(async () => {
    if (!user) return;
    try { setLeagues([GLOBAL, ...(await fetchMyGroups(user.id, "picks"))]); } catch (e) {}
  }, [user]);
  useEffect(() => { loadLeagues(); }, [loadLeagues]);

  // Settle my own finished-but-pending picks immediately (cron also does this).
  useEffect(() => {
    if (!user || !matches) return;
    const resultById = {}; matches.forEach((mt) => { if (mt.completed) resultById[mt.id] = matchResult(mt.home, mt.away); });
    const todo = Object.values(picks).filter((p) => p.status === "pending" && resultById[p.match_id]);
    if (!todo.length) return;
    (async () => {
      for (const p of todo) {
        const res = resultById[p.match_id];
        await sbFetch(`wc_predictions?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ status: p.pick === res ? "won" : "lost", result: res, settled_at: new Date().toISOString() }) });
      }
      loadPicks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, picks, user]);

  // Optimistic pick — update the UI instantly, persist in the background.
  const makePick = async (mt, choice) => {
    if (!user) { router.push("/login"); return; }
    if (new Date(mt.date) <= new Date()) { flash("That match has kicked off"); return; }
    const existing = picks[mt.id];
    setPicks((prev) => ({ ...prev, [mt.id]: { ...(existing || { match_id: mt.id, user_id: user.id, home_abbr: mt.home.abbr, away_abbr: mt.away.abbr, match_date: mt.date }), pick: choice, status: "pending" } }));
    try {
      if (existing?.id) {
        const res = await sbFetch(`wc_predictions?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify({ pick: choice }) });
        if (!res.ok) throw new Error();
      } else {
        const body = {
          user_id: user.id, handle: profile?.handle, display_name: profile?.display_name || profile?.handle,
          match_id: mt.id, match_date: mt.date, pick: choice,
          home_abbr: mt.home.abbr, away_abbr: mt.away.abbr, home_name: mt.home.name, away_name: mt.away.name, status: "pending",
        };
        const res = await sbFetch("wc_predictions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
        const row = (await sbJson(res))[0];
        if (row) setPicks((prev) => ({ ...prev, [mt.id]: row }));
        else if (!res.ok) throw new Error();
      }
    } catch (e) { flash("Couldn't save — run the predictions SQL"); loadPicks(); }
  };

  // ---- leaderboard (global or league-scoped) ----
  const loadBoard = useCallback(async () => {
    setBoard(null);
    let memberIds = null;
    if (selLeagueId) {
      memberIds = await groupMemberIds(selLeagueId);
      if (!memberIds.length) { setBoard([]); return; }
    }
    const flt = memberIds ? `&user_id=in.(${memberIds.join(",")})` : "";
    const rows = await sbJson(await sbFetch(`wc_predictions?status=in.(won,lost)${flt}&select=user_id,handle,display_name,status`));
    const by = {};
    rows.forEach((r) => {
      const k = r.user_id;
      by[k] = by[k] || { user_id: k, name: r.display_name || r.handle || "Player", won: 0, total: 0 };
      by[k].total++; if (r.status === "won") by[k].won++;
    });
    setBoard(Object.values(by).sort((a, b) => b.won - a.won || b.won / b.total - a.won / a.total));
  }, [selLeagueId]);
  useEffect(() => { if (subTab === "leagues") loadBoard(); }, [subTab, loadBoard]);

  const createLeague = async () => {
    if (!lgName.trim() || !user) return;
    const g = await createGroup(lgName, "picks", user.id, profile);
    if (g) { setLgName(""); setCreating(false); await loadLeagues(); setSelLeagueId(g.id); }
    else flash("Couldn't create league");
  };
  const selLeague = leagues.find((l) => (l.id || null) === selLeagueId) || GLOBAL;
  const copyInvite = () => {
    if (!selLeague.invite_code) return;
    try { navigator.clipboard.writeText(`${window.location.origin}/worldcup/g/${selLeague.invite_code}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };

  // record
  const allPicks = Object.values(picks);
  const settledMine = allPicks.filter((p) => p.status === "won" || p.status === "lost");
  const wins = settledMine.filter((p) => p.status === "won").length;
  const pct = settledMine.length ? Math.round((wins / settledMine.length) * 100) : 0;
  const pendingMine = allPicks.filter((p) => p.status === "pending").length;

  // fixtures grouped by day
  const now = new Date();
  const fixtures = (matches || []).filter((m) => !m.completed);
  const finished = (matches || []).filter((m) => m.completed).reverse();
  const byDay = {};
  fixtures.forEach((m) => { (byDay[dayLabel(m.date)] = byDay[dayLabel(m.date)] || []).push(m); });

  const PickRow = ({ mt }) => {
    const p = picks[mt.id];
    const locked = new Date(mt.date) <= now;
    const opts = [["home", mt.home.abbr], ["draw", "Draw"], ["away", mt.away.abbr]];
    return (
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-2">
          <span>{timeLabel(mt.date)}</span>
          {locked ? <span className="text-amber-400/80">kicked off</span> : p && <span className="text-emerald-400 inline-flex items-center gap-0.5"><Icon name="check" className="w-2.5 h-2.5" strokeWidth={3} /> picked</span>}
        </div>
        <div className="flex items-center justify-center gap-2 mb-2.5 text-sm font-bold">
          <span className="flex items-center gap-1.5">{mt.home.logo && <img src={mt.home.logo} alt="" className="w-5 h-5 object-contain" />}{mt.home.abbr}</span>
          <span className="text-zinc-600 text-xs">vs</span>
          <span className="flex items-center gap-1.5">{mt.away.abbr}{mt.away.logo && <img src={mt.away.logo} alt="" className="w-5 h-5 object-contain" />}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {opts.map(([val, label]) => {
            const active = p?.pick === val;
            return (
              <button key={val} disabled={locked} onClick={() => makePick(mt, val)}
                className={`py-2 rounded-lg text-[12px] font-bold transition-all active:scale-[0.97] ${active ? "bg-red-600 text-white" : locked ? "bg-zinc-950 text-zinc-600 border border-zinc-800" : "bg-zinc-950 text-zinc-300 border border-zinc-700 hover:border-red-600"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <Icon name="target" className="w-5 h-5 text-red-500" />
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">Match Picks</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Call every World Cup result · free</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["fixtures", "Fixtures"], ["mine", "My Picks"], ["leagues", "Leagues"]].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)} className={`pb-2 font-bold border-b-2 ${subTab === id ? "text-white border-red-500" : "text-zinc-600 border-transparent"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* record hero */}
        <div className="rounded-2xl bg-gradient-to-br from-red-900/40 via-zinc-900 to-zinc-900 border border-zinc-800 p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase">Your record</div>
            <div className="text-2xl font-extrabold mt-0.5">{wins}-{settledMine.length - wins}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold" style={{ color: pct >= 50 ? "#22c55e" : "#ef4444" }}>{pct}%</div>
            <div className="text-[9px] text-zinc-500 font-bold tracking-wider">{pendingMine} PENDING</div>
          </div>
        </div>

        {/* ===== LEAGUES ===== */}
        {subTab === "leagues" ? (
          <>
            <div className="flex gap-1.5 flex-wrap items-center mb-3">
              {leagues.map((l) => (
                <button key={l.id || "global"} onClick={() => setSelLeagueId(l.id || null)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${selLeagueId === (l.id || null) ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{l.name}</button>
              ))}
              <button onClick={() => setCreating((v) => !v)} className="text-[12px] font-bold px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 inline-flex items-center gap-1"><Icon name="plus" className="w-3 h-3" /> League</button>
            </div>
            {creating && (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 mb-3">
                <input value={lgName} onChange={(e) => setLgName(e.target.value)} placeholder="League name" maxLength={32} className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-zinc-600" />
                <button onClick={createLeague} disabled={!lgName.trim()} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2 rounded-lg text-sm">Create &amp; invite friends</button>
              </div>
            )}
            {selLeague.invite_code && (
              <button onClick={copyInvite} className="w-full text-left text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 mb-3">
                {copied ? "✓ Invite link copied!" : <>🔗 Invite to <span className="text-zinc-200">{selLeague.name}</span> — tap to copy</>}
              </button>
            )}
            {!board ? <p className="text-zinc-600 text-sm py-8 text-center">Loading…</p>
              : board.length === 0 ? <p className="text-zinc-600 text-sm py-8 text-center">No settled picks here yet — they show once matches finish.</p>
              : (
                <div className="space-y-2">
                  {board.map((r, i) => (
                    <div key={r.user_id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-zinc-600 font-bold w-5">{i + 1}</span>
                        <span className="font-bold truncate">{r.name}{r.user_id === user?.id && <span className="text-[10px] text-emerald-400 font-normal"> · you</span>}</span>
                      </div>
                      <span className="text-[12px] text-zinc-400">{r.won}/{r.total} · <span className="text-red-500 font-bold">{Math.round((r.won / r.total) * 100)}%</span></span>
                    </div>
                  ))}
                </div>
              )}
          </>
        ) : subTab === "mine" ? (
          /* ===== MY PICKS ===== */
          !user ? <p className="text-zinc-600 text-sm py-8 text-center">Sign in to track your picks.</p>
          : allPicks.length === 0 ? (
            <div className="text-center py-14">
              <Icon name="target" className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <div className="font-bold">No picks yet</div>
              <div className="text-sm text-zinc-500 mt-1">Head to Fixtures and call some results.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {allPicks.sort((a, b) => new Date(b.match_date || 0) - new Date(a.match_date || 0)).map((p) => {
                const c = p.status === "won" ? "check" : p.status === "lost" ? "x" : null;
                const tx = p.status === "won" ? "text-green-400" : p.status === "lost" ? "text-red-400" : "text-zinc-500";
                return (
                  <div key={p.match_id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{p.home_abbr} <span className="text-zinc-600 font-normal">v</span> {p.away_abbr}</div>
                      <div className="text-[11px] text-zinc-500">{p.match_date ? dayLabel(p.match_date) : ""} · your pick: <span className="text-zinc-300 font-semibold">{pickAbbr(p)}</span></div>
                    </div>
                    <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${tx}`}>
                      {c && <Icon name={c} className="w-3 h-3" strokeWidth={3} />}{p.status === "pending" ? "pending" : p.status.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : matches === null ? (
          <p className="text-zinc-600 text-sm py-8 text-center">Loading fixtures…</p>
        ) : fixtures.length === 0 && finished.length === 0 ? (
          <div className="text-center py-14">
            <Icon name="calendar" className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <div className="font-bold">No fixtures yet</div>
            <div className="text-sm text-zinc-500 mt-1">The schedule loads here once the World Cup draw is live.</div>
          </div>
        ) : (
          /* ===== FIXTURES ===== */
          <>
            {Object.keys(byDay).map((day) => (
              <div key={day} className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{day}</div>
                <div className="space-y-2">{byDay[day].map((mt) => <PickRow key={mt.id} mt={mt} />)}</div>
              </div>
            ))}
            {finished.length > 0 && (
              <div className="mt-2">
                <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5"><Icon name="list" className="w-3 h-3" /> Results</div>
                <div className="space-y-2">
                  {finished.slice(0, 30).map((mt) => {
                    const res = matchResult(mt.home, mt.away);
                    const p = picks[mt.id];
                    const got = p && (p.status === "won" || (p.status === "pending" && p.pick === res));
                    return (
                      <div key={mt.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold">
                          <span className={res === "home" ? "text-white" : "text-zinc-500"}>{mt.home.abbr} {mt.home.score}</span>
                          <span className="text-zinc-600">-</span>
                          <span className={res === "away" ? "text-white" : "text-zinc-500"}>{mt.away.score} {mt.away.abbr}</span>
                        </div>
                        {p ? (
                          <span className={`text-[11px] font-bold inline-flex items-center gap-1 ${got ? "text-green-400" : "text-red-400"}`}>
                            <Icon name={got ? "check" : "x"} className="w-3 h-3" strokeWidth={3} /> {pickAbbr(p)}
                          </span>
                        ) : <span className="text-[11px] text-zinc-600">no pick</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">{toast}</div>}
      <Nav />
    </div>
  );
}
