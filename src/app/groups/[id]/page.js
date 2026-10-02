"use client";
import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase";
import { groupById, groupMembers, groupMessages, postGroupMessage, leaveGroup, inviteUrl } from "@/lib/groups";

function rc(r) {
  const n = Math.round(r);
  return ["#7f1d1d", "#7f1d1d", "#dc2626", "#f87171", "#fb923c", "#fbbf24", "#facc15", "#a3e635", "#4ade80", "#22c55e", "#15803d"][Math.max(0, Math.min(10, n))];
}
const timeAgo = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

export default function GroupPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState(undefined);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [week, setWeek] = useState(null); // { board: [...], top: {...} }
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [authLoading, user, router]);
  useEffect(() => {
    if (!user) return;
    groupById(id).then(setGroup);
    groupMembers(id).then(setMembers);
  }, [user, id]);

  // Chat: refresh every 8s while open
  useEffect(() => {
    if (!user || !group || tab !== "chat") return;
    let cancelled = false;
    const load = () => groupMessages(id).then((m) => { if (!cancelled) setMessages(m); });
    load();
    const t = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user, group, tab, id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  // This week: members' ratings from the last 7 days
  useEffect(() => {
    if (tab !== "week" || !members.length) return;
    (async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase.from("ratings").select("user_id, game_id, rating, away_team, home_team, away_score, home_score, sport")
        .in("user_id", members.map((m) => m.user_id)).gte("created_at", since).not("rating", "is", null);
      const rows = data || [];
      const board = members.map((m) => {
        const mine = rows.filter((r) => r.user_id === m.user_id);
        return { ...m, count: mine.length, avg: mine.length ? mine.reduce((s, r) => s + parseFloat(r.rating), 0) / mine.length : null };
      }).sort((x, y) => y.count - x.count || (y.avg || 0) - (x.avg || 0));
      const byGame = {};
      rows.forEach((r) => { const g = (byGame[r.game_id] = byGame[r.game_id] || { ...r, s: 0, n: 0 }); g.s += parseFloat(r.rating); g.n += 1; });
      const top = Object.values(byGame).filter((g) => g.n >= 2).sort((x, y) => y.s / y.n - x.s / x.n)[0] || null;
      setWeek({ board, top });
    })();
  }, [tab, members]);

  const nameOf = (uid) => members.find((m) => m.user_id === uid)?.name?.split(" ")[0] || "Fan";
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await postGroupMessage(id, user.id, body);
      setDraft("");
      setMessages(await groupMessages(id));
    } catch (e) { /* keep the draft so nothing is lost */ } finally { setSending(false); }
  };
  const invite = async () => {
    const url = inviteUrl(group.invite_code);
    try {
      if (navigator.share) await navigator.share({ title: `Join ${group.name} on The Nosebleeds`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch (e) {}
  };

  if (group === undefined) return <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm">Loading…</div>;
  if (!group) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">👥</div>
      <div className="text-white font-bold">Group not found</div>
      <div className="text-sm text-zinc-500">It may have been deleted, or you&apos;re not a member.</div>
      <Link href="/?tab=friends" className="text-red-400 text-sm font-semibold">← Back to Friends</Link>
    </div>
  );

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[#09090b]/90 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/?tab=friends" className="text-zinc-400 hover:text-white text-sm font-medium">← Back</Link>
          <h1 className="flex-1 min-w-0 text-center text-sm font-bold text-white truncate">{group.emoji} {group.name}</h1>
          <button onClick={invite} className="h-8 px-3 rounded-full bg-red-600 text-white text-xs font-bold shrink-0">{copied ? "Link copied" : "Invite"}</button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-3">
        <div className="flex gap-1 p-1 mb-3 rounded-full bg-zinc-900 border border-zinc-800">
          {[{ id: "chat", l: "💬 Chat" }, { id: "week", l: "🏆 This week" }, { id: "members", l: `👥 ${members.length}` }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
              className={`flex-1 h-9 rounded-full text-xs font-bold ${tab === t.id ? "bg-red-600 text-white" : "text-zinc-400"}`}>{t.l}</button>
          ))}
        </div>

        {tab === "chat" && (
          <div>
            <div className="space-y-2 mb-3">
              {messages.length === 0 && <div className="text-center py-10 text-sm text-zinc-500">No messages yet — get it going. 🩸</div>}
              {messages.map((m) => {
                const mine = m.user_id === user.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-red-600 text-white rounded-br-md" : "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-md"}`}>
                      {!mine && <div className="text-[11px] font-bold text-red-300 mb-0.5">{nameOf(m.user_id)}</div>}
                      <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={`text-[10px] mt-0.5 ${mine ? "text-red-100/70" : "text-zinc-500"}`}>{timeAgo(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="sticky bottom-20 flex gap-2 bg-[#09090b] py-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 1000))} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="Message the group…" aria-label="Message"
                className="flex-1 h-11 px-4 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-white outline-none focus:border-red-600" />
              <button onClick={send} disabled={!draft.trim() || sending} className="h-11 px-5 rounded-full bg-red-600 text-white text-sm font-bold disabled:opacity-40">Send</button>
            </div>
          </div>
        )}

        {tab === "week" && (
          <div>
            {!week && <div className="text-center py-10 text-sm text-zinc-500">Loading…</div>}
            {week?.top && (
              <div className="rounded-2xl p-3 mb-3 bg-gradient-to-r from-green-900/40 to-zinc-900 border border-green-800/50">
                <div className="text-[11px] font-bold text-green-300 tracking-widest uppercase">Group&apos;s game of the week</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-bold text-white">{week.top.away_team} {week.top.away_score}–{week.top.home_score} {week.top.home_team}</span>
                  <span className="text-lg font-extrabold" style={{ color: rc(week.top.s / week.top.n) }}>{(week.top.s / week.top.n).toFixed(1)}</span>
                </div>
              </div>
            )}
            {week && (
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
                {week.board.map((m, i) => (
                  <div key={m.user_id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-6 text-center text-sm font-extrabold text-zinc-500">{i + 1}</span>
                    <span className="flex-1 text-sm font-bold text-white truncate">{m.name}{m.user_id === user.id && <span className="text-zinc-500 font-semibold"> (you)</span>}</span>
                    <span className="text-xs text-zinc-400">{m.count} rated</span>
                    <span className="w-10 text-right text-sm font-extrabold" style={{ color: m.avg != null ? rc(m.avg) : "#52525b" }}>{m.avg != null ? m.avg.toFixed(1) : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "members" && (
          <div>
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800 mb-3">
              {members.map((m) => (
                <Link key={m.user_id} href={m.handle ? `/u/${m.handle}` : "#"} className="flex items-center gap-3 px-3 py-2.5">
                  {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">{m.name[0]}</span>}
                  <span className="flex-1 text-sm font-bold text-white truncate">{m.name}</span>
                  {m.user_id === group.created_by && <span className="text-[11px] text-zinc-500">creator</span>}
                </Link>
              ))}
            </div>
            <div className="text-xs text-zinc-500 mb-3">Invite code: <span className="font-mono text-zinc-300">{group.invite_code}</span></div>
            <button onClick={async () => { if (confirm(`Leave ${group.name}?`)) { await leaveGroup(id, user.id); router.push("/?tab=friends"); } }}
              className="w-full h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-bold">Leave group</button>
          </div>
        )}
      </div>
      <Nav tab="friends" />
    </div>
  );
}
