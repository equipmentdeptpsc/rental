import { useNavigate, useParams } from "react-router-dom";

import OperatorForm from "@/features/operators/components/OperatorForm";
import { useOperator } from "@/features/operators/context/OperatorContext";

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
        onSubmit={(data) => {
          updateOperator({
            ...operator,
            ...data,
          });

          navigate("/operators");
        }}
      />

    </div>
  );
}