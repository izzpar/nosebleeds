"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";

const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };
const NOMINATE_SECONDS = 30; // fresh clock on nomination
const ANTISNIPE_SECONDS = 10; // a late bid bumps the clock back up to this

// Live auction. The commissioner is the auctioneer: managers nominate (in turn)
// and anyone bids; the commissioner clicks "Sold" to settle — so there are no
// settlement race conditions. Lot state lives in wc_auction (members can update).
export default function AuctionRoom({
  leagueId, members, picks, user, isCommish, format, items, perManager, totalPicks, budget, paused, onReload,
}) {
  const [lot, setLot] = useState(null);     // wc_auction row
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [openBid, setOpenBid] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const settling = useRef(false);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  const loadLot = useCallback(async () => {
    const r = await sbFetch(`wc_auction?league_id=eq.${leagueId}&select=*`);
    setLot((await sbJson(r))[0] || null);
  }, [leagueId]);

  useEffect(() => { loadLot(); }, [loadLot]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) loadLot(); }, 1500); return () => clearInterval(t); }, [loadLot]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // ---- derived ----
  const memberOf = (uid) => members.find((m) => m.user_id === uid);
  const memberName = (uid) => { const m = memberOf(uid); return m?.display_name || m?.handle || "Player"; };
  const countByUser = useMemo(() => {
    const c = {}; for (const p of picks) c[p.user_id] = (c[p.user_id] || 0) + 1; return c;
  }, [picks]);
  const spentByUser = useMemo(() => {
    const s = {}; for (const p of picks) s[p.user_id] = (s[p.user_id] || 0) + (Number(p.price) || 0); return s;
  }, [picks]);
  const remainingOf = (uid) => budget - (spentByUser[uid] || 0);
  const slotsLeftOf = (uid) => perManager - (countByUser[uid] || 0);
  // Must keep ≥1 per remaining slot, minus the slot this lot would fill.
  const maxBidOf = (uid) => remainingOf(uid) - Math.max(0, slotsLeftOf(uid) - 1);

  const takenIds = useMemo(() => new Set(picks.map((p) => String(p.player_id ?? p.team_id))), [picks]);
  const draftComplete = totalPicks > 0 && picks.length >= totalPicks;
  const nominator = members.find((m) => m.draft_position === (lot?.nominator_pos ?? 0)) || null;
  const myNominate = !draftComplete && !lot?.item_id && nominator?.user_id === user?.id;
  const secondsLeft = lot?.ends_at ? Math.max(0, Math.round((new Date(lot.ends_at).getTime() - now) / 1000)) : null;
  const iAmHigh = lot?.high_bidder === user?.id;
  const myMax = user ? maxBidOf(user.id) : 0;

  // ---- actions ----
  const patchLot = (body) =>
    sbFetch(`wc_auction?league_id=eq.${leagueId}`, { method: "PATCH", body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });

  const nominate = async (item) => {
    if (!myNominate || busy || paused) return;
    const ob = Math.max(1, Math.min(Number(openBid) || 1, myMax));
    if (ob > myMax) { flash("Over your budget"); return; }
    setBusy(true);
    try {
      await patchLot({
        item_id: String(item.id), item_kind: item.kind, item_name: item.name,
        item_team: item.team || null, item_position: item.position || null,
        high_bid: ob, high_bidder: user.id, high_bidder_name: memberName(user.id),
        ends_at: new Date(Date.now() + NOMINATE_SECONDS * 1000).toISOString(),
      });
      await loadLot();
    } catch (e) { flash("Couldn't nominate"); } finally { setBusy(false); }
  };

  const bid = async (amount) => {
    if (!lot?.item_id || busy || iAmHigh || paused) return;
    if (amount <= (lot.high_bid || 0)) { flash("Bid must be higher"); return; }
    if (amount > myMax) { flash("Over your budget"); return; }
    if (slotsLeftOf(user.id) <= 0) { flash("Your squad is full"); return; }
    setBusy(true);
    try {
      // Anti-snipe: a bid in the final 10s bumps the clock back up to 10s;
      // otherwise the clock keeps running.
      const curEnds = lot.ends_at ? new Date(lot.ends_at).getTime() : Date.now();
      const ends = curEnds - Date.now() < ANTISNIPE_SECONDS * 1000
        ? Date.now() + ANTISNIPE_SECONDS * 1000
        : curEnds;
      await patchLot({
        high_bid: amount, high_bidder: user.id, high_bidder_name: memberName(user.id),
        ends_at: new Date(ends).toISOString(),
      });
      await loadLot();
    } catch (e) { flash("Bid failed"); } finally { setBusy(false); }
  };

  const nextNominatorPos = (fromPos) => {
    const n = members.length;
    for (let i = 1; i <= n; i++) {
      const p = (fromPos + i) % n;
      const m = members.find((mm) => mm.draft_position === p);
      if (m && (countByUser[m.user_id] || 0) < perManager) return p;
    }
    return fromPos;
  };

  const sold = async () => {
    if (!isCommish || !lot?.item_id || settling.current) return;
    settling.current = true;
    setBusy(true);
    try {
      const isPlayer = lot.item_kind === "player";
      const { res } = await sbInsert("wc_picks", {
        league_id: leagueId, user_id: lot.high_bidder, pick_number: picks.length, price: lot.high_bid,
        ...(isPlayer
          ? { player_id: lot.item_id, player_name: lot.item_name, position: lot.item_position, team_name: lot.item_team }
          : { team_id: lot.item_id, team_name: lot.item_name }),
      });
      if (!res.ok && res.status !== 409) { flash("Couldn't settle"); return; }
      // winner now has one more pick → recompute skip from fresh counts
      const winnerNewCount = (countByUser[lot.high_bidder] || 0) + 1;
      const counts = { ...countByUser, [lot.high_bidder]: winnerNewCount };
      let np = lot.nominator_pos;
      const n = members.length;
      for (let i = 1; i <= n; i++) {
        const p = (lot.nominator_pos + i) % n;
        const m = members.find((mm) => mm.draft_position === p);
        if (m && (counts[m.user_id] || 0) < perManager) { np = p; break; }
      }
      await patchLot({
        nominator_pos: np, item_id: null, item_kind: null, item_name: null, item_team: null,
        item_position: null, high_bid: 0, high_bidder: null, high_bidder_name: null, ends_at: null,
      });
      await onReload();
      await loadLot();
    } catch (e) { flash("Couldn't settle"); } finally { setBusy(false); settling.current = false; }
  };

  // Commissioner's client auto-settles when the clock hits 0 (single settler,
  // so there are no double-settle races). Others just watch it resolve.
  useEffect(() => {
    if (!isCommish || paused || !lot?.item_id || !lot?.ends_at || settling.current) return;
    if (new Date(lot.ends_at).getTime() - now <= 0) sold();
  }, [isCommish, lot, now, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const skipNominator = async () => {
    if (!isCommish || lot?.item_id || busy) return;
    setBusy(true);
    try { await patchLot({ nominator_pos: nextNominatorPos(lot?.nominator_pos ?? 0) }); await loadLot(); }
    catch (e) {} finally { setBusy(false); }
  };

  // ---- render ----
  const myPicks = picks.filter((p) => p.user_id === user?.id);
  const query = q.trim().toLowerCase();
  const available = items
    .filter((it) => !takenIds.has(String(it.id)))
    .filter((it) => pos === "ALL" || it.position === pos || it.kind === "team")
    .filter((it) => !query || it.name.toLowerCase().includes(query) || (it.team || "").toLowerCase().includes(query))
    .sort((a, b) => (b.proj || 0) - (a.proj || 0))
    .slice(0, 60);

  if (draftComplete) {
    return (
      <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-4 py-4 text-center">
        <div className="font-bold text-emerald-400">Auction complete 🎉</div>
        <div className="text-[12px] text-zinc-500">Squads are set — check the Standings tab.</div>
      </div>
    );
  }

  return (
    <div>
      {paused && (
        <div className="rounded-xl px-4 py-2.5 mb-3 bg-amber-950/40 border border-amber-700/50 text-[12px] text-amber-300 font-bold text-center">
          ⏸ Auction paused by the commissioner — bidding is on hold
        </div>
      )}
      {/* current lot */}
      {lot?.item_id ? (
        <div className={`rounded-2xl px-4 py-4 mb-4 border ${iAmHigh ? "bg-emerald-950/30 border-emerald-700/50" : "bg-red-950/30 border-red-800/50"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">On the block{lot.item_team ? ` · ${lot.item_team}` : ""}{lot.item_position ? ` · ${lot.item_position}` : ""}</div>
              <div className="text-lg font-bold">{lot.item_name}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{lot.high_bid}</div>
              <div className="text-[11px] text-zinc-400">{memberName(lot.high_bidder)}{secondsLeft != null ? ` · ${secondsLeft}s` : ""}</div>
            </div>
          </div>
          {/* bidding */}
          {!iAmHigh && slotsLeftOf(user?.id) > 0 && (
            <div className="flex gap-2 mt-3">
              {[1, 5, 10].map((inc) => {
                const amt = (lot.high_bid || 0) + inc;
                const ok = amt <= myMax;
                return (
                  <button key={inc} onClick={() => bid(amt)} disabled={!ok || busy}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm ${ok ? "bg-red-600 hover:bg-red-500 text-white" : "bg-zinc-800 text-zinc-600"}`}>
                    +{inc} → {amt}
                  </button>
                );
              })}
            </div>
          )}
          {iAmHigh && <div className="text-center text-[12px] text-emerald-400 mt-2">You&apos;re the high bidder</div>}
          <div className="text-[11px] text-zinc-500 mt-2 text-center">Your budget left: {remainingOf(user?.id)} · max bid {Math.max(0, myMax)}</div>
          {isCommish && (
            <button onClick={sold} disabled={busy} className="w-full mt-3 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg">
              🔨 Sell now → {memberName(lot.high_bidder)} ({lot.high_bid}) · or wait for 0
            </button>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-3 mb-4 text-center">
          <div className="font-bold">{myNominate ? "Your turn to nominate" : `Waiting for ${nominator ? memberName(nominator.user_id) : "—"} to nominate`}</div>
          {isCommish && !myNominate && (
            <button onClick={skipNominator} disabled={busy} className="text-[12px] text-zinc-500 underline mt-1">skip nominator</button>
          )}
        </div>
      )}

      {/* managers / budgets */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {members.map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-1.5 border text-[12px] flex justify-between ${m.user_id === lot?.high_bidder ? "border-emerald-700/60 bg-emerald-950/20" : nominator?.user_id === m.user_id && !lot?.item_id ? "border-red-700/50" : "border-zinc-800 bg-zinc-900/50"}`}>
            <span className="truncate">{memberName(m.user_id)} <span className="text-zinc-600">{countByUser[m.user_id] || 0}/{perManager}</span></span>
            <span className="text-zinc-400 font-bold">{remainingOf(m.user_id)}</span>
          </div>
        ))}
      </div>

      {/* Best-available draft board — always visible so everyone can scout.
          The nominator taps a player to put them on the block. */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Best available ({available.length})</h3>
          {myNominate && !lot?.item_id && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400">Opening</span>
              <input type="number" min={1} max={Math.max(1, myMax)} value={openBid} onChange={(e) => setOpenBid(e.target.value)}
                className="w-14 bg-[#09090b] border border-zinc-800 rounded-md px-2 py-1 text-sm text-right" />
            </div>
          )}
        </div>
        <div className="text-[11px] mb-2">
          {lot?.item_id
            ? <span className="text-zinc-500">Bidding in progress — scout your next target.</span>
            : myNominate
              ? <span className="text-red-400 font-semibold">Your nomination — tap a player to put them up for auction.</span>
              : <span className="text-zinc-500">{nominator ? memberName(nominator.user_id) : "Someone"} is nominating…</span>}
        </div>
        {format === "player" && (
          <div className="flex gap-1.5 mb-2">
            {["ALL", "GK", "DEF", "MID", "FWD"].map((p) => (
              <button key={p} onClick={() => setPos(p)} className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${pos === p ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{p}</button>
            ))}
          </div>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players…" className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm mb-2 outline-none focus:border-zinc-600" />
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {available.length === 0 && <p className="text-zinc-600 text-sm py-2">No players match.</p>}
          {available.map((it) => {
            const canNom = myNominate && !lot?.item_id;
            return (
              <button key={it.id} onClick={() => (canNom ? nominate(it) : flash(lot?.item_id ? "Sell the current lot first" : "Not your nomination"))} disabled={busy}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left ${canNom ? "bg-zinc-900 border-zinc-700 hover:border-red-500" : "bg-zinc-900/40 border-zinc-800"}`}>
                {it.position && <span className={`text-[10px] font-bold w-8 ${POS_COLOR[it.position]}`}>{it.position}</span>}
                <span className="text-sm font-medium flex-1 truncate">{it.name}</span>
                {it.team && <span className="text-[11px] text-zinc-500 truncate max-w-[28%]">{it.team}</span>}
                {it.proj != null && <span className="text-[11px] text-zinc-400 w-7 text-right" title="Projected points">{it.proj}</span>}
                {canNom && <span className="text-[10px] text-red-400 font-bold shrink-0">▲</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* my roster */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Your squad ({myPicks.length}/{perManager})</h3>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {myPicks.length === 0 ? <span className="text-zinc-600 text-sm">Nothing won yet.</span> :
          myPicks.map((p) => (
            <span key={p.id} className="text-[12px] bg-zinc-800/70 rounded px-2 py-1">
              {p.position && <span className={POS_COLOR[p.position]}>{p.position} </span>}
              {p.player_name || p.team_name} <span className="text-zinc-500">{p.price}</span>
            </span>
          ))}
      </div>

      {toast && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">{toast}</div>}
    </div>
  );
}
