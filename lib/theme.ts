// Shared by the server layout (to render the right attribute) and the
// client switch (to change it). No imports, so it is safe on both sides.

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";

export function parseTheme(v: string | undefined): Theme {
  return v === "light" || v === "dark" ? v : "system";
}
