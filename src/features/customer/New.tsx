import { useNavigate } from "react-router-dom";

import CustomerForm from "@/features/customer/components/CustomerForm";

import { useCustomer } from "@/features/customer/context/CustomerContext";
import { generateCustomerCode } from "@/features/customer/services/customerService";

export default function NewCustomer() {
  const navigate = useNavigate();

  const { addCustomer, customers } =
    useCustomer();

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
