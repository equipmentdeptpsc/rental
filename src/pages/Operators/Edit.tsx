import { useNavigate, useParams } from "react-router-dom";

import OperatorForm from "@/features/operators/components/OperatorForm";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { operatorUserLinkRepository } from "@/features/operators/operatorUserLink";

export default function EditOperator() {
  const { id } = useParams();

  const navigate = useNavigate();

  const {
    operators,
    updateOperator,
  } = useOperator();

  const operator = operators.find(
    (o) => o.id === id
  );

  if (!operator) {
    return (
      <div className="p-8">
        Operator not found.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-8">
        Edit Operator
      </h1>

      <OperatorForm
        initialData={operator}
        initialLinkedLoginName={operatorUserLinkRepository.getByOperatorId(operator.id)?.loginName}
        onSubmit={(data) => {
          const { linkedLoginName, ...operatorData } = data;
          updateOperator({
            ...operator,
            ...operatorData,
          });
          if (linkedLoginName.trim()) operatorUserLinkRepository.link(linkedLoginName, operator.id);

          navigate("/operators");
        }}
      />

    </div>
  );
}
