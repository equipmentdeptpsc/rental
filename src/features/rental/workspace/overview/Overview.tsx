import {
  useRentalWorkspaceAggregate,
} from "..";

import {
  useRentalOverview,
} from "./hooks/useRentalOverview";

import ContractSection from "./sections/ContractSection";

export default function Overview() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const overview =
    useRentalOverview(
      aggregate
    );

  return (
    <div className="space-y-6">

      <ContractSection
        overview={overview}
      />

    </div>
  );
}