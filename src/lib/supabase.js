import { createClient } from "@supabase/supabase-js";

// Fall back to harmless placeholders so createClient() never throws at module
// load — e.g. during a build/prerender where NEXT_PUBLIC_* env vars aren't
// present (a Vercel Preview build without the vars scoped). At runtime in the
// browser the real inlined values are used normally.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseKey);
