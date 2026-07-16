import {
  TAB_COMPONENTS,
} from "../tabs/TabRegistry";

import type { WorkspaceTab } from "../types";

export default function WorkspaceContent({ activeTab = "overview" }: { activeTab?: WorkspaceTab }) {

  const Component =
    TAB_COMPONENTS[
      activeTab
    ];

  return <Component />;
}
