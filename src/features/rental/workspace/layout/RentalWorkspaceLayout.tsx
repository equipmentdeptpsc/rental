import { cloneElement, useState, type ReactElement } from "react";

import {
  RentalWorkspaceHeader,
  RentalWorkspaceTabs,
} from "../components";
import type { WorkspaceTab } from "../types";
import { useRentalWorkspaceAggregate } from "..";

interface Props {
  children: ReactElement<{ activeTab: WorkspaceTab }>;
}

export default function RentalWorkspaceLayout({
  children,
}: Props) {
  const { rental } = useRentalWorkspaceAggregate();
  const closed = rental.status === "Closed";
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  return (
    <div className="space-y-6">

      <RentalWorkspaceHeader activeTab={activeTab} />

      {closed && <p className="rounded border border-slate-300 bg-slate-100 p-4 font-medium">This Rental has been closed. Historical records are read-only.</p>}

      <RentalWorkspaceTabs activeTab={activeTab} onChange={setActiveTab} readOnly={closed} />

      {cloneElement(children, { activeTab })}

    </div>
  );
}
