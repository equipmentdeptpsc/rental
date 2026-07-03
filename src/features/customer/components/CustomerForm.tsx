import { useState } from "react";

import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

interface CustomerFormData {
  customerCode: string;
  companyName: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  active: boolean;
}

interface Props {
  initialData?: CustomerFormData;

  onSubmit(
    data: CustomerFormData
  ): void;
}

export default function CustomerForm({
  initialData,
  onSubmit,
}: Props) {
  const [form, setForm] =
    useState<CustomerFormData>(
      initialData ?? {
        customerCode: "",
        companyName: "",
        contactPerson: "",
        contactNumber: "",
        email: "",
        address: "",
        active: true,
      }
    );

  function update(
    key: keyof CustomerFormData,
    value: any
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <form
      className="max-w-2xl space-y-5 p-8"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >

      <Input
        label="Customer Code"
        value={form.customerCode}
        onChange={(e) =>
          update(
            "customerCode",
            e.target.value
          )
        }
      />

      <Input
        label="Company Name"
        value={form.companyName}
        onChange={(e) =>
          update(
            "companyName",
            e.target.value
          )
        }
      />

      <Input
        label="Contact Person"
        value={form.contactPerson}
        onChange={(e) =>
          update(
            "contactPerson",
            e.target.value
          )
        }
      />

      <Input
        label="Contact Number"
        value={form.contactNumber}
        onChange={(e) =>
          update(
            "contactNumber",
            e.target.value
          )
        }
      />

      <Input
        label="Email"
        value={form.email}
        onChange={(e) =>
          update(
            "email",
            e.target.value
          )
        }
      />

      <Input
        label="Address"
        value={form.address}
        onChange={(e) =>
          update(
            "address",
            e.target.value
          )
        }
      />

      <Button type="submit">
        Save Customer
      </Button>

    </form>
  );
}