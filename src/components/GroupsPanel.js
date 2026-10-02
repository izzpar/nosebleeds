"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { myGroups, createGroup, joinGroup } from "@/lib/groups";

const EMOJIS = ["🩸", "🔥", "🏈", "🏀", "⚾", "🏒", "🍺", "👑", "🐐", "🛋️"];

// Friends tab: your private groups, plus create / join by code.
// Hidden until the groups tables exist (supabase/setup.sql).
export default function GroupsPanel({ user }) {
  const router = useRouter();
  const [groups, setGroups] = useState(undefined); // undefined = loading, null = not set up
  const [mode, setMode] = useState(null); // null | "create" | "join"
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🩸");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (user) myGroups(user.id).then(setGroups); }, [user]);
  if (!user || groups === undefined || groups === null) return null;

  const go = async (fn) => {
    setBusy(true); setErr("");
    try { const id = await fn(); router.push(`/groups/${id}`); }
    catch (e) { setErr(/not found/i.test(e?.message || "") ? "That invite code doesn't exist." : "Something went wrong — try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-white">Your groups</h3>
        <div className="flex gap-1.5">
          <button onClick={() => setMode(mode === "join" ? null : "join")} className="h-8 px-3 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold">Join</button>
          <button onClick={() => setMode(mode === "create" ? null : "create")} className="h-8 px-3 rounded-full bg-red-600 text-white text-xs font-bold">+ New</button>
        </div>
      </div>

      {mode === "create" && (
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 mb-3">
          <div className="flex gap-1 mb-2 overflow-x-auto">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} aria-pressed={emoji === e} className={`w-9 h-9 shrink-0 rounded-lg text-lg ${emoji === e ? "bg-red-600/20 ring-1 ring-red-600" : "bg-zinc-900"}`}>{e}</button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Group name (e.g. Sunday Couch Crew)" aria-label="Group name"
            className="w-full h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white outline-none focus:border-red-600 mb-2" />
          <button disabled={busy || !name.trim()} onClick={() => go(() => createGroup(name.trim(), emoji))}
            className="w-full h-10 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40">{busy ? "Creating…" : "Create group"}</button>
        </div>
      )}
      {mode === "join" && (
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 mb-3 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Invite code" aria-label="Invite code"
            className="flex-1 h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white outline-none focus:border-red-600" />
          <button disabled={busy || !code} onClick={() => go(() => joinGroup(code))} className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-40">Join</button>
        </div>
      )}
      {err && <div className="text-xs text-red-400 mb-2">{err}</div>}

      {groups.length === 0 ? (
        <p className="text-xs text-zinc-500">Make a group for the people you watch with — a group chat, your group&apos;s rating on every game, and a weekly leaderboard.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-red-600/40">
              <span className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-xl">{g.emoji}</span>
              <span className="flex-1 text-sm font-bold text-white truncate">{g.name}</span>
              <span className="text-zinc-500">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
