/**
 * Public Workspace API
 */

export type RentalWorkspaceTab =
  | "overview"
  | "timeline"
  | "assignments"
  | "deur"
  | "billing"
  | "invoices"
  | "collections"
  | "closing";

export type WorkspaceTab =
  RentalWorkspaceTab;

export interface WorkspaceTabItem {
  id: WorkspaceTab;

  label: string;

  disabled?: boolean;
}

export const WORKSPACE_TABS: WorkspaceTabItem[] = [
  {
    id: "overview",
    label: "Overview",
  },
  {
    id: "timeline",
    label: "Timeline",
  },
  {
    id: "assignments",
    label: "Assignments",
  },
  {
    id: "deur",
    label: "Daily Operations",
  },
  {
    id: "billing",
    label: "Billing",
  },
  {
    id: "invoices",
    label: "Invoices",
  },
  {
    id: "collections",
    label: "Collections",
  },
  {
    id: "closing",
    label: "Close Rental",
  },
];