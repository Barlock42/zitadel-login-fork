export type ServerActionResponse =
  | { redirect: string }
  | { error: string }
  | { samlData: { url: string; fields: Record<string, string> } }
  | undefined
  | null;

export function handleServerActionResponse(
  response: ServerActionResponse,
  router: { push: (url: string) => void },
  setSamlData: (data: { url: string; fields: Record<string, string> }) => void,
  setError: (error: string) => void,
): boolean {
  if (!response) {
    return false;
  }

  if ("redirect" in response && response.redirect) {
    if (isSafeRedirectUri(response.redirect)) {
      if (typeof window !== "undefined" && isNativeAppCallback(response.redirect)) {
        // The native app's callback (ru.consiliumalterum.app:/oauth2redirect) leaves the web app:
        // the router cannot navigate to a non-http(s) URL, the document can.
        window.location.href = response.redirect;
      } else {
        router.push(response.redirect);
      }
      return true;
    } else {
      console.warn("handleServerActionResponse: Blocked unsafe redirect URI:", response.redirect);
      setError("Unsafe redirect URI was blocked");
      return true;
    }
  }

  if ("samlData" in response && response.samlData) {
    setSamlData(response.samlData);
    return true;
  }

  if ("error" in response && response.error) {
    setError(response.error);
    return true;
  }

  return false;
}

/**
 * Validates whether a given redirect URI is safe.
 * Safe URIs are either relative paths or absolute URLs matching the current host.
 * This prevents open redirect vulnerabilities and XSS via javascript:/data: URIs.
 */
export function isSafeRedirectUri(uri: string): boolean {
  if (!uri) return false;

  // 1. Relative paths are generally safe
  if (uri.startsWith("/") && !uri.startsWith("//")) {
    return true;
  }

  // 2. Check absolute URLs for safe protocols (http/https)
  // We allow external domains, but strictly forbid javascript:/data: etc.
  try {
    const parsedUri = new URL(uri);

    // Only allow http(s) protocols and the private-use schemes of our own native apps
    if (parsedUri.protocol !== "http:" && parsedUri.protocol !== "https:") {
      return NATIVE_APP_SCHEMES.has(parsedUri.protocol);
    }

    return true;
  } catch {
    // If it can't be parsed as a URL and didn't start with /, it's unsafe
    return false;
  }
}

// Private-use URI schemes (RFC 8252, section 7.1) of our native apps, exactly as registered as
// redirect URIs in ZITADEL. The OIDC callback must reach the app; every other non-http(s)
// scheme stays blocked. Upstream relaxed this check for native apps later (zitadel/zitadel#12332).
const NATIVE_APP_SCHEMES = new Set(["ru.consiliumalterum.app:"]);

/** True for a callback into one of our native apps (see NATIVE_APP_SCHEMES). */
export function isNativeAppCallback(uri: string): boolean {
  try {
    return NATIVE_APP_SCHEMES.has(new URL(uri).protocol);
  } catch {
    return false;
  }
}
