// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProtectedHeader from "@/components/auth/protected-header";
import WorkflowOrientation from "@/components/input/workflow-orientation";

function Workflow() {
  const [confirmed, setConfirmed] = useState(false);
  return <>
    <ProtectedHeader />
    <main><WorkflowOrientation confirmed={confirmed} onConfirm={setConfirmed} /><button disabled={!confirmed}>Upload notes</button></main>
  </>;
}

afterEach(() => { cleanup(); localStorage.clear(); });

it("places both guidance buttons in the top navigation and preserves notice acknowledgment", async () => {
  localStorage.setItem("kumpas:workflow-orientation:v1", "seen");
  const user = userEvent.setup();
  render(<Workflow />);
  await screen.findByRole("dialog", { name: "Before processing student information" });
  const navigation = within(screen.getByRole("banner", { hidden: true })).getByRole("navigation", { name: "Workflow help", hidden: true });
  expect(within(navigation).getByRole("button", { name: "How this works", hidden: true })).toBeTruthy();
  expect(within(navigation).getByRole("button", { name: "Processing & privacy notice", hidden: true })).toBeTruthy();
  expect(within(screen.getByRole("main", { hidden: true })).queryByRole("button", { name: "How this works", hidden: true })).toBeNull();
  expect((screen.getByRole("button", { name: "Upload notes", hidden: true }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /I have read this notice/ }));
  await user.click(screen.getByRole("button", { name: "Continue to intake" }));
  expect((screen.getByRole("button", { name: "Upload notes" }) as HTMLButtonElement).disabled).toBe(false);
  await user.click(within(navigation).getByRole("button", { name: "How this works" }));
  expect(screen.getByRole("dialog", { name: "Your counseling workflow" })).toBeTruthy();
  await user.keyboard("{Escape}");
  await user.click(within(navigation).getByRole("button", { name: "Processing & privacy notice" }));
  expect(screen.getByRole("dialog", { name: "Before processing student information" })).toBeTruthy();
});
