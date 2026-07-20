import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { selectAvailableEquipment } from "@/features/assignment/utils/selectAvailableEquipment";
import { useActivityCodes } from "@/features/masters/activity-code";
import {
  evaluateAssignmentActivityCodeConfiguration,
  getActiveAssignmentActivityCodeOptions,
} from "../utils/assignmentActivityCode";
import type { AssignmentFormData } from "../types";

export type { AssignmentFormData } from "../types";

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

  const { records: activityCodes } = useActivityCodes();

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

      activityCodeId: "",

      remarks: "",

      ...initialData,
    });

  const activityCodeConfiguration = evaluateAssignmentActivityCodeConfiguration(
    form.activityCodeId,
    activityCodes,
  );

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

      <div>
        <Select
          label="Activity Code"
          value={form.activityCodeId ?? ""}
          onChange={(event) => update("activityCodeId", event.target.value)}
          options={[
            { label: "Select Activity Code", value: "" },
            ...getActiveAssignmentActivityCodeOptions(activityCodes),
          ]}
        />
        {(activityCodeConfiguration.status === "missing" ||
          activityCodeConfiguration.status === "not-found") && (
          <p className="mt-1 text-sm text-amber-700">
            {activityCodeConfiguration.message}
          </p>
        )}
        {(activityCodeConfiguration.status === "inactive" ||
          activityCodeConfiguration.status === "deleted") && (
          <p className="mt-1 text-sm text-amber-700">
            {activityCodeConfiguration.record.activityCode} — {activityCodeConfiguration.record.description}
            {` (${activityCodeConfiguration.status === "inactive" ? "Inactive" : "Deleted"})`}
          </p>
        )}
      </div>

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
