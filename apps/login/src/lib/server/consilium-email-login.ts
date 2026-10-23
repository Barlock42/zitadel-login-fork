"use server";

import { completeFlowOrGetUrl } from "@/lib/client";
import {
  consiliumEmailLoginEnabled,
  describeDevice,
  emailCodeLifetimeMinutes,
  openEmailLink,
  sealEmailLink,
} from "@/lib/consilium-email-login";
import { assertConsiliumUserScope } from "@/lib/consilium-scope";
import { getSessionCookieById } from "@/lib/cookies";
import { createLogger } from "@/lib/logger";
import { loginCookieName, loginCookiePath } from "@/lib/login-cookies";
import { getServiceConfig } from "@/lib/service-url";
import {
  addOTPEmail,
  getLoginSettings,
  getSession,
  getUserByID,
  listAuthenticationMethodTypes,
  type ServiceConfig,
} from "@/lib/zitadel";
import { create, Duration, Timestamp, timestampDate } from "@zitadel/client";
import { RequestChallengesSchema } from "@zitadel/proto/zitadel/session/v2/challenge_pb";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { AuthenticationMethodType } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { setSessionAndUpdateCookie } from "./cookie";
import { getPublicHostWithProtocol } from "./host";

const logger = createLogger("consilium-email-login");

const RESEND_SECONDS = 60;
const OFFER_DISMISSED_DAYS = 180;
const SESSION_LOST = "Сеанс входа устарел. Введите почту ещё раз.";

type FlowResult = { redirect: string } | { error: string } | { samlData: { url: string; fields: Record<string, string> } };
type Flow = { sessionId: string; requestId?: string; organization?: string };

async function currentSession(sessionId: string) {
  const { serviceConfig } = getServiceConfig(await headers());
  const cookie = await getSessionCookieById({ sessionId });
  if (!cookie) return undefined;
  // ZITADEL rotates the token on every session change; a stale cookie means the login has to start again.
  const session = await getSession({ serviceConfig, sessionId: cookie.id, sessionToken: cookie.token })
    .then((response) => response.session)
    .catch(() => undefined);
  const userId = session?.factors?.user?.id;
  if (!session || !userId) return undefined;
  await assertConsiliumUserScope(serviceConfig, userId);
  return { serviceConfig, cookie, session, userId };
}

/** The email code replaces the password, so it gets the password check lifetime. */
async function sessionLifetime(serviceConfig: ServiceConfig, organization?: string): Promise<Duration> {
  const settings = await getLoginSettings({ serviceConfig, organization });
  const lifetime = settings?.passwordCheckLifetime;
  return lifetime?.seconds ? lifetime : ({ seconds: BigInt(60 * 60 * 24), nanos: 0 } as Duration);
}

function verifiedSince(verifiedAt: Timestamp | undefined, since: number): boolean {
  return !!verifiedAt && timestampDate(verifiedAt).getTime() >= since;
}

export async function sendConsiliumEmailCode({
  sessionId,
}: {
  sessionId: string;
}): Promise<{ sentAt: number; resendAfter: number; codeLength: number } | { error: string }> {
  if (!consiliumEmailLoginEnabled()) return { error: "Вход по коду из письма выключен." };
  const linkerUrl = process.env.CONSILIUM_LINKER_URL;
  const linkerSecret = process.env.CONSILIUM_LINKER_SECRET ?? "";
  const linkSecret = process.env.LOGIN_VERIFICATION_SECRET ?? "";
  if (!linkerUrl || linkerSecret.length < 32) throw new Error("Consilium linker is not configured");

  const current = await currentSession(sessionId);
  if (!current) return { error: SESSION_LOST };
  const { serviceConfig, cookie, session, userId } = current;

  // Reloading the page must not send another email; the previous code is still valid.
  const jar = await cookies();
  const sentCookie = loginCookieName("consiliumEmailCode");
  const [sentFor, sentAtText, lengthText] = (jar.get(sentCookie)?.value ?? "").split(".");
  const previous = sentFor === sessionId ? Number(sentAtText) : NaN;
  if (Number.isFinite(previous) && Date.now() - previous < RESEND_SECONDS * 1000) {
    return { sentAt: previous, resendAfter: RESEND_SECONDS, codeLength: Number(lengthText) || 8 };
  }

  const { user } = await getUserByID({ serviceConfig, userId });
  const email = user?.type.case === "human" ? user.type.value.email : undefined;
  if (!email?.email || !email.isVerified) {
    return { error: "Почта не подтверждена. Откройте письмо с приглашением или напишите в поддержку." };
  }
  const methods = await listAuthenticationMethodTypes({ serviceConfig, userId });
  if (!methods.authMethodTypes.includes(AuthenticationMethodType.OTP_EMAIL)) {
    // A concurrent request may have added it already; the challenge below fails if it is really missing.
    await addOTPEmail({ serviceConfig, userId }).catch((error) => logger.warn("addOTPEmail failed", { error }));
  }

  const updated = await setSessionAndUpdateCookie({
    recentCookie: cookie,
    challenges: create(RequestChallengesSchema, { otpEmail: { deliveryType: { case: "returnCode", value: {} } } }),
    lifetime: await sessionLifetime(serviceConfig, session.factors?.user?.organizationId),
  }).catch((error) => {
    logger.error("Could not request the email code", { error });
    return undefined;
  });
  const code = updated && "challenges" in updated ? updated.challenges?.otpEmail : undefined;
  if (!code) return { error: "Не удалось создать код. Попробуйте ещё раз." };

  const _headers = await headers();
  const sentAt = Date.now();
  const expiresInMinutes = emailCodeLifetimeMinutes();
  const token = sealEmailLink({ sessionId, code, issued: sentAt, expires: sentAt + expiresInMinutes * 60_000 }, linkSecret);
  const link = `${getPublicHostWithProtocol(_headers)}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/email-link?t=${token}`;

  const response = await fetch(`${linkerUrl.replace(/\/$/, "")}/api/internal/login-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Login-Secret": linkerSecret },
    body: JSON.stringify({
      email: email.email,
      code,
      link,
      expiresInMinutes,
      device: describeDevice(userAgent({ headers: _headers })),
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch((error) => {
    logger.error("Linker did not accept the login code email", { error });
    return undefined;
  });
  if (response?.status === 429) return { error: "Слишком много писем подряд. Подождите несколько минут." };
  if (!response?.ok) return { error: "Не удалось отправить письмо. Попробуйте ещё раз." };

  jar.set({
    name: sentCookie,
    value: `${sessionId}.${sentAt}.${code.length}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: loginCookiePath(),
    maxAge: expiresInMinutes * 60,
  });
  return { sentAt, resendAfter: RESEND_SECONDS, codeLength: code.length };
}

