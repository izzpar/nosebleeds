"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Confetti from "@/components/Confetti";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";

const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };
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

export default function MatchRatingPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();

  const [data, setData] = useState(undefined);   // { match, players } | null
  const [community, setCommunity] = useState([]); // wc_match_ratings rows for this fixture
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [motm, setMotm] = useState(null);        // { id, name }
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(0);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  useEffect(() => {
    fetch(`/api/wc-match/${id}`).then((r) => r.json()).then((d) => setData(d.ok ? d : null)).catch(() => setData(null));
  }, [id]);

  const loadCommunity = useCallback(async () => {
    const rows = await sbJson(await sbFetch(`wc_match_ratings?fixture_id=eq.${id}&select=*`));
    setCommunity(rows);
    if (user) {
      const mine = rows.find((r) => r.user_id === user.id);
      if (mine) {
        setRating(Number(mine.rating) || 0);
        setReview(mine.review || "");
        setMotm(mine.motm_player_id ? { id: String(mine.motm_player_id), name: mine.motm_player_name || "" } : null);
      }
    }
  }, [id, user]);
  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  const match = data?.match;
  const players = useMemo(() => (data?.players || []).filter((p) => p.played), [data]);
  const canRate = match && match.status !== "upcoming";

  // ---- community aggregates ----
  const agg = useMemo(() => {
    const rated = community.filter((r) => r.rating != null);
    const n = rated.length;
    const avg = n ? rated.reduce((s, r) => s + Number(r.rating), 0) / n : null;
    const dist = Array(10).fill(0);
    rated.forEach((r) => { const b = Math.min(10, Math.max(1, Math.round(Number(r.rating)))); dist[b - 1]++; });
    const votes = {};
    community.forEach((r) => { if (r.motm_player_id) { const k = String(r.motm_player_id); (votes[k] = votes[k] || { n: 0, name: r.motm_player_name || k }); votes[k].n++; } });
    const totalVotes = Object.values(votes).reduce((s, v) => s + v.n, 0);
    const starMen = Object.entries(votes).map(([pid, v]) => ({ pid, name: v.name, n: v.n, pct: totalVotes ? Math.round((v.n / totalVotes) * 100) : 0 })).sort((a, b) => b.n - a.n).slice(0, 5);
    const reviews = community.filter((r) => (r.review || "").trim()).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 20);
    return { n, avg, dist, starMen, reviews };
  }, [community]);

  const save = async () => {
    if (!user) { router.push("/login"); return; }
    if (saving) return;
    if (!rating) { flash("Pick a rating 1–10"); return; }
    setSaving(true);
    try {
      const res = await sbFetch("wc_match_ratings?on_conflict=user_id,fixture_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: user.id, fixture_id: String(id), rating, review: review.trim() || null,
          motm_player_id: motm?.id || null, motm_player_name: motm?.name || null,
          handle: profile?.handle || user.email?.split("@")[0],
          display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
          updated_at: new Date().toISOString(),
        }),
      });
      if (res.ok) { setCelebrate((c) => c + 1); flash("Rating saved ✓"); await loadCommunity(); }
      else flash("Couldn't save");
    } catch (e) { flash("Couldn't save"); } finally { setSaving(false); }
  };

  const nameOf = (r) => r.display_name || r.handle || "Player";

  if (data === undefined) return <Shell><p className="text-zinc-600 text-sm py-10">Loading…</p></Shell>;
  if (data === null || !match) return <Shell><p className="text-zinc-500 py-10">Match not found.</p></Shell>;

  const showScore = match.status !== "upcoming";
  const homeP = players.filter((p) => p.team_id === match.home?.id);
  const awayP = players.filter((p) => p.team_id === match.away?.id);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup/matches")} className="text-zinc-500 text-xl leading-none">‹</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold leading-tight truncate">{match.round || "World Cup"}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">{match.status === "live" ? `● LIVE ${match.state_label}` : match.status === "finished" ? "Full time" : fmtKick(match.kickoff)}</p>
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

        {!canRate ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-8 text-center text-sm text-zinc-400">
            ⏳ Ratings open at kickoff. Come back during or after the match to rate it and pick your Star Man.
          </div>
        ) : (
          <>
            {/* Your rating */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your rating</h2>
              <div className="grid grid-cols-10 gap-1 mb-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                  <button key={v} onClick={() => setRating(v)}
                    className={`aspect-square rounded-lg text-sm font-bold transition-all ${rating === v ? "text-white scale-105 ring-2 ring-white/40" : "text-white/80"}`}
                    style={{ backgroundColor: rating >= v ? rc(rating) : "#27272a" }}>
                    {v}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-zinc-500 mb-3">{rating ? `${rating}/10 — tap to change` : "Tap a number 1 (snooze-fest) to 10 (instant classic)"}</div>

              <textarea value={review} onChange={(e) => setReview(e.target.value)} maxLength={280} rows={2}
                placeholder="Optional: a quick take on the game…"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-600 mb-3" />

              {/* Star Man */}
              <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">⭐ Star Man {motm && <span className="text-zinc-400 font-normal normal-case">· {motm.name}</span>}</h3>
              {players.length === 0 ? (
                <p className="text-[12px] text-zinc-600 mb-1">Player list appears once the lineup data lands.</p>
              ) : (
                <div className="space-y-3 mb-1">
                  {[["home", match.home, homeP], ["away", match.away, awayP]].map(([k, team, ps]) => (
                    <div key={k}>
                      <div className="text-[10px] text-zinc-500 font-bold mb-1 flex items-center gap-1.5">{team?.logo && <img src={team.logo} alt="" className="w-3.5 h-3.5 object-contain" />}{team?.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ps.map((p) => {
                          const onSel = motm?.id === p.id;
                          return (
                            <button key={p.id} onClick={() => setMotm(onSel ? null : { id: p.id, name: p.name })}
                              className={`text-[12px] px-2.5 py-1 rounded-full border ${onSel ? "bg-red-600 border-red-500 text-white" : "bg-zinc-800/70 border-zinc-700 text-zinc-300"}`}>
                              <span className={`${POS_COLOR[p.role]} mr-1`}>{p.role}</span>{p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={save} disabled={saving} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl mt-3">
                {saving ? "Saving…" : community.some((r) => r.user_id === user?.id) ? "Update rating" : user ? "Submit rating" : "Sign in to rate"}
              </button>
            </div>

            {/* Community */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-3">The crowd ({agg.n})</h2>
              {agg.n === 0 ? (
                <p className="text-[13px] text-zinc-500">No ratings yet — be the first!</p>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl shrink-0" style={{ backgroundColor: rc(agg.avg) }}>{agg.avg.toFixed(1)}</div>
                    <div className="flex-1">
                      <div className="flex gap-0.5 items-end h-10">
                        {agg.dist.map((c, i) => {
                          const mx = Math.max(...agg.dist, 1);
                          return <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max((c / mx) * 100, c ? 12 : 0)}%`, backgroundColor: c ? rc(i + 1) : "#27272a", minHeight: c ? 4 : 2 }} title={`${i + 1}: ${c}`} />;
                        })}
                      </div>
                      <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5"><span>1</span><span>10</span></div>
                    </div>
                  </div>

                  {agg.starMen.length > 0 && (
                    <div className="mb-1">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">⭐ Star Man votes</div>
                      <div className="space-y-1">
                        {agg.starMen.map((s, i) => (
                          <div key={s.pid} className="flex items-center gap-2">
                            <span className="text-[12px] text-zinc-300 truncate flex-1">{i === 0 ? "👑 " : ""}{s.name}</span>
                            <div className="w-24 h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${s.pct}%` }} /></div>
                            <span className="text-[11px] text-zinc-500 w-9 text-right">{s.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

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
                        {r.motm_player_name && <span className="text-[10px] text-zinc-500 ml-auto">⭐ {r.motm_player_name}</span>}
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
