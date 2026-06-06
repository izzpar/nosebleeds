"use client";
import { useState } from "react";
import { Icon } from "@/components/ui";

// Shared "copy invite link" button used across every league/group page.
// `path` is the join-route prefix: "/worldcup/g/" (groups) or "/worldcup/join/"
// (draft leagues).
export default function InviteButton({ code, name, path = "/worldcup/g/", className = "" }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const copy = () => {
    try {
      navigator.clipboard.writeText(`${window.location.origin}${path}${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {}
  };
  return (
    <button onClick={copy} className={`w-full text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-1.5 hover:border-zinc-700 transition-colors ${className}`}>
      {copied
        ? <><Icon name="check" className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Invite link copied!</>
        : <><Icon name="link" className="w-3.5 h-3.5 shrink-0" /> Invite to <span className="text-zinc-200">{name}</span> — tap to copy</>}
    </button>
  );
}