async function forgetConsiliumEmailCode(): Promise<void> {
  (await cookies()).delete({ name: loginCookieName("consiliumEmailCode"), path: loginCookiePath() });
}

export async function verifyConsiliumEmailCode(command: Flow & { code: string }): Promise<FlowResult> {
  if (!consiliumEmailLoginEnabled()) return { error: "Вход по коду из письма выключен." };
  const current = await currentSession(command.sessionId);
  if (!current) return { error: SESSION_LOST };
  const code = command.code.replace(/\s/g, "");
  if (!/^\d{4,12}$/.test(code)) return { error: "Введите код из письма." };
  const checked = await setSessionAndUpdateCookie({
    recentCookie: current.cookie,
    checks: create(ChecksSchema, { otpEmail: { code } }),
    requestId: command.requestId,
    lifetime: await sessionLifetime(current.serviceConfig, current.session.factors?.user?.organizationId),
  }).catch(() => undefined);
  if (!checked) return { error: "Неверный или устаревший код. Проверьте письмо или запросите новый код." };
  return nextAfterEmailCode(command, current.serviceConfig, current.userId);
}

/** The original page polls while the user may click the link in another tab. */
export async function pollConsiliumEmailLogin(command: Flow & { since: number }): Promise<FlowResult | { waiting: true }> {
  if (!consiliumEmailLoginEnabled()) return { error: "Вход по коду из письма выключен." };
  const current = await currentSession(command.sessionId);
  if (!current) return { error: SESSION_LOST };
  if (!verifiedSince(current.session.factors?.otpEmail?.verifiedAt, command.since)) return { waiting: true };
  // The tab that opened the link offers the passkey; this one only finishes its own request.
  return finishConsiliumLogin(command);
}

export type EmailLinkResult = FlowResult | { code: string; expires: number };

/** Same browser: finish the check. Elsewhere: only show the code; a click must never sign in another device. */
export async function openConsiliumEmailLink({ token }: { token: string }): Promise<EmailLinkResult> {
  const link = openEmailLink(token, process.env.LOGIN_VERIFICATION_SECRET ?? "");
  if (!consiliumEmailLoginEnabled() || !link) {
    return { error: "Ссылка устарела. Запросите новый код на странице входа." };
  }
  const current = await currentSession(link.sessionId);
  if (!current) return { code: link.code, expires: link.expires };
  if (!verifiedSince(current.session.factors?.otpEmail?.verifiedAt, link.issued)) {
    const checked = await setSessionAndUpdateCookie({
      recentCookie: current.cookie,
      checks: create(ChecksSchema, { otpEmail: { code: link.code } }),
      lifetime: await sessionLifetime(current.serviceConfig, current.session.factors?.user?.organizationId),
    }).catch(() => undefined);
    if (!checked) return { error: "Ссылка устарела. Запросите новый код на странице входа." };
  }
  return nextAfterEmailCode({ sessionId: link.sessionId }, current.serviceConfig, current.userId);
}

async function nextAfterEmailCode(flow: Flow, serviceConfig: ServiceConfig, userId: string): Promise<FlowResult> {
  await forgetConsiliumEmailCode();
  const dismissed = (await cookies()).get(loginCookieName("consiliumPasskeyOffer"))?.value === "dismissed";
  if (!dismissed) {
    const methods = await listAuthenticationMethodTypes({ serviceConfig, userId });
    if (!methods.authMethodTypes.includes(AuthenticationMethodType.PASSKEY)) {
      const params = new URLSearchParams({ sessionId: flow.sessionId });
      if (flow.requestId) params.set("requestId", flow.requestId);
      if (flow.organization) params.set("organization", flow.organization);
      return { redirect: `/passkey/offer?${params}` };
    }
  }
  return finishConsiliumLogin(flow);
}

export async function finishConsiliumLogin(flow: Flow & { dismissPasskeyOffer?: boolean }): Promise<FlowResult> {
  const current = await currentSession(flow.sessionId);
  if (!current) return { error: SESSION_LOST };
  if (flow.dismissPasskeyOffer) {
    (await cookies()).set({
      name: loginCookieName("consiliumPasskeyOffer"),
      value: "dismissed",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: loginCookiePath(),
      maxAge: OFFER_DISMISSED_DAYS * 24 * 60 * 60,
    });
  }
  const organization = flow.organization ?? current.session.factors?.user?.organizationId;
  const settings = await getLoginSettings({ serviceConfig: current.serviceConfig, organization });
  return completeFlowOrGetUrl(
    flow.requestId
      ? { sessionId: flow.sessionId, requestId: flow.requestId, organization }
      : { loginName: current.session.factors?.user?.loginName ?? "", organization },
    settings?.defaultRedirectUri,
  );
}
