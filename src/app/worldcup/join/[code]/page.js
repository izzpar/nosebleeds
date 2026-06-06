"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";
import WcBackdrop from "@/components/WcBackdrop";
import { Icon } from "@/components/ui";

const FORMAT_LABEL = { team: "nations draft", player: "players draft" };

export default function JoinLeaguePage() {
  const { code } = useParams();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [league, setLeague] = useState(undefined); // undefined=loading, null=not found
  const [status, setStatus] = useState("");

  // Re-read when auth resolves: logged-out visitors hit RLS and can't see the
  // league, so we only trust a null result once we actually have a session.
  useEffect(() => {
    sbFetch(`wc_leagues?invite_code=eq.${String(code).toUpperCase()}&select=*`)
      .then(async (r) => setLeague((await sbJson(r))[0] || null))
      .catch(() => setLeague(null));
  }, [code, user]);

  useEffect(() => {
    if (!league || !user) return;
    (async () => {
      setStatus("Joining…");
      const mems = await sbJson(await sbFetch(`wc_members?league_id=eq.${league.id}&select=user_id`));
      const alreadyIn = mems.some((m) => m.user_id === user.id);
      if (!alreadyIn) {
        if (league.max_managers && mems.length >= league.max_managers) { setStatus("This league is full."); return; }
        if (league.status && league.status !== "lobby") { setStatus("The draft has already started."); return; }
        const ins = await sbInsert("wc_members", {
          league_id: league.id, user_id: user.id,
          handle: profile?.handle || user.email?.split("@")[0],
          display_name: profile?.display_name || profile?.handle || user.email?.split("@")[0],
        });
        if (!ins.res.ok && ins.res.status !== 409) { setStatus("Couldn't join — try again."); return; }
      }
      router.replace(`/worldcup/${league.id}`);
    })();
  }, [league, user, profile, router]);

  const goLogin = () => {
    try { localStorage.setItem("nb_pending_league", String(code)); } catch (e) {}
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <WcBackdrop />
      <div className="max-w-sm w-full text-center">
        <Icon name="trophy" className="w-10 h-10 text-red-500 mx-auto mb-3" />
        {loading || (user && league === undefined) ? (
          <p className="text-zinc-500">Loading…</p>
        ) : !user ? (
          /* Logged out: RLS hides the league, so don't claim it's invalid —
             prompt for an account, then auto-join after sign-in. */
          <>
            <h1 className="text-xl font-bold mb-1">{league?.name ? `Join “${league.name}”` : "You're invited!"}</h1>
            <p className="text-zinc-400 text-sm mb-5">
              {league?.name
                ? <>A {league.draft_type === "auction" ? "live auction" : "snake"} {FORMAT_LABEL[league.format] || "draft"} league on <span className="text-red-500 font-semibold">The Nosebleeds</span>.</>
                : <>Join this Fantasy World Cup league on <span className="text-red-500 font-semibold">The Nosebleeds</span> — free, with your friends.</>}
            </p>
            <button onClick={goLogin} className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-xl w-full">Create account / sign in to join</button>
            <p className="text-zinc-600 text-[11px] mt-3">It takes a few seconds — we&apos;ll drop you straight into the league.</p>
          </>
        ) : league === null ? (
          <>
            <h1 className="text-xl font-bold mb-1">Invite not found</h1>
            <p className="text-zinc-500 text-sm mb-4">That league link looks invalid or expired.</p>
            <button onClick={() => router.push("/worldcup")} className="bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl">Go to The Nosebleeds</button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold mb-1">Join “{league.name}”</h1>
            <p className="text-zinc-400 text-sm mb-5">
              A {league.draft_type === "auction" ? "live auction" : "snake"} {FORMAT_LABEL[league.format] || "draft"} league on <span className="text-red-500 font-semibold">The Nosebleeds</span> — free, with your friends.
            </p>
            <p className="text-emerald-400 text-sm">{status || "Joining…"}</p>
          </>
        )}
      </div>
    </div>
  );
}
