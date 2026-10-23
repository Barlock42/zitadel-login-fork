export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "landing_url",
  "referrer",
] as const;
export function consiliumRegistrationEnabled() {
  return (
    process.env.CONSILIUM_REGISTRATION === "true" &&
    process.env.CONSILIUM_EMAIL_LOGIN === "true" &&
    process.env.CONSILIUM_PASSKEY_ONBOARDING === "true"
  );
}
export function registrationAttribution(input: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    if (typeof input[key] === "string")
      result[key] = (input[key] as string)
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, key.includes("url") || key === "referrer" ? 2000 : 500);
  }
  return result;
}
