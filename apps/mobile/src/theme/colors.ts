import { darkTokens, lightTokens } from "./tokens";

export function getThemeColors(scheme: "light" | "dark") {
  const tokens = scheme === "dark" ? darkTokens : lightTokens;
  const color = (token: keyof typeof lightTokens) =>
    `rgb(${tokens[token].replaceAll(" ", ", ")})`;
  return {
    background: color("--background"),
    navigation: color("--navigation"),
    surface: color("--surface"),
    surfaceElevated: color("--surface-elevated"),
    foreground: color("--foreground"),
    mutedForeground: color("--muted-foreground"),
    primary: color("--primary"),
    primaryForeground: color("--primary-foreground"),
    border: color("--border"),
    success: color("--success"),
    successForeground: color("--success-foreground"),
    warning: color("--warning"),
  };
}
