"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext({});

// Generate a clean handle from email or name
function generateHandle(user) {
  const emailPrefix = (user.email || "").split("@")[0];
  const nameClean = (user.user_metadata?.full_name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const base = nameClean || emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
  // Add random suffix to reduce conflicts
  const suffix = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${base.slice(0, 16)}${suffix}`;
}

async function ensureProfile(user) {
  if (!user) return null;
  try {
    // Check if profile exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) return existing;

    // Create profile with auto-generated handle
    let handle = generateHandle(user);
    let attempts = 0;
    let created = null;

    while (attempts < 5 && !created) {
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          user_id: user.id,
          handle,
          display_name: user.user_metadata?.full_name || user.email?.split("@")[0],
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        })
        .select()
        .single();

      if (data) {
        created = data;
      } else if (error?.code === "23505") {
        // Handle conflict, try again with different suffix
        handle = generateHandle(user);
        attempts++;
      } else {
        console.error("Profile create error:", error);
        break;
      }
    }

    return created;
  } catch (e) {
    console.error("ensureProfile error:", e);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const p = await ensureProfile(u);
        setProfile(p);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const p = await ensureProfile(u);
        setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    try {
      // Use direct fetch — Supabase JS client hangs silently
      const tokenKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
      const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
      const token = session?.access_token;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${user.id}&select=*`,
        {
          headers: {
            "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${token}`,
          },
        }
      );
      const data = await res.json();
      if (Array.isArray(data) && data[0]) setProfile(data[0]);
    } catch (e) { console.error("refreshProfile:", e); }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
