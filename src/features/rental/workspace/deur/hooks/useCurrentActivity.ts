import { useMemo } from "react";

import {
  useRentalWorkspaceAggregate,
} from "../..";

export default function useCurrentActivity() {

  const aggregate =
    useRentalWorkspaceAggregate();

  return useMemo(() => {

    if (!aggregate.activeDeur) {
      return undefined;
    }

    const logs =
      aggregate.activeDeur.logs;

    return logs.find(
      log => !log.endTime
    );

  }, [aggregate.activeDeur]);

}