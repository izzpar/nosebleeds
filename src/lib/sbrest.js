// Direct Supabase REST helper (the supabase-js client hangs silently in this
// app, so existing pages talk to PostgREST directly — see predictions/page.js).
// Client-side only: reads the session from localStorage and auto-refreshes an
// expired access token once on a 401.

export async function sbFetch(path, options = {}, retried = false) {
  const tokenKey = Object.keys(localStorage).find((k) => k.includes("auth-token"));
  const session = tokenKey ? JSON.parse(localStorage.getItem(tokenKey)) : null;
  const token = session?.access_token;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && !retried && session?.refresh_token) {
    try {
      const refreshRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        }
      );
      if (refreshRes.ok) {
        const newSession = await refreshRes.json();
        localStorage.setItem(tokenKey, JSON.stringify({ ...session, ...newSession }));
        return sbFetch(path, options, true);
      }
    } catch (e) {}
  }
  return res;
}

// Parse a PostgREST response as an array (never throws).
export async function sbJson(res) {
  try {
    const d = await res.json();
    return Array.isArray(d) ? d : d ? [d] : [];
  } catch (e) {
    return [];
  }
}

// POST with the inserted row(s) returned.
export async function sbInsert(table, body) {
  const res = await sbFetch(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return { res, rows: await sbJson(res) };
}
