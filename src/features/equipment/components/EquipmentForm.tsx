import { useEffect, useState } from "react";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

import type {
  EquipmentFormData,
  EquipmentCategory,
} from "../types";

import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { usePrefix } from "@/features/settings";

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
  const { projects } = useProject();

  const { operators } = useOperator();

  const {
    getPrefixByCategory,
  } = usePrefix();

  const [form, setForm] =
    useState<EquipmentFormData>({
      prefixId: "",
      assetNo: "",
      equipmentName: "",
      category: "",
      maintenanceType:
        "Engine Hours",
      currentReading: "",
      projectId: "",
      operatorId: "",
      ...initialData,
    });

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    }
  }, [initialData]);

  function update<
    K extends keyof EquipmentFormData
  >(
    key: K,
    value: EquipmentFormData[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  useEffect(() => {
    if (!form.category) {
      update("assetNo", "");
      update("prefixId", "");
      return;
    }

    const prefix =
      getPrefixByCategory(
        form.category as EquipmentCategory
      );

    if (!prefix) {
      update("assetNo", "");
      update("prefixId", "");
      return;
    }

    update("prefixId", prefix.id);

    update(
      "assetNo",
      `${prefix.code}-${String(
        prefix.nextNumber
      ).padStart(prefix.digits, "0")}`
    );
  }, [form.category]);

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
          label="Asset Number"
          value={form.assetNo}
          readOnly
        />

        <Input
          label="Equipment Name"
          value={form.equipmentName}
          onChange={(e) =>
            update(
              "equipmentName",
              e.target.value
            )
          }
        />

        <Select
          label="Equipment Category"
          value={form.category}
          options={[
            {
              label:
                "-- Select Category --",
              value: "",
            },
            {
              label:
                "Moving Equipment",
              value:
                "Moving Equipment",
            },
            {
              label:
                "Non-Moving Equipment",
              value:
                "Non-Moving Equipment",
            },
            {
              label:
                "Aerial Equipment",
              value:
                "Aerial Equipment",
            },
            {
              label:
                "Light Equipment",
              value:
                "Light Equipment",
            },
          ]}
          onChange={(e) =>
            update(
              "category",
              e.target.value as EquipmentCategory
            )
          }
        />

        <Select
          label="Maintenance Type"
          value={form.maintenanceType}
          options={[
            {
              label:
                "Engine Hours",
              value:
                "Engine Hours",
            },
            {
              label:
                "Kilometers",
              value:
                "Kilometers",
            },
            {
              label:
                "Mileage",
              value:
                "Mileage",
            },
            {
              label:
                "Calendar Days",
              value:
                "Calendar Days",
            },
          ]}
          onChange={(e) =>
            update(
              "maintenanceType",
              e.target.value as any
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
            ...projects.map((p) => ({
              label: p.projectName,
              value: p.id,
            })),
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
          value={form.operatorId}
          options={[
            {
              label:
                "-- Select Operator --",
              value: "",
            },
            ...operators.map((o) => ({
              label: o.name,
              value: o.id,
            })),
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