"use client";

import { registrationAttribution } from "@/lib/consilium-registration";
import { CONSILIUM_REGIONS, CONSILIUM_SPECIALTIES } from "@/lib/consilium-registration-options";
import { checkConsiliumRegistrationEmail, submitConsiliumRegistration } from "@/lib/server/consilium-registration";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  variant?: "registration" | "invite";
  requestId?: string;
  attribution: Record<string, string>;
  termsUrl?: string;
  privacyUrl?: string;
  promo?: string;
};
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function NameField({
  name,
  label,
  autoComplete,
  invite,
}: {
  name: string;
  label: string;
  autoComplete: string;
  invite: boolean;
}) {
  return (
    <label className="consilium-field">
      <span className={invite ? "consilium-label" : "consilium-sr-only"}>
        {label}
        {invite && "*"}
      </span>
      <input name={name} autoComplete={autoComplete} required maxLength={50} placeholder={invite ? undefined : label} />
    </label>
  );
}
function Specialty({ additional = false }: { additional?: boolean }) {
  return (
    <label className="consilium-field">
      <span className="consilium-label">{additional ? "Специализация 2" : "Специализация*"}</span>
      <span className="consilium-hint">{additional ? "Дополнительная специализация" : "Основная специализация"}</span>
      <select name={additional ? "AdditionalSpecialties" : "PrimarySpecialty"} required={!additional} defaultValue="">
        <option value="">Выберите специализацию</option>
        {CONSILIUM_SPECIALTIES.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
}

export function ConsiliumRegistrationForm({
  variant = "registration",
  requestId,
  attribution: initial,
  termsUrl = "https://consiliumalterum.ru/terms",
  privacyUrl = "https://consiliumalterum.ru/privacy",
  promo = "",
}: Props) {
  const router = useRouter();
  const invite = variant === "invite";
  const [step, setStep] = useState(1);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [attribution, setAttribution] = useState(initial);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
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
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setDuplicate(false);
    const data = new FormData(event.currentTarget);
    try {
      // The first step is read-only: no application, document or email is created here.
      if (!invite && step === 1) {
        const result = await checkConsiliumRegistrationEmail(String(data.get("Email") ?? ""));
        if ("error" in result) {
          setError(result.error ?? "Не удалось проверить почту.");
          setDuplicate(result.code === "already_registered");
        } else {
          setStep(2);
          requestAnimationFrame(() =>
            formRef.current?.querySelector<HTMLSelectElement>('select[name="CityRegion"]')?.focus(),
          );
        }
      } else {
        for (const [key, value] of Object.entries(attribution)) data.set(key, value);
        const result = await submitConsiliumRegistration(data, requestId);
        if ("error" in result) {
          setError(result.error ?? "Не удалось отправить заявку.");
          setDuplicate(result.code === "already_registered");
        } else router.push(result.redirect);
      }
    } catch {
      setError("Не удалось отправить заявку. Попробуйте ещё раз.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const query = new URLSearchParams();
  if (requestId) query.set("requestId", requestId);
  for (const [key, value] of Object.entries(attribution)) if (key.startsWith("utm_")) query.set(key, value);
  const other = (invite ? "/registration" : "/invite") + (query.size ? "?" + query : "");
  const login = "/loginname" + (requestId ? "?requestId=" + encodeURIComponent(requestId) : "");

  return (
    <>
      {invite && <h1 className="consilium-invite-title">Вас пригласили в Consilium Alterum</h1>}
      <section className={"consilium-panel " + (invite ? "consilium-invite-panel" : "consilium-full-panel")}>
        <div className="consilium-intro">
          {invite ? <h2>Регистрация</h2> : <h1>Регистрация</h1>}
          <p>
            {invite ? (
              "Завершите регистрацию, чтобы начать пользоваться всеми возможностями платформы."
            ) : (
              <>
                Для регистрации потребуется выписка из реестра аккредитованных лиц. Её можно получить в личном кабинете{" "}
                <a href="https://lkmr.egisz.rosminzdrav.ru/main-page/unauthorised" target="_blank" rel="noreferrer">
                  ФРМР (ЕГИСЗ)
                </a>{" "}
                или заказать на портале{" "}
                <a href="https://www.gosuslugi.ru/622342/1/form" target="_blank" rel="noreferrer">
                  Госуслуги
                </a>
              </>
            )}
          </p>
          {!invite && (
            <Image
              className="consilium-intro-logo"
              src={base + "/consilium/logo-blue.svg"}
              alt="Consilium Alterum"
              width={160}
              height={50}
              unoptimized
            />
          )}
        </div>
        <form
          ref={formRef}
          onSubmit={submit}
          className="consilium-form"
          data-testid="consilium-registration-form"
          data-variant={variant}
          aria-busy={busy}
        >
          <fieldset disabled={!ready || busy}>
            <div hidden={!invite && step !== 1}>
              <div className={invite ? "consilium-name-row" : "consilium-first-step"}>
                <NameField name="LastName" label="Фамилия" autoComplete="family-name" invite={invite} />
                <NameField name="FirstName" label="Имя" autoComplete="given-name" invite={invite} />
                <NameField name="MiddleName" label="Отчество" autoComplete="additional-name" invite={invite} />
              </div>
            </div>
            <div className={invite ? "consilium-two-columns" : ""}>
              <div hidden={!invite && step !== 1}>
                <label className="consilium-field">
                  <span className={invite ? "consilium-label" : "consilium-sr-only"}>Email{invite && "*"}</span>
                  <input
                    type="email"
                    name="Email"
                    autoComplete="email"
                    autoCapitalize="none"
                    required
                    maxLength={254}
                    placeholder={invite ? undefined : "Email"}
                  />
                </label>
              </div>
              <fieldset className="consilium-professional" disabled={!invite && step === 1} hidden={!invite && step === 1}>
                <label className="consilium-field">
                  <span className="consilium-label">Регион*</span>
                  <select name="CityRegion" autoComplete="address-level1" required defaultValue="">
                    <option value="">Выберите регион</option>
                    {CONSILIUM_REGIONS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </div>
            <fieldset className="consilium-professional" disabled={!invite && step === 1} hidden={!invite && step === 1}>
              <div className="consilium-two-columns">
                <Specialty />
                <Specialty additional />
              </div>
              {invite ? (
                <label className="consilium-field">
                  <span className="consilium-label">Код приглашения*</span>
                  <input
                    name="QrCode"
                    required
                    maxLength={128}
                    autoComplete="off"
                    placeholder="CA-XXXXXXXX"
                    defaultValue={promo}
                    data-testid="registration-promo"
                  />
                </label>
              ) : (
                <label className="consilium-field consilium-upload">
                  <span className="consilium-label">Документ аккредитации*</span>
                  <span className="consilium-hint">Выписку из реестра аккредитации можно получить на Госуслугах.</span>
                  <input
                    type="file"
                    name="document"
                    required
                    accept=".pdf,.jpg,.jpeg,.png"
                    data-testid="registration-document"
                  />
                  <span className="consilium-hint">PDF, JPEG или PNG, до 10 МБ.</span>
                </label>
              )}
              <label className="consilium-consent">
                <input type="checkbox" name="AcceptRules" value="true" required />
                <span>
                  Принимаю{" "}
                  <a href={termsUrl} target="_blank" rel="noreferrer">
                    пользовательское соглашение.
                  </a>
                </span>
              </label>
              <label className="consilium-consent">
                <input type="checkbox" name="AcceptPersonalDataProcessing" value="true" required />
                <span>
                  Даю{" "}
                  <a href="https://consiliumalterum.ru/consent" target="_blank" rel="noreferrer">
                    согласие
                  </a>{" "}
                  на обработку своих персональных данных.
                </span>
              </label>
            </fieldset>
            {error && (
              <div className="consilium-error" role="alert">
                {error}
                {duplicate && (
                  <div>
                    <Link href={login}>Перейти ко входу</Link>
                  </div>
                )}
              </div>
            )}
            <div className={invite ? "consilium-submit-row" : "consilium-step-actions"}>
              {!invite && step === 2 && (
                <button
                  type="button"
                  className="consilium-back"
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                >
                  ← Назад
                </button>
              )}
              <button
                type="submit"
                className="consilium-button"
                disabled={!ready || busy}
                data-testid={!invite && step === 1 ? "registration-next" : "registration-submit"}
              >
                {busy ? "Проверяем…" : !invite && step === 1 ? "Далее →" : "Отправить"}
              </button>
            </div>
            {(invite || step === 2) && <p className="consilium-required">* Обязательные поля</p>}
            <p className="consilium-alternative">
              <Link href={other}>{invite ? "Регистрация по документу" : "Есть код приглашения?"}</Link>
              <span> · </span>
              <Link href={login}>Уже зарегистрированы? Войти</Link>
            </p>
            <a className="consilium-sr-only" href={privacyUrl}>
              Политика обработки персональных данных
            </a>
          </fieldset>
        </form>
      </section>
    </>
  );
}
