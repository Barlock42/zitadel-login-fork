import { Alert } from "@/components/alert";
import { ConsiliumEmailCode } from "@/components/consilium-email-code";
import { DynamicTheme } from "@/components/dynamic-theme";
import { LoginOTP } from "@/components/login-otp";
import { Translated } from "@/components/translated";
import { UserAvatar } from "@/components/user-avatar";
import { consiliumEmailLoginEnabled } from "@/lib/consilium-email-login";
import { getSessionCookieById } from "@/lib/cookies";
import { getPublicHost } from "@/lib/server/host";
import { getServiceConfig } from "@/lib/service-url";
import { loadMostRecentSession } from "@/lib/session";
import { getBrandingSettings, getLoginSettings, getSession } from "@/lib/zitadel";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("otp");
  return { title: t("verify.title") };
}

export default async function Page(props: {
  searchParams: Promise<Record<string | number | symbol, string | undefined>>;
  params: Promise<Record<string | number | symbol, string | undefined>>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const _headers = await headers();
  const { serviceConfig } = getServiceConfig(_headers);
  const host = getPublicHost(_headers);

  const {
    loginName, // send from password page
    requestId,
    sessionId,
    organization,
    code,
  } = searchParams;

  const { method } = params;

  const session = sessionId
    ? await loadSessionById(sessionId, organization)
    : await loadMostRecentSession({ serviceConfig, sessionParams: { loginName, organization } });

  async function loadSessionById(sessionId: string, organization?: string) {
    const recent = await getSessionCookieById({ sessionId, organization });

    if (!recent) {
      return undefined;
    }

    return getSession({ serviceConfig, sessionId: recent.id, sessionToken: recent.token })
      .then((response) => {
        if (response?.session) {
          return response.session;
        }
      })
      .catch(() => undefined); // the token was rotated by a request whose response never reached this browser
  }

  // email links do not come with organization, thus we need to use the session's organization
  const branding = await getBrandingSettings({
    serviceConfig,
    organization: organization ?? session?.factors?.user?.organizationId,
  });

  const loginSettings = await getLoginSettings({
    serviceConfig,
    organization: organization ?? session?.factors?.user?.organizationId,
  });

  if (consiliumEmailLoginEnabled() && method === "email") {
    const restartParams = new URLSearchParams({ loginName: loginName ?? "", submit: "true" });
    if (requestId) restartParams.set("requestId", requestId);
    if (organization) restartParams.set("organization", organization);
    return (
      <DynamicTheme branding={branding}>
        <div className="flex flex-col space-y-4">
          <h1>Код из письма</h1>
          {session && (
            <UserAvatar
              loginName={loginName ?? session.factors?.user?.loginName}
              displayName={session.factors?.user?.displayName}
              showDropdown
              searchParams={searchParams}
            ></UserAvatar>
          )}
        </div>
        <div className="w-full">
          {session ? (
            <ConsiliumEmailCode
              sessionId={session.id}
              loginName={loginName ?? session.factors?.user?.loginName}
              requestId={requestId}
              organization={organization ?? session.factors?.user?.organizationId}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <Alert>Сеанс входа устарел. Запросите новый код.</Alert>
              <Link href={`/loginname?${restartParams}`}>Получить новый код</Link>
            </div>
          )}
        </div>
      </DynamicTheme>
    );
  }

  return (
    <DynamicTheme branding={branding}>
      <div className="flex flex-col space-y-4">
        <h1>
          <Translated i18nKey="verify.title" namespace="otp" />
        </h1>
        {method === "time-based" && (
          <p className="ztdl-p">
            <Translated i18nKey="verify.totpDescription" namespace="otp" />
          </p>
        )}
        {method === "sms" && (
          <p className="ztdl-p">
            <Translated i18nKey="verify.smsDescription" namespace="otp" />
          </p>
        )}
        {method === "email" && (
          <p className="ztdl-p">
            <Translated i18nKey="verify.emailDescription" namespace="otp" />
          </p>
        )}

        {!session && (
          <div className="py-4">
            <Alert>
              <Translated i18nKey="unknownContext" namespace="error" />
            </Alert>
          </div>
        )}

        {session && (
          <UserAvatar
            loginName={loginName ?? session.factors?.user?.loginName}
            displayName={session.factors?.user?.displayName}
            showDropdown
            searchParams={searchParams}
          ></UserAvatar>
        )}
      </div>

      <div className="w-full">
        {method && session && (
          <LoginOTP
            loginName={loginName ?? session.factors?.user?.loginName}
            sessionId={sessionId}
            requestId={requestId}
            organization={organization ?? session?.factors?.user?.organizationId}
            method={method}
            loginSettings={loginSettings}
            host={host}
            code={code}
          ></LoginOTP>
        )}
      </div>
    </DynamicTheme>
  );
}
