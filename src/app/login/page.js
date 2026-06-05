"use client";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null); // { type: 'error' | 'success', text }

  const signInWithGoogle = async () => {
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "https://thenosebleeds.app/auth/callback",
      },
    });
    if (error) {
      console.error("Login error:", error);
      setMsg({ type: "error", text: error.message });
      setLoading(false);
    }
  };

  const submitEmail = async (e) => {
    e?.preventDefault();
    const mail = email.trim();
    if (!mail || !password) { setMsg({ type: "error", text: "Enter your email and password." }); return; }
    if (mode === "signup" && password.length < 6) { setMsg({ type: "error", text: "Password must be at least 6 characters." }); return; }
    setLoading(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin + "/auth/callback" : undefined },
        });
        if (error) { setMsg({ type: "error", text: error.message }); setLoading(false); return; }
        if (data.session) {
          // Confirmation disabled — signed in immediately
          router.push("/");
          return;
        }
        // Confirmation required
        setMsg({ type: "success", text: "Check your email to confirm your account, then sign in." });
        setMode("signin");
        setLoading(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) { setMsg({ type: "error", text: error.message }); setLoading(false); return; }
        router.push("/");
      }
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Something went wrong." });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] px-4 pb-24">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="text-6xl mb-4">🩸</div>
        <h1 className="text-3xl font-extrabold text-white mb-2">The Nosebleeds</h1>
        <p className="text-zinc-500 text-sm mb-8">Rate and review every game you watch</p>

        {/* Status message */}
        {msg && (
          <div className={`mb-4 px-3 py-2.5 rounded-xl text-sm font-semibold ${msg.type === "error" ? "bg-red-600/15 text-red-300 border border-red-600/30" : "bg-green-600/15 text-green-300 border border-green-600/30"}`}>
            {msg.text}
          </div>
        )}

        {/* Email / password form */}
        <div>
            <form onSubmit={submitEmail} className="text-left mb-4">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Email</label>
              <input
                type="email" value={email} autoComplete="email"
                onChange={(e) => { setEmail(e.target.value); setMsg(null); }}
                placeholder="you@example.com"
                className="w-full mt-1 mb-3 px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 placeholder:text-zinc-600"
              />
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Password</label>
              <input
                type="password" value={password} autoComplete={mode === "signup" ? "new-password" : "current-password"}
                onChange={(e) => { setPassword(e.target.value); setMsg(null); }}
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                className="w-full mt-1 mb-4 px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-sm outline-none focus:border-red-600 placeholder:text-zinc-600"
              />
              <button
                type="submit" disabled={loading}
                className="w-full py-3.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <span className="inline-block w-3.5 h-3.5 border-2 border-red-300 border-t-white rounded-full animate-spin" />}
                {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
            <button
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMsg(null); }}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors mb-6"
            >
              {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {/* Google Sign In */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white text-zinc-900 font-bold text-sm hover:bg-zinc-100 transition-all disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? "Signing in..." : "Continue with Google"}
        </button>

        {/* Browse without account */}
        <Link href="/" className="block mt-8 text-sm text-zinc-500 hover:text-red-400 transition-colors">
          Browse games without signing in →
        </Link>
        <Link href="/about" className="block mt-3 text-xs text-zinc-600 hover:text-red-400 transition-colors">
          New here? See how it works
        </Link>
      </div>
      <Nav />
    </div>
  );
}
