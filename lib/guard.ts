import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Db = Awaited<ReturnType<typeof createClient>>;

export type Curator = {
  supabase: Db;
  userId: string;
  email: string | null;
  name: string;
};

// Called at the top of every page AND every server action.
//
// The proxy has already turned away anyone who is not a superadmin, so
// this looks redundant. It is not: a server action is its own POST
// endpoint and inherits nothing from the page that rendered its form,
// and the proxy matcher is one regex away from skipping a route. This
// check runs in the same process as the query, immediately before it.
//
// Behind both sits RLS (migrations 010 and 011), which is the one gate
// a bug in this codebase cannot open. This app holds no service-role key.
export async function requireSuperadmin(): Promise<Curator> {
  const supabase = await createClient();

  // getClaims() verifies the JWT signature. getSession() only reads the
  // cookie and must never decide access.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const userId = claims.sub as string;

  // The flag is read from the database, not the token, so revoking it
  // takes effect on the next request rather than when the JWT expires.
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_superadmin) redirect("/denied");

  const name =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profile.email ||
    "Curator";

  return { supabase, userId, email: profile.email ?? null, name };
}
