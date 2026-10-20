import { checkUserVerification } from "@/lib/verify-helper";
import { getUserByID, listAuthenticationMethodTypes, verifyInviteCode } from "@/lib/zitadel";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startConsiliumEnrollment } from "./consilium-invite";
import { sendLoginname } from "./loginname";
import { registerPasskeyLink } from "./passkeys";

const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn(async () => ({ set: setCookie })) }));
vi.mock("@/lib/service-url", () => ({ getServiceConfig: () => ({ serviceConfig: {} }) }));
vi.mock("@/lib/fingerprint", () => ({ getOrSetFingerprintId: async () => "browser" }));
vi.mock("@/lib/verify-helper", () => ({ checkUserVerification: vi.fn() }));
vi.mock("@/lib/zitadel", () => ({
  getUserByID: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  verifyInviteCode: vi.fn(),
}));
vi.mock("./passkeys", () => ({ registerPasskeyLink: vi.fn() }));
vi.mock("./loginname", () => ({ sendLoginname: vi.fn() }));
vi.mock("./cookie", () => ({ createSessionAndUpdateCookie: async () => ({ session: { id: "bootstrap-session" } }) }));

const command = { userId: "doctor", organization: "staging", code: "invite" };
describe("Consilium invitation", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CONSILIUM_PASSKEY_ONBOARDING", "true");
    vi.stubEnv("CONSILIUM_ORGANIZATION_ID", "staging");
    vi.stubEnv("LOGIN_VERIFICATION_SECRET", "s".repeat(48));
    vi.mocked(getUserByID).mockResolvedValue({
      user: {
        userId: "doctor",
        preferredLoginName: "doctor@example.test",
        details: { resourceOwner: "staging" },
        type: { case: "human", value: {} },
      },
    } as any);
    vi.mocked(checkUserVerification).mockResolvedValue(false);
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
    vi.mocked(registerPasskeyLink).mockResolvedValue({ passkeyId: "key", publicKeyCredentialCreationOptions: {} } as any);
  });
  it("does not accept an invite from another organization", async () => {
    expect(await startConsiliumEnrollment({ ...command, organization: "production" })).toHaveProperty("error");
    expect(verifyInviteCode).not.toHaveBeenCalled();
    expect(registerPasskeyLink).not.toHaveBeenCalled();
  });
  it("never grants enrollment after an invalid or expired invite", async () => {
    vi.mocked(verifyInviteCode).mockRejectedValue(new Error("expired"));
    expect(await startConsiliumEnrollment(command)).toHaveProperty("error");
    expect(setCookie).not.toHaveBeenCalled();
    expect(registerPasskeyLink).not.toHaveBeenCalled();
  });
  it("verifies once, issues a signed proof and goes directly to passkey enrollment", async () => {
    expect(await startConsiliumEnrollment(command)).toHaveProperty("sessionId", "bootstrap-session");
    expect(verifyInviteCode).toHaveBeenCalledTimes(1);
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 300 }));
    expect(registerPasskeyLink).toHaveBeenCalledWith({ sessionId: "bootstrap-session" });
  });
  it("resumes a cancelled ceremony within the signed proof lifetime without consuming the invite again", async () => {
    vi.mocked(checkUserVerification).mockResolvedValue(true);
    expect(await startConsiliumEnrollment({ ...command, code: undefined })).toHaveProperty("registration");
    expect(verifyInviteCode).not.toHaveBeenCalled();
  });
  it("uses an existing primary method instead of enrolling another credential", async () => {
    vi.mocked(listAuthenticationMethodTypes).mockResolvedValue({
      authMethodTypes: [AuthenticationMethodType.PASSKEY],
    } as any);
    vi.mocked(sendLoginname).mockResolvedValue({ redirect: "/passkey?sessionId=existing" });
    expect(await startConsiliumEnrollment(command)).toEqual({ redirect: "/passkey?sessionId=existing" });
    expect(registerPasskeyLink).not.toHaveBeenCalled();
  });
});
