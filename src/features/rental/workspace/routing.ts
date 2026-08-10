import { WORKSPACE_TABS, type WorkspaceTab } from "./types";

export function parseWorkspaceTab(value: string | null): WorkspaceTab {
  return WORKSPACE_TABS.some((item) => item.id === value) ? value as WorkspaceTab : "overview";
}

export function billingWorkspaceHref(rentalId: string, billingStatementId: string): string {
  const params = new URLSearchParams({ tab: "billing", billingStatementId });
  return `/rentals/${encodeURIComponent(rentalId)}/workspace?${params.toString()}`;
}
