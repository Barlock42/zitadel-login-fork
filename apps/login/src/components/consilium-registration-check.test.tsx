import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsiliumRegistrationCheck } from "./consilium-registration-check";

const m = vi.hoisted(() => ({ check: vi.fn(), handle: vi.fn(), router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router }));
vi.mock("@/lib/client-utils", () => ({ handleServerActionResponse: m.handle }));
vi.mock("@/lib/server/consilium-registration", () => ({
  checkConsiliumRegistration: m.check,
  confirmConsiliumRegistrationLink: vi.fn(),
  resendConsiliumRegistration: vi.fn(),
}));

describe("registration status and manual confirmation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ignores a late status response after a code opens the Passkey offer", async () => {
    let resolvePoll!: (value: object) => void;
    const poll = new Promise((resolve) => {
      resolvePoll = resolve;
    });
    m.check.mockImplementation((code?: string) => (code ? Promise.resolve({ redirect: "/passkey/offer" }) : poll));
    render(<ConsiliumRegistrationCheck email="doctor@example.invalid" />);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(m.check).toHaveBeenCalledTimes(1); // one outstanding poll
    fireEvent.change(screen.getByTestId("registration-code"), { target: { value: "123456" } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId("registration-verify").closest("form")!);
    });
    expect(m.handle).toHaveBeenCalledTimes(1);
    expect(m.handle.mock.calls[0][0]).toEqual({ redirect: "/passkey/offer" });
    await act(async () => {
      resolvePoll({ redirect: "https://test.app.consiliumalterum.ru" });
    });
    expect(m.handle).toHaveBeenCalledTimes(1);
  });

  it("does not start status requests while a submitted code is being checked", async () => {
    let resolveCheck!: (value: object) => void;
    m.check.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );
    render(<ConsiliumRegistrationCheck email="doctor@example.invalid" />);
    fireEvent.change(screen.getByTestId("registration-code"), { target: { value: "123456" } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId("registration-verify").closest("form")!);
    });
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });
    expect(m.check).toHaveBeenCalledTimes(1);
    expect(m.check).toHaveBeenCalledWith("123456");
    await act(async () => {
      resolveCheck({ verified: true, pending: true });
    });
    expect(screen.getByTestId("registration-confirmed")).toBeTruthy();
  });
});
