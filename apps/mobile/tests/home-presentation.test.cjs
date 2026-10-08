const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const jiti = require("jiti")(__filename);
const catalog = jiti(path.join(root, "src/lib/catalog.ts"));
const colors = jiti(path.join(root, "src/theme/colors.ts")).getThemeColors(
  "dark",
);
const tokens = jiti(path.join(root, "src/theme/tokens.ts"));

// Execute the installed Web interop adapter before evaluating Pressable styles.
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

function load(file, mocks = {}) {
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const defaults = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useEffect: () => {}, useState: (value) => [value, () => {}] },
    "react-native": {
      Platform: { OS: "web" },
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      FlatList: "FlatList",
      ScrollView: "ScrollView",
    },
    "expo-image": { Image: "Image" },
    "expo-symbols": { SymbolView: "SymbolView" },
    "@/theme/tokens": tokens,
    "@/lib/catalog": catalog,
    "./catalog": catalog,
    "@/components/ui": {
      Button: "Button",
      Card: "Card",
      Page: "Page",
      Skeleton: "Skeleton",
      Notice: "Notice",
      StatusChip: "StatusChip",
      useUiTheme: () => ({ colors }),
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require: (name) =>
      mocks[name] ??
      defaults[name] ??
      (name === "./ui"
        ? defaults["@/components/ui"]
        : name === "@/theme/home-copy"
          ? load("src/theme/home-copy.ts")
          : name.endsWith(".jpg")
            ? "official-logo"
            : {}),
  });
  return exports;
}

const elements = (tree) =>
  !tree || typeof tree !== "object"
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(elements)
      : [tree, ...elements(tree.props?.children)];
const product = (id, imageReference = null) => ({
  id,
  name: `Dish ${id}`,
  price: 42,
  currency: "GTQ",
  imageReference,
  estimatedPreparationSeconds: 0,
  displayOrder: 0,
});
const menuData = (items) => ({ categories: [{ id: "category", items }] });

function home(overrides = {}) {
  const calls = { routes: [], adds: [], retries: 0 };
  const menu = {
    data: menuData([
      product("first"),
      product("photo", "https://example.com/dish.jpg"),
    ]),
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: () => {
      calls.retries++;
    },
    ...overrides.menu,
  };
  const cart = {
    ready: true,
    attempt: null,
    items: {},
    changeQuantity: (...args) => calls.adds.push(args),
    ...overrides.cart,
  };
  const { default: Home } = load("app/(tabs)/index.tsx", {
    "expo-router": { router: { push: (route) => calls.routes.push(route) } },
    "@/hooks/use-cart": { useCart: () => cart },
    "@/hooks/use-menu": { useMenu: () => menu },
    "@/components/brand": { Brand: "Brand" },
    "@/components/home-hero": { HomeHero: "HomeHero" },
    "@/components/product-image": { ProductImage: "ProductImage" },
    "@/lib/home-presentation": load("src/lib/home-presentation.ts"),
    "@/lib/api": { apiRequest: () => Promise.resolve([]) },
    "@/providers/session-provider": { useSession: () => ({ session: null }) },
  });
  const tree = Home();
  const list = elements(tree).find((node) => node.type === "FlatList");
  return { calls, list, nodes: elements(list.props.ListHeaderComponent) };
}

test("Home selection prefers the first safe image while catalogue order stays published", () => {
  const { selectHomeHero, homeCarouselProducts, homeProductRoute } = load(
    "src/lib/home-presentation.ts",
  );
  const items = [
    product("first", "http://example.com/unsafe.jpg"),
    product("second", "https://example.com/second.jpg"),
    product("third", "https://example.com/third.jpg"),
  ];
  assert.equal(selectHomeHero(items).id, "second");
  assert.equal(selectHomeHero([items[0]]).id, "first");
  assert.equal(selectHomeHero([]), null);
  assert.deepEqual(
    Array.from(
      homeCarouselProducts(menuData([...items, ...items, product("seventh")])),
    ).map((item) => item.id),
    ["first", "second", "third", "first", "second", "third"],
  );
  assert.equal(homeProductRoute(null), "/(tabs)/menu");
  assert.equal(homeProductRoute(items[1]).pathname, "/menu/[itemId]");
  assert.equal(homeProductRoute(items[1]).params.itemId, "second");
});

