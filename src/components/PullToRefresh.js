"use client";
import { useEffect, useRef, useState } from "react";

// Touch pull-to-refresh for the document scroll. When the user drags down while
// already scrolled to the very top, a spinner is revealed; releasing past the
// threshold calls onRefresh() and shows the spinner until it resolves.
// Inert on non-touch devices and when `enabled` is false.
const THRESHOLD = 70; // px pull distance to trigger
const MAX = 100;      // px max visual pull

export default function PullToRefresh({ onRefresh, enabled = true }) {
  const [pull, setPull] = useState(0);     // current visual offset
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const active = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onStart = (e) => {
      if (refreshing) return;
      // Only begin a pull gesture when the page is at the very top
      if (window.scrollY > 0) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
      active.current = true;
    };
    const onMove = (e) => {
      if (!active.current || startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      // Resist past MAX so it feels rubber-bandy
      setPull(Math.min(MAX, dy * 0.5));
    };
    const onEnd = async () => {
      if (!active.current) return;
      active.current = false;
      const triggered = pull >= THRESHOLD;
      if (triggered) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try { await onRefresh?.(); } catch (e) {}
        setRefreshing(false);
      }
      setPull(0);
      startY.current = null;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [enabled, pull, refreshing, onRefresh]);

  if (pull === 0 && !refreshing) return null;

  const rotation = Math.min(360, (pull / THRESHOLD) * 360);
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[110] flex justify-center pointer-events-none"
      style={{ transform: `translateY(${pull}px)`, transition: active.current ? "none" : "transform 0.2s ease-out" }}
    >
      <div className="mt-2 w-9 h-9 rounded-full bg-zinc-900 border border-zinc-700 shadow-lg flex items-center justify-center">
        <div
          className={`w-4 h-4 border-2 border-zinc-600 border-t-red-500 rounded-full ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
        />
      </div>
    </div>
  );
}
