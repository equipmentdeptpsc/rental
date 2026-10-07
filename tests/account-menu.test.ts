import { act, createElement, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import Header from "@/app/Header";
import { ApplicationDependencyProvider, createLocalApplicationDependencies } from "@/app/composition";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); container?.remove(); root = undefined; container = undefined; localStorage.clear(); });

function SignedInHeader() {
  const { user, login } = useAuth();
  const attempted = useRef(false);
  useEffect(() => { if (!attempted.current) { attempted.current = true; void login({ username: "administrator", password: "Administrator123!" }); } }, [login]);
  return user ? createElement(Header, { onMenu: () => undefined }) : null;
}

describe("account menu", () => {
  it("opens from the profile control and signs out only on explicit action", async () => {
    localStorage.clear();
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    const dependencies = createLocalApplicationDependencies();
    await act(async () => root?.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(AuthProvider, null, createElement(MemoryRouter, null, createElement(SignedInHeader))))));
    const account = container.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]');
    expect(account).toBeTruthy();
    await act(async () => account?.click());
    expect(account?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Change Password");
    expect(container.textContent).toContain("Sign out");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await act(async () => undefined);
    expect(account?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => account?.click());
    await act(async () => container?.querySelector<HTMLButtonElement>('[role="menuitem"]:last-child')?.click());
    expect(container.querySelector('button[aria-label="Account menu"]')).toBeNull();
  });
});
