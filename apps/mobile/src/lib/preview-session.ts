type LoginEnvironment = {
  platform: string;
  development: boolean;
  pageUrl?: string;
  apiBaseUrl?: string;
};

function isLoopbackUrl(value: string | undefined, originOnly: boolean) {
  if (!value || /[\\\s]/.test(value)) return false;
  const authority =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?=\/|\?|#|$)/i;
  if (!authority.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      !originOnly ||
      (url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?\/?$/i.test(
          value,
        ))
    );
  } catch {
    return false;
  }
}

export function canLogin({
  platform,
  development,
  pageUrl,
  apiBaseUrl,
}: LoginEnvironment) {
  return (
    platform !== "web" ||
    (development &&
      isLoopbackUrl(pageUrl, false) &&
      isLoopbackUrl(apiBaseUrl, true))
  );
}

export function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      values.delete(key);
    },
  };
}
