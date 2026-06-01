"use client";
import { useEffect, useState } from "react";

// A dismissible "Add to Home Screen" banner.
// - Android/Chrome: captures the beforeinstallprompt event → one-tap install.
// - iOS Safari: no install API exists, so show the manual Share → Add steps.
// - Hidden entirely when already running installed (standalone display mode),
//   or once the user dismisses/installs (remembered in localStorage).
const DISMISS_KEY = "nb_install_dismissed";

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState(null); // Android beforeinstallprompt event
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Already installed? (standalone display, or iOS navigator.standalone)
    const installed = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (installed) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch (e) {}
    if (dismissed) return;

    const ua = window.navigator.userAgent || "";
    const ios = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);

    // Android/Chrome path — wait for the install event
    const onBeforeInstall = (e) => {
      e.preventDefault();
      // Respect a prior dismissal even if the OS re-fires the event this session
      try { if (localStorage.getItem(DISMISS_KEY) === "1") return; } catch (err) {}
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari path — show manual instructions after a short delay
    let t;
    if (ios && safari) {
      setIsIOS(true);
      t = setTimeout(() => setShow(true), 2500);
    }

    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); if (t) clearTimeout(t); };
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) {}
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) {}
    setDeferred(null);
    dismiss();
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[120] px-4 pointer-events-none">
      <div className="max-w-2xl mx-auto pointer-events-auto">
        <div className="rounded-2xl bg-zinc-900 border border-zinc-700 shadow-xl p-3 flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white">Install The Nosebleeds</div>
            {isIOS ? (
              <div className="text-[11px] text-zinc-400">Tap <span className="font-bold">Share</span> <span aria-hidden>􀈂</span> then <span className="font-bold">Add to Home Screen</span></div>
            ) : (
              <div className="text-[11px] text-zinc-400">Add it to your home screen for the full-screen app.</div>
            )}
          </div>
          {!isIOS && deferred && (
            <button onClick={install} className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors">Install</button>
          )}
          <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 w-7 h-7 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center text-sm font-bold">×</button>
        </div>
      </div>
    </div>
  );
}
