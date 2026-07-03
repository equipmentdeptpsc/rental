import { useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";

export interface RentalFormData {
  equipmentId: string;
  customer: string;
  project: string;
  rentedBy: string;
  expectedReturn: string;
}

interface Props {
  onSubmit(data: RentalFormData): void;
}

export default function RentalForm({
  onSubmit,
}: Props) {
  const { equipment } =
    useEquipment();

  const { customers } =
    useCustomer();

  const availableEquipment =
    useMemo(
      () =>
        equipment.filter(
          (e) =>
            e.status === "Available"
        ),
      [equipment]
    );

  const equipmentOptions =
    useMemo(
      () => [
        {
          value: "",
          label:
            "Select Equipment",
        },
        ...availableEquipment.map(
          (e) => ({
            value: e.id,
            label: `${e.assetNo} - ${e.equipmentName}`,
          })
        ),
      ],
      [availableEquipment]
    );

  const customerOptions =
    useMemo(
      () => [
        {
          value: "",
          label:
            "Select Customer",
        },
        ...customers.map((c) => ({
          value: c.companyName,
          label: c.companyName,
        })),
      ],
      [customers]
    );

  const [form, setForm] =
    useState<RentalFormData>({
      equipmentId: "",
      customer: "",
      project: "",
      rentedBy: "",
      expectedReturn: "",
    });

  function update<
    K extends keyof RentalFormData
  >(
    key: K,
    value: RentalFormData[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <Select
        label="Equipment"
        value={form.equipmentId}
        options={equipmentOptions}
        onChange={(e) =>
          update(
            "equipmentId",
            e.target.value
          )
        }
      />

      <Select
        label="Customer"
        value={form.customer}
        options={customerOptions}
        onChange={(e) =>
          update(
            "customer",
            e.target.value
          )
        }
      />

      <Input
        label="Project"
        value={form.project}
        onChange={(e) =>
          update(
            "project",
            e.target.value
          )
        }
      />

      <Input
        label="Released By"
        value={form.rentedBy}
        onChange={(e) =>
          update(
            "rentedBy",
            e.target.value
          )
        }
      />

      <Input
        type="date"
        label="Expected Return"
        value={
          form.expectedReturn
        }
        onChange={(e) =>
          update(
            "expectedReturn",
            e.target.value
          )
        }
      />

      <div className="flex justify-end">
        <Button type="submit">
          Save Rental
        </Button>
      </div>
    </form>
  );
}