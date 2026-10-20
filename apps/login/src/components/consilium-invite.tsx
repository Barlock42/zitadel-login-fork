"use client";

import { coerceToArrayBuffer, coerceToBase64Url } from "@/helpers/base64";
import { startConsiliumEnrollment } from "@/lib/server/consilium-invite";
import { verifyPasskeyRegistration } from "@/lib/server/passkeys";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";

export function ConsiliumInvite(props: { userId: string; organization: string; code?: string; requestId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        setError(
          "Этот браузер не поддерживает ключи входа. Откройте письмо в современном браузере или обратитесь в поддержку.",
        );
        return;
      }
      const result = await startConsiliumEnrollment(props);
      if (!result) throw new Error("No enrollment response");
      if ("error" in result) {
        setError(result.error || "Не удалось принять приглашение.");
        return;
      }
      if ("redirect" in result) {
        router.push(result.redirect);
        return;
      }
      if (!("registration" in result)) throw new Error("Unexpected enrollment response");
      // The invite is now consumed. Do not retain its bearer code in browser history.
      const clean = new URL(window.location.href);
      clean.searchParams.delete("code");
      window.history.replaceState(null, "", clean);
      const options = result.registration.publicKeyCredentialCreationOptions as unknown as CredentialCreationOptions;
      if (!options.publicKey) throw new Error("Missing registration challenge");
      options.publicKey.challenge = coerceToArrayBuffer(options.publicKey.challenge, "challenge");
      options.publicKey.user.id = coerceToArrayBuffer(options.publicKey.user.id, "user id");
      options.publicKey.excludeCredentials = options.publicKey.excludeCredentials?.map((credential) => ({
        ...credential,
        id: coerceToArrayBuffer(credential.id, "credential id"),
      }));
      const credential = (await navigator.credentials.create(options)) as PublicKeyCredential | null;
      if (!credential) throw new Error("Credential creation cancelled");
      const attestation = credential.response as AuthenticatorAttestationResponse;
      await verifyPasskeyRegistration({
        sessionId: result.sessionId,
        passkeyId: result.registration.passkeyId,
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
      const params = new URLSearchParams({
        sessionId: result.sessionId,
        loginName: result.loginName,
        organization: props.organization,
      });
      if (props.requestId) params.set("requestId", props.requestId);
      router.replace(`/passkey?${params}`);
    } catch {
      setError("Не удалось создать ключ входа. Повторите попытку. Если все ключи потеряны, обратитесь в поддержку.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <h1>Войти в Consilium</h1>
      <p>Создайте ключ входа и подтвердите действие на устройстве. Придумывать пароль не нужно.</p>
      {error && <Alert>{error}</Alert>}
      <Button type="button" variant={ButtonVariants.Primary} disabled={busy} onClick={enroll} data-testid="consilium-enroll">
        {busy ? "Подождите…" : "Создать ключ и войти"}
      </Button>
      <a href={process.env.NEXT_PUBLIC_CONSILIUM_PORTAL_URL || "https://app.consiliumalterum.ru"}>
        Уже зарегистрированы? Войти
      </a>
      <p>
        Ссылка устарела или ключ потерян? <a href="mailto:help@consiliumalterum.ru">Напишите в поддержку</a>.
      </p>
    </div>
  );
}
