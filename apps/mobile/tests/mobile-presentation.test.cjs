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

test("date selector announces real values as text rather than fictitious sliders", () => {
  const { ReservationDateTime } = presentationModule(
    "src/components/reservation-date-time.tsx",
    {
      "./ui": {
        Button: "Button",
        useUiTheme: () => ({ colors: theme.getThemeColors("dark") }),
      },
      "@/lib/slot-time": require("node:fs").existsSync(
        path.join(root, "src/lib/slot-time.ts"),
      )
        ? jiti(path.join(root, "src/lib/slot-time.ts"))
        : {},
    },
  );
  const controls = elements(
    ReservationDateTime({
      value: "2026-10-09T18:01",
      onChange() {},
      disabled: false,
    }),
  );
  assert.equal(
    controls.some(
      (item) =>
        item.props.accessibilityRole === "adjustable" ||
        item.props.role === "slider",
    ),
    false,
  );
  assert.ok(
    controls.some((item) => item.props.accessibilityLabel === "Hora: 18"),
  );
  assert.ok(
    controls.some((item) => item.props.accessibilityLabel === "Minuto: 01"),
  );
});

test("actual reservation retry preserves its stored instant, serialized body and key", async () => {
  const pending = {
    body: JSON.stringify({
      guests: 3,
      requestedAt: "2026-01-01T00:00:00.000Z",
      preorder: false,
      notes: null,
    }),
    key: "stored-reservation-key",
  };
  const requests = [];
  const { default: ReservationsScreen } = presentationModule(
    "app/(tabs)/reservations.tsx",
    {
      react: {
        useState: (value) => [
          typeof value === "function" ? value() : value,
          () => {},
        ],
        useRef: () => ({ current: pending }),
        useEffect() {},
        useCallback: (fn) => fn,
      },
      "react-native": {
        Platform: { OS: "web" },
        ScrollView: "ScrollView",
        Text: "Text",
        View: "View",
      },
      "@/components/reservation-date-time": {
        ReservationDateTime: "ReservationDateTime",
        stepGuests: dateHelpers().stepGuests,
      },
      "@/components/ui": {
        ...Object.fromEntries(
          [
            "Button",
            "Card",
            "Field",
            "Heading",
            "Notice",
            "Page",
            "StatusChip",
          ].map((name) => [name, name]),
        ),
        useUiTheme: () => ({ colors: theme.getThemeColors("dark"), ui: {} }),
      },
      "@/providers/session-provider": {
        useSession: () => ({
          session: { email: "client@example.test" },
          request: async (path, options) => {
            requests.push({ path, options });
            return { submitted: true, message: "Solicitud recibida" };
          },
        }),
      },
    },
  );
  const tree = elements(ReservationsScreen());
  assert.equal(
    tree.some((item) => item.props.accessibilityRole === "adjustable"),
    false,
  );
  assert.ok(
    tree.some((item) => item.props.accessibilityLabel === "2 personas"),
  );
  await tree
    .find((item) => item.props.title === "Enviar solicitud de reserva")
    .props.onPress();
  const sent = requests.find((item) => item.options?.method === "POST");
  assert.equal(sent.options.body, pending.body);
  assert.equal(sent.options.headers["Idempotency-Key"], pending.key);
});

test("reservation day changes retain the selected time without inventing availability", () => {
  const { selectReservationDay, selectReservationTime } = dateHelpers();
  assert.equal(
    selectReservationDay("2026-10-06T19:30", "2026-10-09"),
    "2026-10-09T19:30",
  );
  assert.equal(selectReservationDay("", "2026-10-09"), "2026-10-09T");
  assert.equal(
    selectReservationTime(
      "2026-10-09T",
      "12:30",
      new Date("2026-10-06T12:00:00Z"),
    ),
    "2026-10-09T12:30",
  );
  assert.equal(
    selectReservationTime("", "20:00", new Date("2026-10-06T12:00:00Z")),
    "2026-10-06T20:00",
  );
});

