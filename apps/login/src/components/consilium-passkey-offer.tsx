"use client";

import { coerceToArrayBuffer, coerceToBase64Url } from "@/helpers/base64";
import { handleServerActionResponse } from "@/lib/client-utils";
import { finishConsiliumLogin } from "@/lib/server/consilium-email-login";
import { registerPasskeyLink, verifyPasskeyRegistration } from "@/lib/server/passkeys";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { Spinner } from "./spinner";

type Props = { sessionId: string; requestId?: string; organization?: string };

/** Offered once per device after an email-code login; declining is remembered on this device. */
export function ConsiliumPasskeyOffer({ sessionId, requestId, organization }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const checked = useRef(false);

  const finish = useCallback(
    async (dismissPasskeyOffer: boolean) => {
      setBusy(true);
      try {
        const response = await finishConsiliumLogin({ sessionId, requestId, organization, dismissPasskeyOffer });
        if ("error" in response) setError(response.error);
        else handleServerActionResponse(response, router, setSamlData, setError);
      } catch {
        setError("Не удалось продолжить вход. Обновите страницу.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, requestId, organization, router],
  );

  // Without a built-in authenticator the browser would ask for a phone via QR code; skip the offer there.
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const available = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.();
    Promise.resolve(available)
      .then((supported) => {
        if (!supported) void finish(false);
      })
      .catch(() => void finish(false));
  }, [finish]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const registration = await registerPasskeyLink({ sessionId });
      if (!registration || "error" in registration) throw new Error("registration");
      const options = registration.publicKeyCredentialCreationOptions as unknown as CredentialCreationOptions;
      if (!options.publicKey) throw new Error("challenge");
      options.publicKey.challenge = coerceToArrayBuffer(options.publicKey.challenge, "challenge");
      options.publicKey.user.id = coerceToArrayBuffer(options.publicKey.user.id, "user id");
      options.publicKey.excludeCredentials = options.publicKey.excludeCredentials?.map((credential) => ({
        ...credential,
        id: coerceToArrayBuffer(credential.id, "credential id"),
      }));
      const credential = (await navigator.credentials.create(options)) as PublicKeyCredential | null;
      if (!credential) throw new Error("cancelled");
      const attestation = credential.response as AuthenticatorAttestationResponse;
      await verifyPasskeyRegistration({
        sessionId,
        passkeyId: registration.passkeyId,
        publicKeyCredential: {
          id: credential.id,
          rawId: coerceToBase64Url(credential.rawId, "rawId"),
          type: credential.type,
          response: {
            attestationObject: coerceToBase64Url(attestation.attestationObject, "attestation"),
            clientDataJSON: coerceToBase64Url(attestation.clientDataJSON, "clientData"),
          },
        },
      });
      await finish(false);
    } catch {
      setError("Ключ не создан. Можно попробовать ещё раз или продолжить без ключа.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <h1>Входить без кода из письма?</h1>
      <p className="ztdl-p">
        Создайте ключ входа на этом устройстве. В следующий раз войдёте отпечатком пальца, Face ID или PIN-кодом — без письма
        и пароля.
      </p>
      {error && <Alert>{error}</Alert>}
      <div className="flex w-full flex-row items-center">
        <Button
          type="button"
          variant={ButtonVariants.Secondary}
          disabled={busy}
          onClick={() => void finish(true)}
          data-testid="consilium-passkey-later"
        >
          Не сейчас
        </Button>
        <span className="flex-grow"></span>
        <Button
          type="button"
          variant={ButtonVariants.Primary}
          disabled={busy}
          onClick={() => void create()}
          data-testid="consilium-passkey-create"
        >
          {busy && <Spinner className="mr-2 h-5 w-5" />} Создать ключ
        </Button>
      </div>
    </div>
  );
}
