// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProcessingNotice from "@/components/input/processing-notice";

function IntakeNotice() {
  const [confirmed, setConfirmed] = useState(false);
  return <><ProcessingNotice confirmed={confirmed} onConfirm={setConfirmed} /><button disabled={!confirmed}>Upload notes</button></>;
}

afterEach(() => { cleanup(); localStorage.clear(); });

it("requires acknowledgment, remembers it across visits and lets counselors reopen the notice", async () => {
  const user = userEvent.setup();
  const view = render(<IntakeNotice />);
  await screen.findByRole("dialog", { name: "Before processing student information" });
  expect((screen.getByRole("button", { name: "Continue to intake" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /I have read this notice/ }));
  await user.click(screen.getByRole("button", { name: "Continue to intake" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect((screen.getByRole("button", { name: "Upload notes" }) as HTMLButtonElement).disabled).toBe(false);
  view.unmount();
  render(<IntakeNotice />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Upload notes" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByRole("dialog")).toBeNull();
  const trigger = screen.getByRole("button", { name: /Processing & privacy notice/ });
  await user.click(trigger);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(trigger);
});

