import { useNavigate } from "react-router-dom";

import OperatorForm from "@/features/operators/components/OperatorForm";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { operatorUserLinkRepository } from "@/features/operators/operatorUserLink";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";

export default function NewOperator() {
  const navigate = useNavigate();

  const { addOperator } = useOperator();
  const { user: actor } = useAuth();
  const { authentication } = useApplicationDependenciesCompatibility();
  const eligibleUsers = actor ? authentication.userManagementService.list(actor).filter((user) => user.status === "active" && !user.operatorId && (user.systemRoles.includes("operator") || user.systemRoles.includes("rental-operations"))) : [];

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-8">
        New Operator
      </h1>

      <OperatorForm
        eligibleUsers={eligibleUsers}
        requirePin
        onSubmit={async (data) => {
          const { linkedUserId, pin, confirmPin, ...operatorData } = data;
          if (!actor || !linkedUserId) throw new Error("Select an eligible linked user for PIN authentication.");
          authentication.operatorPinCredentialService?.validatePinInput(pin, confirmPin);
          const id = crypto.randomUUID();
          addOperator({
            id,
            joinedDate: new Date()
              .toISOString()
              .split("T")[0],
            ...operatorData,
          });
          const linkedUser = authentication.userRepository.getUserById(linkedUserId);
          if (!linkedUser) throw new Error("Linked user not found.");
          authentication.userManagementService.update(actor, linkedUser.id, { username: linkedUser.username, displayName: linkedUser.displayName, email: linkedUser.email, systemRoles: linkedUser.systemRoles, operatorId: id });
          await authentication.operatorPinCredentialService?.setPin(linkedUser.id, pin, confirmPin);
          operatorUserLinkRepository.unlinkOperator(id);

          navigate("/operators");
        }}
      />

    </div>
  );
}
