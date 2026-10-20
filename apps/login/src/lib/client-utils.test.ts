import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { handleServerActionResponse, isNativeAppCallback, isSafeRedirectUri } from "./client-utils";

describe("isSafeRedirectUri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should reject empty uri", async () => {
    expect(await isSafeRedirectUri("")).toBe(false);
    expect(await isSafeRedirectUri(undefined as unknown as string)).toBe(false);
  });

  test("should allow relative paths", async () => {
    expect(await isSafeRedirectUri("/dashboard")).toBe(true);
    expect(await isSafeRedirectUri("/ui/console")).toBe(true);
    expect(await isSafeRedirectUri("/")).toBe(true);
  });

  test("should reject protocol-relative paths", async () => {
    expect(await isSafeRedirectUri("//evil.com")).toBe(false);
    expect(await isSafeRedirectUri("\\\\evil.com")).toBe(false);
  });

  test("should allow absolute URLs matching the current host", async () => {
    expect(await isSafeRedirectUri("https://my-zitadel.com/console")).toBe(true);
  });

  test("should allow absolute URLs to external domains", async () => {
    expect(await isSafeRedirectUri("https://evil.com")).toBe(true);
    expect(await isSafeRedirectUri("https://settings.com/dashboard")).toBe(true);
  });

  test("should reject non-http(s) protocols", async () => {
    expect(await isSafeRedirectUri("javascript:alert(1)")).toBe(false);
    expect(await isSafeRedirectUri("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe(false);
    expect(await isSafeRedirectUri("file:///etc/passwd")).toBe(false);
  });

  test("should gracefully reject invalid, unparsable URLs that aren't relative", async () => {
    expect(await isSafeRedirectUri("not-a-valid-url")).toBe(false);
    expect(await isSafeRedirectUri("http://%")).toBe(false);
  });

  test("should allow the callback of our native app", () => {
    expect(isSafeRedirectUri("ru.consiliumalterum.app:/oauth2redirect?code=abc&state=xyz")).toBe(true);
    expect(isSafeRedirectUri("RU.CONSILIUMALTERUM.APP:/oauth2redirect")).toBe(true);
    expect(isNativeAppCallback("ru.consiliumalterum.app:/signout")).toBe(true);
  });

  test("should still reject every other non-http(s) scheme", () => {
    expect(isSafeRedirectUri("com.example.other:/oauth2redirect")).toBe(false);
    expect(isSafeRedirectUri("ru.consiliumalterum.app.evil:/oauth2redirect")).toBe(false);
    expect(isSafeRedirectUri("intent://evil#Intent;end")).toBe(false);
    expect(isSafeRedirectUri(" JaVa\tScript:alert(1)")).toBe(false);
    expect(isNativeAppCallback("https://app.consiliumalterum.ru/oauth/oidc/callback")).toBe(false);
    expect(isNativeAppCallback("/ui/v2/login/signedin")).toBe(false);
  });
});

describe("handleServerActionResponse", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("hands the native app's callback to the document, not the router", () => {
    const location = { href: "https://auth.example.com/ui/v2/login/password" };
    vi.stubGlobal("window", { location });
    const router = { push: vi.fn() };
    const setError = vi.fn();

    const handled = handleServerActionResponse(
      { redirect: "ru.consiliumalterum.app:/oauth2redirect?code=abc" },
      router,
      vi.fn(),
      setError,
    );

    expect(handled).toBe(true);
    expect(location.href).toBe("ru.consiliumalterum.app:/oauth2redirect?code=abc");
    expect(router.push).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  test("keeps web callbacks on the router", () => {
    const router = { push: vi.fn() };

    handleServerActionResponse({ redirect: "https://app.consiliumalterum.ru/oauth/oidc/callback?code=abc" }, router, vi.fn(), vi.fn());

    expect(router.push).toHaveBeenCalledWith("https://app.consiliumalterum.ru/oauth/oidc/callback?code=abc");
  });

  test("blocks a foreign custom scheme", () => {
    const router = { push: vi.fn() };
    const setError = vi.fn();

    handleServerActionResponse({ redirect: "com.example.other:/oauth2redirect?code=abc" }, router, vi.fn(), setError);

    expect(router.push).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith("Unsafe redirect URI was blocked");
  });
});
