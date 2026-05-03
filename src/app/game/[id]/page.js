"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

function rc(r) {
  if (r >= 9) return "#22c55e";
  if (r >= 7) return "#dc2626";
  if (r >= 5) return "#eab308";
  if (r >= 3) return "#f97316";
  return "#ef4444";
}

function autoMoods(g) {
  const m = [];
  if (g.total >= 55) m.push("🔥 Shootout");
  if (g.diff <= 3 && g.isFinal) m.push("🎯 Clutch");
  if (g.diff >= 21) m.push("💨 Blowout");
  if (g.ot) m.push("⏱️ OT");
  if (g.total <= 30 && g.isFinal) m.push("🛡️ Defensive");
  return m;
}

async function fetchGame(id) {
  try {
    const r = await fetch(`${ESPN}/summary?event=${id}`);
    const d = await r.json();
    const c = d.header?.competitions?.[0];
    if (!c) return null;
    const ts = c.competitors || [];
    const ho = ts.find((t) => t.homeAway === "home");
    const aw = ts.find((t) => t.homeAway === "away");
    if (!ho || !aw) return null;

    const players = [];
    (d.leaders || []).forEach((tl) => {
      const tm = tl.team?.abbreviation || "";
      (tl.leaders || []).forEach((cat) => {
        (cat.leaders || []).slice(0, 2).forEach((l) => {
          const name = l.athlete?.displayName;
          if (name && !players.find((p) => p.name === name))
            players.push({ name, tm, stat: l.displayValue, cat: cat.displayName });
        });
      });
    });

    if (players.length < 4) {
      (d.boxscore?.players || []).forEach((team) => {
        const tm = team.team?.abbreviation || "";
        (team.statistics || []).forEach((sg) => {
          (sg.athletes || []).slice(0, 3).forEach((a) => {
            const name = a.athlete?.displayName;
            if (name && !players.find((p) => p.name === name))
              players.push({ name, tm, stat: (a.stats || []).join(", "), cat: sg.name });
          });
        });
      });
    }

    const teams = new Set(players.map((p) => p.tm));
    teams.forEach((tm) => players.push({ name: `${tm} Defense`, tm }));

    const st = c.status?.type?.name || "STATUS_FINAL";
    return {
      id, status: st,
      isPre: st === "STATUS_SCHEDULED", isFinal: st === "STATUS_FINAL",
      date: c.date, venue: d.gameInfo?.venue?.fullName || "",
      week: d.header?.week || 0, season: d.header?.season?.year || 2024,
      net: c.broadcasts?.[0]?.names?.[0] || "",
      home: {
        name: ho.team?.displayName || "", abbr: ho.team?.abbreviation || "",
        color: "#" + (ho.team?.color || "333"), logo: ho.team?.logos?.[0]?.href || "",
        record: ho.record?.[0]?.displayValue || "", score: parseInt(ho.score) || 0,
        q: (ho.linescores || []).map((q) => q.displayValue),
        leaders: players.filter((p) => p.tm === ho.team?.abbreviation).slice(0, 3),
      },
      away: {
        name: aw.team?.displayName || "", abbr: aw.team?.abbreviation || "",
        color: "#" + (aw.team?.color || "333"), logo: aw.team?.logos?.[0]?.href || "",
        record: aw.record?.[0]?.displayValue || "", score: parseInt(aw.score) || 0,
        q: (aw.linescores || []).map((q) => q.displayValue),
        leaders: players.filter((p) => p.tm === aw.team?.abbreviation).slice(0, 3),
      },
      players,
      ot: (ho.linescores || []).length > 4,
      diff: Math.abs((parseInt(ho.score) || 0) - (parseInt(aw.score) || 0)),
      total: (parseInt(ho.score) || 0) + (parseInt(aw.score) || 0),
      odds: d.pickcenter?.[0]?.details || "", ou: d.pickcenter?.[0]?.overUnder || "",
    };
  } catch (e) { console.error(e); return null; }
}

