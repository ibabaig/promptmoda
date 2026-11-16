import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import ThemeSwitch from "../theme-switch";

// Signed in, not a superadmin. /denied is on the public allowlist in
// lib/supabase/proxy.ts -- otherwise refusing someone would redirect
// them to the page that refuses them, forever.
export default async function DeniedPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? null;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <main className="gate">
      <div className="gate-top">
        <p className="eyebrow">Access refused</p>
        <ThemeSwitch initial={theme} />
      </div>
      <h1>Curators only</h1>
      <p className="lede">
        {email ? (
          <>
            You&apos;re signed in as <strong>{email}</strong>, but that account doesn&apos;t
            have <code>profiles.is_superadmin</code> set.
          </>
        ) : (
          <>That account doesn&apos;t have curator access.</>
        )}
      </p>
      <form action="/auth/signout" method="post">
        <button className="btn" type="submit">Sign out</button>
      </form>
    </main>
  );
}
