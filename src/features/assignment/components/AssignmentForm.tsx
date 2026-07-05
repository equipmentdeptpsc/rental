import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";

export interface AssignmentFormData {
  equipmentId: string;
  operatorId: string;
  projectId: string;
  expectedReturn: string;
  remarks: string;
}

interface Props {
  onSubmit(
    data: AssignmentFormData
  ): void;

  initialEquipmentId?: string;

  lockEquipment?: boolean;
}

export default function AssignmentForm({
  onSubmit,
  initialEquipmentId,
  lockEquipment = false,
}: Props) {
  const { equipment } =
    useEquipment();

  const { operators } =
    useOperator();

  const { projects } =
    useProject();

  const availableEquipment =
    useMemo(() => {
      const available =
        equipment.filter(
          (e) =>
            e.status ===
            "Available"
        );

      if (!initialEquipmentId)
        return available;

      const selected =
        equipment.find(
          (e) =>
            e.id ===
            initialEquipmentId
        );

      if (
        selected &&
        !available.some(
          (e) =>
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

  const availableOperators =
    useMemo(
      () =>
        operators.filter(
          (o) =>
            o.status ===
            "Active"
        ),
      [operators]
    );

  const activeProjects =
    useMemo(
      () =>
        projects.filter(
          (p) =>
            !p.deleted
        ),
      [projects]
    );

  const [form, setForm] =
    useState<AssignmentFormData>({
      equipmentId:
        initialEquipmentId ??
        "",

      operatorId: "",

      projectId: "",

      expectedReturn: "",

      remarks: "",
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
    key: keyof AssignmentFormData,
    value: string
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
      className="space-y-5"
    >
      <Select
        label="Equipment"
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
        options={[
          {
            label:
              "Select Equipment",
            value: "",
          },

          ...availableEquipment.map(
            (e) => ({
              label: `${e.assetNo} - ${e.equipmentName}`,
              value: e.id,
            })
          ),
        ]}
      />

      <Select
        label="Operator"
        value={
          form.operatorId
        }
        onChange={(e) =>
          update(
            "operatorId",
            e.target.value
          )
        }
        options={[
          {
            label:
              "Select Operator",
            value: "",
          },

          ...availableOperators.map(
            (o) => ({
              label: o.name,
              value: o.id,
            })
          ),
        ]}
      />

      <Select
        label="Project"
        value={
          form.projectId
        }
        onChange={(e) =>
          update(
            "projectId",
            e.target.value
          )
        }
        options={[
          {
            label:
              "Select Project",
            value: "",
          },

          ...activeProjects.map(
            (p) => ({
              label:
                p.projectName,
              value: p.id,
            })
          ),
        ]}
      />

      <Input
        label="Expected Return"
        type="date"
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

      <div className="flex justify-end">
        <Button type="submit">
          Assign Equipment
        </Button>
      </div>
    </form>
  );
}