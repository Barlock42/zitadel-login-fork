import { ConsiliumRegistrationForm } from "@/components/consilium-registration-form";
import { consiliumRegistrationEnabled, registrationAttribution } from "@/lib/consilium-registration";
import { notFound } from "next/navigation";

export async function ConsiliumRegistrationPage({
  searchParams,
  variant,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  variant: "registration" | "invite";
}) {
  if (!consiliumRegistrationEnabled()) notFound();
  const params = await searchParams;
  const organization = process.env.CONSILIUM_ORGANIZATION_ID;
  if (!organization || (params.organization && params.organization !== organization)) notFound();
  return (
    <ConsiliumRegistrationForm
      variant={variant}
      requestId={typeof params.requestId === "string" ? params.requestId : undefined}
      attribution={registrationAttribution(params)}
      promo={variant === "invite" && typeof params.promo === "string" ? params.promo.slice(0, 128) : ""}
    />
  );
}
