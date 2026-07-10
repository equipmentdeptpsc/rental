import type { ComponentType } from "react";

import OverviewTab from "./OverviewTab";
import TimelineTab from "./TimelineTab";
import AssignmentTab from "./AssignmentTab";
import DeurTab from "./DeurTab";
import BillingTab from "./BillingTab";
import InvoiceTab from "./InvoiceTab";
import CollectionTab from "./CollectionTab";
import ClosingTab from "./ClosingTab";

import type {
  RentalWorkspaceTab,
} from "../types";

export const TAB_COMPONENTS: Record<
  RentalWorkspaceTab,
  ComponentType
> = {
  overview: OverviewTab,

  timeline: TimelineTab,

  assignments: AssignmentTab,

  deur: DeurTab,

  billing: BillingTab,

  invoices: InvoiceTab,

  collections: CollectionTab,

  closing: ClosingTab,
};