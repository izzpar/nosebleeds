"use client";
import { useEffect, useState } from "react";

// A slim banner that appears when the device goes offline and auto-hides when
// the connection returns. Pure client state (navigator.onLine + online/offline
// events) — no service worker, so it can't serve stale cached content.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[300] bg-amber-600 text-black text-center text-xs font-bold py-1.5 px-4">
      ⚠️ You&apos;re offline — scores and ratings may be out of date
    </div>
  );
}