test("suggested days roll across months and the guest stepper stays inside API limits", () => {
  const { reservationDays, stepGuests } = dateHelpers();
  const days = reservationDays(new Date("2026-12-31T05:45:00Z"));
  assert.equal(days.length, 7);
  assert.equal(days[0].value, "2026-12-30");
  assert.equal(days[2].value, "2027-01-01");
  assert.equal(stepGuests("1", -1), "1");
  assert.equal(stepGuests("50", 1), "50");
  assert.equal(stepGuests("2", 1), "3");
  assert.equal(stepGuests("invalid", 1), "3");
});

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

test("later weeks and arbitrary hour/minute controls preserve local requestedAt", () => {
  const {
    reservationDays,
    reservationWeekFor,
    moveReservationWeek,
    stepReservationTime,
    reservationTimeParts,
  } = dateHelpers();
  const now = new Date("2026-12-30T16:00:00Z");
  const later = reservationDays(now, 2);
  assert.equal(later[0].value, "2027-01-13");
  assert.equal(moveReservationWeek(0, -1), 0);
  assert.equal(moveReservationWeek(2, -1), 1);
  assert.equal(
    stepReservationTime("2027-01-13T23:59", "hour", 1, now),
    "2027-01-13T23:59",
  );
  assert.equal(
    stepReservationTime("2027-01-13T00:00", "minute", -1, now),
    "2027-01-13T00:00",
  );
  assert.equal(
    stepReservationTime("2027-01-13T19:30", "hour", -1, now),
    "2027-01-13T18:30",
  );
  assert.equal(
    stepReservationTime("2027-01-13T19:30", "minute", 1, now),
    "2027-01-13T19:31",
  );
  assert.equal(
    stepReservationTime("2027-01-13T", "minute", 1, now),
    "2027-01-13T00:01",
  );
  assert.equal(reservationTimeParts("2027-01-13T19:31").minute, 31);
  assert.equal(reservationWeekFor("2027-01-13T19:31", now), 2);
  assert.equal(reservationWeekFor("2026-12-01T19:31", now), 0);
  assert.equal(
    reservationDays(new Date("2028-02-27T12:00:00Z"), 0)[2].value,
    "2028-02-29",
  );
  assert.equal(
    reservationDays(new Date("2028-02-27T12:00:00Z"), 1)[0].value,
    "2028-03-05",
  );
});

test("actual selected day and navigation badge use accessible on-coral foregrounds", () => {
  const colors = theme.getThemeColors("dark");
  const { ReservationDateTime } = presentationModule(
    "src/components/reservation-date-time.tsx",
    {
      "./ui": { Button: "Button", useUiTheme: () => ({ colors }) },
    },
  );
  const selectedDay = dateHelpers().reservationDays(new Date())[0].value;
  const controls = elements(
    ReservationDateTime({
      value: `${selectedDay}T19:30`,
      onChange() {},
      disabled: false,
    }),
  );
  assert.equal(
    controls.some(
      (element) => element.type === "Field" || element.type === "TextInput",
    ),
    false,
  );
  const selected = controls.find(
    (element) =>
      element.type === "Pressable" && element.props.accessibilityState.selected,
  );
  for (const pressed of [false, true]) {
    const fill =
      selected.props.style({ pressed }).backgroundColor ?? colors.primary;
    assert.equal(selected.props.style({ pressed }).opacity, 1);
    for (const text of elements(selected.props.children).filter(
      (element) => element.type === "Text",
    )) {
      assert.ok(contrast(text.props.style.color, fill) >= 4.5);
    }
  }
  const { default: TabLayout } = presentationModule("app/(tabs)/_layout.tsx", {
    "expo-router": { Tabs: Object.assign(() => {}, { Screen: "Tabs.Screen" }) },
    "@/components/ui": { useUiTheme: () => ({ colors }) },
    "@/hooks/use-cart": { useCart: () => ({ items: {} }) },
  });
  const badge = TabLayout().props.screenOptions({
    route: { name: "menu" },
  }).tabBarBadgeStyle;
  assert.ok(contrast(badge.color, badge.backgroundColor) >= 4.5);
});
