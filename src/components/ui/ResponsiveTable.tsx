import type { ReactNode } from "react";

export default function ResponsiveTable({ children }: { children: ReactNode }) {
  return <div className="min-w-0 w-full overflow-x-auto">{children}</div>;
}
