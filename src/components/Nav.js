"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, usePathname } from "next/navigation";

export default function Nav({ tab, setTab }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onHomePage = pathname === "/";

  const tabs = [
    { id: "games", icon: "🏈", label: "Games" },
    { id: "discover", icon: "🔥", label: "Discover" },
    { id: "friends", icon: "👥", label: "Friends" },
    { id: "diary", icon: "📓", label: "Diary" },
    { id: "profile", icon: "👤", label: user ? "Profile" : "Login" },
  ];

  const handleTabClick = (tabId) => {
    if (tabId === "profile" && !user) {
      router.push("/login");
      return;
    }
    if (onHomePage && setTab) {
      setTab(tabId);
    } else {
      // On any other page, navigate to home with the tab as a query param
      router.push(`/?tab=${tabId}`);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-[#09090b]/95 border-t border-zinc-800 z-50">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            className={`flex-1 py-2.5 text-center transition-all ${
              onHomePage && tab === t.id ? "text-red-500" : "text-zinc-600"
            }`}
          >
            <div className="text-lg">{t.icon}</div>
            <div className="text-[9px] font-bold mt-0.5">{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
