const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const jiti = require("jiti")(__filename);
const theme = jiti(path.join(root, "src/theme/colors.ts"));
const tokens = jiti(path.join(root, "src/theme/tokens.ts"));

function presentationModule(file, mocks = {}) {
  const compiled = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const defaults = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useMemo: (fn) => fn(),
      useState: (value) => [
        typeof value === "function" ? value() : value,
        () => {},
      ],
    },
    "react-native": {
      StyleSheet: { create: (value) => value },
      View: "View",
      Text: "Text",
      TextInput: "TextInput",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      FlatList: "FlatList",
    },
    "@/theme/colors": theme,
    "@/theme/tokens": tokens,
    "@/lib/slot-time": jiti(path.join(root, "src/lib/slot-time.ts")),
    "expo-symbols": { SymbolView: "SymbolView" },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    },
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => mocks[name] ?? defaults[name] ?? {},
  });
  return exports;
}

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

function webInteropProps(props) {
  const file = path.resolve(
    root,
    "../../node_modules/react-native-css-interop/dist/runtime/web/api.js",
  );
  const exports = {};
  vm.runInNewContext(readFileSync(file, "utf8"), {
    exports,
    require: (name) => {
      if (name === "react")
        return {
          forwardRef: (render) => ({ render }),
          Component: class {},
          createElement: (type, props) => ({ type, props }),
        };
      if (name === "./interopComponentsMap")
        return { interopComponents: new Map() };
      if (["../../shared", "../config"].includes(name))
        return require(path.resolve(path.dirname(file), name));
      return {};
    },
  });
  return exports
    .cssInterop((props) => props, { className: "style" })
    .render(props, null);
}

test("compact Field hides only the visual label and preserves defaults, touch size and focus", () => {
  const values = [];
  let cursor = 0;
  const { Field } = presentationModule("src/components/ui.tsx", {
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in values)) values[index] = initial;
        return [
          values[index],
          (next) => {
            values[index] = next;
          },
        ];
      },
    },
  });
  const standard = elements(Field({ label: "Correo", value: "" }));
  const standardInput = standard.find((item) => item.type === "TextInput");
  assert.ok(
    standard.some(
      (item) => item.type === "Text" && item.props.children === "Correo",
    ),
  );
  assert.match(standardInput.props.className, /min-h-12.*py-3.*text-base/);
  assert.equal(standardInput.props.style, undefined);
  values.length = 0;
  let focused = false;
  const render = () => {
    cursor = 0;
    return elements(
      Field({
        label: "Buscar platillos",
        placeholder: "Buscar platillos",
        density: "compact",
        hideLabel: true,
        onFocus: () => {
          focused = true;
        },
      }),
    );
  };
  const compact = render();
  assert.equal(
    compact.some(
      (item) =>
        item.type === "Text" && item.props.children === "Buscar platillos",
    ),
    false,
  );
  const input = compact.find((item) => item.type === "TextInput");
  assert.equal(input.props.accessibilityLabel, "Buscar platillos");
  assert.equal(input.props.placeholder, "Buscar platillos");
  const inputStyle = Object.assign({}, ...[input.props.style].flat());
  assert.equal(inputStyle.minHeight, 44);
  assert.equal(inputStyle.fontSize, 14);
  input.props.onFocus({});
  assert.equal(focused, true);
  assert.ok(
    render().some(
      (item) =>
        item.type === "View" &&
        item.props.style?.borderColor ===
          `rgb(${tokens.darkTokens["--focus"].replaceAll(" ", ", ")})`,
    ),
  );
});

function rgb(value) {
  return value.match(/[\d.]+/g).map(Number);
}

function contrast(first, second) {
  const luminance = (color) =>
    rgb(color)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (total, value, index) =>
          total + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Execute the actual pure date helpers without pretending to render native controls.
function dateHelpers() {
  const source = read("src/components/reservation-date-time.tsx");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) =>
      name === "@/lib/slot-time"
        ? jiti(path.join(root, "src/lib/slot-time.ts"))
        : {},
  });
  return exports;
}

test("five tab destinations retain a text-labeled accessible cart badge", () => {
  const tabs = read("app/(tabs)/_layout.tsx");
  assert.deepEqual(
    [...tabs.matchAll(/<Tabs.Screen\s+name="([^"]+)"/g)].map(
      (match) => match[1],
    ),
    ["index", "menu", "reservations", "orders", "account"],
  );
  assert.match(tabs, /unidades en tu pedido/);
  assert.match(tabs, /tabBarBadge:\s*count/);
  assert.match(tabs, /borderBottomWidth: focused \? 2 : 0/);
  assert.match(read("app/_layout.tsx"), /<SessionProvider>/);
  assert.doesNotMatch(
    read("app/_layout.tsx"),
    /CartProvider|QueryClientProvider/,
  );
});

test("actual primary controls preserve normal-text contrast in default and pressed states", () => {
  const colors = theme.getThemeColors("dark");
  const { Button } = presentationModule("src/components/ui.tsx");
  const tree = Button({ title: "Pedir ahora", onPress() {} });
  const foreground =
    tree.props.children.props.style?.color ?? colors.primaryForeground;
  for (const pressed of [false, true]) {
    const style = tree.props.style({ pressed });
    const opacity = style.opacity ?? 1;
    const fill = style.backgroundColor ?? colors.primary;
    for (const background of [
      colors.background,
      colors.surface,
      colors.surfaceElevated,
    ]) {
      const blend = (color) =>
        `rgb(${rgb(color)
          .map(
            (channel, index) =>
              channel * opacity + rgb(background)[index] * (1 - opacity),
          )
          .join(", ")})`;
      assert.ok(
        contrast(blend(foreground), blend(fill)) >= 4.5,
        `Primary normal text has insufficient contrast, pressed=${pressed}`,
      );
    }
  }
  assert.ok(
    contrast(
      colors.actionForeground ?? colors.primaryForeground,
      colors.primary,
    ) >= 4.5,
    "Selected chips and badge need accessible on-coral text",
  );
});

test("small accent text has sufficient contrast over every actual gradient band", () => {
  const colors = theme.getThemeColors("dark");
  const source = `${read("src/components/gradient-panel.tsx")}\nexport const testedBands = bands;`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => (name === "@/theme/tokens" ? tokens : {}),
  });
  for (const band of exports.testedBands) {
    assert.ok(
      contrast(colors.accentText ?? colors.primary, band) >= 4.5,
      "Gradient eyebrow needs normal-text contrast",
    );
    assert.ok(contrast(colors.mutedForeground, band) >= 4.5);
  }
});
