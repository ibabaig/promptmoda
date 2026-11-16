import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import ThemeSwitch from "../theme-switch";
import GoogleButton from "./google-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <main className="gate">
      <div className="gate-top">
        <p className="eyebrow">Museum of Digital Art</p>
        <ThemeSwitch initial={theme} />
      </div>
      <h1>Prompt chains</h1>
      <p className="lede">
        Build the chains behind the museum: write each step, put them in order, and run them to
        see what they make. Restricted to curators.
      </p>
      <GoogleButton next={next} />
      {error && (
        <p className="notice error" role="alert">
          Sign-in didn&apos;t complete. Check that this app&apos;s callback URL is on the Supabase
          redirect allow list, then try again.
        </p>
      )}
    </main>
  );
}
