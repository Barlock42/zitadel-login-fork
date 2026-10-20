import { startConsiliumEnrollment } from "@/lib/server/consilium-invite";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConsiliumInvite } from "./consilium-invite";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/server/consilium-invite", () => ({ startConsiliumEnrollment: vi.fn() }));
vi.mock("@/lib/server/passkeys", () => ({ verifyPasskeyRegistration: vi.fn() }));

it("opening or prefetching the invitation does not consume the code or start WebAuthn", () => {
  render(<ConsiliumInvite userId="doctor" organization="test" code="bearer-code" />);
  expect(screen.getByRole("button", { name: "Создать ключ и войти" })).toBeInTheDocument();
  expect(startConsiliumEnrollment).not.toHaveBeenCalled();
});

it("keeps the invite unused when the browser cannot create passkeys", async () => {
  cleanup();
  vi.clearAllMocks();
  render(<ConsiliumInvite userId="doctor" organization="test" code="bearer-code" />);
  fireEvent.click(screen.getByRole("button", { name: "Создать ключ и войти" }));
  expect(await screen.findByText(/Этот браузер не поддерживает/)).toBeInTheDocument();
  expect(startConsiliumEnrollment).not.toHaveBeenCalled();
});
