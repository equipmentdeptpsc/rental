import { useState } from "react";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

import type { EquipmentFormData } from "../types";

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
  const { projects } = useProject();
  const { operators } = useOperator();

  const [form, setForm] = useState<EquipmentFormData>(
    initialData ?? {
      assetNo: "",
      equipmentName: "",
      category: "",
      maintenanceType: "Engine Hours",
      currentReading: "",
      projectId: "",
      operatorId: "",
    }
  );

  function setField<K extends keyof EquipmentFormData>(
    key: K,
    value: EquipmentFormData[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4">

        <Input
          label="Asset No"
          value={form.assetNo}
          onChange={(e) =>
            setField(
              "assetNo",
              e.target.value
            )
          }
        />

        <Input
          label="Equipment Name"
          value={form.equipmentName}
          onChange={(e) =>
            setField(
              "equipmentName",
              e.target.value
            )
          }
        />

        <Input
          label="Category"
          value={form.category}
          onChange={(e) =>
            setField(
              "category",
              e.target.value
            )
          }
        />

        <Select
          label="Tracking Method"
          value={form.maintenanceType}
          onChange={(e) =>
            setField(
              "maintenanceType",
              e.target.value as
                | "Odometer"
                | "Engine Hours"
            )
          }
          options={[
            {
              label: "Engine Hours",
              value: "Engine Hours",
            },
            {
              label: "Odometer",
              value: "Odometer",
            },
          ]}
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

        <Select
          label="Project"
          value={form.projectId}
          onChange={(e) =>
            setField(
              "projectId",
              e.target.value
            )
          }
          options={[
            {
              label: "-- None --",
              value: "",
            },
            ...projects.map((project) => ({
              label: project.projectName,
              value: project.id,
            })),
          ]}
        />

        <Select
          label="Operator"
          value={form.operatorId}
          onChange={(e) =>
            setField(
              "operatorId",
              e.target.value
            )
          }
          options={[
            {
              label: "-- None --",
              value: "",
            },
            ...operators.map((operator) => ({
              label: operator.name,
              value: operator.id,
            })),
          ]}
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