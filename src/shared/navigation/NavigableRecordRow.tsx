import type { ReactNode } from "react";
import { useRecordNavigation } from "./useRecordNavigation";

export default function NavigableRecordRow({ to, label, className = "", children }: { to: string; label: string; className?: string; children: ReactNode }) {
  const recordNavigation = useRecordNavigation();
  return <tr {...recordNavigation(to, label)} className={`cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${className}`}>{children}</tr>;
}
