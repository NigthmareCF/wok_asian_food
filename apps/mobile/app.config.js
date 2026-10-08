/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  const googleConfigured = Boolean(webClientId && iosUrlScheme);
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const allowPrivateHttpApi = isPrivateHttpUrl(apiBaseUrl);

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: allowPrivateHttpApi } }],
      ...(googleConfigured
        ? [["react-native-nitro-google-signin", { iosUrlScheme }]]
        : []),
    ],
    extra: {
      ...config.extra,
      googleSignInEnabled: googleConfigured,
    },
  };
};

function isPrivateHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd"))
      return true;
    const octets = hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255))
      return false;
    return octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  } catch {
    return false;
  }
}
