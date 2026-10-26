import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** Passwordless Consilium login: a code from the email is the first factor. */
export function consiliumEmailLoginEnabled(): boolean {
  return process.env.CONSILIUM_EMAIL_LOGIN === "true";
}

/** ZITADEL treats an email code as a first factor; upstream Login V2 only accepts it as MFA. */
export function emailCodeVerifiedAt<T>(factors: { otpEmail?: { verifiedAt?: T } } | undefined): T | undefined {
  return consiliumEmailLoginEnabled() ? factors?.otpEmail?.verifiedAt : undefined;
}

export function emailCodeLifetimeMinutes(): number {
  const minutes = Number(process.env.CONSILIUM_EMAIL_CODE_TTL_MINUTES);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
}

export type EmailLink = { sessionId: string; code: string; issued: number; expires: number };

const LINK_PURPOSE = "consilium-email-login-link";

function linkKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("LOGIN_VERIFICATION_SECRET must contain at least 32 characters");
  return Buffer.from(hkdfSync("sha256", secret, "", LINK_PURPOSE, 32));
}

/** The link carries the code for a click in the same browser; encryption keeps it out of access logs. */
export function sealEmailLink(link: EmailLink, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", linkKey(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(link), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openEmailLink(token: string, secret: string, now = Date.now()): EmailLink | undefined {
  try {
    if (!token || token.length > 2048) return undefined;
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= 28) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", linkKey(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const link = JSON.parse(text) as EmailLink;
    const valid =
      typeof link.sessionId === "string" &&
      typeof link.code === "string" &&
      Number.isFinite(link.issued) &&
      Number.isFinite(link.expires) &&
      link.expires > now;
    return valid ? link : undefined;
  } catch {
    return undefined;
  }
}

export function describeDevice(agent: { browser?: { name?: string }; os?: { name?: string } }): string {
  return [agent.browser?.name, agent.os?.name].filter(Boolean).join(" · ") || "неизвестное устройство";
}
