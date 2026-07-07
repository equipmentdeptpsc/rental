/**
 * Public Workspace API
 *
 * RentalWorkspaceTab remains for backward compatibility.
 * WorkspaceTab is the preferred name going forward.
 */

export type RentalWorkspaceTab =
  | "overview"
  | "timeline"
  | "assignments"
  | "deur"
  | "billing"
  | "invoices"
  | "collections";

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
];