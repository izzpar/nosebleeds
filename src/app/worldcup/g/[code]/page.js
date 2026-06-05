"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { groupByCode, joinGroup } from "@/lib/groups";

const GAME_PATH = { ranking: "/worldcup/rankings", salary: "/worldcup/salary" };
const GAME_NAME = { ranking: "World Cup Nations Ranking", salary: "World Cup Salary Cap" };

export default function JoinGroupPage() {
  const { code } = useParams();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [group, setGroup] = useState(undefined); // undefined=loading, null=not found
  const [status, setStatus] = useState("");

  // Re-read when auth resolves: logged-out visitors hit RLS and see nothing.
  useEffect(() => { groupByCode(String(code)).then(setGroup).catch(() => setGroup(null)); }, [code, user]);

  // Once signed in, join and head to the game.
  useEffect(() => {
    if (!group || !user) return;
    (async () => {
      setStatus("Joining…");
      const ok = await joinGroup(group, user.id, profile);
      if (ok) router.replace(GAME_PATH[group.game] || "/worldcup");
      else setStatus("Couldn't join — try again.");
    })();
  }, [group, user, profile, router]);

  const goLogin = () => {
    try { localStorage.setItem("nb_pending_group", String(code)); } catch (e) {}
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="text-4xl mb-3">🏆</div>
        {loading || (user && group === undefined) ? (
          <p className="text-zinc-500">Loading…</p>
        ) : !user ? (
          /* Logged out: RLS hides the group, so prompt for an account, then
             auto-join after sign-in. */
          <>
            <h1 className="text-xl font-bold mb-1">{group?.name ? `Join “${group.name}”` : "You're invited!"}</h1>
            <p className="text-zinc-400 text-sm mb-5">
              {group?.name
                ? <>A <span className="text-zinc-200">{GAME_NAME[group.game] || "Fantasy World Cup"}</span> mini-league on <span className="text-red-500 font-semibold">The Nosebleeds</span>.</>
                : <>Join this Fantasy World Cup mini-league on <span className="text-red-500 font-semibold">The Nosebleeds</span> — free, with your friends.</>}
            </p>
            <button onClick={goLogin} className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-xl w-full">
              Create account / sign in to join
            </button>
            <p className="text-zinc-600 text-[11px] mt-3">It takes a few seconds — we&apos;ll drop you straight into the league.</p>
          </>
        ) : group === null ? (
          <>
            <h1 className="text-xl font-bold mb-1">Invite not found</h1>
            <p className="text-zinc-500 text-sm mb-4">That group link looks invalid or expired.</p>
            <button onClick={() => router.push("/worldcup")} className="bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl">Go to The Nosebleeds</button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold mb-1">Join “{group.name}”</h1>
            <p className="text-zinc-400 text-sm mb-5">
              A <span className="text-zinc-200">{GAME_NAME[group.game] || "Fantasy World Cup"}</span> mini-league on <span className="text-red-500 font-semibold">The Nosebleeds</span>. Draft, predict, and climb the leaderboard with your friends — free.
            </p>
            <p className="text-emerald-400 text-sm">{status || "Joining…"}</p>
          </>
        )}
      </div>
    </div>
  );
}
