import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";
import { useRentalStatuses } from "@/features/masters/rental-status";
import type { RentalLifecycleStatus } from "@/features/rental/types";

export interface RentalFormData {
  equipmentId: string;
  customerId: string;
  customer: string;
  project: string;
  rentedBy: string;
  expectedReturn: string;
  statusId: string;
  status: RentalLifecycleStatus;
}

interface Props {
  onSubmit(data: RentalFormData): void;

  initialEquipmentId?: string;

  lockEquipment?: boolean;
}

export default function RentalForm({
  onSubmit,
  initialEquipmentId,
  lockEquipment = false,
}: Props) {
  const { equipment } =
    useEquipment();

  const { customers } =
    useCustomer();

  const { records: rentalStatuses } =
    useRentalStatuses();

    const availableEquipment =
    useMemo(() => {
  
      const available =
        equipment.filter(
          e =>
            e.active !== false &&
            !e.deleted &&
            e.status ===
              "Available"
        );
  
      if (!initialEquipmentId)
        return available;
  
      const selected =
        equipment.find(
          e =>
            e.id ===
            initialEquipmentId
        );
  
      if (
        selected &&
        !available.some(
          e =>
            e.id ===
            selected.id
        )
      ) {
  
        return [
          selected,
          ...available,
        ];
  
      }
  
      return available;
  
    }, [
      equipment,
      initialEquipmentId,
    ]);

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
          value: c.id,
          label:
            c.companyName,
        })),
      ],
      [customers]
    );

    const reservedStatus =
    rentalStatuses.find(
      s =>
        s.status ===
          "Reserved" &&
        s.active &&
        !s.deleted
    );
  
  const [form, setForm] =
    useState<RentalFormData>({
      equipmentId:
        initialEquipmentId ??
        "",

      customerId: "",
  
      customer: "",
  
      project: "",
  
      rentedBy: "",
  
      expectedReturn: "",
  
      statusId:
        reservedStatus?.id ?? "",
  
      status:
        reservedStatus?.status ??
        "Reserved",
    });

  useEffect(() => {
    if (
      initialEquipmentId
    ) {
      setForm((prev) => ({
        ...prev,
        equipmentId:
          initialEquipmentId,
      }));
    }
  }, [initialEquipmentId]);

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
        value={
          form.equipmentId
        }
        disabled={
          lockEquipment
        }
        options={
          equipmentOptions
        }
        onChange={(e) =>
          update(
            "equipmentId",
            e.target.value
          )
        }
      />

      <Select
        label="Customer"
        value={form.customerId}
        options={
          customerOptions
        }
        onChange={(e) =>
          {
            const customer = customers.find(
              (item) => item.id === e.target.value
            );

            update("customerId", e.target.value);
            update("customer", customer?.companyName ?? "");
          }
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

<Select
  label="Rental Status"
  value={form.statusId}
  disabled
  options={[
    {
      value: "",
      label:
        "-- Select Status --",
    },

    ...rentalStatuses
      .filter(
        s =>
          s.active &&
          !s.deleted
      )
      .map(s => ({
        value: s.id,
        label: s.status,
      })),
  ]}
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
