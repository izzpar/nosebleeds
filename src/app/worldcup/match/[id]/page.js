"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Confetti from "@/components/Confetti";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";

const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };
const POS_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
function rc(r) {
  const n = Math.round(r);
  if (n <= 1) return "#7f1d1d"; if (n === 2) return "#dc2626"; if (n === 3) return "#f87171";
  if (n === 4) return "#fb923c"; if (n === 5) return "#fbbf24"; if (n === 6) return "#facc15";
  if (n === 7) return "#a3e635"; if (n === 8) return "#4ade80"; if (n === 9) return "#22c55e";
  return "#15803d";
}
function fmtKick(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// A 1–10 tap scale that fills up to the chosen value.
function Scale10({ value, onPick }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
        <button key={v} onClick={() => onPick(v)}
          className={`aspect-square rounded-lg text-sm font-bold transition-all ${value === v ? "text-white scale-105 ring-2 ring-white/40" : "text-white/80"}`}
          style={{ backgroundColor: value >= v ? rc(value) : "#27272a" }}>
          {v}
        </button>
      ))}
    </div>
  );
}

export default function MatchRatingPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();

  const [data, setData] = useState(undefined);    // { match, players } | null
  const [community, setCommunity] = useState([]); // wc_match_ratings rows
  const [playerRows, setPlayerRows] = useState([]); // wc_player_ratings rows (all users)
  const [rating, setRating] = useState(0);
  const [hype, setHype] = useState(0);
  const [review, setReview] = useState("");
  const [myPR, setMyPR] = useState({});           // player_id -> my rating
  const [openPlayer, setOpenPlayer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(0);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  useEffect(() => {
    fetch(`/api/wc-match/${id}`).then((r) => r.json()).then((d) => setData(d.ok ? d : null)).catch(() => setData(null));
  }, [id]);

  const loadCommunity = useCallback(async () => {
    const [mrows, prows] = await Promise.all([
      sbJson(await sbFetch(`wc_match_ratings?fixture_id=eq.${id}&select=*`)),
      sbJson(await sbFetch(`wc_player_ratings?fixture_id=eq.${id}&select=*`)),
    ]);
    setCommunity(mrows);
    setPlayerRows(prows);
    if (user) {
      const mine = mrows.find((r) => r.user_id === user.id);
      if (mine) { setRating(Number(mine.rating) || 0); setHype(Number(mine.hype) || 0); setReview(mine.review || ""); }
      const myp = {};
      prows.filter((r) => r.user_id === user.id).forEach((r) => { myp[String(r.player_id)] = Number(r.rating); });
      setMyPR(myp);
    }
  }, [id, user]);
  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  const match = data?.match;
  const players = useMemo(() => {
    const ps = (data?.players || []).filter((p) => p.played);
    return ps.sort((a, b) => (POS_ORDER[a.role] - POS_ORDER[b.role]) || (b.minutes - a.minutes));
  }, [data]);
  const isPre = match && match.status === "upcoming";

  // ---- community aggregates ----
  const agg = useMemo(() => {
    const ent = community.filter((r) => r.rating != null);
    const hy = community.filter((r) => r.hype != null);
    const mean = (arr, key) => (arr.length ? arr.reduce((s, r) => s + Number(r[key]), 0) / arr.length : null);
    const distOf = (arr, key) => { const d = Array(10).fill(0); arr.forEach((r) => { const b = Math.min(10, Math.max(1, Math.round(Number(r[key])))); d[b - 1]++; }); return d; };

    // per-player averages
    const byP = {};
    playerRows.forEach((r) => { const k = String(r.player_id); (byP[k] = byP[k] || { sum: 0, n: 0, name: r.player_name }); byP[k].sum += Number(r.rating); byP[k].n += 1; if (r.player_name) byP[k].name = r.player_name; });
    const playerAvg = {}; Object.entries(byP).forEach(([k, v]) => { playerAvg[k] = { avg: v.sum / v.n, n: v.n, name: v.name }; });
    // Star Man = best average with at least 1 vote
    let motm = null;
    Object.entries(playerAvg).forEach(([k, v]) => { if (!motm || v.avg > motm.avg) motm = { pid: k, ...v }; });

    const reviews = community.filter((r) => (r.review || "").trim()).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 20);
    return {
      entN: ent.length, entAvg: mean(ent, "rating"), entDist: distOf(ent, "rating"),
      hypeN: hy.length, hypeAvg: mean(hy, "hype"), hypeDist: distOf(hy, "hype"),
      playerAvg, motm, reviews,
    };
  }, [community, playerRows]);

  // ---- saves ----
  const upsertMatch = async (patch) => {
    if (!user) { router.push("/login"); return false; }
    const res = await sbFetch("wc_match_ratings?on_conflict=user_id,fixture_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: user.id, fixture_id: String(id),
        handle: profile?.handle || user.email?.split("@")[0],
        display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
        updated_at: new Date().toISOString(), ...patch,
      }),
    });
    return res.ok;
  };

  const saveHype = async () => {
    if (!hype) { flash("Pick a hype level 1–10"); return; }
    if (saving) return; setSaving(true);
    try { const ok = await upsertMatch({ hype }); if (ok) { setCelebrate((c) => c + 1); flash("Hype locked in 🔥"); await loadCommunity(); } else flash("Couldn't save"); }
    finally { setSaving(false); }
  };

  const saveMatch = async () => {
    if (!rating) { flash("Pick a rating 1–10"); return; }
    if (saving) return; setSaving(true);
    try { const ok = await upsertMatch({ rating, review: review.trim() || null }); if (ok) { setCelebrate((c) => c + 1); flash("Rating saved ✓"); await loadCommunity(); } else flash("Couldn't save"); }
    finally { setSaving(false); }
  };

  const ratePlayer = async (p, value) => {
    if (!user) { router.push("/login"); return; }
    setMyPR((m) => ({ ...m, [p.id]: value }));
    setOpenPlayer(null);
    try {
      const res = await sbFetch("wc_player_ratings?on_conflict=user_id,fixture_id,player_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: user.id, fixture_id: String(id), player_id: String(p.id),
          player_name: p.name, team_id: String(p.team_id || ""), rating: value, updated_at: new Date().toISOString(),
        }),
      });
      if (res.ok) await loadCommunity(); else flash("Couldn't save player rating");
    } catch (e) { flash("Couldn't save"); }
  };

  const nameOf = (r) => r.display_name || r.handle || "Player";

  if (data === undefined) return <Shell><p className="text-zinc-600 text-sm py-10">Loading…</p></Shell>;
  if (data === null || !match) return <Shell><p className="text-zinc-500 py-10">Match not found.</p></Shell>;

  const showScore = match.status !== "upcoming";
  const myRatedCount = Object.keys(myPR).length;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup/matches")} className="text-zinc-500 text-xl leading-none">‹</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold leading-tight truncate">{match.round || "World Cup"}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">{match.status === "live" ? `● LIVE ${match.state_label}` : match.status === "finished" ? "Full time" : "Pre-match"}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Scoreline */}
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-900/40 border border-zinc-800 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <Team t={match.home} />
            <div className="text-center shrink-0">
              {showScore
                ? <div className="text-3xl font-extrabold tabular-nums">{match.score?.home ?? 0}<span className="text-zinc-600 mx-1">-</span>{match.score?.away ?? 0}</div>
                : <div className="text-[11px] text-zinc-500 font-bold">{fmtKick(match.kickoff)}</div>}
            </div>
            <Team t={match.away} />
          </div>
        </div>

        {isPre ? (
          /* -------- Pregame hype -------- */
          <>
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-1">🔥 How hyped are you?</h2>
              <p className="text-[12px] text-zinc-500 mb-3">Rate the hype before kickoff. The match &amp; player ratings open once it&apos;s underway.</p>
              <Scale10 value={hype} onPick={setHype} />
              <div className="text-[11px] text-zinc-500 mt-1 mb-3">{hype ? `${hype}/10 hype` : "1 (meh) → 10 (can't wait)"}</div>
              <button onClick={saveHype} disabled={saving} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl">
                {saving ? "Saving…" : community.some((r) => r.user_id === user?.id && r.hype != null) ? "Update hype" : user ? "Lock in hype" : "Sign in to rate hype"}
              </button>
            </div>
            <Crowd title={`Hype meter (${agg.hypeN})`} avg={agg.hypeAvg} dist={agg.hypeDist} empty="No hype votes yet — be the first!" />
          </>
        ) : (
          /* -------- Live / finished: match + player ratings -------- */
          <>
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Rate the match</h2>
              <Scale10 value={rating} onPick={setRating} />
              <div className="text-[11px] text-zinc-500 mt-1 mb-3">{rating ? `${rating}/10` : "1 (snooze-fest) → 10 (instant classic)"}</div>
              <textarea value={review} onChange={(e) => setReview(e.target.value)} maxLength={280} rows={2}
                placeholder="Optional: a quick take on the game…"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-600 mb-3" />
              <button onClick={saveMatch} disabled={saving} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl">
                {saving ? "Saving…" : community.some((r) => r.user_id === user?.id && r.rating != null) ? "Update rating" : user ? "Submit rating" : "Sign in to rate"}
              </button>
            </div>

            {/* Player ratings */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Player ratings</h2>
                {myRatedCount > 0 && <span className="text-[10px] text-zinc-500">you rated {myRatedCount}</span>}
              </div>
              {players.length === 0 ? (
                <p className="text-[12px] text-zinc-600">Player list appears once the lineup data lands (usually at kickoff).</p>
              ) : (
                <>
                  <p className="text-[11px] text-zinc-600 mb-2">Tap a player to score their performance 1–10. 👑 = crowd&apos;s Star Man.</p>
                  {[["home", match.home], ["away", match.away]].map(([k, team]) => {
                    const ps = players.filter((p) => p.team_id === team?.id);
                    if (ps.length === 0) return null;
                    return (
                      <div key={k} className="mb-3">
                        <div className="text-[10px] text-zinc-500 font-bold mb-1.5 flex items-center gap-1.5">{team?.logo && <img src={team.logo} alt="" className="w-3.5 h-3.5 object-contain" />}{team?.name}</div>
                        <div className="space-y-1">
                          {ps.map((p) => {
                            const mine = myPR[p.id];
                            const ca = agg.playerAvg[p.id];
                            const isMotm = agg.motm && agg.motm.pid === p.id && agg.motm.n >= 1;
                            const open = openPlayer === p.id;
                            return (
                              <div key={p.id} className={`rounded-lg border ${open ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 bg-zinc-900/50"}`}>
                                <button onClick={() => setOpenPlayer(open ? null : p.id)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
                                  <span className={`text-[10px] font-bold w-7 ${POS_COLOR[p.role]}`}>{p.role}</span>
                                  <span className="text-sm flex-1 truncate">{isMotm && "👑 "}{p.name}</span>
                                  {ca && <span className="text-[10px] text-zinc-500">avg <span className="font-bold" style={{ color: rc(ca.avg) }}>{ca.avg.toFixed(1)}</span> · {ca.n}</span>}
                                  <span className="w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-bold shrink-0" style={{ backgroundColor: mine ? rc(mine) : "#27272a", color: mine ? "#fff" : "#71717a" }}>{mine || "–"}</span>
                                </button>
                                {open && (
                                  <div className="px-2.5 pb-2">
                                    <Scale10 value={mine || 0} onPick={(v) => ratePlayer(p, v)} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <Crowd title={`The crowd (${agg.entN})`} avg={agg.entAvg} dist={agg.entDist} empty="No match ratings yet — be the first!" />

            {/* Reviews */}
            {agg.reviews.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Reviews</h2>
                <div className="space-y-2">
                  {agg.reviews.map((r, i) => (
                    <div key={i} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[11px] font-bold" style={{ backgroundColor: rc(r.rating) }}>{Number(r.rating).toFixed(0)}</div>
                        <span className="text-[12px] font-bold">{nameOf(r)}</span>
                      </div>
                      <p className="text-[13px] text-zinc-300 leading-snug">{r.review}</p>
                    </div>
                  ))}
                </div>
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

function Crowd({ title, avg, dist, empty }) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-3">{title}</h2>
      {avg == null ? (
        <p className="text-[13px] text-zinc-500">{empty}</p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl shrink-0" style={{ backgroundColor: rc(avg) }}>{avg.toFixed(1)}</div>
          <div className="flex-1">
            <div className="flex gap-0.5 items-end h-10">
              {dist.map((c, i) => {
                const mx = Math.max(...dist, 1);
                return <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max((c / mx) * 100, c ? 12 : 0)}%`, backgroundColor: c ? rc(i + 1) : "#27272a", minHeight: c ? 4 : 2 }} title={`${i + 1}: ${c}`} />;
              })}
            </div>
            <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5"><span>1</span><span>10</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Team({ t }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
      {t?.logo ? <img src={t.logo} alt="" className="w-10 h-10 object-contain" /> : <div className="w-10 h-10 rounded-full bg-zinc-800" />}
      <span className="text-[12px] font-bold text-center truncate w-full">{t?.name}</span>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">{children}</div>
      <Nav />
    </div>
  );
}
