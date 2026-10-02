"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { myGroups } from "@/lib/groups";

function rc(r) {
  const n = Math.round(r);
  return ["#7f1d1d", "#7f1d1d", "#dc2626", "#f87171", "#fb923c", "#fbbf24", "#facc15", "#a3e635", "#4ade80", "#22c55e", "#15803d"][Math.max(0, Math.min(10, n))];
}

// Your groups' average rating for this game ("Couch Crew 8.4 · 3 rated").
// Shows only groups where at least one member rated it.
export default function GroupRatings({ gameId, user }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const groups = await myGroups(user.id);
      if (!groups?.length) return;
      const { data: members } = await supabase.from("group_members").select("group_id, user_id").in("group_id", groups.map((g) => g.id));
      const ids = [...new Set((members || []).map((m) => m.user_id))];
      if (!ids.length) return;
      const { data: ratings } = await supabase.from("ratings").select("user_id, rating").eq("game_id", String(gameId)).in("user_id", ids).not("rating", "is", null);
      if (cancelled || !ratings?.length) return;
      setRows(groups.map((g) => {
        const inGroup = new Set((members || []).filter((m) => m.group_id === g.id).map((m) => m.user_id));
        const rs = ratings.filter((r) => inGroup.has(r.user_id)).map((r) => parseFloat(r.rating));
        return { ...g, n: rs.length, avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null };
      }).filter((g) => g.n > 0));
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [gameId, user]);

  if (!rows.length) return null;
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 mb-3 space-y-1.5">
      <div className="text-[11px] font-bold text-zinc-500 tracking-widest uppercase">Your groups</div>
      {rows.map((g) => (
        <Link key={g.id} href={`/groups/${g.id}`} className="flex items-center gap-2">
          <span className="text-lg">{g.emoji}</span>
          <span className="flex-1 text-sm font-bold text-white truncate">{g.name}</span>
          <span className="text-xs text-zinc-500">{g.n} rated</span>
          <span className="w-10 text-right text-base font-extrabold" style={{ color: rc(g.avg) }}>{g.avg.toFixed(1)}</span>
        </Link>
      ))}
    </div>
  );
}
