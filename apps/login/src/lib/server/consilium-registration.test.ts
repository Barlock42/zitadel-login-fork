import { assertConsiliumUserScope } from "@/lib/consilium-scope";
import { getUserByID } from "@/lib/zitadel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyConsiliumEmailCode } from "./consilium-email-login";
import { checkConsiliumRegistration, confirmConsiliumRegistrationLink, registrationEmail } from "./consilium-registration";
import { createSessionAndUpdateCookie } from "./cookie";

const m = vi.hoisted(() => ({ cookie: "", fetch: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => (m.cookie ? { value: m.cookie } : undefined), set: m.set, delete: m.remove }),
}));
vi.mock("@/lib/service-url", () => ({ getServiceConfig: () => ({ serviceConfig: {} }) }));
vi.mock("@/lib/consilium-scope", () => ({ assertConsiliumUserScope: vi.fn() }));
vi.mock("@/lib/zitadel", () => ({ getUserByID: vi.fn(), addOTPEmail: vi.fn(async () => ({})) }));
vi.mock("./cookie", () => ({ createSessionAndUpdateCookie: vi.fn() }));
vi.mock("./consilium-email-login", () => ({ verifyConsiliumEmailCode: vi.fn() }));

const flow = { id: 42, browserSecret: "a".repeat(64), requestId: "oidc-test", email: "doctor@example.invalid" };
const active = { id: 42, email: flow.email, verified: true, active: true, userId: "consilium-reg-new" };
function reply(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("Consilium registration proof boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CONSILIUM_REGISTRATION", "true");
    vi.stubEnv("CONSILIUM_EMAIL_LOGIN", "true");
    vi.stubEnv("CONSILIUM_PASSKEY_ONBOARDING", "true");
    vi.stubEnv("CONSILIUM_ORGANIZATION_ID", "staging");
    vi.stubEnv("CONSILIUM_LINKER_URL", "http://linker");
    vi.stubEnv("CONSILIUM_LINKER_SECRET", "s".repeat(48));
    vi.stubGlobal("fetch", m.fetch);
    m.cookie = JSON.stringify(flow);
    m.fetch.mockImplementation(async () => reply(active));
    vi.mocked(getUserByID).mockResolvedValue({
      user: { type: { case: "human", value: { email: { email: flow.email, isVerified: true } } } },
    } as any);
    vi.mocked(createSessionAndUpdateCookie).mockResolvedValue({
      session: { id: "session" },
      challenges: { otpEmail: "12345678" },
    } as any);
    vi.mocked(verifyConsiliumEmailCode).mockResolvedValue({ redirect: "/passkey/offer?sessionId=session" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("keeps registration disabled without the explicit canary flag", async () => {
    vi.stubEnv("CONSILIUM_REGISTRATION", "false");
    await expect(checkConsiliumRegistration("123456")).rejects.toThrow();
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("does not perform backend writes or provision a user when rendering the email on GET", async () => {
    expect(await registrationEmail()).toBe(flow.email);
    expect(m.fetch).not.toHaveBeenCalled();
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("requires the original browser secret, and forwards the typed code only to the internal API", async () => {
    m.fetch.mockResolvedValue(reply({ error: "Неверный код" }, 400));
    expect(await checkConsiliumRegistration("000000")).toEqual({ error: "Неверный код" });
    const [url, init] = m.fetch.mock.calls[0];
    expect(url).toBe("http://linker/api/internal/registration/verify");
    expect(JSON.parse(init.body)).toMatchObject({
      id: 42,
      browserSecret: flow.browserSecret,
      code: "000000",
      statusOnly: false,
    });
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("leaves document applications on review without granting a ZITADEL session", async () => {
    m.fetch.mockResolvedValue(reply({ ...active, active: false, userId: undefined }));
    expect(await checkConsiliumRegistration("123456")).toEqual({ verified: true, pending: true });
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("exchanges a verified new doctor proof for a session and consumes the registration grant", async () => {
    expect(await checkConsiliumRegistration("123456")).toEqual({ redirect: "/passkey/offer?sessionId=session" });
    expect(assertConsiliumUserScope).toHaveBeenCalledWith({}, active.userId);
    expect(verifyConsiliumEmailCode).toHaveBeenCalledWith({
      sessionId: "session",
      code: "12345678",
      requestId: "oidc-test",
      organization: "staging",
    });
    expect(m.fetch.mock.calls[1][0]).toContain("/complete");
    expect(m.remove).toHaveBeenCalled();
  });
  it("does not sign in the original browser after a link was confirmed only on another device", async () => {
    m.fetch.mockResolvedValue(reply({ ...active, active: false, userId: undefined, needsCode: true }));
    expect(await checkConsiliumRegistration()).toEqual({ needsCode: true });
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("waits while another tab is exchanging the same registration proof", async () => {
    m.fetch.mockResolvedValue(reply({ ...active, active: false, userId: undefined, signingIn: true }));
    expect(await checkConsiliumRegistration()).toEqual({ waiting: true });
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("refuses an existing account ID or an unverified identity", async () => {
    m.fetch.mockResolvedValueOnce(reply({ ...active, userId: "existing-user" }));
    expect(await checkConsiliumRegistration("123456")).toHaveProperty("error");
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
    vi.mocked(getUserByID).mockResolvedValue({
      user: { type: { case: "human", value: { email: { email: flow.email, isVerified: false } } } },
    } as any);
    expect(await checkConsiliumRegistration("123456")).toHaveProperty("error");
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("does not authenticate the device that opened a link without the original browser cookie", async () => {
    m.cookie = "";
    m.fetch.mockResolvedValue(reply({ ...active, active: false, userId: undefined }));
    expect(await confirmConsiliumRegistrationLink(42, "b".repeat(64))).toEqual({ verified: true, otherDevice: true });
    expect(JSON.parse(m.fetch.mock.calls[0][1].body)).not.toHaveProperty("browserSecret");
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("does not accept another organization's identity proof", async () => {
    vi.mocked(assertConsiliumUserScope).mockRejectedValue(new Error("out of scope"));
    await expect(checkConsiliumRegistration("123456")).rejects.toThrow("out of scope");
    expect(createSessionAndUpdateCookie).not.toHaveBeenCalled();
  });
  it("rejects malformed browser state before the backend can issue a sign-in grant", async () => {
    m.cookie = JSON.stringify({ id: 42, browserSecret: "short" });
    expect(await checkConsiliumRegistration("123456")).toHaveProperty("redirect");
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
