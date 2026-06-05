"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import WcBackdrop from "@/components/WcBackdrop";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson } from "@/lib/sbrest";
import { rankingsLocked } from "@/lib/worldcup";

const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };

export default function SalaryEntryPage() {
  const { league, entry } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const reveal = rankingsLocked();

  const [row, setRow] = useState(undefined);
  const [lineup, setLineup] = useState(null);
  const [pool, setPool] = useState([]);

  useEffect(() => { fetch("/api/wc-players").then((r) => r.json()).then((d) => { if (Array.isArray(d.players)) setPool(d.players); }).catch(() => {}); }, []);
  useEffect(() => {
    (async () => {
      const r = (await sbJson(await sbFetch(`wc_salary_entries?id=eq.${entry}&select=*`)))[0] || null;
      setRow(r);
      if (r) {
        const lus = await sbJson(await sbFetch(`wc_salary_entry_lineups?entry_id=eq.${entry}&select=*&order=updated_at.desc`));
        setLineup(lus[0] || null); // most recently saved team
      }
    })().catch(() => setRow(null));
  }, [entry]);

  const byId = useMemo(() => { const m = {}; for (const p of pool) m[String(p.id)] = p; return m; }, [pool]);

  if (row === undefined) return <Shell><p className="text-zinc-600 text-sm py-10">Loading…</p></Shell>;
  if (row === null) return <Shell><p className="text-zinc-500 py-10">Team not found.</p></Shell>;

  const mine = row.user_id === user?.id;
  const name = row.display_name || row.handle || "Player";
  const starters = (lineup?.starters || []).map(String);
  const bench = (lineup?.bench || []).map(String);
  const captain = lineup?.captain ? String(lineup.captain) : null;

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push(`/worldcup/salary/${league}`)} className="text-zinc-500 text-xl leading-none">‹</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{name}{row.label ? ` · ${row.label}` : ""}</h1>
            <p className="text-[11px] text-zinc-500 leading-tight">World Cup Salary Cap team</p>
          </div>
          {row.handle && <Link href={`/u/${row.handle}`} className="text-[11px] text-zinc-400 hover:text-red-400 shrink-0">profile ↗</Link>}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {mine && (
          <button onClick={() => router.push(`/worldcup/salary?league=${league}&entry=${entry}`)} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl mb-4">✏️ Edit your team</button>
        )}

        {!reveal && !mine ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-10 text-center">
            <div className="text-4xl mb-2">🔒</div>
            <div className="font-bold">Hidden until kickoff</div>
            <p className="text-[12px] text-zinc-500 mt-1">You&apos;ll be able to see {name}&apos;s squad once the first game kicks off (Jun 11).</p>
          </div>
        ) : !lineup || starters.length === 0 ? (
          <p className="text-zinc-600 text-sm py-6">No team saved yet.</p>
        ) : (
          <>
            {/* Pitch */}
            <div className="rounded-2xl p-3 mb-3 bg-gradient-to-b from-emerald-700/30 via-emerald-800/20 to-emerald-950/30 border border-emerald-900/40">
              <div className="text-[10px] text-emerald-200/70 font-bold mb-1 text-center">STARTING XI</div>
              {["FWD", "MID", "DEF", "GK"].map((g) => {
                const rowP = starters.map((id) => byId[id]).filter((p) => p && p.role === g);
                return (
                  <div key={g} className="flex justify-center items-start gap-1.5 my-1.5 min-h-[3.4rem] flex-wrap">
                    {rowP.length === 0 && <span className="text-[10px] text-emerald-200/30 self-center">{g}</span>}
                    {rowP.map((p) => {
                      const id = String(p.id); const isCap = captain === id;
                      return (
                        <div key={id} className="flex flex-col items-center w-[3.6rem]">
                          <div className={`relative w-9 h-9 rounded-full overflow-hidden border-2 bg-zinc-800 ${isCap ? "border-red-500" : "border-zinc-600"}`}>
                            {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                            {isCap && <span className="absolute -bottom-0.5 -right-0.5 bg-red-600 text-white text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">C</span>}
                          </div>
                          <span className="text-[9px] text-white truncate w-full text-center leading-tight mt-0.5">{(p.name || "").split(" ").slice(-1)[0]}</span>
                          <span className="text-[8px] text-emerald-200/70">€{p.price}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* Bench */}
            <div className="text-[10px] text-zinc-500 font-bold mb-1">BENCH</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {bench.length === 0 && <span className="text-[11px] text-zinc-600">No subs.</span>}
              {bench.map((id, i) => {
                const p = byId[id]; if (!p) return null;
                return (
                  <div key={id} className="flex flex-col items-center w-[3.4rem] shrink-0 bg-zinc-900/60 rounded-lg py-1 border border-zinc-800">
                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-zinc-700 bg-zinc-800">
                      {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                      <span className="absolute -top-1 -left-1 bg-zinc-700 text-zinc-300 text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{i + 1}</span>
                    </div>
                    <span className="text-[8px] text-zinc-300 truncate w-full text-center leading-tight">{(p.name || "").split(" ").slice(-1)[0]}</span>
                    <span className={`text-[8px] ${POS_COLOR[p.role]}`}>{p.role}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <Nav />
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="max-w-2xl mx-auto px-4 pt-6">{children}</div>
      <Nav />
    </div>
  );
}
