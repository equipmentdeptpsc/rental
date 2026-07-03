import { useNavigate } from "react-router-dom";

import CustomerForm from "@/features/customer/components/CustomerForm";

import { useCustomer } from "@/features/customer/context/CustomerContext";

export default function NewCustomer() {
  const navigate = useNavigate();

  const { addCustomer } =
    useCustomer();

  return (
    <CustomerForm
      onSubmit={(data) => {
        addCustomer({
          id: crypto.randomUUID(),
          ...data,
        });

        navigate("/customers");
      }}
    />
  );
}