"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import {
  fetchTeams,
  fetchResults,
  computeStandings,
  onClockPosition,
  draftPlan,
  DEFAULT_SCORING,
  nationStrength,
  playerProjection,
} from "@/lib/worldcup";
import AuctionRoom from "./AuctionRoom";
import WaiverView from "./WaiverView";
import Confetti from "@/components/Confetti";
import WcBackdrop from "@/components/WcBackdrop";
import { Icon } from "@/components/ui";
import { DEFAULT_PLAYER_SCORING, pointsFromComponents, isPlayerScoring } from "@/lib/playerScoring";

const POLL_MS = 2500;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function LeagueRoom() {
  const { id } = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [subTab, setSubTab] = useState("draft"); // 'draft' | 'standings'
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);
  const lastPickCount = useRef(-1);
  const autoPicking = useRef(false);
  const autoStarting = useRef(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  // ---- data loading ----
  const loadAll = useCallback(async () => {
    const [lRes, mRes, pRes] = await Promise.all([
      sbFetch(`wc_leagues?id=eq.${id}&select=*`),
      sbFetch(`wc_members?league_id=eq.${id}&select=*&order=draft_position.asc.nullslast,created_at.asc`),
      sbFetch(`wc_picks?league_id=eq.${id}&select=*&order=pick_number.asc`),
    ]);
    const lg = (await sbJson(lRes))[0];
    if (!lg) { setNotFound(true); setLoading(false); return; }
    setLeague(lg);
    setMembers(await sbJson(mRes));
    setPicks(await sbJson(pRes));
    setLoading(false);
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Self-heal a missing/"Player" name on my own member row from my profile.
  useEffect(() => {
    if (!user || !members.length) return;
    const me = members.find((m) => m.user_id === user.id);
    if (!me) return;
    const myName = profile?.display_name || profile?.handle || user.email?.split("@")[0];
    if (myName && (!me.display_name || me.display_name === "Player") && me.display_name !== myName) {
      sbFetch(`wc_members?id=eq.${me.id}`, {
        method: "PATCH",
        body: JSON.stringify({ display_name: myName, handle: me.handle || profile?.handle || myName }),
      }).then(loadAll).catch(() => {});
    }
  }, [members, user, profile, loadAll]);

  // Load the 48 nations once.
  useEffect(() => { fetchTeams().then(setTeams).catch(() => {}); }, []);

  // Poll while in lobby (to see joins) or drafting (to see picks land live).
  // Skip refetches while the tab is backgrounded to avoid wasted load.
  useEffect(() => {
    if (!league || league.status === "done") return;
    const t = setInterval(() => { if (!document.hidden) loadAll(); }, POLL_MS);
    return () => clearInterval(t);
  }, [league, loadAll]);

  // Load tournament results when viewing standings.
  useEffect(() => {
    if (subTab === "standings" && !results) fetchResults().then(setResults).catch(() => {});
  }, [subTab, results]);

  // Load the player pool (all 48 squads) for player-format leagues.
  useEffect(() => {
    if (league?.format !== "player" || players.length) return;
    setPoolLoading(true);
    fetch("/api/wc-players")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.players)) setPlayers(d.players); })
      .catch(() => {})
      .finally(() => setPoolLoading(false));
  }, [league, players.length]);

  // ---- derived draft state ----
  const format = league?.format || "team";
  const isPlayer = format === "player";
  const squadSize = league?.squad_size || 15;
  const n = members.length;
  const { perManager, totalPicks } = isPlayer
    ? { perManager: squadSize, totalPicks: squadSize * n }
    : draftPlan(n, teams.length || 48);
  const draftComplete = totalPicks > 0 && picks.length >= totalPicks;
  const onClockPos = onClockPosition(picks.length, n);
  const onClockMember = members.find((m) => m.draft_position === onClockPos) || null;
  // Who picks next (snake), and which round we're in — for a richer draft board.
  const onDeckMember = members.find((m) => m.draft_position === onClockPosition(picks.length + 1, n)) || null;
  const roundNum = n ? Math.floor(picks.length / n) + 1 : 1;
  const totalRounds = perManager || 0;
  const isMyTurn =
    league?.status === "drafting" &&
    !draftComplete &&
    onClockMember?.user_id === user?.id;
  const isCommish = league && user && league.commissioner_id === user.id;
  const isAuction = league?.draft_type === "auction";
  const pickedTeamIds = new Set(picks.map((p) => String(p.team_id)));
  const pickedPlayerIds = new Set(picks.map((p) => String(p.player_id)));

  // Normalized items for the auction (teams or players).
  const auctionItems = isPlayer
    ? players.map((p) => ({ id: p.id, name: p.name, kind: "player", team: p.team_name, position: p.role, proj: typeof p.proj === "number" ? p.proj : playerProjection(p) }))
    : teams.map((t) => ({ id: t.id, name: t.name, kind: "team", proj: nationStrength(t.name) }));

  const paused = !!league?.draft_paused;

  // Advisory countdown — starts on the first pick, resets whenever a new pick
  // lands, frozen while paused.
  useEffect(() => {
    if (league?.status !== "drafting" || draftComplete) { setSecondsLeft(null); lastPickCount.current = -1; return; }
    // -1 sentinel ensures the very first pick (picks.length === 0) starts the clock.
    if (picks.length !== lastPickCount.current) {
      lastPickCount.current = picks.length;
      setSecondsLeft(league.pick_seconds || 90);
    }
    if (league?.draft_paused) return; // hold the clock while the commissioner has it paused
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? (league.pick_seconds || 90) : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [league, picks.length, draftComplete]);

  // Commissioner auto-marks the league done once the board is full.
  useEffect(() => {
    if (isCommish && draftComplete && league?.status === "drafting") {
      sbFetch(`wc_leagues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) })
        .then(loadAll);
    }
  }, [isCommish, draftComplete, league, id, loadAll]);

  // Auto-draft: when an on-the-clock manager's snake-draft timer hits 0, the
  // commissioner's client picks the best available for them (handles no-shows).
  const autoPick = useCallback(async () => {
    if (autoPicking.current) return;
    const onClockPos2 = onClockPosition(picks.length, members.length);
    const onClock = members.find((m) => m.draft_position === onClockPos2);
    if (!onClock) return;
    autoPicking.current = true;
    try {
      let body;
      if (isPlayer) {
        const avail = players
          .filter((p) => !pickedPlayerIds.has(String(p.id)))
          .sort((a, b) => (typeof b.proj === "number" ? b.proj : playerProjection(b)) - (typeof a.proj === "number" ? a.proj : playerProjection(a)));
        const pl = avail[0]; if (!pl) return;
        body = { league_id: id, user_id: onClock.user_id, player_id: String(pl.id), player_name: pl.name, position: pl.role, team_name: pl.team_name, pick_number: picks.length };
      } else {
        const avail = teams.filter((t) => !pickedTeamIds.has(String(t.id))).sort((a, b) => nationStrength(b.name) - nationStrength(a.name));
        const tm = avail[0]; if (!tm) return;
        body = { league_id: id, user_id: onClock.user_id, team_id: tm.id, team_abbr: tm.abbr, team_name: tm.name, pick_number: picks.length };
      }
      const { res } = await sbInsert("wc_picks", body);
      if (res.ok || res.status === 409) await loadAll();
    } catch (e) { /* retry next tick */ } finally { autoPicking.current = false; }
  }, [id, isPlayer, players, teams, picks.length, members, pickedPlayerIds, pickedTeamIds, loadAll]);

  useEffect(() => {
    if (!isCommish || league?.draft_type === "auction" || league?.status !== "drafting" || draftComplete) return;
    if (league?.draft_paused) return; // no auto-draft while paused (waiting on a late manager)
    if (secondsLeft !== null && secondsLeft <= 0) autoPick();
  }, [isCommish, league, draftComplete, secondsLeft, autoPick]);

  // Commissioner auto-starts a scheduled draft once its time arrives.
  useEffect(() => {
    if (!isCommish || autoStarting.current || league?.status !== "lobby" || !league?.draft_at || members.length < 2) return;
    if (Date.now() >= new Date(league.draft_at).getTime()) {
      autoStarting.current = true;
      startDraft().finally(() => { autoStarting.current = false; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCommish, league, members.length]);

  // ---- actions ----
  // Persist a draft order: write each member's draft_position to its index.
  const patchMemberPositions = async (orderedList) => {
    for (let i = 0; i < orderedList.length; i++) {
      await sbFetch(`wc_members?id=eq.${orderedList[i].id}`, {
        method: "PATCH",
        body: JSON.stringify({ draft_position: i }),
      });
    }
    await loadAll();
  };

  const randomizeOrder = async () => {
    if (!isCommish || busy) return;
    setBusy(true);
    try { await patchMemberPositions(shuffle(members)); }
    catch (e) { flash("Couldn't shuffle"); }
    finally { setBusy(false); }
  };

  const moveMember = async (memberId, dir) => {
    if (!isCommish || busy) return;
    const arr = [...members];
    const idx = arr.findIndex((m) => m.id === memberId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setBusy(true);
    try { await patchMemberPositions(arr); }
    catch (e) { flash("Couldn't reorder"); }
    finally { setBusy(false); }
  };

  const saveSettings = async (patch) => {
    if (!isCommish || busy) return;
    setBusy(true);
    try {
      let res = await sbFetch(`wc_leagues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!res.ok && "draft_at" in patch) {
        // draft_at column may not exist yet — save the rest.
        const { draft_at, ...rest } = patch;
        res = await sbFetch(`wc_leagues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(rest) });
      }
      await loadAll();
      flash(res.ok ? "Settings saved" : "Couldn't save settings");
    } catch (e) {
      flash("Couldn't save settings");
    } finally {
      setBusy(false);
    }
  };

  const startDraft = async () => {
    if (!isCommish || n < 2 || busy) return;
    setBusy(true);
    try {
      // Lock in the current order (whatever the commissioner arranged) as 0..n-1.
      await patchMemberPositions(members);
      // For auctions, seed the live lot row so members can nominate/bid.
      if (league?.draft_type === "auction") {
        await sbFetch("wc_auction", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ league_id: id, nominator_pos: 0 }),
        });
      }
      await sbFetch(`wc_leagues?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "drafting" }),
      });
      await loadAll();
    } catch (e) {
      flash("Couldn't start draft");
    } finally {
      setBusy(false);
    }
  };

  // Commissioner can pause the draft (e.g. a manager is running late) — freezes
  // the clock and suspends auto-drafting until resumed.
  const togglePause = async () => {
    if (!isCommish || busy || league?.status !== "drafting") return;
    setBusy(true);
    try {
      const next = !league.draft_paused;
      const res = await sbFetch(`wc_leagues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ draft_paused: next }) });
      if (!res.ok) { flash("Couldn't update — add the draft_paused column"); return; }
      // A fresh clock on resume so the on-the-clock manager gets a full window.
      if (!next) lastPickCount.current = -1;
      await loadAll();
      flash(next ? "Draft paused" : "Draft resumed");
    } catch (e) {
      flash("Couldn't update");
    } finally {
      setBusy(false);
    }
  };

  const pickTeam = async (team) => {
    if (!isMyTurn || busy || pickedTeamIds.has(String(team.id))) return;
    setBusy(true);
    try {
      const { res } = await sbInsert("wc_picks", {
        league_id: id,
        user_id: user.id,
        team_id: team.id,
        team_abbr: team.abbr,
        team_name: team.name,
        pick_number: picks.length,
      });
      if (!res.ok) {
        // 409 = someone grabbed that slot/team first; just resync.
        await loadAll();
        flash(res.status === 409 ? "Too slow — board moved on" : "Pick failed");
        return;
      }
      await loadAll();
    } catch (e) {
      flash("Pick failed");
    } finally {
      setBusy(false);
    }
  };

  const pickPlayer = async (pl) => {
    if (!isMyTurn || busy || pickedPlayerIds.has(String(pl.id))) return;
    setBusy(true);
    try {
      const { res } = await sbInsert("wc_picks", {
        league_id: id,
        user_id: user.id,
        player_id: String(pl.id),
        player_name: pl.name,
        position: pl.role,
        team_name: pl.team_name,
        pick_number: picks.length,
      });
      if (!res.ok) {
        await loadAll();
        flash(res.status === 409 ? "Too slow — someone took that player" : "Pick failed");
        return;
      }
      await loadAll();
    } catch (e) {
      flash("Pick failed");
    } finally {
      setBusy(false);
    }
  };

  const undoLastPick = async () => {
    if (!isCommish || picks.length === 0 || busy) return;
    setBusy(true);
    try {
      const last = picks[picks.length - 1];
      await sbFetch(`wc_picks?id=eq.${last.id}`, { method: "DELETE" });
      if (league.status === "done") {
        await sbFetch(`wc_leagues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "drafting" }) });
      }
      await loadAll();
    } catch (e) {
      flash("Couldn't undo");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    try { navigator.clipboard.writeText(league.invite_code); flash("Code copied"); } catch (e) {}
  };
  const copyLink = async () => {
    const link = `${window.location.origin}/worldcup/join/${league.invite_code}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: "The Nosebleeds", text: `Join ${league.name || "my league"} on The Nosebleeds`, url: link }); return; }
      catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(link); flash("Invite link copied. Text it to friends!"); } catch (e) {}
  };

  // ---- render ----
  if (loading) return <Shell><p className="text-zinc-600 text-sm py-10">Loading…</p></Shell>;
  if (notFound) return <Shell><p className="text-zinc-500 py-10">League not found.</p></Shell>;

  const myPicks = picks.filter((p) => p.user_id === user?.id);

  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/70 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <Icon name="trophy" className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{league.name}</h1>
            <div className="text-[11px] text-zinc-500 leading-tight flex items-center gap-2">
              <button onClick={copyLink} className="text-red-400 font-semibold inline-flex items-center gap-1"><Icon name="link" className="w-3 h-3" /> Copy invite link</button>
              <button onClick={copyCode}>code <span className="text-zinc-300 font-mono tracking-widest">{league.invite_code}</span></button>
            </div>
          </div>
        </div>
        {/* sub-tabs */}
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {["draft", "standings", ...(isPlayer && league.status === "done" ? ["waivers"] : []), ...(isCommish ? ["settings"] : [])].map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`pb-2 font-bold capitalize border-b-2 ${
                subTab === t ? "text-white border-red-500" : "text-zinc-600 border-transparent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {subTab === "draft" ? (
          <>
          {league.status === "drafting" && (paused || isCommish) && (
            <div className={`rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between gap-2 border ${paused ? "bg-amber-950/40 border-amber-700/50" : "bg-zinc-900/70 border-zinc-800"}`}>
              <div className="text-[12px] leading-tight">
                {paused
                  ? <span className="text-amber-300 font-bold">⏸ Draft paused{isCommish ? "" : " by the commissioner"}</span>
                  : <span className="text-zinc-400">Waiting on someone? You can pause the clock.</span>}
              </div>
              {isCommish && (
                <button onClick={togglePause} disabled={busy}
                  className={`shrink-0 text-[12px] font-bold px-3 py-1.5 rounded-lg ${paused ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-amber-600 hover:bg-amber-500 text-white"}`}>
                  {paused ? "▶ Resume" : "⏸ Pause"}
                </button>
              )}
            </div>
          )}
          {league.status === "lobby" ? (
            <Lobby
              members={members}
              isCommish={isCommish}
              perManager={n >= 2 ? perManager : 0}
              format={format}
              draftType={league.draft_type || "snake"}
              league={league}
              onSaveSchedule={saveSettings}
              onStart={startDraft}
              busy={busy}
            />
          ) : isAuction ? (
            <AuctionRoom
              leagueId={id}
              members={members}
              picks={picks}
              user={user}
              isCommish={isCommish}
              format={format}
              items={auctionItems}
              perManager={perManager}
              totalPicks={totalPicks}
              budget={league.budget || 200}
              paused={paused}
              onReload={loadAll}
            />
          ) : isPlayer ? (
            <PlayerDraftBoard
              members={members}
              picks={picks}
              players={players}
              poolLoading={poolLoading}
              pickedPlayerIds={pickedPlayerIds}
              onClockMember={onClockMember}
              onDeckMember={onDeckMember}
              roundNum={roundNum}
              totalRounds={totalRounds}
              isMyTurn={isMyTurn}
              draftComplete={draftComplete}
              perManager={perManager}
              totalPicks={totalPicks}
              secondsLeft={secondsLeft}
              onPick={pickPlayer}
              isCommish={isCommish}
              onUndo={undoLastPick}
              busy={busy}
              myPicks={myPicks}
            />
          ) : (
            <DraftBoard
              members={members}
              picks={picks}
              teams={teams}
              pickedTeamIds={pickedTeamIds}
              onClockMember={onClockMember}
              onDeckMember={onDeckMember}
              roundNum={roundNum}
              totalRounds={totalRounds}
              isMyTurn={isMyTurn}
              draftComplete={draftComplete}
              perManager={perManager}
              totalPicks={totalPicks}
              secondsLeft={secondsLeft}
              onPick={pickTeam}
              isCommish={isCommish}
              onUndo={undoLastPick}
              busy={busy}
              myPicks={myPicks}
            />
          )}
          </>
        ) : subTab === "standings" ? (
          isPlayer ? (
            <PlayerStandings members={members} picks={picks} scoring={league.scoring} />
          ) : (
            <Standings
              members={members}
              picks={picks}
              results={results}
              scoring={league.scoring || DEFAULT_SCORING}
              status={league.status}
            />
          )
        ) : subTab === "waivers" ? (
          <WaiverView leagueId={id} members={members} picks={picks} players={players} user={user} />
        ) : (
          <Settings
            league={league}
            members={members}
            onSave={saveSettings}
            onMove={moveMember}
            onRandomize={randomizeOrder}
            busy={busy}
          />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-sm px-4 py-2 rounded-full z-50">
          {toast}
        </div>
      )}
      <Confetti show={draftComplete && league.status === "done"} />
      <Nav />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Shell({ children }) {
  return (
    <div className="min-h-screen pb-24">
      <WcBackdrop />
      <div className="max-w-2xl mx-auto px-4 pt-6">{children}</div>
      <Nav />
    </div>
  );
}

