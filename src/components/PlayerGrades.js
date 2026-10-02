"use client";
import { useState, useEffect } from "react";

// 1–10 color scale (matches the rest of the app)
function rc(r) {
  const n = Math.round(r);
  if (n <= 1) return "#7f1d1d";
  if (n === 2) return "#dc2626";
  if (n === 3) return "#f87171";
  if (n === 4) return "#fb923c";
  if (n === 5) return "#fbbf24";
  if (n === 6) return "#facc15";
  if (n === 7) return "#a3e635";
  if (n === 8) return "#4ade80";
  if (n === 9) return "#22c55e";
  return "#15803d";
}

// Grade each team's top performers 1–10 after a game, with the fans' average.
// Stays hidden until the `player_ratings` table exists (see supabase/setup.sql).
// `leaders`: [{ name, tm, stat }] from the game's ESPN leaders.
export default function PlayerGrades({ gameId, sport, leaders, away, home, user, sbFetch, sbJson, requireAuth }) {
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);

  const load = async () => {
    try {
      const res = await sbFetch(`player_ratings?game_id=eq.${gameId}&select=user_id,player_name,rating`);
      if (!res.ok) { setReady(false); return; }
      const data = await sbJson(res);
      setRows(data);
      setReady(true);
    } catch (e) { setReady(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gameId]);

  const byTeam = [away, home].map((team) => ({ team, players: (leaders || []).filter((p) => p.tm === team.abbr && p.name).slice(0, 4) }))
    .filter((t) => t.players.length > 0);
  if (!ready || byTeam.length === 0) return null;

  const stats = {};
  rows.forEach((r) => { const s = (stats[r.player_name] = stats[r.player_name] || { sum: 0, n: 0 }); s.sum += Number(r.rating); s.n += 1; });
  const mine = Object.fromEntries(rows.filter((r) => user && r.user_id === user.id).map((r) => [r.player_name, Number(r.rating)]));

  const grade = async (p, v) => {
    if (!requireAuth()) return;
    setOpen(null);
    setRows((rs) => [...rs.filter((r) => !(r.user_id === user.id && r.player_name === p.name)), { user_id: user.id, player_name: p.name, rating: v }]);
    try {
      await sbFetch("player_ratings?on_conflict=user_id,game_id,player_name", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: user.id, game_id: String(gameId), sport, player_name: p.name, team: p.tm, rating: v, updated_at: new Date().toISOString() }),
      });
    } catch (e) { /* the optimistic grade stays; next load reconciles */ }
  };

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
      <h3 className="font-bold text-white text-base mb-1">⭐ Grade the players</h3>
      <p className="text-xs text-zinc-500 mb-3">Tap a player to grade their game 1–10.</p>
      {byTeam.map(({ team, players }) => (
        <div key={team.abbr} className="mb-3 last:mb-0">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1.5 rounded-lg bg-zinc-950 border-l-4" style={{ borderLeftColor: team.color || "#52525b" }}>
            {team.logo && <img src={team.logo} alt="" className="w-5 h-5 object-contain" />}
            <span className="text-xs font-extrabold text-white">{team.name}</span>
          </div>
          {players.map((p) => {
            const my = mine[p.name];
            const s = stats[p.name];
            const avg = s ? s.sum / s.n : null;
            const isOpen = open === p.name;
            return (
              <div key={p.name} className={`rounded-xl mb-1.5 border ${isOpen ? "border-zinc-600 bg-zinc-950" : "border-zinc-800 bg-zinc-950/50"}`}>
                <button onClick={() => (user ? setOpen(isOpen ? null : p.name) : requireAuth())} aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white truncate">{p.name}</span>
                    {p.stat && <span className="block text-[11px] text-zinc-500 truncate">{p.stat}</span>}
                  </span>
                  {avg != null && (
                    <span className="text-[11px] text-zinc-500 shrink-0">fans <span className="font-bold" style={{ color: rc(avg) }}>{avg.toFixed(1)}</span> · {s.n}</span>
                  )}
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-extrabold shrink-0"
                    style={{ backgroundColor: my ? rc(my) : "#27272a", color: my ? "#fff" : "#71717a" }}>{my || "–"}</span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 grid grid-cols-5 gap-1.5">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                      <button key={v} onClick={() => grade(p, v)} aria-label={`Grade ${v}`}
                        className={`h-9 rounded-lg text-sm font-bold ${my === v ? "ring-2 ring-white/60 text-white" : "text-white/90"}`}
                        style={{ backgroundColor: rc(v) }}>{v}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
