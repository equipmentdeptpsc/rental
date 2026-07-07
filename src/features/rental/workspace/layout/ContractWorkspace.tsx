import type { ReactNode } from "react";

interface ContractWorkspaceProps {
  header: ReactNode;

  tabs: ReactNode;

  content: ReactNode;
}

export default function ContractWorkspace({
  header,
  tabs,
  content,
}: ContractWorkspaceProps) {
  return (
    <div className="space-y-6">

      {header}

      {tabs}

      <div className="rounded-xl border bg-white p-6 shadow-sm">

        {content}

      </div>

    </div>
  );
}