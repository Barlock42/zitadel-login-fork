"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import {
  pollConsiliumEmailLogin,
  sendConsiliumEmailCode,
  verifyConsiliumEmailCode,
} from "@/lib/server/consilium-email-login";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertType } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { BackButton } from "./back-button";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { Spinner } from "./spinner";

const POLL_MS = 3000;
const POLL_FOR_MS = 15 * 60 * 1000;

type Props = { sessionId: string; loginName?: string; requestId?: string; organization?: string };
type Sent = { sentAt: number; resendAfter: number; codeLength: number };

export function ConsiliumEmailCode({ sessionId, loginName, requestId, organization }: Props) {
  const router = useRouter();
  const [sent, setSent] = useState<Sent>();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const finished = useRef(false);
  const requested = useRef(false);

  const finish = useCallback(
    (response: Parameters<typeof handleServerActionResponse>[0]) => {
      if (response && "error" in response && response.error) {
        setError(response.error);
        return;
      }
      finished.current = true;
      handleServerActionResponse(response, router, setSamlData, setError);
    },
    [router],
  );

  const send = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await sendConsiliumEmailCode({ sessionId });
      if ("error" in result) setError(result.error);
      else setSent(result);
    } catch {
      setError("Не удалось отправить письмо. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // The link may be opened in another tab of this browser; then this page continues by itself.
  useEffect(() => {
    if (!sent) return;
    let stopped = false;
    const check = async () => {
      if (stopped || finished.current || document.visibilityState !== "visible") return;
      if (Date.now() - sent.sentAt > POLL_FOR_MS) return;
      const result = await pollConsiliumEmailLogin({ sessionId, requestId, organization, since: sent.sentAt }).catch(
        () => undefined,
      );
      if (!stopped && result && !("waiting" in result)) finish(result);
    };
    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [sent, sessionId, requestId, organization, finish]);

  const submit = useCallback(
    async (value: string) => {
      if (busy || finished.current) return;
      setBusy(true);
      setError("");
      try {
        finish(await verifyConsiliumEmailCode({ sessionId, requestId, organization, code: value }));
      } catch {
        setError("Не удалось проверить код. Попробуйте ещё раз.");
      } finally {
        setBusy(false);
      }
    },
    [busy, sessionId, requestId, organization, finish],
  );

  const wait = sent ? Math.max(0, Math.ceil((sent.sentAt + sent.resendAfter * 1000 - now) / 1000)) : 0;

  return (
    <>
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(code);
        }}
      >
        <p className="ztdl-p">
          {sent ? (
            <>
              Мы отправили код на <strong>{loginName ?? "вашу почту"}</strong>. Введите его здесь или нажмите «Войти» в
              письме — если письмо открыто в этом браузере, страница продолжит сама.
            </>
          ) : (
            "Отправляем код на вашу почту…"
          )}
        </p>
        <TextInput
          label="Код из письма"
          value={code}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, "");
            setCode(value);
            if (sent && value.length === sent.codeLength) void submit(value);
          }}
          data-testid="consilium-email-code"
        />
        {error && <Alert>{error}</Alert>}
        {sent && (
          <Alert type={AlertType.INFO}>
            <span className="flex flex-row items-center gap-4">
              <span className="flex-1">Письма нет? Проверьте «Спам» или запросите код ещё раз.</span>
              <button
                type="button"
                disabled={busy || wait > 0}
                onClick={() => void send()}
                className="text-primary-light-500 dark:text-primary-dark-500 cursor-pointer disabled:cursor-default disabled:text-gray-400"
                data-testid="consilium-email-resend"
              >
                {wait > 0 ? `Отправить ещё раз через ${wait} с` : "Отправить ещё раз"}
              </button>
            </span>
          </Alert>
        )}
        <div className="mt-4 flex w-full flex-row items-center">
          <BackButton />
          <span className="flex-grow"></span>
          <Button
            type="submit"
            variant={ButtonVariants.Primary}
            disabled={busy || !code}
            data-testid="consilium-email-submit"
          >
            {busy && <Spinner className="mr-2 h-5 w-5" />} Войти
          </Button>
        </div>
      </form>
    </>
  );
}
