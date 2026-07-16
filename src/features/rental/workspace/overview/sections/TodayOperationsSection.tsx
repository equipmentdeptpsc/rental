import TodayOperationsCard from "../cards/TodayOperationsCard";

import type {
  TodayOperationsSummary,
} from "../types";

interface Props {
  today: TodayOperationsSummary;
}

export default function TodayOperationsSection({
  today,
}: Props) {
  return (
    <TodayOperationsCard
      today={today}
    />
  );
}