import { useNavigate, useParams } from "react-router-dom";

import CustomerForm from "@/features/customer/components/CustomerForm";

import { useCustomer } from "@/features/customer/context/CustomerContext";

export default function EditCustomer() {
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
      initialData={customer}
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