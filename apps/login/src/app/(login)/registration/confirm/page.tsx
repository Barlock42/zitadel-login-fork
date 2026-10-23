import { ConsiliumRegistrationCheck } from "@/components/consilium-registration-check";
import { DynamicTheme } from "@/components/dynamic-theme";
import { consiliumRegistrationEnabled } from "@/lib/consilium-registration";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Подтверждение почты — Consilium",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
} as const;
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!consiliumRegistrationEnabled()) notFound();
  const params = await searchParams;
  return (
    <DynamicTheme>
      <div>
        <h1>Подтверждение почты</h1>
      </div>
      <ConsiliumRegistrationCheck link={{ id: Number(params.id), token: params.t ?? "" }} />
    </DynamicTheme>
  );
}
