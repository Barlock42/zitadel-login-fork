import { createHmac, timingSafeEqual } from "node:crypto";

export const VERIFICATION_LIFETIME_SECONDS = 300;

type Proof = { userId: string; fingerprint: string; expires: number; purpose: "enrollment" };

function sign(payload: string, secret: string): string {
  if (secret.length < 32) throw new Error("LOGIN_VERIFICATION_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createVerificationProof(userId: string, fingerprint: string, secret: string, now = Date.now()): string {
  const proof: Proof = { userId, fingerprint, expires: now + VERIFICATION_LIFETIME_SECONDS * 1000, purpose: "enrollment" };
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyVerificationProof(
  token: string,
  userId: string,
  fingerprint: string,
  secret: string,
  now = Date.now(),
): boolean {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra || token.length > 4096) return false;
    const expected = Buffer.from(sign(payload, secret));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const proof = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Proof;
    return (
      proof.purpose === "enrollment" &&
      proof.userId === userId &&
      proof.fingerprint === fingerprint &&
      Number.isFinite(proof.expires) &&
      proof.expires > now &&
      proof.expires <= now + VERIFICATION_LIFETIME_SECONDS * 1000
    );
  } catch {
    return false;
  }
}
