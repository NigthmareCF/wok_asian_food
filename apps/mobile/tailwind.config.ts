import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import plugin from "tailwindcss/plugin";
import { platformSelect } from "nativewind/theme";
import { darkTokens, lightTokens } from "./src/theme/tokens";

// NativeWind v4 exposes its preset through CommonJS without module declarations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativewindPreset = require("nativewind/preset") as Config;

const color = (token: keyof typeof lightTokens) =>
  `rgb(var(${token}) / <alpha-value>)`;

// NativeWind defaults to a 14-unit rem; Web's Tailwind scale uses a 16px rem.
const webRem = (value: string) =>
  value.replace(/([\d.]+)rem/g, (_, size: string) => `${Number(size) * 16}px`);

const config = {
  content: {
    relative: true,
    files: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  },
  darkMode: "media",
  presets: [nativewindPreset],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      background: color("--background"),
      navigation: color("--navigation"),
      foreground: color("--foreground"),
      card: color("--surface"),
      surface: color("--surface"),
      "surface-elevated": color("--surface-elevated"),
      muted: {
        DEFAULT: color("--surface-elevated"),
        foreground: color("--muted-foreground"),
      },
      "subtle-foreground": color("--subtle-foreground"),
      primary: {
        DEFAULT: color("--primary"),
        hover: color("--primary-hover"),
        foreground: color("--primary-foreground"),
      },
      secondary: {
        DEFAULT: color("--surface-elevated"),
        foreground: color("--foreground"),
      },
      border: color("--border"),
      info: {
        DEFAULT: color("--info"),
        foreground: color("--info-foreground"),
      },
      success: {
        DEFAULT: color("--success"),
        foreground: color("--success-foreground"),
      },
      warning: {
        DEFAULT: color("--warning"),
        foreground: color("--warning-foreground"),
      },
      destructive: {
        DEFAULT: color("--destructive"),
        foreground: color("--destructive-foreground"),
      },
      ring: color("--focus"),
    },
    spacing: Object.fromEntries(
      Object.entries(defaultTheme.spacing).map(([key, value]) => [
        key,
        webRem(value),
      ]),
    ),
    fontSize: Object.fromEntries(
      Object.entries(defaultTheme.fontSize).map(([key, [size, options]]) => [
        key,
        [webRem(size), { ...options, lineHeight: webRem(options.lineHeight) }],
      ]),
    ),
    extend: {
      fontFamily: {
        sans:
          process.env.NATIVEWIND_OS && process.env.NATIVEWIND_OS !== "web"
            ? [
                platformSelect({
                  ios: "System",
                  android: "sans-serif",
                  default: "system-ui",
                }),
              ]
            : [
                "system-ui",
                "-apple-system",
                "BlinkMacSystemFont",
                '"Segoe UI"',
                "sans-serif",
              ],
      },
      borderRadius: { sm: "6px", md: "8px", lg: "16px" },
      boxShadow: { panel: "0 16px 32px rgb(0 0 0 / 24%)" },
      letterSpacing: { eyebrow: "0.08em" },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": darkTokens,
        "@media (prefers-color-scheme: dark)": { ":root": darkTokens },
      });
    }),
  ],
} satisfies Config;

export default config;
