"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";

function makeCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function WorldCupHub() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("team"); // 'team' | 'player'
  const [draftType, setDraftType] = useState("snake"); // 'snake' | 'auction'
  const [budget, setBudget] = useState(200);
  const [squadSize, setSquadSize] = useState(15);
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

  const createLeague = async () => {
    if (!user || !name.trim() || busy) return;
    setBusy(true);
    try {
      const { rows } = await sbInsert("wc_leagues", {
        name: name.trim(),
        invite_code: makeCode(),
        commissioner_id: user.id,
        format,
        draft_type: draftType,
        budget: draftType === "auction" ? Math.max(20, Math.min(1000, Number(budget) || 200)) : 200,
        squad_size: format === "player" ? Math.max(11, Math.min(23, Number(squadSize) || 15)) : 15,
      });
      const league = rows[0];
      if (!league) { flash("Couldn't create league"); return; }
      await sbInsert("wc_members", {
        league_id: league.id,
        user_id: user.id,
        handle: profile?.handle,
        display_name: profile?.display_name || profile?.handle,
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
      const ins = await sbInsert("wc_members", {
        league_id: league.id,
        user_id: user.id,
        handle: profile?.handle,
        display_name: profile?.display_name || profile?.handle,
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
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <div>
            <h1 className="text-lg font-bold leading-tight">Fantasy World Cup</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Snake-draft nations · score as they win</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {!user ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 mb-4">Sign in to draft with your friends.</p>
            <button
              onClick={() => router.push("/login")}
              className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2.5 rounded-xl"
            >
              Log in
            </button>
          </div>
        ) : (
          <>
            {/* Game modes */}
            <button
              onClick={() => router.push("/worldcup/rankings")}
              className="w-full text-left bg-gradient-to-r from-red-950/60 to-zinc-900/70 border border-red-900/40 rounded-2xl px-4 py-3 mb-2 flex items-center gap-3 hover:border-red-700/60"
            >
              <span className="text-2xl">🔢</span>
              <div className="flex-1">
                <div className="font-bold">Power Ranking</div>
                <div className="text-[11px] text-zinc-400">Rank all 48 nations · climb the global leaderboard</div>
              </div>
              <span className="text-zinc-600">›</span>
            </button>
            <button
              onClick={() => router.push("/worldcup/salary")}
              className="w-full text-left bg-gradient-to-r from-emerald-950/50 to-zinc-900/70 border border-emerald-900/40 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3 hover:border-emerald-700/60"
            >
              <span className="text-2xl">💰</span>
              <div className="flex-1">
                <div className="font-bold">Salary Cap</div>
                <div className="text-[11px] text-zinc-400">€100m budget · pick any players · global leaderboard</div>
              </div>
              <span className="text-zinc-600">›</span>
            </button>

            {/* Your leagues */}
            <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your draft leagues</h2>
            {loading ? (
              <p className="text-zinc-600 text-sm py-6">Loading…</p>
            ) : leagues.length === 0 ? (
              <p className="text-zinc-600 text-sm py-4">No leagues yet. Create one or join with a code.</p>
            ) : (
              <div className="space-y-2 mb-8">
                {leagues.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => router.push(`/worldcup/${l.id}`)}
                    className="w-full text-left bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-700"
                  >
                    <div>
                      <div className="font-bold">
                        {l.name}{" "}
                        <span className="text-[10px] font-normal text-zinc-500">
                          {l.format === "player" ? "⚽" : "🏳️"} {l.draft_type === "auction" ? "Auction" : "Snake"}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Code {l.invite_code} ·{" "}
                        {l.status === "lobby" ? "Lobby" : l.status === "drafting" ? "Live" : "Done"}
                      </div>
                    </div>
                    <span className="text-zinc-600">›</span>
                  </button>
                ))}
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
                    onClick={() => setFormat(id)}
                    className={`text-left rounded-xl px-3 py-2 border ${format === id ? "border-red-500 bg-red-950/30" : "border-zinc-800 bg-[#09090b]"}`}
                  >
                    <div className="text-sm font-bold">{label}</div>
                    <div className="text-[10px] text-zinc-500 leading-tight">{desc}</div>
                  </button>
                ))}
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
