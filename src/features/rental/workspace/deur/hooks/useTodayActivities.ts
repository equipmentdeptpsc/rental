import { useMemo } from "react";

import {
  useRentalWorkspaceAggregate,
} from "../..";

export default function useTodayActivities() {

  const aggregate =
    useRentalWorkspaceAggregate();

  return useMemo(() => {

    if (!aggregate.activeDeur) {
      return [];
    }

    return aggregate.activeDeur.logs.map(
      (log: {
        id: string;
        activity: string;
        startTime: string;
        endTime?: string;
      }) => ({
        id: log.id,
        activity: log.activity,
        start: log.startTime,
        end: log.endTime,
      })
    );

  }, [aggregate.activeDeur]);

}