test("Home quick-add eligibility preserves every cart/catalogue lock and the 50 cap", () => {
  const { canHomeQuickAdd } = load("src/lib/home-presentation.ts");
  const state = {
    ready: true,
    attempt: null,
    isFetching: false,
    isError: false,
    quantity: 0,
  };
  assert.equal(canHomeQuickAdd(state), true);
  for (const lock of [
    { ready: false },
    { attempt: {} },
    { isFetching: true },
    { isError: true },
    { quantity: 50 },
    { quantity: 51 },
  ])
    assert.equal(canHomeQuickAdd({ ...state, ...lock }), false);
  assert.equal(canHomeQuickAdd({ ...state, quantity: 49 }), true);
});

test("actual Home order is logo, hero, carousel, menu link, three compact shortcuts, status", () => {
  const { nodes } = home();
  const sequence = nodes.filter(
    (node) =>
      ["Brand", "HomeHero", "ScrollView"].includes(node.type) ||
      (node.type === "Text" &&
        ["Los más antojables", "Antes de visitarnos"].includes(
          node.props.children,
        )) ||
      (node.type === "Pressable" &&
        ["Ver todo el menú", "Menú", "Reservar", "Mis pedidos"].includes(
          node.props.accessibilityLabel,
        )),
  );
  assert.deepEqual(
    sequence.map(
      (node) =>
        node.props.accessibilityLabel ??
        (node.type === "Text" ? node.props.children : node.type),
    ),
    [
      "Brand",
      "HomeHero",
      "Los más antojables",
      "ScrollView",
      "Ver todo el menú",
      "Menú",
      "Reservar",
      "Mis pedidos",
      "Antes de visitarnos",
    ],
  );
  const scroll = nodes.find((node) => node.type === "ScrollView");
  assert.equal(scroll.props.horizontal, true);
  assert.equal(scroll.props.pagingEnabled, true);
  assert.equal(scroll.props.decelerationRate, "fast");
  assert.equal(scroll.props.snapToInterval, 268);
  for (const shortcut of nodes.filter(
    (node) =>
      node.type === "Pressable" &&
      ["Menú", "Reservar", "Mis pedidos"].includes(
        node.props.accessibilityLabel,
      ),
  ))
    assert.ok(shortcut.props.style({ pressed: false }).minHeight >= 44);
});

test("actual carousel detail and plus are separate targets using existing routes and quantity action", () => {
  const { nodes, calls } = home();
  const detail = nodes.find(
    (node) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel?.startsWith("Ver Dish first"),
  );
  const add = nodes.find(
    (node) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel === "Agregar Dish first al carrito",
  );
  assert.ok(detail && add);
  assert.ok(!elements(detail.props.children).includes(add));
  assert.equal(add.props.style({ pressed: false }).width, 44);
  assert.equal(add.props.style({ pressed: false }).height, 44);
  detail.props.onPress();
  add.props.onPress();
  assert.equal(calls.routes[0].params.itemId, "first");
  assert.deepEqual(calls.adds, [["first", 1]]);
  for (const overrides of [
    { cart: { ready: false } },
    { cart: { attempt: {} } },
    { cart: { items: { first: 50 } } },
    { menu: { isFetching: true } },
    { menu: { isError: true } },
  ]) {
    const locked = home(overrides);
    const button = locked.nodes.find(
      (node) =>
        node.props?.accessibilityLabel === "Agregar Dish first al carrito",
    );
    if (button) {
      assert.equal(button.props.disabled, true);
      button.props.onPress();
    }
    assert.equal(locked.calls.adds.length, 0);
  }
});

