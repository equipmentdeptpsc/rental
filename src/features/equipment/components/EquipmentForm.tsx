import { useState } from "react";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

export interface EquipmentFormData {
  assetNo: string;
  equipmentName: string;
  category: string;
  maintenanceType: "Odometer" | "Engine Hours";
  currentReading: string;
  project: string;
  operator: string;
}

interface Option {
  label: string;
  value: string;
}

interface Props {
  initialData?: EquipmentFormData;
  submitLabel?: string;
  onSubmit: (data: EquipmentFormData) => void;
  onCancel?: () => void;
}

export default function EquipmentForm({
  initialData,
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<EquipmentFormData>(
    initialData || {
      assetNo: "",
      equipmentName: "",
      category: "",
      maintenanceType: "Engine Hours",
      currentReading: "",
      project: "",
      operator: "",
    }
  );

  function setField(
    key: keyof EquipmentFormData,
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  const maintenanceOptions: Option[] = [
    { label: "Engine Hours", value: "Engine Hours" },
    { label: "Odometer", value: "Odometer" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Asset No"
          value={form.assetNo}
          onChange={(e) =>
            setField("assetNo", e.target.value)
          }
        />

        <Input
          label="Equipment Name"
          value={form.equipmentName}
          onChange={(e) =>
            setField("equipmentName", e.target.value)
          }
        />

        <Input
          label="Category"
          value={form.category}
          onChange={(e) =>
            setField("category", e.target.value)
          }
        />

        <Select
          label="Tracking Method"
          value={form.maintenanceType}
          options={maintenanceOptions}
          onChange={(e) =>
            setField(
              "maintenanceType",
              e.target.value
            )
          }
        />

        <Input
          label="Current Reading"
          type="number"
          value={form.currentReading}
          onChange={(e) =>
            setField(
              "currentReading",
              e.target.value
            )
          }
        />

        <Input
          label="Project"
          value={form.project}
          onChange={(e) =>
            setField("project", e.target.value)
          }
        />

        <Input
          label="Operator"
          value={form.operator}
          onChange={(e) =>
            setField("operator", e.target.value)
          }
        />
      </div>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}

        <Button type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}