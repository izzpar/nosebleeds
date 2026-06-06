"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { loadRoster } from "@/lib/rosters";
import { makeLineupCard } from "@/lib/shareCard";

const SPORTS = [
  { id: "wc", emoji: "⚽", label: "World Cup" },
  { id: "nba", emoji: "🏀", label: "NBA" },
  { id: "nfl", emoji: "🏈", label: "NFL" },
  { id: "mlb", emoji: "⚾", label: "MLB" },
  { id: "nhl", emoji: "🏒", label: "NHL" },
];

const LAYOUTS = {
  wc: { title: "World Cup Dream XI", accent: "#16a34a", slots: ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"] },
  nba: { title: "Dream Starting 5", accent: "#f59e0b", slots: ["PG", "SG", "SF", "PF", "C"] },
  nfl: { title: "Dream Offense", accent: "#dc2626", slots: ["QB", "RB", "RB", "WR", "WR", "WR", "TE"] },
  mlb: { title: "Dream Lineup", accent: "#3b82f6", slots: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "SP"] },
  nhl: { title: "Dream Line + D + G", accent: "#0ea5e9", slots: ["LW", "C", "RW", "D", "D", "G"] },
};

const initials = (n) => (n || "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function DreamPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [sport, setSport] = useState("wc");
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState({});      // slotIndex -> player
  const [pickerFor, setPickerFor] = useState(null);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const layout = LAYOUTS[sport];

  // Load roster + saved picks when the sport changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setRoster([]);
    loadRoster(sport).then((r) => { if (!cancelled) { setRoster(r); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    try { setPicks(JSON.parse(localStorage.getItem(`nb_dream_${sport}`) || "{}")); } catch (e) { setPicks({}); }
    return () => { cancelled = true; };
  }, [sport]);

  const persist = (next) => { setPicks(next); try { localStorage.setItem(`nb_dream_${sport}`, JSON.stringify(next)); } catch (e) {} };
  const assign = (player) => { if (pickerFor == null) return; persist({ ...picks, [pickerFor]: player }); setPickerFor(null); setQ(""); };
  const clearSlot = (i) => { const n = { ...picks }; delete n[i]; persist(n); };
  const reset = () => { if (confirm("Clear this lineup?")) persist({}); };

  const pickedCount = Object.keys(picks).length;
  const pickedIds = new Set(Object.values(picks).map((p) => p.id));
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    const base = roster.filter((p) => !pickedIds.has(p.id));
    if (!query) return base.slice(0, 60);
    return base.filter((p) => p.name.toLowerCase().includes(query) || (p.team || "").toLowerCase().includes(query)).slice(0, 60);
  }, [roster, query, picks]);

  const share = async () => {
    if (pickedCount === 0) { flash("Pick some players first"); return; }
    const slots = layout.slots.map((pos, i) => ({ pos, name: picks[i]?.name || "—" }));
    try {
      const { blob, dataUrl } = await makeLineupCard({ title: layout.title, accent: layout.accent, slots, handle: profile?.handle });
      const file = new File([blob], "dream-team.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: `My ${layout.title} — build yours at thenosebleeds.app` });
        return;
      }
      const a = document.createElement("a"); a.href = dataUrl; a.download = "dream-team.png"; a.click();
      flash("Image saved");
    } catch (e) { flash("Couldn't make image"); }
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/80 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.back()} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">🌟</span>
          <div className="flex-1">
            <h1 className="text-base font-extrabold leading-tight tracking-tight">Dream Team</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">Build your all-time XI &amp; share it</p>
          </div>
          <button onClick={share} className="text-[12px] font-bold bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg">Share</button>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-1.5 pb-2 overflow-x-auto">
          {SPORTS.map((s) => (
            <button key={s.id} onClick={() => setSport(s.id)} className={`text-[12px] font-bold px-3 py-1 rounded-full whitespace-nowrap ${sport === s.id ? "bg-red-600 text-white" : "bg-zinc-900 text-zinc-400 border border-zinc-800"}`}>{s.emoji} {s.label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight" style={{ color: layout.accent }}>{layout.title}</h2>
            <p className="text-[11px] text-zinc-500">{pickedCount}/{layout.slots.length} picked · tap a slot to choose</p>
          </div>
          {pickedCount > 0 && <button onClick={reset} className="text-[11px] text-zinc-500 hover:text-red-400">Clear</button>}
        </div>

        {loading ? (
          <p className="text-zinc-600 text-sm py-10 text-center">Loading {SPORTS.find((s) => s.id === sport)?.label} players…</p>
        ) : roster.length === 0 ? (
          <p className="text-zinc-600 text-sm py-10 text-center">Couldn&apos;t load players — try another sport or refresh.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {layout.slots.map((pos, i) => {
              const p = picks[i];
              return (
                <button key={i} onClick={() => { setPickerFor(i); setQ(""); }}
                  className="relative bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3 flex flex-col items-center text-center hover:border-zinc-700 transition-all min-h-[7.5rem] justify-center">
                  <span className="absolute top-2 left-2 text-[9px] font-bold text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">{pos}</span>
                  {p ? (
                    <>
                      <span onClick={(e) => { e.stopPropagation(); clearSlot(i); }} className="absolute top-1.5 right-1.5 text-zinc-600 hover:text-red-400 text-xs w-5 h-5 flex items-center justify-center">✕</span>
                      {p.headshot ? (
                        <img src={p.headshot} alt="" className="w-14 h-14 rounded-full object-cover bg-zinc-800 mb-1" loading="lazy" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400 mb-1">{initials(p.name)}</div>
                      )}
                      <span className="text-[12px] font-bold leading-tight">{p.name}</span>
                      <span className="text-[10px] text-zinc-500">{p.team}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 text-xl mb-1">＋</div>
                      <span className="text-[12px] text-zinc-500 font-semibold">Add {pos}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Picker modal */}
      {pickerFor != null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setPickerFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-3 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold">Pick a {layout.slots[pickerFor]}</span>
                <button onClick={() => setPickerFor(null)} className="text-zinc-500 text-sm">Close</button>
              </div>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players or teams…" className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-zinc-600" />
            </div>
            <div className="overflow-y-auto p-2">
              {results.map((p) => (
                <button key={p.id} onClick={() => assign(p)} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-zinc-900 text-left">
                  {p.headshot ? <img src={p.headshot} alt="" className="w-9 h-9 rounded-full object-cover bg-zinc-800 shrink-0" loading="lazy" /> : <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-[11px] font-bold text-zinc-400 shrink-0">{initials(p.name)}</div>}
                  <span className="flex-1 min-w-0"><span className="text-sm font-medium block truncate">{p.name}</span><span className="text-[11px] text-zinc-500">{p.team}{p.position ? ` · ${p.position}` : ""}</span></span>
                </button>
              ))}
              {results.length === 0 && <p className="text-zinc-600 text-sm text-center py-6">No players match.</p>}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-[60]">{toast}</div>}
      <Nav />
    </div>
  );
}
