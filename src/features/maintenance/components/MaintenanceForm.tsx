import {
  useEffect,
  useState,
} from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface MaintenanceFormData {
  equipmentId: string;
  maintenanceType: string;
  scheduledReading: number;
  currentReading: number;
  scheduledDate: string;
  technician: string;
  remarks: string;
  status: string;
}

interface Props {
  onSubmit(
    data: MaintenanceFormData
  ): void;

  initialEquipmentId?: string;

  lockEquipment?: boolean;
}

export default function MaintenanceForm({
  onSubmit,
  initialEquipmentId,
  lockEquipment = false,
}: Props) {

  const [form, setForm] =
    useState<MaintenanceFormData>({
      equipmentId:
        initialEquipmentId ??
        "",

      maintenanceType: "",

      scheduledReading: 0,

      currentReading: 0,

      scheduledDate: "",

      technician: "",

      remarks: "",

      status: "Scheduled",
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

  function update(
    key: keyof MaintenanceFormData,
    value: string | number
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
        label="Equipment ID"
        value={
          form.equipmentId
        }
        disabled={
          lockEquipment
        }
        onChange={(e) =>
          update(
            "equipmentId",
            e.target.value
          )
        }
      />

      <Input
        label="Maintenance Type"
        value={
          form.maintenanceType
        }
        onChange={(e) =>
          update(
            "maintenanceType",
            e.target.value
          )
        }
      />

      <Input
        type="number"
        label="Scheduled Reading"
        value={
          form.scheduledReading
        }
        onChange={(e) =>
          update(
            "scheduledReading",
            Number(
              e.target.value
            )
          )
        }
      />

      <Input
        type="number"
        label="Current Reading"
        value={
          form.currentReading
        }
        onChange={(e) =>
          update(
            "currentReading",
            Number(
              e.target.value
            )
          )
        }
      />

      <Input
        type="date"
        label="Scheduled Date"
        value={
          form.scheduledDate
        }
        onChange={(e) =>
          update(
            "scheduledDate",
            e.target.value
          )
        }
      />

      <Input
        label="Technician"
        value={
          form.technician
        }
        onChange={(e) =>
          update(
            "technician",
            e.target.value
          )
        }
      />

      <Input
        label="Remarks"
        value={
          form.remarks
        }
        onChange={(e) =>
          update(
            "remarks",
            e.target.value
          )
        }
      />

      <Button type="submit">
        Save Work Order
      </Button>

    </form>
  );
}