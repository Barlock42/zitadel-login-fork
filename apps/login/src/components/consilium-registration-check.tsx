"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import {
  checkConsiliumRegistration,
  confirmConsiliumRegistrationLink,
  resendConsiliumRegistration,
} from "@/lib/server/consilium-registration";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertType } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";

type Props = { email?: string; link?: { id: number; token: string } };
export function ConsiliumRegistrationCheck({ email, link }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [otherDevice, setOtherDevice] = useState(false);
  const [resendAt, setResendAt] = useState(Date.now() + 60_000);
  const [now, setNow] = useState(Date.now());
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const finished = useRef(false);
  const actionInFlight = useRef(false);
  const pollInFlight = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    if (link) window.history.replaceState(null, "", window.location.pathname);
  }, [link]);
  const consume = useCallback(
    (
      result:
        | Awaited<ReturnType<typeof checkConsiliumRegistration>>
        | Awaited<ReturnType<typeof confirmConsiliumRegistrationLink>>,
    ) => {
      if (finished.current) return;
      if ("error" in result) {
        setError(result.error ?? "Не удалось подтвердить почту.");
        return;
      }
      if ("waiting" in result) return;
      if ("needsCode" in result) {
        setNotice("Почта подтверждена. Введите код из письма, чтобы войти на этом устройстве.");
        return;
      }
      finished.current = true;
      if ("verified" in result) {
        setVerified(true);
        setOtherDevice("otherDevice" in result);
        return;
      }
      handleServerActionResponse(result, router, setSamlData, setError);
    },
    [router],
  );
  useEffect(() => {
    if (link || verified) return;
    const timer = window.setInterval(() => {
      if (!finished.current && !actionInFlight.current && !pollInFlight.current && document.visibilityState === "visible") {
        pollInFlight.current = true;
        const started = generation.current;
        void checkConsiliumRegistration()
          .then((result) => {
            if (started === generation.current) consume(result);
          })
          .catch(() => undefined)
          .finally(() => {
            pollInFlight.current = false;
          });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [link, verified, consume]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  async function verify() {
    if (actionInFlight.current || finished.current) return;
    actionInFlight.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      consume(link ? await confirmConsiliumRegistrationLink(link.id, link.token) : await checkConsiliumRegistration(code));
    } catch {
      setError("Не удалось проверить подтверждение. Попробуйте ещё раз.");
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }
  async function resend() {
    if (actionInFlight.current || finished.current) return;
    actionInFlight.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      const result = await resendConsiliumRegistration();
      if ("error" in result) setError(result.error ?? "Не удалось отправить письмо.");
      else setResendAt(Date.now() + 60_000);
    } catch {
      setError("Не удалось отправить письмо. Попробуйте позже.");
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }
  if (verified)
    return (
      <div className="flex flex-col gap-4" data-testid="registration-confirmed">
        <h2>Почта подтверждена</h2>
        <p>
          {otherDevice
            ? "Вернитесь на устройство, где начали регистрацию."
            : "Ваша заявка на проверке. После одобрения мы отправим письмо для входа в Consilium."}
        </p>
      </div>
    );
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <p>
          {link ? (
            "Нажмите кнопку, чтобы подтвердить почту. Если регистрация начата на другом устройстве, затем вернитесь к нему."
          ) : (
            <>
              Мы отправили код и ссылку на <strong>{email ?? "вашу почту"}</strong>. Введите код здесь или подтвердите почту
              по ссылке.
            </>
          )}
        </p>
        {!link && (
          <TextInput
            label="Код подтверждения"
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            data-testid="registration-code"
          />
        )}
        {notice && <Alert type={AlertType.INFO}>{notice}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Button
          type="submit"
          variant={ButtonVariants.Primary}
          disabled={busy || (!link && code.length !== 6)}
          data-testid="registration-verify"
        >
          {busy ? "Проверяем…" : link ? "Подтвердить почту" : "Подтвердить и продолжить"}
        </Button>
        {!link && (
          <button type="button" disabled={busy || wait > 0} onClick={() => void resend()} data-testid="registration-resend">
            {wait ? "Отправить ещё раз через " + wait + " с" : "Отправить код ещё раз"}
          </button>
        )}
      </form>
    </>
  );
}
