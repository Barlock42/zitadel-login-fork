import { ConsiliumRegistrationPage } from "@/components/consilium-registration-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Регистрация в Consilium", robots: { index: false, follow: false } };
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ConsiliumRegistrationPage searchParams={searchParams} variant="registration" />;
}
