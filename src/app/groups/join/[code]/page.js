"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { joinGroup } from "@/lib/groups";

// Invite link. Signed out: remember the code through sign-in (AuthProvider
// brings you back here). Signed in: join and go to the group.
export default function JoinGroupPage({ params }) {
  const { code } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();
  const [err, setErr] = useState("");

  useEffect(() => {
    if (loading || !user) return;
    joinGroup(code).then((gid) => router.replace(`/groups/${gid}`))
      .catch((e) => setErr(/not found/i.test(e?.message || "") ? "That invite link doesn't work anymore." : "Couldn't join right now — try again in a minute."));
  }, [loading, user, code, router]);

  const signIn = () => {
    try { localStorage.setItem("nb_pending_group", code); } catch (e) {}
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-5xl">👥</div>
      {err ? (
        <>
          <div className="text-white font-bold">{err}</div>
          <Link href="/?tab=friends" className="text-red-400 text-sm font-semibold">Go to Friends →</Link>
        </>
      ) : !loading && !user ? (
        <>
          <div className="text-lg font-extrabold text-white">You&apos;re invited to a group</div>
          <div className="text-sm text-zinc-400 max-w-xs">Group chat, your group&apos;s rating on every game, and a weekly leaderboard.</div>
          <button onClick={signIn} className="mt-2 h-11 px-6 rounded-xl bg-red-600 text-white font-bold">Sign in to join</button>
        </>
      ) : (
        <div className="text-zinc-400 text-sm">Joining…</div>
      )}
    </div>
  );
}
