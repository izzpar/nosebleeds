"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import KickoffCountdown from "@/components/KickoffCountdown";

function makeCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Team-draft league sizes must divide 48 so the nations split evenly.
const TEAM_SIZES = [2, 3, 4, 6, 8, 12, 16, 24];

const kindLabel = (l) => `${l.format === "player" ? "⚽ Players" : "🏳️ Nations"} · ${l.draft_type === "auction" ? "💸 Auction" : "🐍 Snake"}`;

// When the draft is / was, and its completion state (colors tuned for the light UI).
function draftTiming(l) {
  if (l.status === "drafting") return { text: "🔴 Drafting now", cls: "text-red-600" };
  if (l.status === "done") return { text: "✓ Draft completed", cls: "text-emerald-600" };
  if (l.draft_at) {
    const d = new Date(l.draft_at);
    const past = d.getTime() < Date.now();
    return {
      text: past ? "Starting…" : `🗓 Drafts ${d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      cls: past ? "text-amber-600" : "text-zinc-600",
    };
  }
  return { text: "In lobby · not scheduled", cls: "text-zinc-400" };
}

const LEAGUE_SECTIONS = [
  ["drafting", "🔴 Live now"],
  ["lobby", "🗓 Upcoming"],
  ["done", "✓ Completed"],
];

const GAMES = [
  { key: "ranking", icon: "🔢", chip: "bg-red-50 text-red-600", title: "Nations Ranking", href: "/worldcup/rankings",
    on: "View your rank on the global board", off: "Rank all 48 nations · climb the global board" },
  { key: "salary", icon: "💰", chip: "bg-emerald-50 text-emerald-600", title: "Salary Cap", href: "/worldcup/salary",
    on: "Manage your squad & check the board", off: "€100m budget · build your XI · solo or in leagues" },
  { key: "ratings", icon: "⭐", chip: "bg-amber-50 text-amber-600", title: "Match Ratings", href: "/?tab=games",
    on: "Rate matches & players", off: "Rate every game 1–10, pick your Star Man" },
];

export default function WorldCupHub() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myStatus, setMyStatus] = useState({ salary: false, ranking: false });
  const [name, setName] = useState("");
  const [format, setFormat] = useState("team"); // 'team' | 'player'
  const [draftType, setDraftType] = useState("snake"); // 'snake' | 'auction'
  const [budget, setBudget] = useState(200);
  const [squadSize, setSquadSize] = useState(15);
  const [maxManagers, setMaxManagers] = useState(8);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  const loadLeagues = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const res = await sbFetch(`wc_members?user_id=eq.${user.id}&select=*,wc_leagues(*)`);
    const rows = await sbJson(res);
    setLeagues(rows.map((r) => r.wc_leagues).filter(Boolean));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadLeagues(); }, [loadLeagues]);

  // Quick "have I entered?" status for the game cards.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [sal, rank] = await Promise.all([
        sbJson(await sbFetch(`wc_salary_entries?user_id=eq.${user.id}&select=id&limit=1`)),
        sbJson(await sbFetch(`wc_ranking_entries?user_id=eq.${user.id}&select=id&limit=1`)),
      ]);
      setMyStatus({ salary: sal.length > 0, ranking: rank.length > 0 });
    })().catch(() => {});
  }, [user]);

  const createLeague = async () => {
    if (!user || !name.trim() || busy) return;
    setBusy(true);
    try {
      const base = { name: name.trim(), invite_code: makeCode(), commissioner_id: user.id };
      const full = {
        ...base,
        format,
        draft_type: draftType,
        budget: draftType === "auction" ? Math.max(20, Math.min(1000, Number(budget) || 200)) : 200,
        squad_size: format === "player" ? Math.max(11, Math.min(23, Number(squadSize) || 15)) : 15,
        max_managers: format === "team" ? (TEAM_SIZES.includes(Number(maxManagers)) ? Number(maxManagers) : 8) : Math.max(2, Math.min(20, Number(maxManagers) || 8)),
      };
      let { res, rows } = await sbInsert("wc_leagues", full);
      if (!res.ok) {
        ({ res, rows } = await sbInsert("wc_leagues", base));
      }
      const league = rows[0];
      if (!res.ok || !league) { flash(`Couldn't create league (error ${res.status})`); return; }
      await sbInsert("wc_members", {
        league_id: league.id,
        user_id: user.id,
        handle: profile?.handle || user.email?.split("@")[0],
        display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
      });
      router.push(`/worldcup/${league.id}`);
    } catch (e) {
      flash("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const joinLeague = async () => {
    if (!user || !code.trim() || busy) return;
    setBusy(true);
    try {
      const res = await sbFetch(`wc_leagues?invite_code=eq.${code.trim().toUpperCase()}&select=*`);
      const found = await sbJson(res);
      const league = found[0];
      if (!league) { flash("No league with that code"); return; }
      const memRes = await sbFetch(`wc_members?league_id=eq.${league.id}&select=user_id`);
      const mems = await sbJson(memRes);
      const alreadyIn = mems.some((m) => m.user_id === user.id);
      if (!alreadyIn && league.max_managers && mems.length >= league.max_managers) {
        flash(`League is full (${league.max_managers} managers)`); return;
      }
      if (!alreadyIn && league.status !== "lobby") { flash("Draft already started"); return; }
      const ins = await sbInsert("wc_members", {
        league_id: league.id,
        user_id: user.id,
        handle: profile?.handle || user.email?.split("@")[0],
        display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
      });
      if (!ins.res.ok && ins.res.status !== 409) { flash("Couldn't join"); return; }
      router.push(`/worldcup/${league.id}`);
    } catch (e) {
      flash("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-white border border-zinc-300 rounded-xl px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

  return (
    <div className="min-h-screen pb-24 bg-zinc-50 text-zinc-900">
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-zinc-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center text-base shrink-0">🩸</div>
          <div>
            <h1 className="text-base font-extrabold leading-tight tracking-tight">The Nosebleeds</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Fantasy World Cup 2026</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl p-7 mb-6 text-center text-white bg-gradient-to-br from-red-600 via-rose-600 to-rose-800 shadow-xl shadow-rose-600/20">
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1.6px)", backgroundSize: "22px 22px" }} />
          <div className="relative">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75 mb-2">Free · with your friends</div>
            <h2 className="text-3xl font-extrabold leading-[1.1] tracking-tight">Your group chat&apos;s home for the World Cup</h2>
            <p className="text-[13px] text-white/85 mt-3 max-w-md mx-auto leading-relaxed">Rank the nations, build a salary-cap squad, draft with friends, and rate every match — all in one place.</p>
            <div className="mt-5"><KickoffCountdown variant="hero" /></div>
            <div className="text-[11px] text-white/70 mt-2">until kickoff · June 11</div>
            <div className="mt-3">
              <button onClick={() => router.push("/worldcup/how")} className="text-[12px] text-white/85 underline underline-offset-2">How the games &amp; scoring work →</button>
            </div>
          </div>
        </div>

        {/* Game modes — anyone can browse */}
        <div className="grid gap-3 mb-6">
          {GAMES.map((g) => {
            const entered = myStatus[g.key];
            return (
              <button key={g.key} onClick={() => router.push(g.href)}
                className="w-full text-left bg-white border border-zinc-200 rounded-2xl px-4 py-4 flex items-center gap-3.5 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all active:scale-[0.99]">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${g.chip}`}>{g.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-zinc-900 flex items-center gap-2">
                    {g.title}
                    {entered && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5">✓ in</span>}
                  </div>
                  <div className="text-[12px] text-zinc-500 leading-snug">{entered ? g.on : g.off}</div>
                </div>
                <span className="text-zinc-300 text-lg">›</span>
              </button>
            );
          })}
        </div>

        {!user ? (
          <div className="bg-white border border-zinc-200 rounded-2xl px-5 py-6 text-center shadow-sm mb-6">
            <p className="text-zinc-900 font-bold mb-1">New here? Welcome 👋</p>
            <p className="text-[13px] text-zinc-500 mb-4 max-w-sm mx-auto">Tap any game above to look around. Log in to save your picks, create private leagues, and invite your friends.</p>
            <button onClick={() => router.push("/login")} className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-sm shadow-red-600/30">Log in / sign up</button>
          </div>
        ) : (
          <>
            {/* Your leagues */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-zinc-900">Your draft leagues</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowCreate((v) => !v)} className="text-[12px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg">＋ Create</button>
              </div>
            </div>

            {loading ? (
              <p className="text-zinc-400 text-sm py-6">Loading…</p>
            ) : leagues.length === 0 ? (
              <p className="text-zinc-400 text-sm py-2 mb-2">No leagues yet — create one or join with a code below.</p>
            ) : (
              <div className="space-y-4 mb-6">
                {LEAGUE_SECTIONS.map(([status, label]) => {
                  const group = leagues
                    .filter((l) => (l.status || "lobby") === status)
                    .sort((a, b) => {
                      if (status !== "lobby") return 0;
                      const at = a.draft_at ? new Date(a.draft_at).getTime() : Infinity;
                      const bt = b.draft_at ? new Date(b.draft_at).getTime() : Infinity;
                      return at - bt;
                    });
                  if (group.length === 0) return null;
                  return (
                    <div key={status}>
                      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1.5">{label} ({group.length})</div>
                      <div className="space-y-2">
                        {group.map((l) => {
                          const t = draftTiming(l);
                          return (
                            <button
                              key={l.id}
                              onClick={() => router.push(`/worldcup/${l.id}`)}
                              className="w-full text-left bg-white border border-zinc-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm hover:shadow-md hover:border-zinc-300 transition-all"
                            >
                              <div className="min-w-0">
                                <div className="font-bold truncate text-zinc-900">{l.name}</div>
                                <div className="text-[11px] text-zinc-500 mt-0.5">{kindLabel(l)}</div>
                                <div className={`text-[11px] mt-0.5 ${t.cls}`}>{t.text}</div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className="text-[10px] text-zinc-400">code</div>
                                <div className="text-[11px] font-mono tracking-widest text-zinc-600">{l.invite_code}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create */}
            {showCreate && (
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 mb-4 shadow-sm">
                <h3 className="font-bold mb-2 text-zinc-900">Create a league</h3>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="League name" maxLength={40} className={`${inputCls} mb-3`} />
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[["team", "🏳️ Nations", "Draft 48 national teams"], ["player", "⚽ Players", "Draft a squad of players"]].map(([id, label, desc]) => (
                    <button key={id} onClick={() => { setFormat(id); if (id === "team" && !TEAM_SIZES.includes(Number(maxManagers))) setMaxManagers(8); }}
                      className={`text-left rounded-xl px-3 py-2 border transition-all ${format === id ? "border-red-500 bg-red-50 ring-2 ring-red-500/15" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
                      <div className="text-sm font-bold text-zinc-900">{label}</div>
                      <div className="text-[10px] text-zinc-500 leading-tight">{desc}</div>
                    </button>
                  ))}
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-zinc-700">League size</span>
                    {format === "team" ? (
                      <select value={maxManagers} onChange={(e) => setMaxManagers(Number(e.target.value))} className="bg-white border border-zinc-300 rounded-md px-2 py-1 text-sm text-zinc-900 outline-none focus:border-red-500">
                        {TEAM_SIZES.map((n) => (<option key={n} value={n}>{n} managers · {48 / n} each</option>))}
                      </select>
                    ) : (
                      <input type="number" min={2} max={20} value={maxManagers} onChange={(e) => setMaxManagers(Number(e.target.value))} className="w-16 bg-white border border-zinc-300 rounded-md px-2 py-1 text-sm text-right text-zinc-900 outline-none focus:border-red-500" />
                    )}
                  </div>
                  {format === "team" && <div className="text-[10px] text-zinc-400 mt-1">Team drafts split all 48 nations evenly.</div>}
                </div>
                {format === "player" && (
                  <label className="flex items-center justify-between gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 mb-3">
                    <span className="text-[13px] text-zinc-700">Players per manager</span>
                    <input type="number" min={11} max={23} value={squadSize} onChange={(e) => setSquadSize(e.target.value)} className="w-16 bg-white border border-zinc-300 rounded-md px-2 py-1 text-sm text-right text-zinc-900 outline-none focus:border-red-500" />
                  </label>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[["snake", "🐍 Snake", "Take turns picking"], ["auction", "💸 Auction", "Bid with a budget"]].map(([id, label, desc]) => (
                    <button key={id} onClick={() => setDraftType(id)}
                      className={`text-left rounded-xl px-3 py-2 border transition-all ${draftType === id ? "border-red-500 bg-red-50 ring-2 ring-red-500/15" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
                      <div className="text-sm font-bold text-zinc-900">{label}</div>
                      <div className="text-[10px] text-zinc-500 leading-tight">{desc}</div>
                    </button>
                  ))}
                </div>
                {draftType === "auction" && (
                  <label className="flex items-center justify-between gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 mb-3">
                    <span className="text-[13px] text-zinc-700">Budget per manager</span>
                    <input type="number" min={20} max={1000} value={budget} onChange={(e) => setBudget(e.target.value)} className="w-20 bg-white border border-zinc-300 rounded-md px-2 py-1 text-sm text-right text-zinc-900 outline-none focus:border-red-500" />
                  </label>
                )}
                <button onClick={createLeague} disabled={busy || !name.trim()} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl shadow-sm shadow-red-600/30">Create &amp; invite friends</button>
              </div>
            )}

            {/* Join */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
              <h3 className="font-bold mb-2 text-zinc-900">Join a league</h3>
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite code" maxLength={6} className={`${inputCls} tracking-widest flex-1`} />
                <button onClick={joinLeague} disabled={busy || !code.trim()} className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white font-bold px-5 rounded-xl shrink-0">Join</button>
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-sm px-4 py-2 rounded-full z-50 shadow-lg">{toast}</div>
      )}
      <Nav />
    </div>
  );
}
