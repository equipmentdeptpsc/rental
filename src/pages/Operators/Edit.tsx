import { useNavigate, useParams } from "react-router-dom";

import OperatorForm from "@/features/operators/components/OperatorForm";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { operatorUserLinkRepository } from "@/features/operators/operatorUserLink";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { getOperatorRuntimeCapability, REMOTE_OPERATOR_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/operators/services/operatorRuntimeCapability";
import RemoteMutationUnavailable from "@/components/ui/RemoteMutationUnavailable";
import RemoteOperatorCertificationEditor from "@/features/operators/components/RemoteOperatorCertificationEditor";

export default function EditOperator() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  return getOperatorRuntimeCapability(configuration).legacyMutations ? <LocalEditOperator /> : commandRepositories.operatorCertifications ? <RemoteOperatorCertificationEditor /> : <RemoteMutationUnavailable title="Edit Operator" message={REMOTE_OPERATOR_MUTATION_UNAVAILABLE_MESSAGE} />;
}

function LocalEditOperator() {
  const { id } = useParams();

  const navigate = useNavigate();
  const { user: actor } = useAuth();
  const { authentication } = useApplicationDependenciesCompatibility();

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

  const linkedUser = authentication.userRepository.getUsers().find((user) => user.operatorId === operator.id);
  const eligibleUsers = authentication.userRepository.getUsers().filter((user) => user.status === "active" && (!user.operatorId || user.operatorId === operator.id) && (user.systemRoles.includes("operator") || user.systemRoles.includes("rental-operations")));

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-3xl font-bold mb-8">
        Edit Operator
      </h1>

      <OperatorForm
        initialData={operator}
        initialLinkedUserId={linkedUser?.id}
        eligibleUsers={eligibleUsers}
        onSubmit={async (data) => {
          const { linkedUserId, pin, confirmPin, ...operatorData } = data;
          updateOperator({
            ...operator,
            ...operatorData,
          });
          if (actor && linkedUserId) {
            const selected = authentication.userRepository.getUserById(linkedUserId);
            if (!selected) throw new Error("Linked user not found.");
            if (pin) authentication.operatorPinCredentialService?.validatePinInput(pin, confirmPin);
            if (linkedUser && linkedUser.id !== selected.id) authentication.userManagementService.update(actor, linkedUser.id, { username: linkedUser.username, displayName: linkedUser.displayName, email: linkedUser.email, systemRoles: linkedUser.systemRoles, operatorId: undefined });
            authentication.userManagementService.update(actor, selected.id, { username: selected.username, displayName: selected.displayName, email: selected.email, systemRoles: selected.systemRoles, operatorId: operator.id });
            if (pin) await authentication.operatorPinCredentialService?.setPin(selected.id, pin, confirmPin);
            operatorUserLinkRepository.unlinkOperator(operator.id);
          }

          navigate("/operators");
        }}
      />

    </div>
  );
}
