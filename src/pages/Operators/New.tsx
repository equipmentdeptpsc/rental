import { useNavigate } from "react-router-dom";

import OperatorForm from "@/features/operators/components/OperatorForm";
import { useOperator } from "@/features/operators/context/OperatorContext";

export default function NewOperator() {
  const navigate = useNavigate();

  const { addOperator } = useOperator();

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-8">
        New Operator
      </h1>

      <OperatorForm
        onSubmit={(data) => {
          addOperator({
            id: crypto.randomUUID(),
            joinedDate: new Date()
              .toISOString()
              .split("T")[0],
            ...data,
          });

          navigate("/operators");
        }}
      />

    </div>
  );
}