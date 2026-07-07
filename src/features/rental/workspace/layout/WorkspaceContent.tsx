import {
  useState,
} from "react";

import type {
  WorkspaceTab,
} from "../types";

import RentalWorkspaceTabs from "../components/RentalWorkspaceTabs";

import {
  TAB_COMPONENTS,
} from "../tabs/TabRegistry";

export default function WorkspaceContent() {
  const [
    activeTab,
    setActiveTab,
  ] = useState<WorkspaceTab>(
    "overview"
  );

  const ActiveTab =
    TAB_COMPONENTS[activeTab];

  return (
    <>

      <RentalWorkspaceTabs
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <div className="rounded-xl border bg-white p-6 shadow-sm">

        <ActiveTab />

      </div>

    </>
  );
}