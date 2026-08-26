import { cloneElement, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";

import {
  RentalWorkspaceHeader,
  RentalWorkspaceTabs,
} from "../components";
import type { WorkspaceTab } from "../types";
import { useRentalWorkspaceAggregate, useRentalWorkspacePresentationData } from "..";
import { parseWorkspaceTab } from "../routing";
import { buildWorkspaceTabBadges } from "../presentation/workspaceTabBadges";

interface Props {
  children: ReactElement<{ activeTab: WorkspaceTab }>;
}

export default function RentalWorkspaceLayout({
  children,
}: Props) {
  const aggregate = useRentalWorkspaceAggregate();
  const { equipment } = useRentalWorkspacePresentationData();
  const { rental } = aggregate;
  const tabBadges = buildWorkspaceTabBadges(aggregate, equipment);
  const closed = rental.status === "Closed";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: WorkspaceTab = parseWorkspaceTab(searchParams.get("tab"));
  const setActiveTab = (tab: WorkspaceTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (tab !== "billing") next.delete("billingStatementId");
    setSearchParams(next, { replace: true });
  };
  return (
    <div className="space-y-6">

      <RentalWorkspaceHeader activeTab={activeTab} />

      {closed && <p className="rounded border border-slate-300 bg-slate-100 p-4 font-medium">This Rental has been closed. Historical records are read-only.</p>}

      <RentalWorkspaceTabs activeTab={activeTab} onChange={setActiveTab} readOnly={closed} badges={tabBadges} />

      {cloneElement(children, { activeTab })}

    </div>
  );
}
