import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsiliumRegistrationForm } from "./consilium-registration-form";

const m = vi.hoisted(() => ({ check: vi.fn(), submit: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("next/image", () => ({ default: ({ unoptimized, priority, ...props }: any) => <img {...props} /> }));
vi.mock("@/lib/server/consilium-registration", () => ({
  checkConsiliumRegistrationEmail: m.check,
  submitConsiliumRegistration: m.submit,
}));

function names(container: HTMLElement) {
  for (const [name, value] of Object.entries({
    LastName: "Тестовый",
    FirstName: "Врач",
    MiddleName: "Проверка",
    Email: "doctor@example.invalid",
  }))
    fireEvent.change(container.querySelector(`input[name="${name}"]`)!, { target: { value } });
}
describe("Tilda registration variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    m.check.mockResolvedValue({ available: true });
    m.submit.mockResolvedValue({ redirect: "/registration/check" });
  });
  afterEach(cleanup);
  it("rejects a duplicate on the first step before showing or submitting documents", async () => {
    m.check.mockResolvedValue({ error: "Вы уже зарегистрированы.", code: "already_registered" });
    const { container } = render(<ConsiliumRegistrationForm attribution={{}} requestId="oidc-test" />);
    names(container);
    fireEvent.submit(screen.getByTestId("consilium-registration-form"));
    await screen.findByRole("alert");
    expect(m.check).toHaveBeenCalledWith("doctor@example.invalid");
    expect(m.submit).not.toHaveBeenCalled();
    expect(screen.getByTestId("registration-document").closest("fieldset")?.hidden).toBe(true);
    expect(screen.getByText("Перейти ко входу").getAttribute("href")).toContain("requestId=oidc-test");
  });
  it("keeps name values between steps and submits document, dictionaries, consent and UTM", async () => {
    const { container } = render(<ConsiliumRegistrationForm attribution={{ utm_campaign: "mail" }} />);
    names(container);
    fireEvent.submit(screen.getByTestId("consilium-registration-form"));
    await screen.findByTestId("registration-submit");
    fireEvent.change(container.querySelector('select[name="CityRegion"]')!, { target: { value: "Москва" } });
    fireEvent.change(container.querySelector('select[name="PrimarySpecialty"]')!, { target: { value: "Терапевт" } });
    fireEvent.change(container.querySelector('select[name="AdditionalSpecialties"]')!, { target: { value: "Кардиолог" } });
    fireEvent.submit(screen.getByTestId("consilium-registration-form"));
    await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
    const data = m.submit.mock.calls[0][0] as FormData;
    expect(data.get("Email")).toBe("doctor@example.invalid");
    expect(data.get("LastName")).toBe("Тестовый");
    expect(data.get("CityRegion")).toBe("Москва");
    expect(data.getAll("AdditionalSpecialties")).toEqual(["Кардиолог"]);
    expect(data.get("utm_campaign")).toBe("mail");
    expect(data.has("QrCode")).toBe(false);
    expect(m.push).toHaveBeenCalledWith("/registration/check");
  });
  it("uses a single-page invitation code form without a document input", async () => {
    const { container } = render(<ConsiliumRegistrationForm variant="invite" attribution={{}} promo="CONSILIUM-TEST" />);
    names(container);
    expect(screen.queryByTestId("registration-next")).toBeNull();
    expect(screen.queryByTestId("registration-document")).toBeNull();
    expect((screen.getByTestId("registration-promo") as HTMLInputElement).value).toBe("CONSILIUM-TEST");
    fireEvent.submit(screen.getByTestId("consilium-registration-form"));
    await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
    expect(m.check).not.toHaveBeenCalled();
    expect(m.submit.mock.calls[0][0].get("QrCode")).toBe("CONSILIUM-TEST");
  });
});
