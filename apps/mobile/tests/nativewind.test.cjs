const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const mobileRoot = path.dirname(require.resolve("../package.json"));

process.env.NATIVEWIND_OS = "ios";
const loadConfig = require("tailwindcss/loadConfig");
const resolveConfig = require("tailwindcss/resolveConfig");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const {
  cssToReactNativeRuntime,
} = require("react-native-css-interop/css-to-rn");
const config = loadConfig(path.resolve(mobileRoot, "tailwind.config.ts"));
const jiti = require("jiti")(
  path.resolve(mobileRoot, "tests/nativewind.test.cjs"),
);
const { getThemeColors } = jiti("../src/theme/colors.ts");
const { lightTokens, darkTokens } = jiti("../src/theme/tokens.ts");

test("Metro can detect the NativeWind v4 preset", () => {
  assert.ok(config.presets.some((preset) => preset.nativewind));
  const metro = readFileSync(
    path.resolve(mobileRoot, "metro.config.js"),
    "utf8",
  );
  assert.match(metro, /withNativeWind/);
  assert.match(metro, /inlineRem: 16/);
  assert.match(
    readFileSync(path.resolve(mobileRoot, "app/_layout.tsx"), "utf8"),
    /import "\.\.\/global\.css"/,
  );
});

test("navigation colors and NativeWind use the same light/dark source", () => {
  const mapping = {
    background: "--background",
    navigation: "--navigation",
    surface: "--surface",
    surfaceElevated: "--surface-elevated",
    foreground: "--foreground",
    mutedForeground: "--muted-foreground",
    primary: "--primary",
    primaryForeground: "--primary-foreground",
    border: "--border",
    success: "--success",
    successForeground: "--success-foreground",
    warning: "--warning",
  };
  for (const scheme of ["light", "dark"]) {
    const tokens = scheme === "dark" ? darkTokens : lightTokens;
    const colors = getThemeColors(scheme);
    for (const [name, token] of Object.entries(mapping)) {
      assert.equal(colors[name], `rgb(${tokens[token].replaceAll(" ", ", ")})`);
    }
  }
  const expoConfig = JSON.parse(
    readFileSync(path.resolve(mobileRoot, "app.json"), "utf8"),
  );
  const dependencies = JSON.parse(
    readFileSync(path.resolve(mobileRoot, "package.json"), "utf8"),
  ).dependencies;
  assert.equal(expoConfig.expo.userInterfaceStyle, "dark");
  assert.ok(dependencies["expo-system-ui"]);
});

test("semantic themes preserve Web dark tokens under both browser preferences", async () => {
  const theme = resolveConfig(config).theme;
  const classes = Object.entries(theme.colors).flatMap(([name, value]) =>
    typeof value === "string"
      ? [`bg-${name}`]
      : Object.keys(value).map(
          (key) => `bg-${name}${key === "DEFAULT" ? "" : `-${key}`}`,
        ),
  );
  const result = await postcss([
    tailwind({
      ...config,
      content: [{ raw: classes.join(" "), extension: "tsx" }],
    }),
  ]).process("@tailwind base; @tailwind utilities;", { from: undefined });
  const compiled = cssToReactNativeRuntime(result.css);
  const web = readFileSync(
    path.resolve(mobileRoot, "../web/src/app/globals.css"),
    "utf8",
  );
  const aliases = {
    canvas: "background",
    text: "foreground",
    "text-secondary": "muted-foreground",
    "text-subtle": "subtle-foreground",
    "on-primary": "primary-foreground",
    error: "destructive",
  };
  let count = 0;
  for (const match of web.matchAll(/--([a-z-]+): #([a-f0-9]{6});/g)) {
    const token = compiled.rootVariables[`--${aliases[match[1]] ?? match[1]}`];
    assert.deepEqual(
      token.dark,
      match[2].match(/../g).map((value) => parseInt(value, 16)),
    );
    assert.deepEqual(token.light, token.dark);
    count++;
  }
  assert.equal(count, 16);
  assert.equal(theme.spacing[11], "44px");
  assert.equal(theme.fontSize.base[0], "16px");
  assert.equal(theme.borderRadius.sm, "6px");
  assert.equal(theme.borderRadius.md, "8px");
  assert.equal(theme.borderRadius.lg, "16px");
  assert.equal(theme.boxShadow.panel, "0 16px 32px rgb(0 0 0 / 24%)");
});
