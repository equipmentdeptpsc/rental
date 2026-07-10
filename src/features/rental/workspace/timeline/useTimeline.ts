import { useMemo } from "react";

import { useRentalWorkspaceAggregate } from "..";

import { buildTimeline } from "./TimelineBuilder";

export function useTimeline() {
  const aggregate =
    useRentalWorkspaceAggregate();

  return useMemo(
    () => buildTimeline(aggregate),
    [aggregate]
  );
}