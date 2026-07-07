import type {
    WorkspaceTab,
  } from "../types";
  
  import {
    WORKSPACE_TABS,
  } from "../types";
  
  interface Props {
    activeTab: WorkspaceTab;
  
    onChange(
      tab: WorkspaceTab
    ): void;
  }
  
  export default function WorkspaceTabs({
    activeTab,
    onChange,
  }: Props) {
    return (
      <div className="flex flex-wrap gap-2 border-b pb-3">
  
        {WORKSPACE_TABS.map(
          (tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                onChange(tab.id)
              }
              disabled={
                tab.disabled
              }
              className={`rounded-lg px-4 py-2 text-sm transition ${
                activeTab ===
                tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          )
        )}
      </div>
    );
  }