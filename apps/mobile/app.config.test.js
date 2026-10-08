import { afterEach, describe, expect, it } from "vitest";
import configureApp from "./app.config.js";

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

afterEach(() => {
  if (originalApiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
});

function cleartextSettingFor(apiBaseUrl) {
  if (apiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = apiBaseUrl;

  const config = configureApp({ config: { plugins: [] } });
  const plugin = config.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === "expo-build-properties",
  );
  return plugin?.[1]?.android?.usesCleartextTraffic;
}

describe("Android cleartext API configuration", () => {
  it.each([
    "http://localhost:8088",
    "http://127.0.0.1:8088",
    "http://10.20.30.40:8088",
    "http://172.31.10.2:8088",
    "http://192.168.1.20:8088",
    "http://[fd00::1234]:8088",
  ])("allows local HTTP API at %s", (url) => {
    expect(cleartextSettingFor(url)).toBe(true);
  });

  it.each([
    undefined,
    "https://api.example.com",
    "http://8.8.8.8:8088",
    "http://172.32.0.1:8088",
    "http://api.example.com:8088",
  ])("keeps cleartext disabled for %s", (url) => {
    expect(cleartextSettingFor(url)).toBe(false);
  });
});
