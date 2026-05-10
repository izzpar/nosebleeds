"use client";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

export default function Nav({ tab, setTab }) {
  const { user } = useAuth();

  const tabs = [
    { id: "games", icon: "🏈", label: "Games" },
    { id: "discover", icon: "🔥", label: "Discover" },
    { id: "friends", icon: "👥", label: "Friends" },
    { id: "diary", icon: "📓", label: "Diary" },
    { id: "profile", icon: "👤", label: user ? "Profile" : "Login" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-[#09090b]/95 border-t border-zinc-800 z-50">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map((t) => {
          // If not logged in and they tap Profile, go to login page
          if (t.id === "profile" && !user) {
            return (
              <Link
                key={t.id}
                href="/login"
                className="flex-1 py-2.5 text-center text-zinc-600"
              >
                <div className="text-lg">{t.icon}</div>
                <div className="text-[9px] font-bold mt-0.5">{t.label}</div>
              </Link>
            );
          }

          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-center transition-all ${
                tab === t.id ? "text-red-500" : "text-zinc-600"
              }`}
            >
              <div className="text-lg">{t.icon}</div>
              <div className="text-[9px] font-bold mt-0.5">{t.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
