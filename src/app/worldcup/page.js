"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import KickoffCountdown from "@/components/KickoffCountdown";
import WcBackdrop from "@/components/WcBackdrop";

function makeCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Team-draft league sizes must divide 48 so the nations split evenly.
const TEAM_SIZES = [2, 3, 4, 6, 8, 12, 16, 24];

const kindLabel = (l) => `${l.format === "player" ? "⚽ Players" : "🏳️ Nations"} · ${l.draft_type === "auction" ? "💸 Auction" : "🐍 Snake"}`;

// When the draft is / was, and its completion state.
function draftTiming(l) {
  if (l.status === "drafting") return { text: "🔴 Drafting now", cls: "text-red-400" };
  if (l.status === "done") return { text: "✓ Draft completed", cls: "text-emerald-400" };
  if (l.draft_at) {
    const d = new Date(l.draft_at);
    const past = d.getTime() < Date.now();
    return {
      text: past ? "Starting…" : `🗓 Drafts ${d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      cls: past ? "text-amber-400" : "text-zinc-300",
    };
  }
  return { text: "In lobby · not scheduled", cls: "text-zinc-500" };
}

// Section order/labels for grouping leagues on the hub.
const LEAGUE_SECTIONS = [
  ["drafting", "🔴 Live now"],
  ["lobby", "🗓 Upcoming"],
  ["done", "✓ Completed"],
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

  // (Pending invite-link joins are handled globally in AuthProvider.)

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
        // A column may be missing if a migration wasn't run — fall back to core fields.
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
      // Capacity check (unless already a member, or draft already started).
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
      // 23505 = already a member → just go in
      if (!ins.res.ok && ins.res.status !== 409) { flash("Couldn't join"); return; }
      router.push(`/worldcup/${league.id}`);
    } catch (e) {
      flash("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <div>
            <h1 className="text-lg font-bold leading-tight">Fantasy World Cup</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Rankings · salary cap · drafts · match ratings</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* Hero */}
        <div className="rounded-3xl p-6 mb-6 text-center bg-gradient-to-br from-red-700 via-red-800 to-zinc-900 border border-red-500/30">
          <div className="text-5xl mb-2">🏆</div>
          <h2 className="text-2xl font-extrabold text-white leading-tight">Fantasy World Cup 2026</h2>
          <p className="text-[12px] text-red-100/80 mt-1 mb-4">Rank the nations, build a squad, draft with friends &amp; rate every match — all free. Pick a game below ↓</p>
          <KickoffCountdown variant="hero" />
          <p className="text-[10px] text-red-200/60 mt-2">until kickoff — lock your picks before June 11</p>
          <button onClick={() => router.push("/worldcup/how")} className="text-[11px] text-white/90 underline mt-2">ℹ️ How the games &amp; scoring work</button>
        </div>

        {/* Game modes — anyone can browse; the game pages prompt sign-in to save */}
            <button
              onClick={() => router.push("/worldcup/rankings")}
              className="w-full text-left bg-gradient-to-r from-red-950/60 to-zinc-900/70 border border-red-900/40 rounded-2xl px-4 py-3 mb-2 flex items-center gap-3 hover:border-red-700/60"
            >
              <span className="text-2xl">🔢</span>
              <div className="flex-1">
                <div className="font-bold">World Cup Nations Ranking {myStatus.ranking && <span className="text-[10px] text-emerald-400 font-normal">✓ entered</span>}</div>
                <div className="text-[11px] text-zinc-400">{myStatus.ranking ? "View your rank on the global leaderboard" : "Rank all 48 nations · climb the global leaderboard"}</div>
              </div>
              <span className="text-zinc-600">›</span>
            </button>
            <button
              onClick={() => router.push("/worldcup/salary")}
              className="w-full text-left bg-gradient-to-r from-emerald-950/50 to-zinc-900/70 border border-emerald-900/40 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3 hover:border-emerald-700/60"
            >
              <span className="text-2xl">💰</span>
              <div className="flex-1">
                <div className="font-bold">World Cup Salary Cap {myStatus.salary && <span className="text-[10px] text-emerald-400 font-normal">✓ entered</span>}</div>
                <div className="text-[11px] text-zinc-400">{myStatus.salary ? "Manage your team & check the leaderboard" : "€100m budget · pick any players · play global or in private leagues"}</div>
              </div>
              <span className="text-zinc-600">›</span>
            </button>
            <button
              onClick={() => router.push("/?tab=games")}
              className="w-full text-left bg-gradient-to-r from-amber-950/40 to-zinc-900/70 border border-amber-900/40 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3 hover:border-amber-700/60"
            >
              <span className="text-2xl">⭐</span>
              <div className="flex-1">
                <div className="font-bold">World Cup Match Ratings</div>
                <div className="text-[11px] text-zinc-400">Rate every game 1–10, MVP &amp; players — in the main games feed</div>
              </div>
              <span className="text-zinc-600">›</span>
            </button>

            {!user ? (
              <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-6 text-center mb-6">
                <p className="text-zinc-200 font-bold mb-1">New here? Welcome 👋</p>
                <p className="text-[12px] text-zinc-500 mb-4">Tap any game above to look around. Log in to save your picks, create private leagues, and invite friends.</p>
                <button onClick={() => router.push("/login")} className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2.5 rounded-xl">Log in / sign up</button>
              </div>
            ) : (
              <>
            {/* Your leagues */}
            <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your draft leagues</h2>
            {loading ? (
              <p className="text-zinc-600 text-sm py-6">Loading…</p>
            ) : leagues.length === 0 ? (
              <p className="text-zinc-600 text-sm py-4">No leagues yet. Create one or join with a code.</p>
            ) : (
              <div className="space-y-4 mb-8">
                {LEAGUE_SECTIONS.map(([status, label]) => {
                  const group = leagues
                    .filter((l) => (l.status || "lobby") === status)
                    .sort((a, b) => {
                      if (status !== "lobby") return 0;
                      const at = a.draft_at ? new Date(a.draft_at).getTime() : Infinity;
                      const bt = b.draft_at ? new Date(b.draft_at).getTime() : Infinity;
                      return at - bt; // scheduled (soonest) first, unscheduled last
                    });
                  if (group.length === 0) return null;
                  return (
                    <div key={status}>
                      <div className="text-[11px] font-bold text-zinc-500 mb-1.5">{label} ({group.length})</div>
                      <div className="space-y-2">
                        {group.map((l) => {
                          const t = draftTiming(l);
                          return (
                            <button
                              key={l.id}
                              onClick={() => router.push(`/worldcup/${l.id}`)}
                              className="w-full text-left bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-700"
                            >
                              <div className="min-w-0">
                                <div className="font-bold truncate">{l.name}</div>
                                <div className="text-[11px] text-zinc-500 mt-0.5">{kindLabel(l)}</div>
                                <div className={`text-[11px] mt-0.5 ${t.cls}`}>{t.text}</div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className="text-[10px] text-zinc-600">code</div>
                                <div className="text-[11px] font-mono tracking-widest text-zinc-400">{l.invite_code}</div>
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
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
              <h3 className="font-bold mb-2">Create a league</h3>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="League name"
                maxLength={40}
                className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-zinc-600"
              />
              {/* Draft format */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  ["team", "🏳️ Nations", "Draft 48 national teams"],
                  ["player", "⚽ Players", "Draft a squad of players"],
                ].map(([id, label, desc]) => (
                  <button
                    key={id}
                    onClick={() => { setFormat(id); if (id === "team" && !TEAM_SIZES.includes(Number(maxManagers))) setMaxManagers(8); }}
                    className={`text-left rounded-xl px-3 py-2 border ${format === id ? "border-red-500 bg-red-950/30" : "border-zinc-800 bg-[#09090b]"}`}
                  >
                    <div className="text-sm font-bold">{label}</div>
                    <div className="text-[10px] text-zinc-500 leading-tight">{desc}</div>
                  </button>
                ))}
              </div>
              {/* League size (managers) */}
              <div className="bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-zinc-300">League size</span>
                  {format === "team" ? (
                    <select
                      value={maxManagers}
                      onChange={(e) => setMaxManagers(Number(e.target.value))}
                      className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-sm outline-none focus:border-zinc-600"
                    >
                      {TEAM_SIZES.map((n) => (
                        <option key={n} value={n}>{n} managers · {48 / n} teams each</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number" min={2} max={20} value={maxManagers}
                      onChange={(e) => setMaxManagers(Number(e.target.value))}
                      className="w-16 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-sm text-right outline-none focus:border-zinc-600"
                    />
                  )}
                </div>
                {format === "team" && <div className="text-[10px] text-zinc-600 mt-1">Team drafts split all 48 nations evenly.</div>}
              </div>
              {format === "player" && (
                <label className="flex items-center justify-between gap-2 bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 mb-3">
                  <span className="text-[13px] text-zinc-300">Players per manager</span>
                  <input
                    type="number" min={11} max={23} value={squadSize}
                    onChange={(e) => setSquadSize(e.target.value)}
                    className="w-16 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-sm text-right outline-none focus:border-zinc-600"
                  />
                </label>
              )}
              {/* Draft method */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  ["snake", "🐍 Snake", "Take turns picking"],
                  ["auction", "💸 Auction", "Bid with a budget"],
                ].map(([id, label, desc]) => (
                  <button
                    key={id}
                    onClick={() => setDraftType(id)}
                    className={`text-left rounded-xl px-3 py-2 border ${draftType === id ? "border-red-500 bg-red-950/30" : "border-zinc-800 bg-[#09090b]"}`}
                  >
                    <div className="text-sm font-bold">{label}</div>
                    <div className="text-[10px] text-zinc-500 leading-tight">{desc}</div>
                  </button>
                ))}
              </div>
              {draftType === "auction" && (
                <label className="flex items-center justify-between gap-2 bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 mb-3">
                  <span className="text-[13px] text-zinc-300">Budget per manager</span>
                  <input
                    type="number" min={20} max={1000} value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-20 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-sm text-right outline-none focus:border-zinc-600"
                  />
                </label>
              )}
              <button
                onClick={createLeague}
                disabled={busy || !name.trim()}
                className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl"
              >
                Create &amp; invite friends
              </button>
            </div>

            {/* Join */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4">
              <h3 className="font-bold mb-2">Join a league</h3>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Invite code (e.g. 7KQ2MX)"
                maxLength={6}
                className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-zinc-600 tracking-widest"
              />
              <button
                onClick={joinLeague}
                disabled={busy || !code.trim()}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl"
              >
                Join
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">
          {toast}
        </div>
      )}
      <Nav />
    </div>
  );
}