function Lobby({ members, isCommish, perManager, format, draftType, league, onSaveSchedule, onStart, busy }) {
  const noun = format === "player" ? "players" : "nations";
  const isAuction = draftType === "auction";
  const draftAt = league?.draft_at;
  const [showSched, setShowSched] = useState(false);
  const [when, setWhen] = useState(toLocalInput(draftAt));
  const [secs, setSecs] = useState(league?.pick_seconds || 90);

  const saveSchedule = () => {
    onSaveSchedule({ draft_at: when ? new Date(when).toISOString() : null, pick_seconds: Math.max(10, parseInt(secs) || 90) });
    setShowSched(false);
  };

  return (
    <div>
      {draftAt && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3 mb-3 text-center">
          <div className="text-[11px] uppercase tracking-wide text-red-300/70">Draft scheduled</div>
          <div className="font-bold text-white">{new Date(draftAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Auto-starts then · no-shows are auto-drafted</div>
        </div>
      )}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-1">Pre-{isAuction ? "auction" : "draft"} lobby</h3>
        <p className="text-[12px] text-zinc-500 mb-3">
          Share the invite code. When everyone&apos;s in, the commissioner starts the {isAuction ? "auction — nominate players and bid; the commissioner calls “sold”" : "draft — it snakes (1·2·3 → 3·2·1)"}.
          {members.length >= 2 && <> Each manager builds a squad of <span className="text-zinc-300">{perManager}</span> {noun}.</>}
        </p>
        <div className="space-y-1.5">
          {members.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className="text-zinc-600 w-5">{i + 1}</span>
              <span>{m.display_name || m.handle || "Player"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Commissioner: schedule the draft + set the pick clock, right here in the lobby. */}
      {isCommish && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold">⏰ Schedule &amp; pick clock</h3>
              <p className="text-[11px] text-zinc-500">
                {draftAt ? `Starts ${new Date(draftAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not scheduled"} · {league?.pick_seconds || 90}s per pick
              </p>
            </div>
            <button onClick={() => setShowSched((v) => !v)} className="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">
              {showSched ? "Close" : "Edit"}
            </button>
          </div>
          {showSched && (
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="text-[12px] text-zinc-400">Date &amp; time (optional — auto-starts then)</span>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                  className="w-full mt-1 bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-600" />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-zinc-300">Seconds per pick</span>
                <input type="number" min={10} value={secs} onChange={(e) => setSecs(e.target.value)}
                  className="w-20 bg-[#09090b] border border-zinc-800 rounded-md px-2 py-1 text-sm text-right outline-none focus:border-zinc-600" />
              </label>
              <div className="flex gap-2">
                {when && <button onClick={() => { setWhen(""); }} className="text-[12px] text-zinc-400 px-3 py-2">Clear date</button>}
                <button onClick={saveSchedule} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-2 rounded-xl text-sm">Save</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isCommish ? (
        <button
          onClick={onStart}
          disabled={busy || members.length < 2}
          className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl"
        >
          {members.length < 2 ? "Need 2+ managers to start" : "Start draft now 🎲"}
        </button>
      ) : (
        <p className="text-center text-zinc-500 text-sm py-2">Waiting for the commissioner to start…</p>
      )}
    </div>
  );
}

// Shared "on the clock" banner — round, pick number, who's up, who's on deck, timer.
function OnClockBar({ picks, totalPicks, roundNum, totalRounds, onClockName, onDeckName, isMyTurn, secondsLeft }) {
  return (
    <div className={`rounded-2xl px-4 py-3 mb-3 border ${isMyTurn ? "bg-red-950/40 border-red-700/60" : "bg-zinc-900/70 border-zinc-800"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Round {roundNum}{totalRounds ? `/${totalRounds}` : ""} · Pick {picks.length + 1} of {totalPicks}
          </div>
          <div className="font-bold text-lg leading-tight truncate">
            {isMyTurn ? "🟢 You're on the clock" : `${onClockName} is picking`}
          </div>
          {onDeckName && <div className="text-[11px] text-zinc-500 truncate">On deck: {onDeckName}</div>}
        </div>
        {secondsLeft != null && (
          <div className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 ${secondsLeft <= 10 ? "border-red-500 animate-pulse" : "border-zinc-700"}`}>
            <span className={`text-xl font-bold tabular-nums leading-none ${secondsLeft <= 10 ? "text-red-500" : "text-zinc-200"}`}>{secondsLeft}</span>
            <span className="text-[8px] text-zinc-500 mt-0.5">sec</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Shared recent-picks strip so the board feels live.
function RecentPicks({ picks, members }) {
  if (!picks.length) return null;
  const nameOf = (uid) => { const m = members.find((x) => x.user_id === uid); return m?.display_name || m?.handle || "Player"; };
  const last = picks.slice(-4).reverse();
  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mb-1">Recent picks</div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {last.map((p, i) => (
          <div key={p.id} className="shrink-0 bg-zinc-900/70 border border-zinc-800 rounded-lg px-2.5 py-1.5 max-w-[9rem]">
            <div className="text-[11px] font-bold truncate">{p.player_name || p.team_name}</div>
            <div className="text-[9px] text-zinc-500 truncate">#{picks.length - i} · {nameOf(p.user_id)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Fixed confirm bar shown when a manager has tapped a pick but not confirmed.
function ConfirmPickBar({ name, sub, onConfirm, onCancel, busy }) {
  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 px-3">
      <div className="max-w-2xl mx-auto bg-zinc-900 border border-red-700/60 rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-zinc-500">Draft this pick?</div>
          <div className="font-bold truncate">{name}{sub ? <span className="text-zinc-500 font-normal"> · {sub}</span> : null}</div>
        </div>
        <button onClick={onCancel} className="text-[12px] font-bold px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300">Cancel</button>
        <button onClick={onConfirm} disabled={busy} className="text-[13px] font-bold px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white inline-flex items-center gap-1"><Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} /> Draft</button>
      </div>
    </div>
  );
}

function DraftBoard({
  members, picks, teams, pickedTeamIds, onClockMember, onDeckMember, roundNum, totalRounds,
  isMyTurn, draftComplete, perManager, totalPicks, secondsLeft, onPick, isCommish, onUndo, busy, myPicks,
}) {
  const memberName = (uid) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.display_name || m?.handle || "Player";
  };
  const [pending, setPending] = useState(null);
  // Drop a pending selection once the board moves on (someone picked / not my turn).
  useEffect(() => { setPending(null); }, [picks.length, isMyTurn]);
  // Suggested order: strongest nations first, so users don't have to sort.
  const available = teams
    .filter((t) => !pickedTeamIds.has(String(t.id)))
    .sort((a, b) => nationStrength(b.name) - nationStrength(a.name));

  return (
    <div>
      {/* status bar */}
      {draftComplete ? (
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-4 py-3 mb-4 text-center">
          <div className="font-bold text-emerald-400">Draft complete 🎉</div>
          <div className="text-[12px] text-zinc-500">Check the Standings tab once games kick off.</div>
        </div>
      ) : (
        <>
          <OnClockBar picks={picks} totalPicks={totalPicks} roundNum={roundNum} totalRounds={totalRounds}
            onClockName={onClockMember ? memberName(onClockMember.user_id) : "—"} onDeckName={onDeckMember ? memberName(onDeckMember.user_id) : ""}
            isMyTurn={isMyTurn} secondsLeft={secondsLeft} />
          <RecentPicks picks={picks} members={members} />
        </>
      )}

      {/* available nations (suggested order: strongest first) */}
      {!draftComplete && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Available ({available.length}) · suggested order
            </h3>
            {isMyTurn && available[0] && (
              <button
                onClick={() => setPending(available[0])}
                disabled={busy}
                className="text-[12px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold px-3 py-1 rounded-lg"
              >
                ⚡ Best available
              </button>
            )}
          </div>
          {isMyTurn && <p className="text-[11px] text-zinc-500 mb-2">Tap a nation to pick — you&apos;ll confirm before it&apos;s locked in.</p>}
          <div className="grid grid-cols-2 gap-2 mb-6">
            {available.map((t) => (
              <button
                key={t.id}
                onClick={() => setPending(t)}
                disabled={!isMyTurn || busy}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border text-left transition-all ${
                  pending?.id === t.id ? "bg-red-950/50 border-red-500"
                  : isMyTurn ? "bg-zinc-900 border-zinc-700 hover:border-red-500 active:scale-[0.98]"
                  : "bg-zinc-900/50 border-zinc-800 opacity-60"
                }`}
              >
                {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain" />}
                <span className="text-sm font-medium truncate flex-1">{t.name}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums">{nationStrength(t.name)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {pending && (
        <ConfirmPickBar name={pending.name} sub={`strength ${nationStrength(pending.name)}`} busy={busy}
          onCancel={() => setPending(null)} onConfirm={() => { onPick(pending); setPending(null); }} />
      )}

      {/* my squad */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">
        Your squad ({myPicks.length}{perManager ? `/${perManager}` : ""})
      </h3>
      <div className="flex flex-wrap gap-2 mb-6">
        {myPicks.length === 0 ? (
          <p className="text-zinc-600 text-sm">No picks yet.</p>
        ) : (
          myPicks.map((p) => {
            const t = teams.find((x) => String(x.id) === String(p.team_id));
            return (
              <span key={p.id} className="flex items-center gap-1.5 bg-zinc-800/70 rounded-lg px-2 py-1 text-sm">
                {t?.logo && <img src={t.logo} alt="" className="w-4 h-4 object-contain" />}
                {p.team_name}
              </span>
            );
          })
        )}
      </div>

      {/* full draft log */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Draft log</h3>
      <div className="space-y-1 mb-4">
        {[...picks].reverse().map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm bg-zinc-900/40 rounded-lg px-3 py-1.5">
            <span className="text-zinc-600 w-8 text-[11px]">#{p.pick_number + 1}</span>
            <span className="font-medium">{p.team_name}</span>
            <span className="text-zinc-600 text-[11px] ml-auto">{memberName(p.user_id)}</span>
          </div>
        ))}
        {picks.length === 0 && <p className="text-zinc-600 text-sm">No picks yet.</p>}
      </div>

      {isCommish && picks.length > 0 && (
        <button
          onClick={onUndo}
          disabled={busy}
          className="text-[12px] text-zinc-500 hover:text-zinc-300 underline"
        >
          Undo last pick (commissioner)
        </button>
      )}
    </div>
  );
}

function Standings({ members, picks, results, scoring, status }) {
  if (!results) return <p className="text-zinc-600 text-sm py-8">Loading results…</p>;
  const rows = computeStandings(members, picks, results, scoring);
  const noGames = (results.events || 0) === 0;

  return (
    <div>
      {noGames && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-4 text-[12px] text-zinc-500">
          No completed matches yet — standings fill in automatically as the World Cup plays out.
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.user_id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-zinc-600 font-bold w-5">{i + 1}</span>
                <span className="font-bold">{r.name}</span>
              </div>
              <span className="font-bold text-red-500 tabular-nums">{r.total} pts</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-7">
              {r.teams.map((t) => (
                <span
                  key={t.team_id}
                  className="text-[11px] bg-zinc-800/70 rounded px-1.5 py-0.5 text-zinc-300"
                  title={t.stat ? `${t.stat.w}W ${t.stat.d}D ${t.stat.l}L · ${t.stat.gf} GF` : "no games yet"}
                >
                  {t.team_abbr || t.team_name} <span className="text-zinc-500">{t.points}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-zinc-600 text-sm py-6">No managers yet.</p>}
      </div>

      {/* scoring legend */}
      <div className="mt-6 text-[11px] text-zinc-600 leading-relaxed">
        <span className="font-bold text-zinc-500">Scoring</span> · Win {scoring.win} · Draw {scoring.draw} ·
        Goal {scoring.goal} · Clean sheet {scoring.clean_sheet} · Reach R16 +{scoring.r16} · QF +{scoring.qf} ·
        SF +{scoring.sf} · Final +{scoring.final} · Champion +{scoring.champion}
      </div>
    </div>
  );
}

// Commissioner-only config: scoring, pick timer, and pre-draft order.
const SCORE_FIELDS = [
  ["win", "Win"],
  ["draw", "Draw"],
  ["goal", "Goal scored"],
  ["clean_sheet", "Clean sheet"],
  ["r16", "Reach Round of 16"],
  ["qf", "Reach Quarterfinal"],
  ["sf", "Reach Semifinal"],
  ["final", "Reach Final"],
  ["champion", "Champion"],
];

// ISO timestamp <-> <input type="datetime-local"> value (local time).
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso); const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Editable player-scoring fields (dotted paths into the scoring object).
const PLAYER_SCORE_FIELDS = [
  ["play_60", "Played 60+"], ["play_1", "Played <60"],
  ["goal.GK", "Goal · GK"], ["goal.DEF", "Goal · DEF"], ["goal.MID", "Goal · MID"], ["goal.FWD", "Goal · FWD"],
  ["assist", "Assist"], ["shot_on_target", "Shot on target"], ["tackle", "Tackle"],
  ["clean_sheet.GK", "Clean sheet · GK"], ["clean_sheet.DEF", "Clean sheet · DEF"], ["clean_sheet.MID", "Clean sheet · MID"],
  ["conceded_2.GK", "Conceded /2 · GK"], ["conceded_2.DEF", "Conceded /2 · DEF"],
  ["save_points", "Saves /3"], ["yellow", "Yellow"], ["red", "Red"], ["own_goal", "Own goal"],
];

function Settings({ league, members, onSave, onMove, onRandomize, busy }) {
  const isPlayer = league.format === "player";
  const base = { ...DEFAULT_SCORING, ...(league.scoring || {}) };
  const [form, setForm] = useState(base);
  // Player-scoring form (nested object), starting from the league's or the default.
  const [pform, setPform] = useState(() =>
    JSON.parse(JSON.stringify(isPlayerScoring(league.scoring) ? league.scoring : DEFAULT_PLAYER_SCORING))
  );
  const [secs, setSecs] = useState(league.pick_seconds || 90);
  const [draftAt, setDraftAt] = useState(toLocalInput(league.draft_at));
  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  const isLobby = league.status === "lobby";

  const getP = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), pform);
  const setP = (path, val) => setPform((prev) => {
    const r = JSON.parse(JSON.stringify(prev)); const ks = path.split(".");
    let o = r; for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = num(val); return r;
  });

  const save = () => {
    const draft_at = draftAt ? new Date(draftAt).toISOString() : null;
    if (isPlayer) { onSave({ scoring: pform, pick_seconds: Math.max(10, num(secs)), draft_at }); return; }
    const scoring = {};
    for (const [k] of SCORE_FIELDS) scoring[k] = num(form[k]);
    onSave({ scoring, pick_seconds: Math.max(10, num(secs)), draft_at });
  };

  return (
    <div>
      {/* Draft order */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-1">Draft order</h3>
        <p className="text-[12px] text-zinc-500 mb-3">
          {isLobby
            ? "Arrange the snake order, or shuffle it. This locks when you start the draft."
            : "The draft has started — order is locked."}
        </p>
        <div className="space-y-1.5 mb-3">
          {members.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 text-sm bg-zinc-900/40 rounded-lg px-3 py-1.5">
              <span className="text-zinc-600 w-5">{i + 1}</span>
              <span className="flex-1 truncate">{m.display_name || m.handle || "Player"}</span>
              {isLobby && (
                <span className="flex gap-1">
                  <button
                    onClick={() => onMove(m.id, -1)}
                    disabled={busy || i === 0}
                    className="w-7 h-7 rounded-md bg-zinc-800 disabled:opacity-30 text-zinc-300"
                  >↑</button>
                  <button
                    onClick={() => onMove(m.id, 1)}
                    disabled={busy || i === members.length - 1}
                    className="w-7 h-7 rounded-md bg-zinc-800 disabled:opacity-30 text-zinc-300"
                  >↓</button>
                </span>
              )}
            </div>
          ))}
        </div>
        {isLobby && (
          <button
            onClick={onRandomize}
            disabled={busy || members.length < 2}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl"
          >
            🎲 Randomize order
          </button>
        )}
      </div>

      {/* Draft schedule + pick timer */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-1">Draft schedule</h3>
        <p className="text-[12px] text-zinc-500 mb-2">Optional — the draft auto-starts at this time. Anyone who misses their pick is <span className="text-zinc-300">auto-drafted</span> the best available.</p>
        <input
          type="datetime-local"
          value={draftAt}
          onChange={(e) => setDraftAt(e.target.value)}
          className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-600 mb-3"
        />
        <label className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-zinc-300">Seconds per pick</span>
          <input type="number" min={10} value={secs} onChange={(e) => setSecs(e.target.value)} className="w-20 bg-[#09090b] border border-zinc-800 rounded-md px-2 py-1 text-sm text-right outline-none focus:border-zinc-600" />
        </label>
      </div>

      {/* Scoring */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-1">Scoring</h3>
        {league.format === "player" ? (
          <>
            <p className="text-[12px] text-zinc-500 mb-3">Set the points each action is worth (per-match thresholds: 60 min, clean sheet, conceded ÷2, saves ÷3 are fixed). Standings re-score instantly.</p>
            <div className="grid grid-cols-2 gap-2">
              {PLAYER_SCORE_FIELDS.map(([path, label]) => (
                <label key={path} className="flex items-center justify-between gap-2 bg-zinc-900/40 rounded-lg px-3 py-2">
                  <span className="text-[12px] text-zinc-300">{label}</span>
                  <input
                    type="number" step="0.25" value={getP(path) ?? 0}
                    onChange={(e) => setP(path, e.target.value)}
                    className="w-14 bg-[#09090b] border border-zinc-800 rounded-md px-1.5 py-1 text-sm text-right outline-none focus:border-zinc-600"
                  />
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-zinc-500 mb-3">
              Points each nation earns. Round bonuses are cumulative (a finalist banks R16 + QF + SF + Final).
              Changes re-score the standings instantly.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SCORE_FIELDS.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-2 bg-zinc-900/40 rounded-lg px-3 py-2">
                  <span className="text-[13px] text-zinc-300">{label}</span>
                  <input
                    type="number"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-16 bg-[#09090b] border border-zinc-800 rounded-md px-2 py-1 text-sm text-right outline-none focus:border-zinc-600"
                  />
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl"
      >
        Save settings
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
const POS = ["ALL", "GK", "DEF", "MID", "FWD"];
const POS_COLOR = { GK: "text-amber-400", DEF: "text-sky-400", MID: "text-emerald-400", FWD: "text-red-400" };

function PlayerDraftBoard({
  members, picks, players, poolLoading, pickedPlayerIds, onClockMember, onDeckMember, roundNum, totalRounds, isMyTurn,
  draftComplete, perManager, totalPicks, secondsLeft, onPick, isCommish, onUndo, busy, myPicks,
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [pending, setPending] = useState(null);
  useEffect(() => { setPending(null); }, [picks.length, isMyTurn]);
  const memberName = (uid) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.display_name || m?.handle || "Player";
  };

  const projOf = (p) => (typeof p.proj === "number" ? p.proj : playerProjection(p));
  const query = q.trim().toLowerCase();
  const available = players
    .filter((p) => !pickedPlayerIds.has(String(p.id)))
    .filter((p) => pos === "ALL" || p.role === pos)
    .filter((p) => !query || (p.name || "").toLowerCase().includes(query) || (p.team_name || "").toLowerCase().includes(query))
    .sort((a, b) => projOf(b) - projOf(a)); // suggested order
  const shown = available.slice(0, 80);

  // group my squad by position
  const squadByPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of myPicks) (squadByPos[p.position] || squadByPos.MID).push(p);

  return (
    <div>
      {draftComplete ? (
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-4 py-3 mb-4 text-center">
          <div className="font-bold text-emerald-400">Draft complete 🎉</div>
          <div className="text-[12px] text-zinc-500">Your squad scores automatically once matches kick off.</div>
        </div>
      ) : (
        <>
          <OnClockBar picks={picks} totalPicks={totalPicks} roundNum={roundNum} totalRounds={totalRounds}
            onClockName={onClockMember ? memberName(onClockMember.user_id) : "—"} onDeckName={onDeckMember ? memberName(onDeckMember.user_id) : ""}
            isMyTurn={isMyTurn} secondsLeft={secondsLeft} />
          <RecentPicks picks={picks} members={members} />
        </>
      )}

      {/* my squad */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">
        Your squad ({myPicks.length}/{perManager})
      </h3>
      <div className="space-y-1.5 mb-6">
        {myPicks.length === 0 ? (
          <p className="text-zinc-600 text-sm">No picks yet.</p>
        ) : (
          ["GK", "DEF", "MID", "FWD"].map((g) =>
            squadByPos[g].length ? (
              <div key={g} className="flex gap-2 items-start">
                <span className={`text-[10px] font-bold w-8 pt-1.5 ${POS_COLOR[g]}`}>{g}</span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {squadByPos[g].map((p) => (
                    <span key={p.id} className="text-[12px] bg-zinc-800/70 rounded px-2 py-1">
                      {p.player_name} <span className="text-zinc-500">{p.team_name}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )
        )}
      </div>

      {/* pool */}
      {!draftComplete && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Player pool · suggested order
            </h3>
            {isMyTurn && shown[0] && (
              <button
                onClick={() => setPending(shown[0])}
                disabled={busy}
                className="text-[12px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold px-3 py-1 rounded-lg"
              >
                ⚡ Best available
              </button>
            )}
          </div>
          {isMyTurn && <p className="text-[11px] text-zinc-500 mb-2">Tap a player to pick — you&apos;ll confirm before it&apos;s locked in.</p>}
          {poolLoading && players.length === 0 ? (
            <p className="text-zinc-600 text-sm py-4">Loading squads…</p>
          ) : (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search player or nation…"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2.5 text-sm mb-2 outline-none focus:border-zinc-600"
              />
              <div className="flex gap-1.5 mb-1">
                {POS.map((p) => (
                  <button key={p} onClick={() => setPos(p)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${pos === p ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mb-3">“Proj” is a pre-tournament strength estimate — replaced by live form once games start.</p>
              <div className="space-y-1">
                {shown.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPending(p)}
                    disabled={!isMyTurn || busy}
                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left ${pending?.id === p.id ? "bg-red-950/50 border-red-500" : isMyTurn ? "bg-zinc-900 border-zinc-700 hover:border-red-500 active:scale-[0.99]" : "bg-zinc-900/50 border-zinc-800 opacity-70"}`}
                  >
                    <span className={`text-[10px] font-bold w-8 ${POS_COLOR[p.role] || "text-zinc-400"}`}>{p.role}</span>
                    {p.image && <img src={p.image} alt="" className="w-6 h-6 rounded-full object-cover bg-zinc-800 shrink-0" loading="lazy" />}
                    <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                    <span className="text-[11px] text-zinc-500 truncate max-w-[30%]">{p.team_name}</span>
                    <span className="text-[11px] text-zinc-400 tabular-nums w-7 text-right" title="Projection">{projOf(p)}</span>
                  </button>
                ))}
                {available.length === 0 && <p className="text-zinc-600 text-sm py-3">No players match.</p>}
                {available.length > shown.length && (
                  <p className="text-zinc-600 text-[12px] py-2 text-center">+{available.length - shown.length} more — refine your search</p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* draft log */}
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2 mt-6">Draft log</h3>
      <div className="space-y-1 mb-4">
        {[...picks].reverse().slice(0, 30).map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm bg-zinc-900/40 rounded-lg px-3 py-1.5">
            <span className="text-zinc-600 w-8 text-[11px]">#{p.pick_number + 1}</span>
            <span className="font-medium">{p.player_name}</span>
            <span className="text-zinc-600 text-[11px]">{p.team_name}</span>
            <span className="text-zinc-600 text-[11px] ml-auto">{memberName(p.user_id)}</span>
          </div>
        ))}
        {picks.length === 0 && <p className="text-zinc-600 text-sm">No picks yet.</p>}
      </div>

      {isCommish && picks.length > 0 && (
        <button onClick={onUndo} disabled={busy} className="text-[12px] text-zinc-500 hover:text-zinc-300 underline">
          Undo last pick (commissioner)
        </button>
      )}
      {pending && (
        <ConfirmPickBar name={pending.name} sub={`${pending.role} · ${pending.team_name}`} busy={busy}
          onCancel={() => setPending(null)} onConfirm={() => { onPick(pending); setPending(null); }} />
      )}
    </div>
  );
}

// Player-league standings — totals from the live wc_player_points store
// (written by the /api/wc-score cron during the tournament).
function PlayerStandings({ members, picks, scoring }) {
  const [pts, setPts] = useState(null); // player_id -> row { points, components, role }
  const playerScoring = isPlayerScoring(scoring) ? scoring : DEFAULT_PLAYER_SCORING;

  useEffect(() => {
    const ids = [...new Set(picks.map((p) => p.player_id).filter(Boolean))];
    let cancelled = false;
    (async () => {
      const map = {};
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100).map((x) => encodeURIComponent(x)).join(",");
        const res = await sbFetch(`wc_player_points?player_id=in.(${chunk})&select=player_id,points,components,role`);
        for (const r of await sbJson(res)) map[String(r.player_id)] = r;
      }
      if (!cancelled) setPts(map);
    })();
    return () => { cancelled = true; };
  }, [picks]);

  if (!pts) return <p className="text-zinc-600 text-sm py-8">Loading points…</p>;

  // Use the league's (possibly custom) scoring re-applied to the stored components.
  const ptOf = (pid) => {
    const r = pts[String(pid)];
    if (!r) return 0;
    if (r.components && Object.keys(r.components).length) return pointsFromComponents(r.components, r.role || "MID", playerScoring);
    return Number(r.points || 0);
  };
  const rows = members
    .map((m) => {
      const squad = picks
        .filter((p) => p.user_id === m.user_id)
        .sort((a, b) => ptOf(b.player_id) - ptOf(a.player_id));
      const total = squad.reduce((s, p) => s + ptOf(p.player_id), 0);
      return { ...m, squad, total: Math.round(total * 100) / 100 };
    })
    .sort((a, b) => b.total - a.total);
  const anyPoints = rows.some((r) => r.total !== 0);

  return (
    <div>
      {!anyPoints && (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-4 text-[12px] text-zinc-500">
          Points populate automatically once matches kick off (Jun 11) and the scoring cron runs.
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-zinc-600 font-bold w-5">{i + 1}</span>
                <span className="font-bold">{r.display_name || r.handle || "Player"}</span>
              </div>
              <span className="font-bold text-red-500 tabular-nums">{r.total} pts</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-7">
              {r.squad.map((p) => (
                <span key={p.id} className="text-[11px] bg-zinc-800/70 rounded px-1.5 py-0.5 text-zinc-300">
                  <span className={POS_COLOR[p.position] || ""}>{p.position}</span> {p.player_name}
                  {anyPoints && <span className="text-zinc-500"> {ptOf(p.player_id)}</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
