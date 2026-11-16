import Link from "next/link";
import { cookies } from "next/headers";
import { requireSuperadmin } from "@/lib/guard";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import ThemeSwitch from "../theme-switch";

// Everything in this route group is curator-only. /login, /denied and
// /auth/* sit outside it, so the guard here cannot lock anyone out of
// the door they came in through.
//
// A layout is not a security boundary -- server actions post straight
// to their own endpoint -- so every page and every action runs the
// guard again, and RLS sits under all of it.
export default async function ToolLayout({ children }: { children: React.ReactNode }) {
  const { name, email } = await requireSuperadmin();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="shell">
      <header className="masthead">
        <Link href="/" className="wordmark">
          MoDA <span>/</span> Prompt Chains
        </Link>
        <div className="who">
          <ThemeSwitch initial={theme} />
          <span>{name}</span>
          {email && <span className="muted">{email}</span>}
          <form action="/auth/signout" method="post">
            <button type="submit" className="linkish">Sign out</button>
          </form>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
