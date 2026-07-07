import { useEffect } from "react";

import {
  DeurHeader,
  CurrentActivityCard,
  ActivityButtons,
  ActivityTimeline,
} from "@/features/rental/deur/components";

import {
  DeurProvider,
  useDeur,
} from "@/features/rental/deur/context";

import type {
  DeurRecord,
} from "@/features/rental/deur/types";

const sampleRecord: DeurRecord = {
  id: crypto.randomUUID(),

  rentalId: "RENT-0001",

  equipmentId: "EQ-0001",

  operatorId: "OP-0001",

  projectId: "PROJ-0001",

  customerId: "CUST-0001",

  workDate: new Date()
    .toISOString()
    .split("T")[0],

  shift: "Day",

  logs: [],

  totalOperatingMinutes: 0,

  totalIdleMinutes: 0,

  totalMaintenanceMinutes: 0,

  totalMealBreakMinutes: 0,

  totalMobilizationMinutes: 0,

  totalDemobilizationMinutes: 0,

  status: "Draft",

  createdAt:
    new Date().toISOString(),

  updatedAt:
    new Date().toISOString(),
};

function Screen() {

  const {
    session,
    loadSession,
    start,
  } = useDeur();

  useEffect(() => {

    if (!session) {

      loadSession(
        sampleRecord
      );

    }

  }, [
    session,
    loadSession,
  ]);

  if (!session) {

    return null;

  }

  return (

    <div className="space-y-6 p-8">

      <DeurHeader
        deur={session.deur}
      />

      <CurrentActivityCard
        logs={
          session.activities
        }
      />

      <ActivityButtons
        onSelect={start}
      />

      <ActivityTimeline
        logs={
          session.activities
        }
      />

      <div className="flex justify-end">

        <button
          className="rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700"
        >
          Complete Daily Equipment Report
        </button>

      </div>

    </div>

  );

}

export default function DeurPage() {

  return (

    <DeurProvider>

      <Screen />

    </DeurProvider>

  );

}