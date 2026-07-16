import { cloneElement, useState, type ReactElement } from "react";

import {
  RentalWorkspaceHeader,
  RentalWorkspaceTabs,
} from "../components";
import type { WorkspaceTab } from "../types";

interface Props {
  children: ReactElement<{ activeTab: WorkspaceTab }>;
}

export default function RentalWorkspaceLayout({
  children,
}: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  return (
    <div className="space-y-6">

      <RentalWorkspaceHeader />

      <RentalWorkspaceTabs activeTab={activeTab} onChange={setActiveTab} />

      {cloneElement(children, { activeTab })}

    </div>
  );
}
