import { useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";

export interface AssignmentFormData {
  equipmentId: string;
  operatorId: string;
  projectId: string;
}

interface Props {
  onSubmit(
    data: AssignmentFormData
  ): void;
}

export default function AssignmentForm({
  onSubmit,
}: Props) {
  const { equipment } =
    useEquipment();

  const { operators } =
    useOperator();

  const { projects } =
    useProject();

  const availableEquipment =
    useMemo(
      () =>
        equipment.filter(
          (e) =>
            e.status ===
            "Available"
        ),
      [equipment]
    );

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
    useState({
      equipmentId: "",
      operatorId: "",
      projectId: "",
    });

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
              label: p.projectName,
              value: p.id,
            })
          ),
        ]}
      />

      <div className="flex justify-end">
        <Button type="submit">
          Assign Equipment
        </Button>
      </div>
    </form>
  );
}