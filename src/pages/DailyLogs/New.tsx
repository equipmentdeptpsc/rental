import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import DailyLogForm from "@/features/daily-log/components/DailyLogForm";

import { useDailyLog } from "@/features/daily-log";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";

import {
  useEquipmentHistory,
  createHistoryEvent,
} from "@/features/equipment/history";

import type { DailyLogRecord } from "@/features/daily-log/types";

export default function NewDailyLog() {

  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const equipmentId =
    searchParams.get(
      "equipment"
    ) ?? "";

  const { addLog } =
    useDailyLog();

  const {
    equipment,
    updateEquipment,
  } = useEquipment();

  const {
    operators,
  } = useOperator();

  const {
    projects,
  } = useProject();

  const { log } =
    useEquipmentHistory();

  function save(
    record: DailyLogRecord
  ) {

    addLog(record);

    const machine =
      equipment.find(
        (item) =>
          item.id ===
          record.equipmentId
      );

    if (machine) {

      updateEquipment({

        ...machine,

        currentReading:
          record.endReading,

      });

      log(
        createHistoryEvent(

          machine.id,

          "Daily Log",

          `Daily usage recorded (${record.startReading} → ${record.endReading})`,

          "UPDATED"

        )
      );

    }

    navigate(
      "/daily-logs"
    );

  }

  return (
    <div className="space-y-6 p-8">

      <h1 className="text-3xl font-bold">
        New Daily Log
      </h1>

      <DailyLogForm
        equipment={equipment}
        operators={operators}
        projects={projects}
        initialEquipmentId={
          equipmentId ||
          undefined
        }
        lockEquipment={Boolean(
          equipmentId
        )}
        onSubmit={save}
      />

    </div>
  );

}