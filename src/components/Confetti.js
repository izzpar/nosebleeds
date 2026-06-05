"use client";
import { useState, useEffect } from "react";

const COLORS = ["#dc2626", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#ffffff"];

// Fires a confetti burst whenever `show` changes to a truthy value (a boolean
// that flips true, or an incrementing counter). Self-cleans after the animation.
export default function Confetti({ show }) {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (!show) return;
    const spawn = setTimeout(() => {
      setPieces(Array.from({ length: 70 }, (_, i) => ({
        id: `${i}-${Date.now()}`,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.8 + Math.random() * 1.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 6 + Math.random() * 7,
      })));
    }, 0);
    const clear = setTimeout(() => setPieces([]), 3400);
    return () => { clearTimeout(spawn); clearTimeout(clear); };
  }, [show]);

  if (!pieces.length) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute", left: `${p.left}%`, top: 0,
            width: p.size, height: p.size, background: p.color, borderRadius: 2,
            animation: `nb-confetti-fall ${p.dur}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}
