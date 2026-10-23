"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { openConsiliumEmailLink, type EmailLinkResult } from "@/lib/server/consilium-email-login";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "./alert";
import { AutoSubmitForm } from "./auto-submit-form";
import { Spinner } from "./spinner";

export function ConsiliumEmailLink({ token }: { token: string }) {
  const router = useRouter();
  const [result, setResult] = useState<EmailLinkResult>();
  const [error, setError] = useState("");
  const [samlData, setSamlData] = useState<{ url: string; fields: Record<string, string> } | null>(null);
  const started = useRef(false);

  // Runs only in a real browser: mail scanners that prefetch the link get the static shell.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    openConsiliumEmailLink({ token })
      .then((response) => {
        setResult(response);
        if ("code" in response) return;
        if ("error" in response) setError(response.error);
        else handleServerActionResponse(response, router, setSamlData, setError);
      })
      .catch(() => setError("Не удалось открыть ссылку. Введите код из письма на странице входа."));
  }, [token, router]);

  const portal = process.env.NEXT_PUBLIC_CONSILIUM_PORTAL_URL || "https://app.consiliumalterum.ru";

  if (result && "code" in result) {
    const until = new Date(result.expires).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className="flex flex-col gap-4">
        <h1>Введите код на устройстве, где начали вход</h1>
        <p className="ztdl-p">
          Ссылка открыта в другом браузере или на другом устройстве. Чтобы войти, введите этот код на странице входа:
        </p>
        <p className="text-center font-mono text-4xl tracking-widest" data-testid="consilium-link-code">
          {result.code}
        </p>
        <p className="ztdl-p">Код действует до {until}.</p>
        <p className="ztdl-p">
          Хотите войти здесь? <a href={portal}>Откройте Consilium</a> и запросите новый код на этом устройстве.
        </p>
        <p className="ztdl-p text-sm">Если вы не входили в Consilium, ничего не делайте: без кода войти нельзя.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {samlData && <AutoSubmitForm url={samlData.url} fields={samlData.fields} />}
      <h1>Вход в Consilium</h1>
      {error ? (
        <>
          <Alert>{error}</Alert>
          <a href={portal}>Перейти к входу</a>
        </>
      ) : (
        <p className="ztdl-p flex flex-row items-center gap-2">
          <Spinner className="h-5 w-5" /> Проверяем ссылку…
        </p>
      )}
    </div>
  );
}
