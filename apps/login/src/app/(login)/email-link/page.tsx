import { ConsiliumEmailLink } from "@/components/consilium-email-link";
import { DynamicTheme } from "@/components/dynamic-theme";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings } from "@/lib/zitadel";
import { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Вход в Consilium", referrer: "no-referrer" };

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const { t } = await props.searchParams;
  const { serviceConfig } = getServiceConfig(await headers());
  const branding = await getBrandingSettings({ serviceConfig, organization: process.env.CONSILIUM_ORGANIZATION_ID });

  return (
    <DynamicTheme branding={branding}>
      <div className="w-full">
        <ConsiliumEmailLink token={t ?? ""} />
      </div>
    </DynamicTheme>
  );
}
