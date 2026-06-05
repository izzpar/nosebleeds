"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";

const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };
const POS = ["ALL", "GK", "DEF", "MID", "FWD"];

// Waivers for player draft leagues: claim a free agent + drop one of your
// players. Claims process daily in reverse-standings order (see /api/wc-waivers).
export default function WaiverView({ leagueId, members, picks, players, user }) {
  const [claims, setClaims] = useState([]);
  const [add, setAdd] = useState(null);   // free-agent player object
  const [drop, setDrop] = useState(null); // one of my picks
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  const loadClaims = useCallback(async () => {
    if (!user) return;
    const r = await sbFetch(`wc_waiver_claims?league_id=eq.${leagueId}&user_id=eq.${user.id}&status=eq.pending&select=*&order=created_at.asc`);
    setClaims(await sbJson(r));
  }, [leagueId, user]);
  useEffect(() => { loadClaims(); }, [loadClaims]);

  const memberName = (uid) => { const m = members.find((x) => x.user_id === uid); return m?.display_name || m?.handle || "Player"; };
  const takenIds = useMemo(() => new Set(picks.map((p) => String(p.player_id))), [picks]);
  const myRoster = picks.filter((p) => p.user_id === user?.id);

  // priority = reverse standings (placeholder until points exist: roster order)
  const priority = members.map((m) => m.user_id);

  const query = q.trim().toLowerCase();
  const freeAgents = (players || [])
    .filter((p) => !takenIds.has(String(p.id)))
    .filter((p) => pos === "ALL" || p.role === pos)
    .filter((p) => !query || (p.name || "").toLowerCase().includes(query) || (p.team_name || "").toLowerCase().includes(query))
    .sort((a, b) => (b.proj || 0) - (a.proj || 0))
    .slice(0, 50);

  const submit = async () => {
    if (!add || !drop || busy) return;
    setBusy(true);
    try {
      const { res } = await sbInsert("wc_waiver_claims", {
        league_id: leagueId, user_id: user.id,
        add_player_id: String(add.id), add_player_name: add.name, add_position: add.role, add_team: add.team_name,
        drop_player_id: String(drop.player_id), drop_player_name: drop.player_name,
      });
      if (!res.ok) { flash("Couldn't submit claim"); return; }
      setAdd(null); setDrop(null); setQ("");
      await loadClaims();
      flash("Claim submitted ✓");
    } catch (e) { flash("Couldn't submit"); } finally { setBusy(false); }
  };

  const cancel = async (id) => {
    await sbFetch(`wc_waiver_claims?id=eq.${id}`, { method: "DELETE" });
    await loadClaims();
  };

  return (
    <div>
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-4 text-[12px] text-zinc-500">
        Claim a free agent and drop a player. Claims run daily — <span className="text-zinc-300">last place gets first pick</span>, so a contested player goes to whoever&apos;s lowest in the standings.
      </div>

      {/* waiver order */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Waiver order</h3>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {priority.map((uid, i) => (
          <span key={uid} className="text-[11px] bg-zinc-800/70 rounded px-2 py-1">{i + 1}. {memberName(uid)}</span>
        ))}
      </div>

      {/* make a claim */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Drop from your squad</h3>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {myRoster.length === 0 && <span className="text-zinc-600 text-sm">No players.</span>}
        {myRoster.map((p) => (
          <button key={p.id} onClick={() => setDrop(drop?.id === p.id ? null : p)}
            className={`text-[12px] rounded-lg px-2 py-1 border ${drop?.id === p.id ? "border-red-500 bg-red-950/40 text-white" : "border-zinc-800 bg-zinc-900/50 text-zinc-300"}`}>
            <span className={POS_COLOR[p.position] || ""}>{p.position} </span>{p.player_name}
          </button>
        ))}
      </div>

      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Add a free agent ({freeAgents.length === 50 ? "50+" : freeAgents.length})</h3>
      <div className="flex gap-1.5 mb-2">
        {POS.map((p) => (
          <button key={p} onClick={() => setPos(p)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${pos === p ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{p}</button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search free agents…" className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm mb-2 outline-none focus:border-zinc-600" />
      <div className="space-y-1 mb-4 max-h-72 overflow-y-auto">
        {freeAgents.map((p) => (
          <button key={p.id} onClick={() => setAdd(add?.id === p.id ? null : p)}
            className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left ${add?.id === p.id ? "border-red-500 bg-red-950/30" : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"}`}>
            <span className={`text-[10px] font-bold w-8 ${POS_COLOR[p.role]}`}>{p.role}</span>
            {p.image && <img src={p.image} alt="" className="w-6 h-6 rounded-full object-cover bg-zinc-800 shrink-0" loading="lazy" />}
            <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
            <span className="text-[11px] text-zinc-500 truncate max-w-[28%]">{p.team_name}</span>
            <span className="text-[11px] text-zinc-400 w-7 text-right">{p.proj}</span>
          </button>
        ))}
      </div>

      <button onClick={submit} disabled={!add || !drop || busy}
        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl mb-6">
        {add && drop ? `Claim ${add.name} for ${drop.player_name}` : "Pick a player to add + one to drop"}
      </button>

      {/* pending claims */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your pending claims</h3>
      <div className="space-y-1.5">
        {claims.length === 0 && <p className="text-zinc-600 text-sm">None yet.</p>}
        {claims.map((c) => (
          <div key={c.id} className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-[12px]">
            <span className="text-emerald-400">+{c.add_player_name}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-red-400">−{c.drop_player_name}</span>
            <button onClick={() => cancel(c.id)} className="ml-auto text-zinc-500 hover:text-zinc-300">cancel</button>
          </div>
        ))}
      </div>

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">{toast}</div>}
    </div>
  );
}
