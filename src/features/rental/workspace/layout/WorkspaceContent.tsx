import { useState } from "react";

import type {
  WorkspaceTab,
} from "../types";

import RentalWorkspaceTabs from "../components/RentalWorkspaceTabs";

import OverviewTab from "../tabs/OverviewTab";
import TimelineTab from "../tabs/TimelineTab";
import AssignmentTab from "../tabs/AssignmentTab";
import DeurTab from "../tabs/DeurTab";
import BillingTab from "../tabs/BillingTab";
import InvoiceTab from "../tabs/InvoiceTab";
import CollectionTab from "../tabs/CollectionTab";

export default function WorkspaceContent() {
  const [
    activeTab,
    setActiveTab,
  ] = useState<WorkspaceTab>(
    "overview"
  );

  return (
    <>
      <RentalWorkspaceTabs
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <div className="rounded-xl border bg-white p-6 shadow-sm">

        {activeTab === "overview" && (
          <OverviewTab />
        )}

        {activeTab === "timeline" && (
          <TimelineTab />
        )}

        {activeTab === "assignments" && (
          <AssignmentTab />
        )}

        {activeTab === "deur" && (
          <DeurTab />
        )}

        {activeTab === "billing" && (
          <BillingTab />
        )}

        {activeTab === "invoices" && (
          <InvoiceTab />
        )}

        {activeTab === "collections" && (
          <CollectionTab />
        )}

      </div>
    </>
  );
}