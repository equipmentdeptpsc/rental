import OperatorAssignmentCard from "../cards/OperatorAssignmentCard";

import type {
  OperatorAssignmentSummary,
} from "../types";

interface Props {
  operator: OperatorAssignmentSummary;
}

export default function OperatorSection({
  operator,
}: Props) {
  return (
    <OperatorAssignmentCard
      operator={operator}
    />
  );
}