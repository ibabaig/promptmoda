"use client";

import { useState } from "react";
import { THEMES, THEME_COOKIE, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };

// Changes the theme instantly on the client and writes a cookie so the
// server renders the same choice on the next request. No round trip:
// a theme is a display preference, not data.
export default function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => choose(t)}
        >
          {LABEL[t]}
        </button>
      ))}
    </div>
  );
}
