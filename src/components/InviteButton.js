"use client";
import { useState } from "react";
import { Icon } from "@/components/ui";

// Shared invite button used across every league/group page. On mobile it opens
// the native share sheet (so you can fire the link straight into a group chat);
// elsewhere it falls back to copying the link.
// `path` is the join-route prefix: "/worldcup/g/" (groups) or "/worldcup/join/"
// (draft leagues).
export default function InviteButton({ code, name, path = "/worldcup/g/", className = "" }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  const onClick = async () => {
    const url = `${window.location.origin}${path}${code}`;
    // Prefer the native share sheet (Messages, WhatsApp, etc.) on supported devices.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "The Nosebleeds", text: `Join ${name || "my league"} on The Nosebleeds`, url });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // user dismissed the sheet — do nothing
        // any other failure: fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {}
  };

  return (
    <button onClick={onClick} className={`w-full text-[12px] text-zinc-400 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-1.5 hover:border-zinc-700 transition-colors ${className}`}>
      {copied
        ? <><Icon name="check" className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Invite link copied!</>
        : <><Icon name="link" className="w-3.5 h-3.5 shrink-0" /> Invite to <span className="text-zinc-200">{name}</span> · tap to share</>}
    </button>
  );
}
