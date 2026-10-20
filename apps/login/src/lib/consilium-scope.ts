import "server-only";
import { getUserByID, type ServiceConfig } from "./zitadel";

/** A canary sharing the issuer must not enroll or send codes to production users. */
export async function assertConsiliumUserScope(serviceConfig: ServiceConfig, userId: string): Promise<void> {
  if (process.env.CONSILIUM_PASSKEY_ONBOARDING !== "true") return;
  const organization = process.env.CONSILIUM_ORGANIZATION_ID;
  if (!organization || !userId) throw new Error("Enrollment organization is not configured");
  const response = await getUserByID({ serviceConfig, userId });
  if (response.user?.details?.resourceOwner !== organization) throw new Error("User is outside this login organization");
}
