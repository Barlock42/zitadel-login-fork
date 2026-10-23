import { ConsiliumRegistrationCheck } from "@/components/consilium-registration-check";
import { DynamicTheme } from "@/components/dynamic-theme";
import { consiliumRegistrationEnabled } from "@/lib/consilium-registration";
import { registrationEmail } from "@/lib/server/consilium-registration";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Подтверждение почты — Consilium", robots: { index: false, follow: false } };
export default async function Page() {
  if (!consiliumRegistrationEnabled()) notFound();
  return (
    <DynamicTheme>
      <div>
        <h1>Подтвердите почту</h1>
      </div>
      <ConsiliumRegistrationCheck email={await registrationEmail()} />
    </DynamicTheme>
  );
}
