import {
  TAB_COMPONENTS,
} from "../tabs/TabRegistry";

import {
  useWorkspaceTab,
} from "../hooks/useWorkspaceTab";

export default function WorkspaceContent() {
  const activeTab =
    useWorkspaceTab();

  const Component =
    TAB_COMPONENTS[
      activeTab
    ];

  return <Component />;
}