"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, usePathname } from "next/navigation";

export default function Nav({ tab, setTab }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onHomePage = pathname === "/";

  // Home-page tabs use setTab; route tabs navigate. `route` marks the latter.
  const tabs = [
    { id: "games", icon: "🏈", label: "Games" },
    { id: "discover", icon: "🔥", label: "Discover" },
    { id: "predictions", icon: "🔮", label: "Predict", route: "/predictions" },
    { id: "friends", icon: "👥", label: "Friends" },
    { id: "diary", icon: "📓", label: "Diary" },
    { id: "profile", icon: "👤", label: user ? "Profile" : "Login" },
  ];

  const handleTabClick = (t) => {
    if (t.id === "profile" && !user) {
      router.push("/login");
      return;
    }
    if (t.route) {
      router.push(t.route);
      return;
    }
    if (onHomePage && setTab) {
      setTab(t.id);
    } else {
      router.push(`/?tab=${t.id}`);
    }
  };

  // Is this tab the active one?
  const isActive = (t) => {
    if (t.route) return pathname === t.route || pathname.startsWith(t.route + "/");
    return onHomePage && tab === t.id;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-[#09090b]/95 border-t border-zinc-800 z-50">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabClick(t)}
            className={`flex-1 py-2.5 px-0.5 text-center transition-all ${
              isActive(t) ? "text-red-500" : "text-zinc-600"
            }`}
          >
            <div className="text-base">{t.icon}</div>
            <div className="text-[8px] font-bold mt-0.5">{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
