import { afterEach, describe, expect, test, vi } from "vitest";
import { describeDevice, emailCodeVerifiedAt, openEmailLink, sealEmailLink } from "./consilium-email-login";

const secret = "x".repeat(48);
const link = { sessionId: "123", code: "12345678", issued: 1_000, expires: 301_000 };

describe("Consilium email link", () => {
  test("round-trips without exposing the code", () => {
    const token = sealEmailLink(link, secret);
    expect(token).not.toContain(link.code);
    expect(openEmailLink(token, secret, 2_000)).toEqual(link);
  });

  test("rejects expired, tampered and foreign links", () => {
    const token = sealEmailLink(link, secret);
    expect(openEmailLink(token, secret, 301_000)).toBeUndefined();
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(openEmailLink(tampered, secret, 2_000)).toBeUndefined();
    expect(openEmailLink(token, "y".repeat(48), 2_000)).toBeUndefined();
    expect(openEmailLink("", secret, 2_000)).toBeUndefined();
  });

  test("requires a long secret", () => {
    expect(() => sealEmailLink(link, "short")).toThrow();
  });
});

describe("email code as the first factor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("counts only in Consilium email-login mode", () => {
    const factors = { otpEmail: { verifiedAt: "now" } };
    expect(emailCodeVerifiedAt(factors)).toBeUndefined();
    vi.stubEnv("CONSILIUM_EMAIL_LOGIN", "true");
    expect(emailCodeVerifiedAt(factors)).toBe("now");
    expect(emailCodeVerifiedAt({})).toBeUndefined();
  });
});

test("describes the requesting device", () => {
  expect(describeDevice({ browser: { name: "Chrome" }, os: { name: "Windows" } })).toBe("Chrome · Windows");
  expect(describeDevice({})).toBe("неизвестное устройство");
});
