"use server";

import { consiliumRegistrationEnabled, registrationAttribution } from "@/lib/consilium-registration";
import { assertConsiliumUserScope } from "@/lib/consilium-scope";
import { loginCookieName, loginCookiePath } from "@/lib/login-cookies";
import { getServiceConfig } from "@/lib/service-url";
import { addOTPEmail, getUserByID } from "@/lib/zitadel";
import { create } from "@zitadel/client";
import { RequestChallengesSchema } from "@zitadel/proto/zitadel/session/v2/challenge_pb";
import { ChecksSchema } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { verifyConsiliumEmailCode } from "./consilium-email-login";
import { createSessionAndUpdateCookie } from "./cookie";

type Flow = { id: number; browserSecret: string; requestId?: string; email?: string };
type Result = {
  id: number;
  email: string;
  verified: boolean;
  active: boolean;
  userId?: string;
  signingIn?: boolean;
  needsCode?: boolean;
  error?: string;
  code?: string;
};
const PORTAL = process.env.DEFAULT_REDIRECT_URI ?? "https://test.app.consiliumalterum.ru";

function guard() {
  if (!consiliumRegistrationEnabled() || !process.env.CONSILIUM_ORGANIZATION_ID) throw new Error("Registration is disabled");
}
async function readFlow(): Promise<Flow | undefined> {
  const raw = (await cookies()).get(loginCookieName("consiliumRegistration"))?.value;
  if (!raw || raw.length > 1000) return undefined;
  try {
    const flow = JSON.parse(raw);
    if (!Number.isInteger(flow.id) || !/^[a-f0-9]{64}$/.test(flow.browserSecret)) return undefined;
    return flow;
  } catch {
    return undefined;
  }
}
async function saveFlow(flow: Flow) {
  (await cookies()).set({
    name: loginCookieName("consiliumRegistration"),
    value: JSON.stringify(flow),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: loginCookiePath(),
    maxAge: 1800,
  });
}
async function backend(action: string, body: FormData | object): Promise<Result> {
  guard();
  const secret = process.env.CONSILIUM_LINKER_SECRET ?? "";
  const url = process.env.CONSILIUM_LINKER_URL;
  if (!url || secret.length < 32) throw new Error("Registration backend is not configured");
  const h = await headers();
  const client = (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim().slice(0, 100);
  const isForm = body instanceof FormData;
  const response = await fetch(url.replace(/\/$/, "") + "/api/internal/registration/" + action, {
    method: "POST",
    headers: {
      "X-Login-Secret": secret,
      "X-Registration-Client": client,
      ...(!isForm ? { "Content-Type": "application/json" } : {}),
    },
    body: isForm ? body : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    return {
      ...result,
      error:
        result.error ??
        (response.status === 429
          ? "Слишком много попыток. Попробуйте позже."
          : "Не удалось завершить действие. Попробуйте позже."),
    };
  return result;
}

export async function checkConsiliumRegistrationEmail(email: string) {
  guard();
  const flow = await readFlow();
  const result = await backend("check-email", { email, browserSecret: flow?.browserSecret });
  return result.error ? { error: result.error, code: result.code } : { available: true as const };
}

export async function submitConsiliumRegistration(form: FormData, requestId?: string) {
  guard();
  const file = form.get("document");
  if (file instanceof File && file.size > 10 * 1024 * 1024) return { error: "Документ должен быть размером до 10 МБ." };
  const previous = await readFlow();
  const flow: Flow = { id: 0, browserSecret: previous?.browserSecret ?? randomBytes(32).toString("hex"), requestId };
  await saveFlow(flow); // preserves idempotency even if SMTP or the HTTP response fails
  const clean = new FormData();
  for (const key of [
    "Email",
    "LastName",
    "FirstName",
    "MiddleName",
    "CityRegion",
    "PrimarySpecialty",
    "QrCode",
    "AcceptRules",
    "AcceptPersonalDataProcessing",
  ]) {
    const value = form.get(key);
    if (typeof value === "string") clean.set(key, value);
  }
  const additional = form
    .getAll("AdditionalSpecialties")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (additional.length > 3 || additional.some((value) => value.length > 100))
    return { error: "Укажите не более трёх дополнительных специализаций." };
  for (const value of additional) clean.append("AdditionalSpecialties", value.trim());
  if (file instanceof File && file.size > 0) clean.set("document", file);
  const attribution = registrationAttribution(Object.fromEntries(form.entries()));
  for (const [key, value] of Object.entries(attribution)) clean.set(key, value);
  clean.set("browserSecret", flow.browserSecret);
  const result = await backend("submit", clean);
  if (result.error) return { error: result.error, code: result.code };
  await saveFlow({ ...flow, id: result.id, email: result.email });
  return { redirect: "/registration/check" };
}

async function finish(result: Result, flow: Flow) {
  if (result.error) return { error: result.error };
  if (result.needsCode) return { needsCode: true as const };
  if (!result.verified || result.signingIn) return { waiting: true as const };
  if (!result.active || !result.userId) return { verified: true as const, pending: true as const };

  // Only the original browser, a confirmed new registration and a newly provisioned doctor reach here.
  // Exchange that email-ownership proof for a native ZITADEL session. No second email is sent.
  if (!result.userId.startsWith("consilium-reg-")) return { error: "Не удалось подтвердить новый аккаунт." };
  const { serviceConfig } = getServiceConfig(await headers());
  await assertConsiliumUserScope(serviceConfig, result.userId);
  const { user } = await getUserByID({ serviceConfig, userId: result.userId });
  const email = user?.type.case === "human" ? user.type.value.email : undefined;
  if (!email?.isVerified || email.email.toLowerCase() !== result.email.toLowerCase())
    return { error: "Почта аккаунта не подтверждена." };
  await addOTPEmail({ serviceConfig, userId: result.userId }).catch(() => undefined);
  const session = await createSessionAndUpdateCookie({
    checks: create(ChecksSchema, { user: { search: { case: "userId", value: result.userId } } }),
    challenges: create(RequestChallengesSchema, { otpEmail: { deliveryType: { case: "returnCode", value: {} } } }),
    requestId: flow.requestId,
  });
  const code = session.challenges?.otpEmail;
  if (!code) return { error: "Не удалось начать сеанс. Войдите на странице входа." };
  const completed = await verifyConsiliumEmailCode({
    sessionId: session.session.id,
    code,
    requestId: flow.requestId,
    organization: process.env.CONSILIUM_ORGANIZATION_ID,
  });
  if ("error" in completed) return completed;
  await backend("complete", { id: flow.id, browserSecret: flow.browserSecret });
  (await cookies()).delete({ name: loginCookieName("consiliumRegistration"), path: loginCookiePath() });
  return completed;
}

export async function checkConsiliumRegistration(code?: string) {
  guard();
  const flow = await readFlow();
  if (!flow?.id) return { redirect: PORTAL };
  const result = await backend("verify", {
    id: flow.id,
    browserSecret: flow.browserSecret,
    code,
    statusOnly: code === undefined,
  });
  return finish(result, flow);
}
export async function resendConsiliumRegistration() {
  guard();
  const flow = await readFlow();
  if (!flow?.id) return { error: "Откройте исходную страницу регистрации." };
  const result = await backend("resend", { id: flow.id, browserSecret: flow.browserSecret });
  return result.error ? { error: result.error } : { sent: true as const };
}
export async function confirmConsiliumRegistrationLink(id: number, token: string) {
  guard();
  if (!Number.isInteger(id) || !/^[a-f0-9]{64}$/.test(token)) return { error: "Ссылка недействительна." };
  const flow = await readFlow();
  const result = await backend("verify", {
    id,
    link: token,
    ...(flow?.id === id ? { browserSecret: flow.browserSecret } : {}),
  });
  if (result.error) return { error: result.error };
  if (flow?.id === id) return finish(result, flow);
  return { verified: true as const, otherDevice: true as const };
}
export async function registrationEmail() {
  guard();
  return (await readFlow())?.email;
}
