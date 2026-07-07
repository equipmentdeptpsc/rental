import {
  WORKSPACE_TABS,
  type WorkspaceTab,
} from "../types";

interface Props {
  activeTab: WorkspaceTab;

  onChange(
    tab: WorkspaceTab
  ): void;
}

export default function RentalWorkspaceTabs({
  activeTab,
  onChange,
}: Props) {
  return (
    <div className="rounded-xl border bg-white shadow-sm">

      <div className="flex flex-wrap">

        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() =>
              onChange(tab.id)
            }
            className={`border-b-2 px-6 py-4 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-600 hover:text-blue-600"
            }`}
          >
            {tab.label}
          </button>
        ))}

      </div>

    </div>
  );
}