"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import { rankingsLocked } from "@/lib/worldcup";

const BUDGET = 100;
const SQUAD_REQ = { GK: 2, DEF: 5, MID: 5, FWD: 3 };       // 15 total
const START_MIN = { GK: 1, DEF: 3, MID: 2, FWD: 1 };       // formation floor
const START_MAX = { GK: 1, DEF: 5, MID: 5, FWD: 3 };       // formation ceiling
const POS = ["GK", "DEF", "MID", "FWD"];
const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };

export default function SalaryCapPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [squad, setSquad] = useState([]);       // player ids
  const [starters, setStarters] = useState([]); // player ids (subset)
  const [captain, setCaptain] = useState(null);
  const [subTab, setSubTab] = useState("team");
  const [pos, setPos] = useState("GK");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const locked = rankingsLocked();
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  // Priced player pool + my saved entry.
  useEffect(() => {
    fetch("/api/wc-players").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.players)) setPool(d.players);
    }).catch(() => {}).finally(() => setPoolLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    sbFetch(`wc_fantasy_entries?user_id=eq.${user.id}&select=squad,starters,captain`).then(async (res) => {
      const r = (await sbJson(res))[0];
      if (r) { setSquad((r.squad || []).map(String)); setStarters((r.starters || []).map(String)); setCaptain(r.captain ? String(r.captain) : null); }
    });
  }, [user]);

  const byId = useMemo(() => {
    const m = {}; for (const p of pool) m[String(p.id)] = p; return m;
  }, [pool]);
  const squadPlayers = squad.map((id) => byId[id]).filter(Boolean);
  const priceOf = (id) => Number(byId[id]?.price || 0);
  const spent = squad.reduce((s, id) => s + priceOf(id), 0);
  const remaining = Math.round((BUDGET - spent) * 10) / 10;
  const posCount = (arr, pp) => arr.filter((id) => byId[id]?.role === pp).length;

  const addPlayer = (p) => {
    if (locked || squad.includes(String(p.id))) return;
    if (posCount(squad, p.role) >= SQUAD_REQ[p.role]) { flash(`Squad already has ${SQUAD_REQ[p.role]} ${p.role}`); return; }
    if (priceOf(p.id) > remaining + 1e-9) { flash("Not enough budget"); return; }
    if (squad.length >= 15) { flash("Squad is full (15)"); return; }
    setSquad((s) => [...s, String(p.id)]);
  };
  const removePlayer = (id) => {
    if (locked) return;
    setSquad((s) => s.filter((x) => x !== id));
    setStarters((s) => s.filter((x) => x !== id));
    if (captain === id) setCaptain(null);
  };
  const toggleStarter = (id) => {
    if (locked) return;
    const role = byId[id]?.role;
    if (starters.includes(id)) {
      setStarters((s) => s.filter((x) => x !== id));
      if (captain === id) setCaptain(null);
      return;
    }
    if (starters.length >= 11) { flash("11 starters already"); return; }
    if (posCount(starters, role) >= START_MAX[role]) { flash(`Max ${START_MAX[role]} ${role} on the pitch`); return; }
    setStarters((s) => [...s, id]);
  };

  const squadFull = squad.length === 15 && POS.every((p) => posCount(squad, p) === SQUAD_REQ[p]);
  const startersValid =
    starters.length === 11 && POS.every((p) => {
      const c = posCount(starters, p);
      return c >= START_MIN[p] && c <= START_MAX[p];
    });
  const canSave = squadFull && startersValid && captain && starters.includes(captain) && !locked;

  const save = async () => {
    if (!user || saving || !canSave) { if (!canSave) flash("Complete a valid 15 squad, 11 starters + captain"); return; }
    setSaving(true);
    try {
      const res = await sbFetch("wc_fantasy_entries?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: user.id, handle: profile?.handle, display_name: profile?.display_name || profile?.handle,
          squad, starters, captain, spent, updated_at: new Date().toISOString(),
        }),
      });
      flash(res.ok ? "Team saved ✓" : "Couldn't save");
    } catch (e) { flash("Couldn't save"); } finally { setSaving(false); }
  };

  // pool picker list
  const query = q.trim().toLowerCase();
  const available = pool
    .filter((p) => p.role === pos)
    .filter((p) => !squad.includes(String(p.id)))
    .filter((p) => !query || (p.name || "").toLowerCase().includes(query) || (p.team_name || "").toLowerCase().includes(query))
    .sort((a, b) => (b.proj || 0) - (a.proj || 0))
    .slice(0, 60);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">💰</span>
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">Salary Cap</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">€{BUDGET}m budget · {locked ? "locked" : "locks at kickoff"}</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {[["team", "My Team"], ["board", "Leaderboard"]].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)} className={`pb-2 font-bold border-b-2 ${subTab === id ? "text-white border-red-500" : "text-zinc-600 border-transparent"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {!user ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 mb-4">Sign in to build your team.</p>
            <button onClick={() => router.push("/login")} className="bg-red-600 text-white font-bold px-6 py-2.5 rounded-xl">Log in</button>
          </div>
        ) : subTab === "board" ? (
          <SalaryLeaderboard />
        ) : poolLoading ? (
          <p className="text-zinc-600 text-sm py-8">Loading players…</p>
        ) : (
          <>
            {/* budget bar */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[["Budget left", `€${remaining}m`, remaining < 0 ? "text-red-500" : "text-emerald-400"],
                ["Squad", `${squad.length}/15`, squadFull ? "text-emerald-400" : "text-zinc-300"],
                ["Starters", `${starters.length}/11`, startersValid ? "text-emerald-400" : "text-zinc-300"]].map(([l, v, c]) => (
                <div key={l} className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] uppercase text-zinc-500">{l}</div>
                  <div className={`font-bold ${c}`}>{v}</div>
                </div>
              ))}
            </div>

            {/* squad by position */}
            {POS.map((g) => (
              <div key={g} className="mb-2">
                <div className="text-[11px] font-bold mb-1"><span className={POS_COLOR[g]}>{g}</span> <span className="text-zinc-600">({posCount(squad, g)}/{SQUAD_REQ[g]})</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {squadPlayers.filter((p) => p.role === g).map((p) => {
                    const id = String(p.id); const isStart = starters.includes(id); const isCap = captain === id;
                    return (
                      <span key={id} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] border ${isStart ? "bg-zinc-800 border-zinc-600" : "bg-zinc-900/50 border-zinc-800 text-zinc-400"}`}>
                        <button onClick={() => toggleStarter(id)} title="starter" className={isStart ? "text-amber-400" : "text-zinc-600"}>★</button>
                        {isStart && <button onClick={() => setCaptain(id)} title="captain" className={isCap ? "text-red-500 font-bold" : "text-zinc-600"}>C</button>}
                        <span>{p.name}</span>
                        <span className="text-zinc-500">€{p.price}</span>
                        {!locked && <button onClick={() => removePlayer(id)} className="text-zinc-600 ml-0.5">✕</button>}
                      </span>
                    );
                  })}
                  {posCount(squad, g) === 0 && <span className="text-zinc-600 text-[12px]">none yet</span>}
                </div>
              </div>
            ))}

            {!locked && (
              <button onClick={save} disabled={saving} className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl my-4">
                {saving ? "Saving…" : canSave ? "Save team" : "Pick 15 + 11 starters + captain"}
              </button>
            )}

            {/* picker */}
            {!locked && (
              <>
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Add players</h3>
                <div className="flex gap-1.5 mb-2">
                  {POS.map((p) => (
                    <button key={p} onClick={() => setPos(p)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${pos === p ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
                      {p} {posCount(squad, p)}/{SQUAD_REQ[p]}
                    </button>
                  ))}
                </div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm mb-2 outline-none focus:border-zinc-600" />
                <div className="space-y-1">
                  {available.map((p) => {
                    const affordable = priceOf(p.id) <= remaining + 1e-9;
                    const slot = posCount(squad, p.role) < SQUAD_REQ[p.role];
                    const ok = affordable && slot;
                    return (
                      <button key={p.id} onClick={() => addPlayer(p)} disabled={!ok}
                        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left ${ok ? "bg-zinc-900 border-zinc-700 hover:border-red-500" : "bg-zinc-900/40 border-zinc-800 opacity-50"}`}>
                        <span className={`text-[10px] font-bold w-8 ${POS_COLOR[p.role]}`}>{p.role}</span>
                        <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                        <span className="text-[11px] text-zinc-500 truncate max-w-[26%]">{p.team_name}</span>
                        <span className="text-[11px] text-zinc-400 w-7 text-right">{p.proj}</span>
                        <span className="text-[11px] text-emerald-400 w-12 text-right">€{p.price}m</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">{toast}</div>}
      <Nav />
    </div>
  );
}

function SalaryLeaderboard() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    (async () => {
      const entries = await sbJson(await sbFetch("wc_fantasy_entries?select=user_id,display_name,handle,starters,captain"));
      const ids = [...new Set(entries.flatMap((e) => e.starters || []).map(String))];
      const pmap = {};
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100).map((x) => encodeURIComponent(x)).join(",");
        if (!chunk) continue;
        for (const r of await sbJson(await sbFetch(`wc_player_points?player_id=in.(${chunk})&select=player_id,points`)))
          pmap[String(r.player_id)] = Number(r.points || 0);
      }
      const scored = entries.map((e) => {
        const starters = (e.starters || []).map(String);
        let total = starters.reduce((s, id) => s + (pmap[id] || 0), 0);
        if (e.captain && starters.includes(String(e.captain))) total += pmap[String(e.captain)] || 0; // captain doubles
        return { user_id: e.user_id, name: e.display_name || e.handle || "Player", total: Math.round(total * 100) / 100 };
      }).sort((a, b) => b.total - a.total);
      setRows(scored);
    })().catch(() => setRows([]));
  }, []);
  if (!rows) return <p className="text-zinc-600 text-sm py-8">Loading…</p>;
  if (!rows.length) return <p className="text-zinc-600 text-sm py-8">No teams yet — build yours!</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.user_id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-zinc-600 font-bold w-5">{i + 1}</span><span className="font-bold">{r.name}</span></div>
          <span className="font-bold text-red-500 tabular-nums">{r.total} pts</span>
        </div>
      ))}
    </div>
  );
}
