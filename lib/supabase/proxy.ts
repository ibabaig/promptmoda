import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// THE WALL.
//
// The museum is public to read, members to act. This tool is
// the opposite — it is default-deny. Nothing is public, and the list
// below is the complete set of paths that do not require a verified
// superadmin session.
//
// An allowlist, not a blocklist. A blocklist means every page you add
// later is exposed until someone remembers to list it; an allowlist
// means a new page is protected by default and you have to opt it out
// on purpose. For something whose whole job is reading every row in the
// database, that is the only defensible default.
const PUBLIC_PATHS = [
  "/login",
  "/denied",
  "/auth/callback",
  "/auth/signout",
];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do NOT put code between createServerClient and getClaims().
  // getClaims() both refreshes the token and verifies its signature;
  // getSession() reads the cookie without revalidating it and must
  // never be used to decide access.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;

  if (isPublic(path)) return supabaseResponse;

  // Gate one: is there a verified session at all?
  if (!claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Gate two: is it a superadmin? Asking the database rather than
  // trusting a claim in the token — the flag lives in profiles and can
  // be revoked there, and a stale JWT must not outlive that.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", claims.sub as string)
    .maybeSingle();

  if (!profile?.is_superadmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/denied";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Gate three is RLS, in the database, on every query this app makes.
  // The two gates above are the polite version; that one is the real
  // one, and it holds even if both of these are wrong.
  return supabaseResponse;
}