test("actual Home hero and discreet menu action preserve direct versus generic routes", () => {
  const populated = home();
  populated.nodes.find((node) => node.type === "HomeHero").props.onPress();
  assert.equal(populated.calls.routes[0].pathname, "/menu/[itemId]");
  assert.equal(populated.calls.routes[0].params.itemId, "photo");
  const empty = home({ menu: { data: menuData([]) } });
  empty.nodes.find((node) => node.type === "HomeHero").props.onPress();
  empty.nodes
    .find((node) => node.props.accessibilityLabel === "Ver todo el menú")
    .props.onPress();
  assert.deepEqual(empty.calls.routes, ["/(tabs)/menu", "/(tabs)/menu"]);
});

test("actual Home loading, error and empty branches never fabricate catalogue dishes", () => {
  for (const menu of [
    { isPending: true, data: undefined },
    { isError: true },
    { data: menuData([]) },
  ]) {
    const { nodes, calls } = home({ menu });
    assert.ok(!nodes.some((node) => node.type === "ScrollView"));
    assert.equal(
      nodes.find((node) => node.type === "HomeHero").props.product,
      null,
    );
    if (menu.isPending)
      assert.ok(nodes.some((node) => node.type === "Skeleton"));
    if (menu.isError) {
      const retry = nodes.find(
        (node) => node.type === "Button" && node.props.title === "Reintentar",
      );
      retry.props.onPress();
      assert.equal(calls.retries, 1);
    }
  }
});

test("actual hero keeps one compact CTA, API price, image-error fallback and opaque text backing", () => {
  let failed = null;
  const { HomeHero } = load("src/components/home-hero.tsx", {
    react: {
      useState: () => [
        failed,
        (value) => {
          failed = value;
        },
      ],
    },
    "./gradient-panel": { GradientPanel: "GradientPanel" },
  });
  const selected = product("photo", "https://example.com/dish.jpg");
  let opened = 0;
  const render = (item) =>
    elements(
      HomeHero({
        product: item,
        onPress: () => {
          opened++;
        },
      }),
    );
  let nodes = render(selected);
  const image = nodes.find(
    (node) => node.type === "Image" && node.props.source.uri,
  );
  assert.equal(image.props.contentFit, "cover");
  assert.equal(nodes[0].props.style.height, 280);
  const cta = nodes.find((node) => node.type === "Button");
  assert.equal(cta.props.title, "Pedir ahora");
  cta.props.onPress();
  assert.equal(opened, 1);
  assert.equal(nodes.filter((node) => node.type === "Button").length, 1);
  assert.ok(
    nodes.some(
      (node) =>
        node.props.style?.alignSelf === "flex-start" &&
        elements(node.props.children).includes(cta),
    ),
  );
  assert.ok(
    nodes.some(
      (node) =>
        node.type === "Text" &&
        node.props.children === catalog.formatPrice(selected),
    ),
  );
  const backing = nodes.find(
    (node) => node.props.testID === "home-hero-backing",
  );
  assert.equal(backing.props.style.backgroundColor, "#121214");
  for (const text of elements(backing).filter((node) => node.type === "Text"))
    assert.ok(
      contrast(text.props.style.color, backing.props.style.backgroundColor) >=
        4.5,
    );
  image.props.onError();
  nodes = render(selected);
  assert.ok(
    !nodes.some((node) => node.type === "Image" && node.props.source.uri),
  );
  assert.ok(
    nodes.some(
      (node) => node.type === "Image" && node.props.source === "official-logo",
    ),
  );
  for (const item of [null, product("no-image")])
    assert.ok(
      render(item).some(
        (node) =>
          node.type === "GradientPanel" && node.props.variant === "warm",
      ),
    );
  assert.ok(
    !render(null).some(
      (node) =>
        node.type === "Text" &&
        node.props.children === catalog.formatPrice(selected),
    ),
  );
});

