"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/ui";

export default function Nav({ tab, setTab }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onHomePage = pathname === "/";

  // Home-page tabs use setTab; route tabs navigate. `route` marks the latter.
  const tabs = [
    { id: "games", icon: "scores", label: "Games" },
    { id: "discover", icon: "flame", label: "Discover" },
    { id: "predictions", icon: "target", label: "Predict", route: "/predictions" },
    { id: "worldcup", icon: "trophy", label: "Cup", route: "/worldcup" },
    { id: "friends", icon: "users", label: "Friends" },
    { id: "diary", icon: "book", label: "Diary" },
    { id: "profile", icon: user ? "user" : "login", label: user ? "Profile" : "Login" },
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
            className={`flex-1 py-2.5 px-0.5 flex flex-col items-center transition-colors ${
              isActive(t) ? "text-red-500" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon name={t.icon} className="w-[18px] h-[18px]" strokeWidth={isActive(t) ? 2.4 : 2} />
            <div className="text-[8px] font-bold mt-1 tracking-wide">{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
