import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Header from "@/app/Header";
import Sidebar from "@/app/Sidebar";
import DailyLogs from "@/pages/DailyLogs";
import PageHeader from "@/components/ui/PageHeader";
import OrganizationBrand from "@/shared/branding/OrganizationBrand";
import { organizationBranding } from "@/shared/branding/organizationBranding";

vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ user: null, logout: vi.fn(), hasPermission: () => true }) }));
vi.mock("@/app/composition", () => ({ PersistenceMode: { Local: "local", Remote: "remote" }, useApplicationDependenciesCompatibility: () => ({ authentication: { authorizationService: {} }, configuration: { persistenceMode: "local" } }) }));
vi.mock("@/app/navigation/navigationConfig", () => ({ getVisibleNavigation: () => [] }));

describe("application shell cleanup", () => {
  it("keeps the shell route label out of the heading outline", () => {
    const shell = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/daily-logs"] }, createElement(Header, { onMenu: () => undefined })));
    expect(shell).not.toContain("<h1");
    const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/daily-logs"] }, createElement(Header, { onMenu: () => undefined }), createElement(DailyLogs)));
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toContain("Daily Logs");
  });

  it("retains PageHeader as the semantic page heading", () => {
    const markup = renderToStaticMarkup(createElement(PageHeader, { title: "Operations Dashboard", description: "Current work" }));
    expect(markup).toContain('<h1 class="font-display">Operations Dashboard</h1>');
  });

  it("renders both expanded sidebar brand lines without truncation within the sidebar width", () => {
    const brand = renderToStaticMarkup(createElement(OrganizationBrand, { compact: true, inverse: true }));
    expect(brand).toContain(organizationBranding.companyName);
    expect(brand).toContain(organizationBranding.departmentName);
    expect(brand).not.toContain("truncate");
    expect(brand).toContain("w-full");
    const sidebar = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Sidebar, { collapsed: false, mobileOpen: false, onToggle: () => undefined, onNavigate: () => undefined })));
    expect(sidebar).toContain("w-[216px]");
    expect(sidebar).toContain(organizationBranding.companyName);
  });

  it("keeps the collapsed sidebar logo only", () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Sidebar, { collapsed: true, mobileOpen: false, onToggle: () => undefined, onNavigate: () => undefined })));
    expect(markup).toContain('alt="PSC Equipment logo"');
    expect(markup).not.toContain(organizationBranding.companyName);
    expect(markup).not.toContain(organizationBranding.departmentName);
  });

  it("keeps global search visibly and accessibly labeled as application wide", () => {
    const source = readFileSync("src/components/search/GlobalSearch.tsx", "utf8");
    expect(source).toContain('placeholder="Global search"');
    expect(source).toContain('aria-label="Global search"');
  });
});
