import { ConsiliumPasskeyOffer } from "@/components/consilium-passkey-offer";
import { DynamicTheme } from "@/components/dynamic-theme";
import { getServiceConfig } from "@/lib/service-url";
import { getBrandingSettings } from "@/lib/zitadel";
import { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Ключ входа", referrer: "no-referrer" };

export default async function Page(props: { searchParams: Promise<Record<string | number | symbol, string | undefined>> }) {
  const { sessionId, requestId, organization } = await props.searchParams;
  const { serviceConfig } = getServiceConfig(await headers());
  const branding = await getBrandingSettings({ serviceConfig, organization });

  return (
    <DynamicTheme branding={branding}>
      <div className="w-full">
        {sessionId ? (
          <ConsiliumPasskeyOffer sessionId={sessionId} requestId={requestId} organization={organization} />
        ) : (
          <p className="ztdl-p">Сеанс входа не найден. Откройте Consilium ещё раз.</p>
        )}
      </div>
    </DynamicTheme>
  );
}
