import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TextInput } from "./input";

describe("password reveal toggle", () => {
  afterEach(cleanup);

  it("renders eye button for password inputs and toggles visibility", () => {
    render(<TextInput label="Password" type="password" data-testid="pw" />);
    const input = screen.getByTestId("pw") as HTMLInputElement;
    const button = screen.getByTestId("password-reveal-button");

    expect(input.type).toBe("password");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Show password");

    fireEvent.click(button);
    expect(input.type).toBe("text");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Hide password");

    fireEvent.click(button);
    expect(input.type).toBe("password");
  });

  it("does not render the button for non-password inputs", () => {
    render(<TextInput label="Email" type="text" data-testid="email" />);
    expect(screen.queryByTestId("password-reveal-button")).toBeNull();
  });

  it("hides the button when showPasswordToggle is false", () => {
    render(<TextInput label="Password" type="password" showPasswordToggle={false} data-testid="pw2" />);
    expect(screen.queryByTestId("password-reveal-button")).toBeNull();
    expect((screen.getByTestId("pw2") as HTMLInputElement).type).toBe("password");
  });

  it("does not submit the surrounding form when clicked", () => {
    let submitted = false;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted = true;
        }}
      >
        <TextInput label="Password" type="password" />
      </form>,
    );
    fireEvent.click(screen.getByTestId("password-reveal-button"));
    expect(submitted).toBe(false);
  });
});
