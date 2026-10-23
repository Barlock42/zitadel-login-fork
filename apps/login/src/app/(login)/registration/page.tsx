import { Alert } from "@/components/alert";
import { ConsiliumRegistrationForm } from "@/components/consilium-registration-form";
import { DynamicTheme } from "@/components/dynamic-theme";
import { consiliumRegistrationEnabled, registrationAttribution } from "@/lib/consilium-registration";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings, getLegalAndSupportSettings } from "@/lib/zitadel";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регистрация в Consilium", robots: { index: false, follow: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!consiliumRegistrationEnabled()) notFound();
  const params = await searchParams;
  const organization = process.env.CONSILIUM_ORGANIZATION_ID;
  if (!organization || (params.organization && params.organization !== organization))
    return <Alert>Эта регистрация предназначена для тестового портала.</Alert>;
  const { serviceConfig } = getServiceConfig(await headers());
  const [branding, legal] = await Promise.all([
    getBrandingSettings({ serviceConfig, organization }),
    getLegalAndSupportSettings({ serviceConfig, organization }),
  ]);
  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col gap-4">
        <h1>Регистрация в Consilium</h1>
        <p>Для врачей. Подтвердите почту и получите доступ по промокоду или после проверки документа.</p>
      </div>
      <ConsiliumRegistrationForm
        requestId={typeof params.requestId === "string" ? params.requestId : undefined}
        attribution={registrationAttribution(params)}
        termsUrl={legal?.tosLink}
        privacyUrl={legal?.privacyPolicyLink}
      />
    </DynamicTheme>
  );
}
