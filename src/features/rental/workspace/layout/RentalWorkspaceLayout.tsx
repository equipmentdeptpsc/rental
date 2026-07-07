import type {
  ReactNode,
} from "react";

import {
  RentalWorkspaceHeader,
} from "../components";

interface Props {
  children: ReactNode;
}

export default function RentalWorkspaceLayout({
  children,
}: Props) {
  return (
    <div className="space-y-6">

      <RentalWorkspaceHeader />

      {children}

    </div>
  );
}