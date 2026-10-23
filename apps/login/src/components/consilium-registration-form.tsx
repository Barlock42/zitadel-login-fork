"use client";

import { registrationAttribution } from "@/lib/consilium-registration";
import { submitConsiliumRegistration } from "@/lib/server/consilium-registration";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";

type Props = { requestId?: string; attribution: Record<string, string>; termsUrl?: string; privacyUrl?: string };
export function ConsiliumRegistrationForm({ requestId, attribution: initial, termsUrl, privacyUrl }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [method, setMethod] = useState<"promo" | "document">("promo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [attribution, setAttribution] = useState(initial);
  useEffect(() => {
    const key = "consilium-registration-attribution";
    let stored = {};
    try {
      stored = JSON.parse(sessionStorage.getItem(key) ?? "{}");
    } catch {
      /* storage is optional */
    }
    const next = registrationAttribution({
      landing_url: window.location.href,
      referrer: document.referrer,
      ...initial,
      ...stored,
    });
    setAttribution(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage is optional */
    }
    setReady(true);
  }, [initial]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDuplicate(false);
    const data = new FormData(event.currentTarget);
    for (const [key, value] of Object.entries(attribution)) data.set(key, value);
    try {
      const result = await submitConsiliumRegistration(data, requestId);
      if ("error" in result) {
        setError(result.error ?? "Не удалось отправить заявку.");
        setDuplicate(result.code === "already_registered");
      } else router.push(result.redirect);
    } catch {
      setError("Не удалось отправить заявку. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  const login = "/loginname" + (requestId ? "?requestId=" + encodeURIComponent(requestId) : "");
  return (
    <form onSubmit={submit} className="w-full" data-testid="consilium-registration-form">
      <fieldset disabled={!ready || busy} className="flex flex-col gap-4">
        <TextInput
          label="Email"
          type="email"
          name="Email"
          autoComplete="email"
          autoCapitalize="none"
          required
          maxLength={254}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="Фамилия" name="LastName" autoComplete="family-name" required maxLength={50} />
          <TextInput label="Имя" name="FirstName" autoComplete="given-name" required maxLength={50} />
        </div>
        <TextInput label="Отчество" name="MiddleName" autoComplete="additional-name" maxLength={50} />
        <TextInput label="Город и регион" name="CityRegion" autoComplete="address-level2" required maxLength={200} />
        <TextInput label="Специальность" name="PrimarySpecialty" required maxLength={100} placeholder="Например, терапевт" />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm">Подтверждение статуса врача</legend>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="qualification"
                value="promo"
                checked={method === "promo"}
                onChange={() => setMethod("promo")}
              />
              Промокод
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="qualification"
                value="document"
                checked={method === "document"}
                onChange={() => setMethod("document")}
              />
              Документ
            </label>
          </div>
          {method === "promo" ? (
            <TextInput
              label="Промокод"
              name="QrCode"
              required
              maxLength={128}
              autoComplete="off"
              data-testid="registration-promo"
            />
          ) : (
            <label className="flex flex-col gap-2 text-sm">
              Документ о медицинском образовании или аккредитации
              <input
                type="file"
                name="document"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                data-testid="registration-document"
              />
              <span className="text-xs">PDF, JPEG или PNG, до 10 МБ. Документ рассмотрит специалист.</span>
            </label>
          )}
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="AcceptRules" value="true" required className="mt-1" />
          <span>
            Принимаю{" "}
            {termsUrl ? (
              <a href={termsUrl} target="_blank" rel="noreferrer" className="underline">
                правила использования
              </a>
            ) : (
              "правила использования сервиса"
            )}
            .
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="AcceptPersonalDataProcessing" value="true" required className="mt-1" />
          <span>
            Даю согласие на обработку персональных данных
            {privacyUrl && (
              <>
                {" "}
                в соответствии с{" "}
                <a href={privacyUrl} target="_blank" rel="noreferrer" className="underline">
                  политикой конфиденциальности
                </a>
              </>
            )}
            .
          </span>
        </label>
        {error && (
          <Alert>
            {error}
            {duplicate && (
              <div className="mt-2">
                <Link href={login} className="underline">
                  Перейти ко входу
                </Link>
              </div>
            )}
          </Alert>
        )}
        <Button type="submit" variant={ButtonVariants.Primary} disabled={!ready || busy} data-testid="registration-submit">
          {busy ? "Отправляем…" : "Зарегистрироваться"}
        </Button>
        <p className="text-sm">
          Уже зарегистрированы?{" "}
          <Link href={login} className="underline">
            Войти
          </Link>
        </p>
      </fieldset>
    </form>
  );
}
