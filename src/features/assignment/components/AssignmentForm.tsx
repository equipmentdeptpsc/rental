import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { selectAvailableEquipment } from "@/features/assignment/utils/selectAvailableEquipment";

export interface AssignmentFormData {
  equipmentId: string;
  operatorId: string;
  projectId: string;
  remarks: string;
}

interface Props {
  onSubmit(
    data: AssignmentFormData
  ): void;

  initialEquipmentId?: string;

  initialData?: Partial<AssignmentFormData>;

  lockEquipment?: boolean;

  submitLabel?: string;
}

export default function AssignmentForm({
  onSubmit,
  initialEquipmentId,
  initialData,
  lockEquipment = false,
  submitLabel = "Assign Equipment",
}: Props) {
  const { equipment } =
    useEquipment();

  const { operators } =
    useOperator();

  const { projects } =
    useProject();

  const { assignments } =
    useAssignment();

  const availableEquipment =
    useMemo(() =>
      selectAvailableEquipment(
        equipment,
        assignments,
        initialEquipmentId
      ), [
      equipment,
      assignments,
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
            !p.deleted &&
            p.status === "Active"
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

      remarks: "",

      ...initialData,
    });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      ...initialData,
      equipmentId:
        initialEquipmentId ??
        initialData?.equipmentId ??
        prev.equipmentId,
    }));
  }, [initialData, initialEquipmentId]);

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

      {availableEquipment.length === 0 && (
        <p className="text-sm text-slate-500">
          No equipment is currently available for assignment.
        </p>
      )}

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
                `${p.projectCode} - ${p.projectName}`,
              value: p.id,
            })
          ),
        ]}
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
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
