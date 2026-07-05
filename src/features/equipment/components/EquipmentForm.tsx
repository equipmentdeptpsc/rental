import { useState } from "react";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

import type {
  EquipmentFormData,
} from "../types";

import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

interface Props {
  initialData?: EquipmentFormData;

  submitLabel?: string;

  onSubmit(
    data: EquipmentFormData
  ): void;

  onCancel?(): void;
}

export default function EquipmentForm({
  initialData,
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: Props) {
  const { projects } =
    useProject();

  const { operators } =
    useOperator();

  const [form, setForm] =
    useState<EquipmentFormData>(
      initialData ?? {
        assetNo: "",

        equipmentName: "",

        category: "",

        maintenanceType:
          "Engine Hours",

          currentReading: "",

        projectId: "",

        operatorId: "",
      }
    );

  function update<K extends keyof EquipmentFormData>(
    key: K,
    value: EquipmentFormData[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    onSubmit(form);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4">

        <Input
          label="Asset No"
          value={form.assetNo}
          onChange={(e) =>
            update(
              "assetNo",
              e.target.value
            )
          }
        />

        <Input
          label="Equipment Name"
          value={
            form.equipmentName
          }
          onChange={(e) =>
            update(
              "equipmentName",
              e.target.value
            )
          }
        />

        <Input
          label="Category"
          value={form.category}
          onChange={(e) =>
            update(
              "category",
              e.target.value
            )
          }
        />

        <Select
          label="Maintenance Type"
          value={
            form.maintenanceType
          }
          options={[
            {
              label:
                "Engine Hours",
              value:
                "Engine Hours",
            },
            {
              label:
                "Odometer",
              value:
                "Odometer",
            },
          ]}
          onChange={(e) =>
            update(
              "maintenanceType",
              e.target.value as
                | "Engine Hours"
                | "Odometer"
            )
          }
        />

<Input
  label="Current Reading"
  type="number"
  value={form.currentReading}
  onChange={(e) =>
    update(
      "currentReading",
      e.target.value
    )
  }
/>

        <Select
          label="Project"
          value={form.projectId}
          options={[
            {
              label:
                "-- Select Project --",
              value: "",
            },
            ...projects.map(
              (p) => ({
                label:
                  p.projectName,
                value: p.id,
              })
            ),
          ]}
          onChange={(e) =>
            update(
              "projectId",
              e.target.value
            )
          }
        />

        <Select
          label="Operator"
          value={
            form.operatorId
          }
          options={[
            {
              label:
                "-- Select Operator --",
              value: "",
            },
            ...operators.map(
              (o) => ({
                label: o.name,
                value: o.id,
              })
            ),
          ]}
          onChange={(e) =>
            update(
              "operatorId",
              e.target.value
            )
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