import type {
    ComponentType,
  } from "react";
  
  import type {
    WorkspaceTab,
  } from "../types";
  
  import OverviewTab from "./OverviewTab";
  import TimelineTab from "./TimelineTab";
  import AssignmentTab from "./AssignmentTab";
  import DeurTab from "./DeurTab";
  import BillingTab from "./BillingTab";
  import InvoiceTab from "./InvoiceTab";
  import CollectionTab from "./CollectionTab";
  
  export const TAB_COMPONENTS: Record<
    WorkspaceTab,
    ComponentType
  > = {
    overview: OverviewTab,
  
    timeline: TimelineTab,
  
    assignments: AssignmentTab,
  
    deur: DeurTab,
  
    billing: BillingTab,
  
    invoices: InvoiceTab,
  
    collections: CollectionTab,
  };