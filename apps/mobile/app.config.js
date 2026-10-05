/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  const googleConfigured = Boolean(webClientId && iosUrlScheme);

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
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
