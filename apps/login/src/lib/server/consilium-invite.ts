"use server";

import { getOrSetFingerprintId } from "@/lib/fingerprint";
import { loginCookieName, loginCookiePath } from "@/lib/login-cookies";
import { getServiceConfig } from "@/lib/service-url";
import { createVerificationProof, VERIFICATION_LIFETIME_SECONDS } from "@/lib/verification-proof";
import { checkUserVerification } from "@/lib/verify-helper";
import { getUserByID, listAuthenticationMethodTypes, verifyInviteCode } from "@/lib/zitadel";
import { create } from "@zitadel/client";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { AuthenticationMethodType, type RegisterPasskeyResponse } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { cookies, headers } from "next/headers";
import { createSessionAndUpdateCookie } from "./cookie";
import { sendLoginname } from "./loginname";
import { registerPasskeyLink } from "./passkeys";

type EnrollmentResult =
  | { error: string }
  | { redirect: string }
  | { registration: RegisterPasskeyResponse; sessionId: string; loginName: string };

export async function startConsiliumEnrollment(command: {
  userId: string;
  organization: string;
  code?: string;
  requestId?: string;
}): Promise<EnrollmentResult> {
  if (
    process.env.CONSILIUM_PASSKEY_ONBOARDING !== "true" ||
    !process.env.CONSILIUM_ORGANIZATION_ID ||
    command.organization !== process.env.CONSILIUM_ORGANIZATION_ID
  ) {
    return { error: "Это приглашение не относится к данному порталу." };
  }
  const secret = process.env.LOGIN_VERIFICATION_SECRET ?? "";
  if (secret.length < 32) throw new Error("Enrollment signing secret is not configured");
  const { serviceConfig } = getServiceConfig(await headers());
  const response = await getUserByID({ serviceConfig, userId: command.userId });
  const user = response.user;
  if (!user || user.details?.resourceOwner !== command.organization || user.type.case !== "human") {
    return { error: "Приглашение недействительно. Обратитесь в поддержку." };
  }
  if (!(await checkUserVerification(user.userId))) {
    if (!command.code || command.code.length > 1024) return { error: "Откройте ссылку из письма с приглашением." };
    try {
      await verifyInviteCode({ serviceConfig, userId: user.userId, verificationCode: command.code });
    } catch {
      return {
        error:
          "Ссылка истекла или уже использована. Если вы уже зарегистрированы, войдите в портал. Для нового приглашения обратитесь в поддержку.",
      };
    }
    const fingerprint = await getOrSetFingerprintId();
    (await cookies()).set({
      name: loginCookieName("verificationCheck"),
      value: createVerificationProof(user.userId, fingerprint, secret),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: loginCookiePath(),
      maxAge: VERIFICATION_LIFETIME_SECONDS,
    });
  }
  const methods = await listAuthenticationMethodTypes({ serviceConfig, userId: user.userId });
  if (
    methods.authMethodTypes.some((method) =>
      [AuthenticationMethodType.PASSWORD, AuthenticationMethodType.PASSKEY, AuthenticationMethodType.IDP].includes(method),
    )
  ) {
    const next = await sendLoginname({
      loginName: user.preferredLoginName,
      organization: command.organization,
      requestId: command.requestId,
    });
    if (next && "redirect" in next && next.redirect) return { redirect: next.redirect };
    return { error: "Не удалось открыть вход. Обратитесь в поддержку." };
  }
  const { session } = await createSessionAndUpdateCookie({
    checks: create(ChecksSchema, { user: { search: { case: "userId", value: user.userId } } }),
    requestId: command.requestId,
  });
  const registration = await registerPasskeyLink({ sessionId: session.id });
  if ("error" in registration) return registration;
  return { registration, sessionId: session.id, loginName: user.preferredLoginName };
}
