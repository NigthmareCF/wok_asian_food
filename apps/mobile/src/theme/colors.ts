import { darkTokens, lightTokens, mobileContrastTokens } from "./tokens";

export function getThemeColors(scheme: "light" | "dark") {
  const tokens = scheme === "dark" ? darkTokens : lightTokens;
  const color = (token: keyof typeof lightTokens) =>
    `rgb(${tokens[token].replaceAll(" ", ", ")})`;
  const semanticColor = (value: string) =>
    `rgb(${value.replaceAll(" ", ", ")})`;
  return {
    background: color("--background"),
    navigation: color("--navigation"),
    surface: color("--surface"),
    surfaceElevated: color("--surface-elevated"),
    foreground: color("--foreground"),
    mutedForeground: color("--muted-foreground"),
    primary: color("--primary"),
    primaryHover: color("--primary-hover"),
    primaryForeground: color("--primary-foreground"),
    actionForeground: semanticColor(
      mobileContrastTokens[scheme].actionForeground,
    ),
    accentText: semanticColor(mobileContrastTokens[scheme].accentText),
    border: color("--border"),
    success: color("--success"),
    successForeground: color("--success-foreground"),
    warning: color("--warning"),
  };
}
