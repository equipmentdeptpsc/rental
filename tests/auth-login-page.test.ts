import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  ApplicationDependencyProvider,
  createLocalApplicationDependencies,
} from "@/app/composition";
import { AuthProvider } from "@/features/auth/AuthContext";
import { DEFAULT_LOCAL_SEED_USERS } from "@/features/auth/repository/LocalUserRepository";
import Login from "@/pages/Login";

let mounted: { root: Root; container: HTMLDivElement } | undefined;

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  localStorage.clear();
});

async function renderLogin(returnTo = "") {
  localStorage.clear();
  const dependencies = createLocalApplicationDependencies();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(createElement(
      ApplicationDependencyProvider,
      { dependencies },
      createElement(
        AuthProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: [`/login${returnTo}`] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/login", element: createElement(Login) }),
            createElement(Route, { path: "/", element: createElement("div", null, "Dashboard landing") }),
            createElement(Route, { path: "/equipment", element: createElement("div", null, "Equipment return") }),
          ),
        ),
      ),
    ));
  });
  return { container, dependencies };
}

function enter(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("credential Login page", () => {
  it("submits username/password and follows a safe internal return-to", async () => {
    const { container } = await renderLogin("?returnTo=%2Fequipment");
    const [username, password] = [...container.querySelectorAll("input")];
    await act(async () => {
      enter(username, "administrator");
      enter(password, DEFAULT_LOCAL_SEED_USERS[0].localPassword);
    });
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(container.textContent).toContain("Equipment return");
  });

  it("shows invalid-credential and inactive-user messages", async () => {
    const first = await renderLogin();
    let [username, password] = [...first.container.querySelectorAll("input")];
    await act(async () => {
      enter(username, "administrator");
      enter(password, "wrong");
      first.container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(first.container.querySelector("[role=alert]")?.textContent)
      .toBe("Invalid username or password.");

    await act(async () => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = undefined;
    const second = await renderLogin();
    second.dependencies.authentication.userRepository.deactivateUser(
      "local-user-management",
    );
    [username, password] = [...second.container.querySelectorAll("input")];
    await act(async () => {
      enter(username, "management");
      enter(password, DEFAULT_LOCAL_SEED_USERS[3].localPassword);
      second.container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(second.container.querySelector("[role=alert]")?.textContent)
      .toContain("inactive");
  });
});
