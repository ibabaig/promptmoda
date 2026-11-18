import type { Metadata } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoDA — Prompt Chains",
  description: "Build, reorder and run the prompt chains behind the Museum of Digital Archives.",
  robots: { index: false, follow: false },
};

// The theme is read from a cookie on the server, so the first byte of
// HTML already carries the right data-theme and there is no flash of
// the wrong palette before JavaScript runs.
//
//   light / dark -> data-theme is set and wins over the OS setting.
//   system       -> no attribute; the prefers-color-scheme query in
//                   globals.css decides, and follows the OS live.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
