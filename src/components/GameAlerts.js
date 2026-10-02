"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function keyBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Push alerts switch: your team's game starting, games you cared about ending
// (rate them), and friends rating games you rated. Renders nothing until push
// is configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY + the push_subscriptions table).
// variant "card": one-time prompt on the Games tab; "row": profile setting.
export default function GameAlerts({ user, variant = "row" }) {
  const [state, setState] = useState("checking"); // checking | off | on | blocked | ios-install | hidden
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user) { setState("hidden"); return; }
    try { setDismissed(localStorage.getItem("nb_alerts_prompt_done") === "1"); } catch (e) { setDismissed(false); }
    (async () => {
      const supported = VAPID_PUBLIC && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      // iPhones only allow web push for sites added to the Home Screen
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
      if (!VAPID_PUBLIC) { setState("hidden"); return; }
      const { error } = await supabase.from("push_subscriptions").select("endpoint").limit(1);
      if (error) { setState("hidden"); return; } // table not created yet
      if (ios && !standalone) { setState("ios-install"); return; }
      if (!supported) { setState("hidden"); return; }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("hidden"));
  }, [user]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
      const j = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        { user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
        { onConflict: "endpoint" });
      setState(error ? "off" : "on");
    } catch (e) { setState("off"); } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) { /* leave as is */ } finally { setBusy(false); }
  };

  if (state === "checking" || state === "hidden") return null;

  if (variant === "card") {
    if (dismissed || state !== "off") return null;
    const done = () => { setDismissed(true); try { localStorage.setItem("nb_alerts_prompt_done", "1"); } catch (e) {} };
    return (
      <div className="rounded-2xl p-3 mb-3 bg-zinc-900 border border-zinc-800 flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">🔔</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">Get game alerts</div>
          <div className="text-xs text-zinc-400">When your team kicks off, and when a game you care about ends.</div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={async () => { await enable(); done(); }} disabled={busy} className="h-9 px-3 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50">Turn on</button>
          <button onClick={done} className="h-7 text-[11px] text-zinc-500">Not now</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-2 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 flex items-center gap-3">
      <span className="text-lg" aria-hidden="true">🔔</span>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-bold text-white">Game alerts</div>
        <div className="text-[11px] text-zinc-500">
          {state === "ios-install" ? "On iPhone: Share → Add to Home Screen, then turn alerts on from the app."
            : state === "blocked" ? "Notifications are blocked — allow them for this site in your settings."
            : "Kickoffs for your teams, finals to rate, friends' ratings."}
        </div>
      </div>
      {(state === "on" || state === "off") && (
        <button onClick={state === "on" ? disable : enable} disabled={busy} role="switch" aria-checked={state === "on"} aria-label="Game alerts"
          className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${state === "on" ? "bg-red-600" : "bg-zinc-700"}`}>
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${state === "on" ? "left-6" : "left-1"}`} />
        </button>
      )}
    </div>
  );
}
