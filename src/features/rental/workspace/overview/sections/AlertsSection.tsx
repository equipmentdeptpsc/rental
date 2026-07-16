import AlertsCard from "../cards/AlertsCard";

import type {
  AlertItem,
} from "../types";

interface Props {
  alerts: AlertItem[];
}

export default function AlertsSection({
  alerts,
}: Props) {
  return (
    <AlertsCard
      alerts={alerts}
    />
  );
}