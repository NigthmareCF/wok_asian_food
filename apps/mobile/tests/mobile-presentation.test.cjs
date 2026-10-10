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

test("compact menu controls preserve filtering, selected markers, Web feedback and quick-add guards", () => {
  const state = ["", null, null, null];
  let cursor = 0;
  const changes = [];
  const cart = { items: {}, ready: true, attempt: null };
  const menu = {
    isPending: false,
    isFetching: false,
    isError: false,
    data: {
      categories: [
        {
          id: "food",
          name: "Platos",
          items: [
            {
              id: "dish",
              name: "Gyozas",
              description: "Crujientes",
              price: 68,
              currency: "GTQ",
            },
          ],
        },
        {
          id: "drinks",
          name: "Bebidas",
          items: [{ id: "tea", name: "Té", price: 15, currency: "GTQ" }],
        },
      ],
    },
  };
  const { default: MenuScreen } = presentationModule("app/(tabs)/menu.tsx", {
    react: {
      useMemo: (fn) => fn(),
      useState: () => {
        const index = cursor++;
        return [
          state[index],
          (value) => {
            state[index] = value;
          },
        ];
      },
    },
    "@/components/ui": {
      ...Object.fromEntries(
        [
          "Page",
          "Heading",
          "Field",
          "Button",
          "Card",
          "Notice",
          "EmptyState",
        ].map((name) => [name, name]),
      ),
      useUiTheme: () => ({ colors: theme.getThemeColors("dark") }),
    },
    "@/hooks/use-cart": {
      useCart: () => ({
        ...cart,
        changeQuantity: (...args) => changes.push(args),
      }),
    },
    "@/hooks/use-menu": { useMenu: () => menu },
    "@/lib/catalog": {
      cartTotals: () => [],
      menuProducts: () => [],
      formatPrice: (item) => `Q${item.price}`,
    },
    "@/components/product-image": { ProductImage: "ProductImage" },
  });
  const render = () => {
    cursor = 0;
    return elements(MenuScreen());
  };
  let controls = render();
  assert.equal(
    controls.some((item) => item.type === "Heading" && item.props.eyebrow),
    false,
  );
  assert.ok(
    controls.some(
      (item) =>
        item.type === "Text" &&
        item.props.children === "Menú WOK" &&
        item.props.accessibilityRole === "header",
    ),
  );
  const field = controls.find((item) => item.type === "Field");
  assert.equal(field.props.hideLabel, true);
  assert.equal(field.props.density, "compact");
  assert.equal(field.props.placeholder, "Buscar platillos");
  let chips = controls.filter((item) => item.type === "Pressable");
  for (const chip of chips) {
    const interop = webInteropProps(chip.props);
    assert.equal(typeof interop.style, "function");
    for (const pressed of [false, true]) {
      const style = interop.style({ pressed });
      assert.equal(style.minHeight, 44);
      assert.equal(style.paddingHorizontal, 10);
      assert.equal(style.opacity, 1);
    }
  }
  assert.ok(
    elements(chips[0]).some(
      (item) => item.type === "Text" && item.props.children === "✓",
    ),
  );
  chips
    .find((item) => item.props.accessibilityLabel === "Platos")
    .props.onPress();
  controls = render();
  let list = controls.find((item) => item.type === "FlatList");
  assert.deepEqual(
    Array.from(
      list.props.data.filter((item) => item.kind === "product"),
      (item) => item.product.id,
    ),
    ["dish"],
  );
  field.props.onChangeText("crujientes");
  controls = render();
  list = controls.find((item) => item.type === "FlatList");
  assert.equal(
    list.props.data.filter((item) => item.kind === "product").length,
    1,
  );
  const row = list.props.data.find((item) => item.kind === "product");
  const add = () =>
    elements(list.props.renderItem({ item: row })).find(
      (item) => item.props.title === "+",
    );
  assert.equal(add().props.disabled, false);
  add().props.onPress();
  assert.deepEqual(changes, [["dish", 1]]);
  for (const lock of [
    { ready: false },
    { attempt: {} },
    { items: { dish: 50 } },
  ]) {
    const previous = { ...cart };
    Object.assign(cart, lock);
    controls = render();
    list = controls.find((item) => item.type === "FlatList");
    assert.equal(add().props.disabled, true);
    Object.assign(cart, previous);
  }
  for (const property of ["isFetching", "isError"]) {
    menu[property] = true;
    controls = render();
    list = controls.find((item) => item.type === "FlatList");
    assert.equal(add().props.disabled, true);
    menu[property] = false;
  }
  chips = controls.filter((item) => item.type === "Pressable");
  const selected = chips.find((item) => item.props.accessibilityState.selected);
  selected.props.onFocus();
  const focusedChip = render().find(
    (item) => item.props.accessibilityLabel === "Platos",
  );
  assert.equal(
    focusedChip.props.style({ pressed: false }).borderColor,
    `rgb(${tokens.darkTokens["--focus"].replaceAll(" ", ", ")})`,
  );
});

