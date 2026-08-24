import { useNavigate } from "react-router-dom";

import CustomerForm from "@/features/customer/components/CustomerForm";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { generateCustomerCode } from "@/features/customer/services/customerService";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import RemoteCustomerForm from "@/features/customer/components/RemoteCustomerForm";
import { getCustomerRuntimeCapability, REMOTE_CUSTOMER_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/customer/services/customerRuntimeCapability";
import RemoteMutationUnavailable from "@/components/ui/RemoteMutationUnavailable";

export default function NewCustomer() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const capability = getCustomerRuntimeCapability(configuration, Boolean(commandRepositories.canonicalCustomer));
  const { hasPermission } = useAuth();
  if (capability.canonicalMutations && hasPermission("customer.create")) return <RemoteCustomerForm />;
  if (!capability.legacyMutations) return <RemoteMutationUnavailable title="New Customer" message={REMOTE_CUSTOMER_MUTATION_UNAVAILABLE_MESSAGE} />;
  return <LocalNewCustomer />;
}

function LocalNewCustomer() {
  const navigate = useNavigate();

  const { addCustomer, customers } = useCustomer();

  return (
    <CustomerForm
      onSubmit={(data) => {
        addCustomer({
          id: crypto.randomUUID(),
          customerCode: generateCustomerCode(customers),
          ...data,
        });

        navigate("/customers");
      }}
    />
  );
}