function contrast(a, b) {
  const luminance = (color) =>
    (color.startsWith("#")
      ? color
          .slice(1)
          .match(/../g)
          .map((part) => parseInt(part, 16))
      : color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
    )
      .map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("actual Home menu and contact links preserve contrast in default and pressed states", () => {
  const { nodes, list } = home();
  const links = [...nodes, ...elements(list.props.ListFooterComponent)].filter(
    (node) =>
      node.type === "Pressable" &&
      ["Ver todo el menú", "Contacto"].includes(node.props.accessibilityLabel),
  );
  assert.equal(links.length, 2);
  const channels = (color) =>
    color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
  const composite = (color, opacity) =>
    `rgb(${channels(color)
      .map(
        (channel, index) =>
          channel * opacity +
          channels(colors.background)[index] * (1 - opacity),
      )
      .join(", ")})`;
  for (const link of links) {
    const text = elements(link.props.children).find(
      (node) => node.type === "Text",
    );
    for (const pressed of [false, true]) {
      const style = link.props.style({ pressed });
      const fill =
        style.backgroundColor && style.backgroundColor !== "transparent"
          ? style.backgroundColor
          : colors.background;
      const ratio = contrast(
        composite(text.props.style.color, style.opacity ?? 1),
        composite(fill, style.opacity ?? 1),
      );
      assert.ok(
        ratio >= 4.5,
        `${link.props.accessibilityLabel} pressed=${pressed} contrast=${ratio}`,
      );
      assert.equal(style.opacity ?? 1, 1);
    }
  }
});

test("installed Web className interop drops a function style rather than invoking it", () => {
  let calls = 0;
  const props = webInteropProps({
    className: "focus:ring-2",
    style: () => {
      calls++;
      return { minHeight: 44 };
    },
  });
  assert.notEqual(typeof props.style, "function");
  assert.equal(props.style.minHeight, undefined);
  assert.equal(calls, 0);
});

test("every actual Home Pressable retains layout and feedback through installed Web interop", () => {
  const { nodes, list } = home();
  const controls = [
    ...nodes,
    ...elements(list.props.ListFooterComponent),
  ].filter((node) => node.type === "Pressable");
  assert.equal(controls.length, 9);
  for (const control of controls) {
    const props = webInteropProps(control.props);
    assert.equal(
      typeof props.style,
      "function",
      `${props.accessibilityLabel}: lost layout callback`,
    );
    for (const state of [
      { pressed: false },
      { pressed: true },
      { pressed: false, focused: true },
    ]) {
      const style = props.style(state);
      assert.ok(
        (style.height ?? style.minHeight) >= 44,
        `${props.accessibilityLabel}: missing 44px height`,
      );
      assert.ok(
        (style.width ?? style.minWidth) >= 44,
        `${props.accessibilityLabel}: missing 44px width`,
      );
      assert.equal(style.opacity ?? 1, 1);
      if (state.focused) assert.equal(style.borderColor, colors.accentText);
    }
  }
});

test("opt-in warm/scrim gradients preserve every original neutral band and native primitives", () => {
  const { GradientPanel } = load("src/components/gradient-panel.tsx");
  const neutral = elements(GradientPanel({ children: "content" }));
  const start = tokens.darkTokens["--surface-elevated"].split(" ").map(Number),
    end = tokens.darkTokens["--surface"].split(" ").map(Number);
  const expected = Array.from(
    { length: 32 },
    (_, index) =>
      `rgb(${start.map((channel, offset) => Math.round(channel + ((end[offset] - channel) * index) / 31)).join(", ")})`,
  );
  assert.deepEqual(
    neutral
      .filter((node) => node.props.style?.backgroundColor)
      .map((node) => node.props.style.backgroundColor),
    expected,
  );
  const warm = elements(GradientPanel({ variant: "warm", fill: true }));
  for (const band of warm.filter((node) => node.props.style?.backgroundColor))
    assert.ok(
      contrast(colors.foreground, band.props.style.backgroundColor) >= 4.5,
    );
  const scrim = elements(GradientPanel({ variant: "scrim", fill: true }));
  assert.ok(scrim.some((node) => node.props.className?.includes("flex-col")));
  assert.ok(
    scrim.some(
      (node) => node.props.style?.backgroundColor === "rgba(18, 18, 20, 1)",
    ),
  );
  assert.ok(scrim.every((node) => node.type === "View"));
});
