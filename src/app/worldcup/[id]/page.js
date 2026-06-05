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
} from "@/lib/worldcup";

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
  const { user } = useAuth();

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
  const lastPickCount = useRef(0);

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

  // Load the 48 nations once.
  useEffect(() => { fetchTeams().then(setTeams).catch(() => {}); }, []);

  // Poll while in lobby (to see joins) or drafting (to see picks land live).
  useEffect(() => {
    if (!league || league.status === "done") return;
    const t = setInterval(loadAll, POLL_MS);
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
  const isMyTurn =
    league?.status === "drafting" &&
    !draftComplete &&
    onClockMember?.user_id === user?.id;
  const isCommish = league && user && league.commissioner_id === user.id;
  const pickedTeamIds = new Set(picks.map((p) => String(p.team_id)));
  const pickedPlayerIds = new Set(picks.map((p) => String(p.player_id)));

  // Advisory countdown — resets whenever a new pick lands.
  useEffect(() => {
    if (league?.status !== "drafting" || draftComplete) { setSecondsLeft(null); return; }
    if (picks.length !== lastPickCount.current) {
      lastPickCount.current = picks.length;
      setSecondsLeft(league.pick_seconds || 90);
    }
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [league, picks.length, draftComplete]);

  // Commissioner auto-marks the league done once the board is full.
  useEffect(() => {
    if (isCommish && draftComplete && league?.status === "drafting") {
      sbFetch(`wc_leagues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) })
        .then(loadAll);
    }
  }, [isCommish, draftComplete, league, id, loadAll]);

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
      await sbFetch(`wc_leagues?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await loadAll();
      flash("Settings saved");
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

  // ---- render ----
  if (loading) return <Shell><p className="text-zinc-600 text-sm py-10">Loading…</p></Shell>;
  if (notFound) return <Shell><p className="text-zinc-500 py-10">League not found.</p></Shell>;

  const myPicks = picks.filter((p) => p.user_id === user?.id);

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.push("/worldcup")} className="text-zinc-500 text-xl leading-none">‹</button>
          <span className="text-xl">🏆</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight truncate">{league.name}</h1>
            <button onClick={copyCode} className="text-[11px] text-zinc-500 leading-tight">
              Invite code <span className="text-zinc-300 font-mono tracking-widest">{league.invite_code}</span> · tap to copy
            </button>
          </div>
        </div>
        {/* sub-tabs */}
        <div className="max-w-2xl mx-auto px-4 flex gap-4 text-sm">
          {(isCommish ? ["draft", "standings", "settings"] : ["draft", "standings"]).map((t) => (
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
          league.status === "lobby" ? (
            <Lobby
              members={members}
              isCommish={isCommish}
              perManager={n >= 2 ? perManager : 0}
              format={format}
              onStart={startDraft}
              busy={busy}
            />
          ) : isPlayer ? (
            <PlayerDraftBoard
              members={members}
              picks={picks}
              players={players}
              poolLoading={poolLoading}
              pickedPlayerIds={pickedPlayerIds}
              onClockMember={onClockMember}
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
          )
        ) : subTab === "standings" ? (
          isPlayer ? (
            <PlayerStandings members={members} picks={picks} />
          ) : (
            <Standings
              members={members}
              picks={picks}
              results={results}
              scoring={league.scoring || DEFAULT_SCORING}
              status={league.status}
            />
          )
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
      <Nav />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Shell({ children }) {
  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">{children}</div>
      <Nav />
    </div>
  );
}

function Lobby({ members, isCommish, perManager, format, onStart, busy }) {
  const noun = format === "player" ? "players" : "nations";
  return (
    <div>
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-1">Pre-draft lobby</h3>
        <p className="text-[12px] text-zinc-500 mb-3">
          Share the invite code. When everyone&apos;s in, the commissioner starts the draft — it
          snakes (1·2·3 → 3·2·1).
          {members.length >= 2 && <> Each manager will draft <span className="text-zinc-300">{perManager}</span> {noun}.</>}
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
      {isCommish && (
        <p className="text-[12px] text-zinc-500 mb-3">
          ⚙️ Set scoring, the pick timer, and draft order in the <span className="text-zinc-300 font-semibold">Settings</span> tab above.
        </p>
      )}
      {isCommish ? (
        <button
          onClick={onStart}
          disabled={busy || members.length < 2}
          className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl"
        >
          {members.length < 2 ? "Need 2+ managers to start" : "Start draft 🎲"}
        </button>
      ) : (
        <p className="text-center text-zinc-500 text-sm py-2">Waiting for the commissioner to start…</p>
      )}
    </div>
  );
}

function DraftBoard({
  members, picks, teams, pickedTeamIds, onClockMember, isMyTurn, draftComplete,
  perManager, totalPicks, secondsLeft, onPick, isCommish, onUndo, busy, myPicks,
}) {
  const memberName = (uid) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.display_name || m?.handle || "Player";
  };
  const available = teams.filter((t) => !pickedTeamIds.has(String(t.id)));

  return (
    <div>
      {/* status bar */}
      {draftComplete ? (
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-4 py-3 mb-4 text-center">
          <div className="font-bold text-emerald-400">Draft complete 🎉</div>
          <div className="text-[12px] text-zinc-500">Check the Standings tab once games kick off.</div>
        </div>
      ) : (
        <div
          className={`rounded-xl px-4 py-3 mb-4 flex items-center justify-between border ${
            isMyTurn ? "bg-red-950/40 border-red-700/60" : "bg-zinc-900/70 border-zinc-800"
          }`}
        >
          <div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              Pick {picks.length + 1} of {totalPicks}
            </div>
            <div className="font-bold">
              {isMyTurn ? "You're on the clock" : `${onClockMember ? memberName(onClockMember.user_id) : "—"} picking`}
            </div>
          </div>
          {secondsLeft != null && (
            <div className={`text-2xl font-bold tabular-nums ${secondsLeft <= 10 ? "text-red-500" : "text-zinc-300"}`}>
              {secondsLeft}s
            </div>
          )}
        </div>
      )}

      {/* available nations */}
      {!draftComplete && (
        <>
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">
            Available ({available.length})
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {available.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick(t)}
                disabled={!isMyTurn || busy}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border text-left transition-all ${
                  isMyTurn
                    ? "bg-zinc-900 border-zinc-700 hover:border-red-500 active:scale-[0.98]"
                    : "bg-zinc-900/50 border-zinc-800 opacity-60"
                }`}
              >
                {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain" />}
                <span className="text-sm font-medium truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </>
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

function Settings({ league, members, onSave, onMove, onRandomize, busy }) {
  const base = { ...DEFAULT_SCORING, ...(league.scoring || {}) };
  const [form, setForm] = useState(base);
  const [secs, setSecs] = useState(league.pick_seconds || 90);
  const num = (v) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : 0; };
  const isLobby = league.status === "lobby";

  const save = () => {
    const scoring = {};
    for (const [k] of SCORE_FIELDS) scoring[k] = num(form[k]);
    onSave({ scoring, pick_seconds: Math.max(10, num(secs)) });
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

      {/* Pick timer */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-1">Time per pick</h3>
        <p className="text-[12px] text-zinc-500 mb-3">On-the-clock countdown shown during the draft (seconds).</p>
        <input
          type="number"
          min={10}
          value={secs}
          onChange={(e) => setSecs(e.target.value)}
          className="w-28 bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-600"
        />
      </div>

      {/* Scoring */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h3 className="font-bold mb-1">Scoring</h3>
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
  members, picks, players, poolLoading, pickedPlayerIds, onClockMember, isMyTurn,
  draftComplete, perManager, totalPicks, secondsLeft, onPick, isCommish, onUndo, busy, myPicks,
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const memberName = (uid) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.display_name || m?.handle || "Player";
  };

  const query = q.trim().toLowerCase();
  const available = players
    .filter((p) => !pickedPlayerIds.has(String(p.id)))
    .filter((p) => pos === "ALL" || p.role === pos)
    .filter((p) => !query || (p.name || "").toLowerCase().includes(query) || (p.team_name || "").toLowerCase().includes(query));
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
        <div className={`rounded-xl px-4 py-3 mb-4 flex items-center justify-between border ${isMyTurn ? "bg-red-950/40 border-red-700/60" : "bg-zinc-900/70 border-zinc-800"}`}>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Pick {picks.length + 1} of {totalPicks}</div>
            <div className="font-bold">{isMyTurn ? "You're on the clock" : `${onClockMember ? memberName(onClockMember.user_id) : "—"} picking`}</div>
          </div>
          {secondsLeft != null && (
            <div className={`text-2xl font-bold tabular-nums ${secondsLeft <= 10 ? "text-red-500" : "text-zinc-300"}`}>{secondsLeft}s</div>
          )}
        </div>
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
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-2">Player pool</h3>
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
              <div className="flex gap-1.5 mb-3">
                {POS.map((p) => (
                  <button key={p} onClick={() => setPos(p)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${pos === p ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                {shown.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onPick(p)}
                    disabled={!isMyTurn || busy}
                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 border text-left ${isMyTurn ? "bg-zinc-900 border-zinc-700 hover:border-red-500 active:scale-[0.99]" : "bg-zinc-900/50 border-zinc-800 opacity-70"}`}
                  >
                    <span className={`text-[10px] font-bold w-8 ${POS_COLOR[p.role] || "text-zinc-400"}`}>{p.role}</span>
                    <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                    <span className="text-[11px] text-zinc-500 truncate max-w-[35%]">{p.team_name}</span>
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
    </div>
  );
}

// Player-league standings. Live points arrive once the scoring cron runs during
// the tournament; until then this shows each manager's drafted squad.
function PlayerStandings({ members, picks }) {
  const rows = members.map((m) => ({
    ...m,
    squad: picks.filter((p) => p.user_id === m.user_id),
  }));
  return (
    <div>
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 mb-4 text-[12px] text-zinc-500">
        Live points populate automatically once matches kick off (Jun 11) and the scoring engine runs.
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold">{r.display_name || r.handle || "Player"}</span>
              <span className="text-[11px] text-zinc-500">{r.squad.length} players</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.squad.map((p) => (
                <span key={p.id} className="text-[11px] bg-zinc-800/70 rounded px-1.5 py-0.5 text-zinc-300">
                  <span className={POS_COLOR[p.position] || ""}>{p.position}</span> {p.player_name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