test("actual pickup footer uses the typed selector and retries the exact stored request", async () => {
  const existing = {
    email: "client@example.test",
    key: "stored-key",
    body: {
      requestedFor: "2026-01-01T00:00:00.000Z",
      items: [{ menuItemId: "dish", quantity: 1 }],
    },
  };
  for (const attempt of [null, existing]) {
    const sent = [];
    const cart = {
      items: { dish: 1 },
      ready: true,
      attempt,
      prepareAttempt: async (value) => {
        assert.equal(value, existing);
      },
      completeAttempt: async () => {},
    };
    const { default: CartScreen } = presentationModule("app/cart.tsx", {
      react: {
        useMemo: (fn) => fn(),
        useState: (value) => [value, () => {}],
        useRef: (value) => ({ current: value }),
      },
      "expo-router": {
        useLocalSearchParams: () => ({}),
        router: { push() {} },
      },
      "@/components/ui": Object.fromEntries(
        [
          "Button",
          "Card",
          "Field",
          "Heading",
          "Notice",
          "Page",
          "EmptyState",
        ].map((name) => [name, name]),
      ),
      "@/components/reservation-date-time": {
        ReservationDateTime: "ReservationDateTime",
      },
      "@/hooks/use-cart": { useCart: () => cart },
      "@/hooks/use-menu": {
        useMenu: () => ({ isSuccess: true, isError: false, isFetching: false }),
      },
      "@/lib/catalog": {
        menuProducts: () => [{ id: "dish", estimatedPreparationSeconds: 300 }],
        cartTotals: () => [{ currency: "GTQ", price: 35 }],
        formatPrice: () => "Q35",
        pickupReceiptSchema: { safeParse: () => ({ success: true, data: {} }) },
      },
      "@/providers/session-provider": {
        useSession: () => ({
          session: { email: "client@example.test" },
          ready: true,
          request: async (path, options) => {
            sent.push({ path, options });
            return {};
          },
        }),
      },
    });
    const list = elements(CartScreen()).find(
      (element) => element.type === "FlatList",
    );
    const footer = elements(list.props.ListFooterComponent);
    assert.equal(
      footer.some(
        (element) =>
          element.type === "Field" &&
          element.props.placeholder === "AAAA-MM-DDTHH:mm",
      ),
      false,
    );
    assert.equal(
      footer.filter((element) => element.type === "ReservationDateTime").length,
      attempt ? 0 : 1,
    );
    if (!attempt)
      assert.ok(
        footer.some((element) => element.props.children === "Pasar a recoger"),
      );
    if (attempt) {
      const retry = elements(list.props.ListHeaderComponent).find(
        (element) => element.props.title === "Reintentar la misma solicitud",
      );
      await retry.props.onPress();
      // The event handler intentionally returns void; drain the injected async operations.
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(sent.length, 1);
      assert.equal(sent[0].options.headers["Idempotency-Key"], existing.key);
      assert.equal(sent[0].options.body, JSON.stringify(existing.body));
    }
  }
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
    owner: "client@example.test",
    sessionVersion: 1,
    body: JSON.stringify({
      guests: 3,
      requestedAt: "2026-01-01T00:00:00.000Z",
      preorder: false,
      notes: null,
    }),
    key: "09b7f19c-7ea1-4b55-bb27-8b342fb73f60",
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
        useRef: (value) => ({ current: value === null ? pending : value }),
        useEffect() {},
        useLayoutEffect() {},
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
          session: { email: "client@example.test", version: 1 },
          request: async (path, options) => {
            requests.push({ path, options });
            return {
              requestId: pending.key,
              reservationId: "bef0df01-a4cf-4ee9-a9ed-277ac338b7ee",
              submitted: true,
              decision: "REQUIRES_HUMAN_APPROVAL",
              reasonCodes: [],
              minimumOccupancyMinutes: 105,
              maximumOccupancyMinutes: 150,
              message: "Solicitud recibida",
            };
          },
        }),
      },
      "@/lib/reservation-attempt": jiti(
        path.join(root, "src/lib/reservation-attempt.ts"),
      ),
    },
  );
  const screen = ReservationsScreen();
  const tree = elements(screen.type(screen.props));
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

test("redesign preserves virtualized lists, dark Web branding and one native sheet", () => {
  const menu = read("app/(tabs)/menu.tsx");
  const sheet = read("src/components/product-sheet.tsx");
  assert.match(menu, /<FlatList/);
  assert.match(menu, /<ProductSheet/);
  assert.match(menu, /Boolean\(cart.attempt\)/);
  assert.match(sheet, /onRequestClose=\{onClose\}/);
  assert.match(sheet, /animationType="none"/);
  assert.match(sheet, /accessibilityViewIsModal/);
  assert.match(sheet, /setAccessibilityFocus/);
  assert.match(sheet, /comentario es general/);
  assert.match(read("src/components/ui.tsx"), /return themes.dark/);
  assert.match(read("tailwind.config.ts"), /":root": darkTokens/);
  assert.doesNotMatch(
    read("src/components/gradient-panel.tsx"),
    /experimental_backgroundImage|expo-linear-gradient/,
  );
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

test("actual menu footer is absent for zero items and present for a selection", () => {
  for (const quantity of [0, 2]) {
    const { default: MenuScreen } = presentationModule("app/(tabs)/menu.tsx", {
      "@/components/ui": {
        Page: "Page",
        Heading: "Heading",
        Field: "Field",
        Button: "Button",
        Card: "Card",
        EmptyState: "EmptyState",
        useUiTheme: () => ({ colors: theme.getThemeColors("dark") }),
      },
      "@/components/product-sheet": { ProductSheet: "ProductSheet" },
      "@/hooks/use-cart": {
        useCart: () => ({
          items: quantity
            ? { "bef0df01-a4cf-4ee9-a9ed-277ac338b7ee": quantity }
            : {},
          ready: true,
          attempt: null,
        }),
      },
      "@/hooks/use-menu": {
        useMenu: () => ({
          isPending: false,
          isFetching: false,
          isError: false,
        }),
      },
      "@/lib/catalog": {
        cartTotals: () => [],
        menuProducts: () => [],
        formatPrice: () => "Q0.00",
      },
    });
    const footer = elements(MenuScreen()).filter(
      (element) =>
        element.type === "Button" &&
        element.props.title?.startsWith("Ver pedido"),
    );
    assert.equal(footer.length, quantity > 0 ? 1 : 0);
  }
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
