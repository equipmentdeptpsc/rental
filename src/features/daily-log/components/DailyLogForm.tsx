import { useEffect, useState } from "react";

import Button from "@/components/ui/Button";

import type { DailyLogRecord } from "../types";

import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";

interface Props {
  equipment: EquipmentRecord[];
  operators: Operator[];
  projects: ProjectRecord[];

  onSubmit(
    data: DailyLogRecord
  ): void;
}

export default function DailyLogForm({
  equipment,
  operators,
  projects,
  onSubmit,
}: Props) {
  const [equipmentId, setEquipmentId] =
    useState("");

  const [operatorId, setOperatorId] =
    useState("");

  const [projectId, setProjectId] =
    useState("");

  const [date, setDate] =
    useState(
      new Date()
        .toISOString()
        .split("T")[0]
    );

  const [startReading, setStartReading] =
    useState(0);

  const [endReading, setEndReading] =
    useState(0);

  const [workingHours, setWorkingHours] =
    useState(0);

  const [remarks, setRemarks] =
    useState("");

  useEffect(() => {
    if (!equipmentId) {
      setStartReading(0);
      setEndReading(0);
      setWorkingHours(0);
      return;
    }

    const machine =
      equipment.find(
        (item) =>
          item.id === equipmentId
      );

    if (!machine) return;

    setStartReading(
      machine.currentReading
    );

    setEndReading(
      machine.currentReading
    );

    setWorkingHours(0);
  }, [
    equipmentId,
    equipment,
  ]);

  useEffect(() => {
    const usage =
      endReading - startReading;

    if (usage >= 0) {
      setWorkingHours(usage);
    }
  }, [
    startReading,
    endReading,
  ]);

  function submit() {
    if (!equipmentId) {
      alert(
        "Please select equipment."
      );
      return;
    }

    if (!operatorId) {
      alert(
        "Please select operator."
      );
      return;
    }

    if (!projectId) {
      alert(
        "Please select project."
      );
      return;
    }

    if (
      endReading < startReading
    ) {
      alert(
        "End reading cannot be less than the current equipment reading."
      );
      return;
    }

    onSubmit({
      id: crypto.randomUUID(),

      equipmentId,

      operatorId,

      projectId,

      date,

      startReading,

      endReading,

      workingHours,

      remarks,
    });
  }

  return (
    <div className="space-y-5">

      <div>
        <label className="mb-1 block text-sm font-medium">
          Equipment
        </label>

        <select
          className="w-full rounded border p-2"
          value={equipmentId}
          onChange={(e) =>
            setEquipmentId(
              e.target.value
            )
          }
        >
          <option value="">
            Select Equipment
          </option>

          {equipment.map((item) => (
            <option
              key={item.id}
              value={item.id}
            >
              {item.assetNo} -{" "}
              {item.equipmentName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Operator
        </label>

        <select
          className="w-full rounded border p-2"
          value={operatorId}
          onChange={(e) =>
            setOperatorId(
              e.target.value
            )
          }
        >
          <option value="">
            Select Operator
          </option>

          {operators.map((item) => (
            <option
              key={item.id}
              value={item.id}
            >
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Project
        </label>

        <select
          className="w-full rounded border p-2"
          value={projectId}
          onChange={(e) =>
            setProjectId(
              e.target.value
            )
          }
        >
          <option value="">
            Select Project
          </option>

          {projects.map((item) => (
            <option
              key={item.id}
              value={item.id}
            >
              {item.projectName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Date
        </label>

        <input
          type="date"
          className="w-full rounded border p-2"
          value={date}
          onChange={(e) =>
            setDate(
              e.target.value
            )
          }
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Current Reading
        </label>

        <input
          type="number"
          className="w-full rounded border bg-gray-100 p-2"
          value={startReading}
          readOnly
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          End Reading
        </label>

        <input
          type="number"
          className="w-full rounded border p-2"
          value={endReading}
          onChange={(e) =>
            setEndReading(
              Number(
                e.target.value
              )
            )
          }
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Usage
        </label>

        <input
          type="number"
          className="w-full rounded border bg-gray-100 p-2"
          value={workingHours}
          readOnly
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Remarks
        </label>

        <textarea
          rows={4}
          className="w-full rounded border p-2"
          value={remarks}
          onChange={(e) =>
            setRemarks(
              e.target.value
            )
          }
        />
      </div>

      <Button
        onClick={submit}
      >
        Save Daily Log
      </Button>

    </div>
  );
}