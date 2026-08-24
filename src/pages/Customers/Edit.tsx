import { useNavigate, useParams } from "react-router-dom";

import CustomerForm from "@/features/customer/components/CustomerForm";

import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getCustomerRuntimeCapability, REMOTE_CUSTOMER_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/customer/services/customerRuntimeCapability";
import RemoteMutationUnavailable from "@/components/ui/RemoteMutationUnavailable";

export default function EditCustomer() {
  const { configuration } = useApplicationDependenciesCompatibility();
  if (!getCustomerRuntimeCapability(configuration).legacyMutations) return <RemoteMutationUnavailable title="Edit Customer" message={REMOTE_CUSTOMER_MUTATION_UNAVAILABLE_MESSAGE} />;
  return <LocalEditCustomer />;
}

function LocalEditCustomer() {
  const { id } = useParams();

  const navigate = useNavigate();

  const {
    customers,
    updateCustomer,
  } = useCustomer();

  const customer = customers.find(
    (c) => c.id === id
  );

  if (!customer) {
    return (
      <div className="p-8">
        Customer not found.
      </div>
    );
  }

  return (
    <CustomerForm
      initialData={{ ...customer, contactPerson: customer.contactPerson ?? "", contactNumber: customer.contactNumber ?? "", email: customer.email ?? "", address: customer.address ?? "" }}
      onSubmit={(data) => {
        updateCustomer({
          ...customer,
          ...data,
        });

        navigate("/customers");
      }}
    />
  );
}
