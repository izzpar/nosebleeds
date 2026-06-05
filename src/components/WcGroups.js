"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { fetchMyGroups, createGroup, groupMemberIds, groupByCode, joinGroup } from "@/lib/groups";

// Scope selector for a public-game leaderboard: 🌍 Global or one of your
// mini-leagues. Calls onScope(memberIds | null) — null means global.
// `game` is 'ranking' | 'salary'.
export default function GroupScope({ game, onScope }) {
  const { user, profile } = useAuth();
  const [groups, setGroups] = useState([]);
  const [sel, setSel] = useState(null); // selected group id | null (global)
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!user) return;
    // Finish a join that started before sign-in (invite link → login → here).
    try {
      const pending = localStorage.getItem("nb_pending_group");
      if (pending) {
        const g = await groupByCode(pending);
        if (g) await joinGroup(g, user.id, profile);
        localStorage.removeItem("nb_pending_group");
      }
    } catch (e) {}
    setGroups(await fetchMyGroups(user.id, game));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, game]);

  const pick = async (g) => {
    if (!g) { setSel(null); onScope(null); return; }
    setSel(g.id);
    onScope(await groupMemberIds(g.id));
  };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const g = await createGroup(name, game, user.id, profile);
      if (g) { setName(""); setCreating(false); await load(); await pick(g); }
    } finally { setBusy(false); }
  };

  const selectedGroup = groups.find((g) => g.id === sel);
  const inviteLink = selectedGroup && typeof window !== "undefined"
    ? `${window.location.origin}/worldcup/g/${selectedGroup.invite_code}` : "";
  const copy = () => { try { navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {} };

  if (!user) return null;

  return (
    <div className="mb-3">
      <div className="flex gap-1.5 flex-wrap items-center">
        <button onClick={() => pick(null)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${sel === null ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>🌍 Global</button>
        {groups.map((g) => (
          <button key={g.id} onClick={() => pick(g)} className={`text-[12px] font-bold px-3 py-1 rounded-full ${sel === g.id ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>{g.name}</button>
        ))}
        <button onClick={() => setCreating((v) => !v)} className="text-[12px] font-bold px-3 py-1 rounded-full bg-zinc-800 text-zinc-400">＋ Group</button>
      </div>

      {creating && (
        <div className="flex gap-2 mt-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" maxLength={32}
            className="flex-1 bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-600" />
          <button onClick={create} disabled={busy || !name.trim()} className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold px-3 rounded-lg text-sm">Create</button>
        </div>
      )}

      {selectedGroup && (
        <button onClick={copy} className="mt-2 w-full text-left bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-[12px] text-zinc-400">
          {copied ? "✓ Invite link copied!" : <>📋 Invite to <span className="text-zinc-200">{selectedGroup.name}</span> — tap to copy link</>}
        </button>
      )}
    </div>
  );
}
