import { describe, expect, it } from "vitest";
import { createVerificationProof, verifyVerificationProof } from "./verification-proof";

const key = "a".repeat(48);
describe("enrollment proof", () => {
  it("binds a short-lived proof to the user, browser and server key", () => {
    const proof = createVerificationProof("doctor", "browser", key, 1000);
    expect(verifyVerificationProof(proof, "doctor", "browser", key, 2000)).toBe(true);
    expect(verifyVerificationProof(proof, "other", "browser", key, 2000)).toBe(false);
    expect(verifyVerificationProof(proof, "doctor", "other", key, 2000)).toBe(false);
    expect(verifyVerificationProof(proof, "doctor", "browser", "b".repeat(48), 2000)).toBe(false);
    expect(verifyVerificationProof(proof, "doctor", "browser", key, 301000)).toBe(false);
    expect(verifyVerificationProof(proof + "x", "doctor", "browser", key, 2000)).toBe(false);
  });
  it("rejects a modified expiration even if the client controls both cookie values", () => {
    const proof = createVerificationProof("doctor", "browser", key, 1000);
    const [payload, signature] = proof.split(".");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    data.expires = Number.MAX_SAFE_INTEGER;
    const forged = `${Buffer.from(JSON.stringify(data)).toString("base64url")}.${signature}`;
    expect(verifyVerificationProof(forged, "doctor", "browser", key, 2000)).toBe(false);
  });
});