export default function GamePage({ params }) {
  const { id } = use(params);
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("games");
  const [phase, setPhase] = useState("post");
  const [step, setStep] = useState(0);
  const [showWiz, setShowWiz] = useState(false);
  const [rating, setRating] = useState(7);
  const [refR, setRefR] = useState(5);
  const [entR, setEntR] = useState(7);
  const [mvp, setMvp] = useState("");
  const [letdown, setLetdown] = useState("");
  const [watchHow, setWatchHow] = useState("");
  const [worthIt, setWorthIt] = useState("");
  const [review, setReview] = useState("");
  const [logged, setLogged] = useState(false);
  const [fav, setFav] = useState(false);
  const [chatFilter, setChatFilter] = useState("all");
  const [liveIn, setLiveIn] = useState("");
  const [liveChat, setLiveChat] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchGame(id);
      setGame(data);
      if (data) {
        setLiveChat([
          { u: "GridironGuru", t: "What a game! 🔥", ago: "2h", c: "#3b82f6", tm: data.away.abbr },
          { u: "ChiefsKingdom", t: "Defense showed up when it mattered", ago: "3h", c: "#e11d48", tm: data.home.abbr },
          { u: "NFLFanatic", t: "That 4th quarter was insane", ago: "4h", c: "#22c55e", tm: "" },
        ]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  useEffect(() => {
    async function loadRating() {
      try {
        const { data } = await supabase.from("ratings").select("*").eq("game_id", id).limit(1);
        if (data && data.length > 0) {
          const r = data[0];
          setRating(r.rating || 7);
          setRefR(r.ref_rating || 5);
          setEntR(r.ent_rating || 7);
          setMvp(r.mvp || "");
          setLetdown(r.letdown || "");
          setWatchHow(r.watch_how || "");
          setWorthIt(r.worth_it || "");
          setReview(r.review || "");
          setLogged(true);
        }
      } catch (e) { console.error("Load error:", e); }
    }
    loadRating();
  }, [id]);


  const sendMsg = () => {
    if (!liveIn.trim()) return;
    setLiveChat((p) => [{ u: "Isaac", t: liveIn, ago: "now", c: "#dc2626", tm: "" }, ...p]);
    setLiveIn("");
  };

  const submitLog = async () => {
    const ratingData = {
      game_id: id,
      rating: rating,
      ref_rating: refR,
      ent_rating: entR,
      mvp: mvp || null,
      letdown: letdown || null,
      watch_how: watchHow || null,
      worth_it: worthIt || null,
      review: review || null,
      season: game?.season,
      week: game?.week,
    };
    try {
      const { data: existing } = await supabase.from("ratings").select("id").eq("game_id", id).limit(1);
      if (existing && existing.length > 0) {
        await supabase.from("ratings").update(ratingData).eq("id", existing[0].id);
      } else {
        await supabase.from("ratings").insert(ratingData);
      }
    } catch (e) { console.error("Save error:", e); }
    setLogged(true); setShowWiz(false); setStep(0);
  };

  const filteredChat = chatFilter === "all" ? liveChat : liveChat.filter((m) => chatFilter === "neutral" ? !m.tm : m.tm === chatFilter);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-zinc-500">Loading game...</div></div>;
  if (!game) return <div className="min-h-screen flex flex-col items-center justify-center gap-4"><div className="text-4xl">😕</div><div className="text-zinc-500">Game not found</div><Link href="/" className="text-red-400 text-sm font-semibold">← Back to games</Link></div>;

  const g = game, a = g.away, h = g.home;
  const moods = autoMoods(g);
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${a.name} vs ${h.name} Week ${g.week} ${g.season} highlights NFL`)}`;
  const steps = ["Rating", "Details", "MVP", "Extras"];

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="text-sm font-bold text-white flex-1 text-center">{a.abbr} vs {h.abbr} · Wk {g.week}</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Scoreboard */}
        <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-4">
          <div className="h-1" style={{ background: `linear-gradient(90deg, ${a.color}, ${h.color})` }} />
          <div className="p-5">
            <div className="text-center text-[10px] font-semibold text-zinc-500 tracking-widest uppercase mb-1">
              Week {g.week} · {g.net} · {new Date(g.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
            {g.venue && <div className="text-center text-[10px] text-zinc-600 mb-4">{g.venue}</div>}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center flex-1">
                {a.logo && <img src={a.logo} className="w-14 h-14 object-contain mx-auto" />}
                <div className="text-4xl font-extrabold mt-2 tabular-nums" style={{ color: a.score < h.score ? "#52525b" : "#fafafa" }}>{g.isPre ? "—" : a.score}</div>
                <div className="text-xs font-semibold text-zinc-400 mt-1">{a.name}</div>
                <div className="text-[10px] text-zinc-600">{a.record}</div>
              </div>
              <div className="text-[10px] font-bold text-zinc-600 tracking-widest">{g.isPre ? "" : `FINAL${g.ot ? "/OT" : ""}`}</div>
              <div className="text-center flex-1">
                {h.logo && <img src={h.logo} className="w-14 h-14 object-contain mx-auto" />}
                <div className="text-4xl font-extrabold mt-2 tabular-nums" style={{ color: h.score > a.score ? "#fafafa" : "#52525b" }}>{g.isPre ? "—" : h.score}</div>
                <div className="text-xs font-semibold text-zinc-400 mt-1">{h.name}</div>
                <div className="text-[10px] text-zinc-600">{h.record}</div>
              </div>
            </div>
            {h.q.length > 0 && (
              <div className="flex justify-center gap-0 mt-4 pt-3 border-t border-zinc-800">
                {h.q.map((q, i) => (
                  <div key={i} className="text-center px-2" style={{ borderRight: i < h.q.length - 1 ? "1px solid #27272a" : "none" }}>
                    <div className="text-[8px] text-zinc-600 font-bold">{i < 4 ? `Q${i + 1}` : "OT"}</div>
                    <div className="text-[10px] font-semibold text-zinc-400">{a.q[i] ?? "-"}</div>
                    <div className="text-[10px] font-semibold text-zinc-400">{q ?? "-"}</div>
                  </div>
                ))}
                <div className="text-center px-2">
                  <div className="text-[8px] text-zinc-600 font-bold">F</div>
                  <div className="text-[10px] font-extrabold text-white">{a.score}</div>
                  <div className="text-[10px] font-extrabold text-white">{h.score}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Phase tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-900 p-1 rounded-full">
          {[{ id: "pre", l: "📋 Pre-Game" }, { id: "live", l: "💬 Discussion" }, { id: "post", l: "📊 Post-Game" }].map((p) => (
            <button key={p.id} onClick={() => setPhase(p.id)} className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all ${phase === p.id ? "bg-red-600 text-white" : "text-zinc-500"}`}>{p.l}</button>
          ))}
        </div>

        {/* Action buttons */}
        {phase !== "pre" && !showWiz && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => setShowWiz(true)} className={`flex-1 py-3 rounded-xl font-bold text-sm ${logged ? "border-2 border-red-600 text-red-400" : "bg-red-600 text-white"}`}>
              {logged ? "✓ Edit Rating" : "⭐ Rate Match"}
            </button>
            <button onClick={() => setFav(!fav)} className="px-4 py-3 rounded-xl border border-zinc-800 flex flex-col items-center gap-0.5" style={{ backgroundColor: fav ? "rgba(239,68,68,0.1)" : "transparent" }}>
              <span className="text-sm">{fav ? "❤️" : "🤍"}</span>
              <span className={`text-[8px] font-bold ${fav ? "text-red-400" : "text-zinc-600"}`}>Fave</span>
            </button>
            <button className="px-4 py-3 rounded-xl border border-zinc-800 flex flex-col items-center gap-0.5">
              <span className="text-sm">📌</span><span className="text-[8px] font-bold text-zinc-600">Pin</span>
            </button>
            <button className="px-4 py-3 rounded-xl border border-zinc-800 flex flex-col items-center gap-0.5">
              <span className="text-sm">📋</span><span className="text-[8px] font-bold text-zinc-600">List</span>
            </button>
          </div>
        )}

        {/* PRE-GAME */}
        {phase === "pre" && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
            <h3 className="font-bold text-white text-sm mb-3">Matchup Preview</h3>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div className="text-center p-3 rounded-xl bg-zinc-950">
                {a.logo && <img src={a.logo} className="w-10 h-10 mx-auto" />}
                <div className="text-lg font-extrabold text-white mt-2">{a.record}</div>
                <div className="text-[10px] text-zinc-400">{a.name}</div>
              </div>
              <div className="text-xs font-bold text-zinc-600">VS</div>
              <div className="text-center p-3 rounded-xl bg-zinc-950">
                {h.logo && <img src={h.logo} className="w-10 h-10 mx-auto" />}
                <div className="text-lg font-extrabold text-white mt-2">{h.record}</div>
                <div className="text-[10px] text-zinc-400">{h.name}</div>
              </div>
            </div>
            {g.odds && (
              <div className="mt-3 p-3 rounded-xl bg-zinc-950 flex justify-between">
                <div><div className="text-[9px] font-bold text-zinc-600">SPREAD</div><div className="text-sm font-bold text-white">{g.odds}</div></div>
                {g.ou && <div className="text-right"><div className="text-[9px] font-bold text-zinc-600">O/U</div><div className="text-sm font-bold text-white">{g.ou}</div></div>}
              </div>
            )}
          </div>
        )}

        {/* DISCUSSION */}
        {phase === "live" && (
          <div>
            <div className="flex gap-2 mb-3 overflow-x-auto">
              {[{ id: "all", l: "All Fans" }, { id: a.abbr, l: `${a.abbr} Fans` }, { id: h.abbr, l: `${h.abbr} Fans` }, { id: "neutral", l: "Neutrals" }].map((f) => (
                <button key={f.id} onClick={() => setChatFilter(f.id)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 border ${chatFilter === f.id ? "bg-red-600/10 text-red-400 border-red-600/30" : "text-zinc-500 border-zinc-800"}`}>{f.l}</button>
              ))}
            </div>
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex gap-2 mb-3">
                <input value={liveIn} onChange={(e) => setLiveIn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMsg()} placeholder="Share your take..."
                  className="flex-1 px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm outline-none focus:border-red-600" />
                <button onClick={sendMsg} className="px-4 rounded-xl bg-red-600 text-white font-bold">→</button>
              </div>
              {filteredChat.map((m, i) => (
                <div key={i} className="p-3 rounded-xl bg-zinc-950 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: m.c }}>{m.u[0]}</div>
                    <span className={`text-xs font-bold ${m.u === "Isaac" ? "text-red-400" : "text-white"}`}>{m.u}</span>
                    {m.tm && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-semibold">{m.tm}</span>}
                    <span className="text-[10px] text-zinc-600 ml-auto">{m.ago}</span>
                  </div>
                  <div className="text-sm text-zinc-400 pl-7">{m.t}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* POST-GAME */}
        {phase === "post" && (
          <div>
            {/* YouTube Highlights */}
            {g.isFinal && (
              <div onClick={() => window.open(ytUrl, "_blank")} className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 mb-4 hover:-translate-y-0.5 transition-transform cursor-pointer">
                <div className="w-12 h-9 rounded-lg bg-red-600 flex items-center justify-center text-xl shrink-0">▶</div>
                <div>
                  <div className="text-sm font-bold text-white">Watch Highlights</div>
                  <div className="text-[11px] text-zinc-500">{a.abbr} vs {h.abbr} Week {g.week} highlights on YouTube</div>
                </div>
              </div>
            )}

            {/* Top Performers */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <h3 className="font-bold text-white text-sm mb-3">🏆 Top Performers</h3>
              <div className="grid grid-cols-2 gap-4">
                {[a, h].map((t) => (
                  <div key={t.abbr}>
                    <div className="text-[9px] font-extrabold tracking-widest uppercase mb-2" style={{ color: t.color }}>{t.abbr}</div>
                    {t.leaders.filter((l) => l.name && !l.name.includes("Defense")).map((p, i) => (
                      <div key={i} className="mb-2 p-2.5 rounded-lg bg-zinc-950">
                        <div className="text-xs font-bold text-white">{p.name}</div>
                        <div className="text-[10px] text-zinc-500">{p.stat}</div>
                      </div>
                    ))}
                    {t.leaders.filter((l) => l.name && !l.name.includes("Defense")).length === 0 && <div className="text-[11px] text-zinc-600 p-2">No data</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Game Mood */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
              <h3 className="font-bold text-white text-sm mb-2">🎭 Game Mood</h3>
              <div className="flex gap-1.5 flex-wrap">
                {["🔥 Shootout", "💪 Comeback", "⏱️ OT", "🛡️ Defensive", "💨 Blowout", "🎯 Clutch", "🌟 Classic", "😤 Controversial"].map((m) => {
                  const active = moods.includes(m);
                  return <span key={m} className={`text-[11px] px-3 py-1.5 rounded-full font-semibold ${active ? "bg-red-600/10 text-red-400 border border-red-600/30" : "bg-zinc-950 text-zinc-600 border border-transparent"}`}>{m}</span>;
                })}
              </div>
            </div>

            {/* Rating Wizard */}
            {showWiz && (
              <div className="rounded-2xl bg-zinc-900 border-2 border-red-600 p-5 mb-4">
                <div className="flex items-center justify-center gap-3 mb-5">
                  {steps.map((s, i) => (
                    <div key={s} className="flex items-center gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="rounded-full transition-all" style={{ width: i === step ? 12 : 8, height: i === step ? 12 : 8, backgroundColor: i <= step ? "#dc2626" : "#27272a" }} />
                        <span className={`text-[9px] font-semibold ${i <= step ? "text-red-400" : "text-zinc-600"}`}>{s}</span>
                      </div>
                      {i < steps.length - 1 && <div className="w-6 h-0.5 rounded-full mb-4" style={{ backgroundColor: i < step ? "#dc2626" : "#27272a" }} />}
                    </div>
                  ))}
                </div>

                {step === 0 && (
                  <div>
                    <div className="text-center mb-4">
                      <div className="text-6xl font-extrabold" style={{ color: rc(rating) }}>{rating}</div>
                      <div className="text-sm font-bold mt-1" style={{ color: rc(rating) }}>{rating >= 9 ? "INSTANT CLASSIC" : rating >= 7 ? "GREAT GAME" : rating >= 5 ? "DECENT" : rating >= 3 ? "MEH" : "TERRIBLE"}</div>
                    </div>
                    <input type="range" min="1" max="10" step="0.5" value={rating} onChange={(e) => setRating(parseFloat(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, ${rc(rating)} ${((rating - 1) / 9) * 100}%, #27272a ${((rating - 1) / 9) * 100}%)` }} />
                    <div className="flex justify-between mt-1"><span className="text-[10px] text-zinc-600">1</span><span className="text-[10px] text-zinc-600">10</span></div>
                    <div className="mt-5">
                      <div className="text-sm font-semibold text-white text-center mb-3">Was it worth watching?</div>
                      <div className="flex gap-2 justify-center">
                        {[{ v: "yes", l: "👍 Yes", c: "#22c55e" }, { v: "no", l: "👎 No", c: "#ef4444" }, { v: "meh", l: "😐 Meh", c: "#eab308" }].map((o) => (
                          <button key={o.v} onClick={() => setWorthIt(o.v)} className="px-5 py-2.5 rounded-xl text-sm font-bold"
                            style={{ border: worthIt === o.v ? `2px solid ${o.c}` : "2px solid #27272a", backgroundColor: worthIt === o.v ? o.c + "15" : "transparent", color: worthIt === o.v ? o.c : "#71717a" }}>{o.l}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div>
                    <div className="text-sm font-bold text-white text-center mb-4">How were the details?</div>
                    {[{ l: "🏁 Ref Performance", v: refR, s: setRefR }, { l: "🎬 Entertainment Value", v: entR, s: setEntR }].map(({ l, v, s }) => (
                      <div key={l} className="mb-5 p-4 rounded-xl bg-zinc-950">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-semibold text-white">{l}</span>
                          <span className="text-2xl font-extrabold" style={{ color: rc(v) }}>{v}</span>
                        </div>
                        <input type="range" min="1" max="10" step="0.5" value={v} onChange={(e) => s(parseFloat(e.target.value))}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, ${rc(v)} ${((v - 1) / 9) * 100}%, #27272a ${((v - 1) / 9) * 100}%)` }} />
                      </div>
                    ))}
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <div className="mb-5">
                      <div className="text-sm font-bold text-white mb-3">🌟 Game MVP</div>
                      <div className="flex gap-1.5 flex-wrap max-h-36 overflow-y-auto">
                        {g.players.map((p, i) => (
                          <button key={p.name + i} onClick={() => setMvp(p.name)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${mvp === p.name ? "bg-green-500/15 text-green-400 border-green-500/40" : "bg-zinc-950 text-zinc-500 border-transparent"}`}>
                            {p.name} <span className="text-[9px] opacity-50">{p.tm}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white mb-3">😤 Biggest Letdown</div>
                      <div className="flex gap-1.5 flex-wrap max-h-36 overflow-y-auto">
                        {g.players.map((p, i) => (
                          <button key={p.name + i + "l"} onClick={() => setLetdown(p.name)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${letdown === p.name ? "bg-red-500/15 text-red-400 border-red-500/40" : "bg-zinc-950 text-zinc-500 border-transparent"}`}>
                            {p.name} <span className="text-[9px] opacity-50">{p.tm}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div>
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-white mb-2">📺 How did you watch?</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {["🛋️ Couch", "🍺 Bar", "🏟️ Stadium", "📱 Phone", "📺 RedZone", "🎬 Highlights"].map((w) => (
                          <button key={w} onClick={() => setWatchHow(w)}
                            className={`px-3.5 py-2 rounded-full text-xs font-semibold border-2 ${watchHow === w ? "bg-red-600/10 text-red-400 border-red-600" : "bg-zinc-950 text-zinc-500 border-transparent"}`}>{w}</button>
                        ))}
                      </div>
                    </div>
                    <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Write your review..." rows={3}
                      className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm outline-none resize-none focus:border-red-600" />
                  </div>
                )}

                <div className="flex gap-2 mt-5">
                  {step > 0 && <button onClick={() => setStep(step - 1)} className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 font-semibold text-sm">Back</button>}
                  <div className="flex-1" />
                  {step < 3 && <button onClick={() => setStep(step + 1)} className="px-6 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm">Next →</button>}
                  {step === 3 && <button onClick={submitLog} className="px-6 py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm">{logged ? "Update ✓" : "Log Game ✓"}</button>}
                </div>
                <button onClick={() => { setShowWiz(false); setStep(0); }} className="w-full mt-2 py-2 text-zinc-600 text-xs">Cancel</button>
              </div>
            )}

            {/* Logged summary */}
            {logged && !showWiz && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[{ l: "Overall", v: rating }, { l: "Refs", v: refR }, { l: "Entertain", v: entR }].map((x) => (
                    <div key={x.l} className="text-center p-2.5 rounded-xl bg-zinc-950">
                      <div className="text-[8px] text-zinc-600 font-bold">{x.l}</div>
                      <div className="text-xl font-extrabold" style={{ color: rc(x.v) }}>{x.v}</div>
                    </div>
                  ))}
                </div>
                {worthIt && <div className="text-xs font-semibold mb-1" style={{ color: worthIt === "yes" ? "#22c55e" : worthIt === "no" ? "#ef4444" : "#eab308" }}>Worth watching: {worthIt === "yes" ? "👍 Yes" : worthIt === "no" ? "👎 No" : "😐 Meh"}</div>}
                <div className="flex gap-2 flex-wrap text-[11px]">
                  {mvp && <span className="text-green-400">🌟 {mvp}</span>}
                  {letdown && <span className="text-red-400">😤 {letdown}</span>}
                  {watchHow && <span className="text-zinc-500">{watchHow}</span>}
                </div>
                {review && <div className="text-xs text-zinc-400 italic mt-2">{`"${review}"`}</div>}
              </div>
            )}
          </div>
        )}
      </div>
      <Nav tab={tab} setTab={setTab} />
    </div>
  );
}
