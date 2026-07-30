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
            createElement(Route, { path: "/dashboard", element: createElement("div", null, "Dashboard landing") }),
            createElement(Route, { path: "/billing", element: createElement("div", null, "Billing landing") }),
            createElement(Route, { path: "/rentals", element: createElement("div", null, "Rentals landing") }),
            createElement(Route, { path: "/operator", element: createElement("div", null, "Operator landing") }),
            createElement(Route, { path: "/equipment", element: createElement("div", null, "Equipment return") }),
            createElement(Route, { path: "/assignments/new", element: createElement("div", null, "Assignment create") }),
            createElement(Route, { path: "/rentals/:id/workspace", element: createElement("div", null, "Rental workspace") }),
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
  it("sends System Administrator to the canonical dashboard and ignores internal return-to", async () => {
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
    expect(container.textContent).toContain("Dashboard landing");
  });

  it.each([
    "?returnTo=%2Frentals%2Frental-1%2Fworkspace",
    "?returnTo=%2Fassignments%2Fnew",
    "?returnTo=%2Fequipment%2Fedit%2Fequipment-1",
  ])("does not restore protected internal target %s after credential login", async (returnTo) => {
    const { container } = await renderLogin(returnTo);
    const [username, password] = [...container.querySelectorAll("input")];
    await act(async () => {
      enter(username, "administrator");
      enter(password, DEFAULT_LOCAL_SEED_USERS[0].localPassword);
      container.querySelector("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(container.textContent).toContain("Dashboard landing");
    expect(container.textContent).not.toContain("Rental workspace");
    expect(container.textContent).not.toContain("Assignment create");
  });

  it("sends Finance to Billing and unlinked Rental Operations to Rentals", async () => {
    const finance = await renderLogin();
    let [username, password] = [...finance.container.querySelectorAll("input")];
    await act(async () => {
      enter(username, "finance");
      enter(password, DEFAULT_LOCAL_SEED_USERS[2].localPassword);
      finance.container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(finance.container.textContent).toContain("Billing landing");

    await act(async () => mounted?.root.unmount());
    mounted?.container.remove();
    mounted = undefined;
    const operations = await renderLogin();
    [username, password] = [...operations.container.querySelectorAll("input")];
    await act(async () => {
      enter(username, "rental.operations");
      enter(password, DEFAULT_LOCAL_SEED_USERS[1].localPassword);
      operations.container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(operations.container.textContent).toContain("Rentals landing");
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
