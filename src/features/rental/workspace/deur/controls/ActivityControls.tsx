import type {
  DeurActivityType,
} from "@/features/rental/deur/types";

import ActivityButton from "./ActivityButton";

import useCurrentActivity from "../hooks/useCurrentActivity";

import {
  useRentalWorkspaceAggregate,
} from "../..";

import {
  startActivity,
} from "../services/startActivity";

import {
  endActivity,
} from "../services/endActivity";

export default function ActivityControls() {

  const aggregate =
    useRentalWorkspaceAggregate();

  const current =
    useCurrentActivity();

  function start(

    activity: DeurActivityType

  ) {

    startActivity({

      rentalId:
        aggregate.rental.id,

      equipmentId:
        aggregate.rental.equipmentId,

      operatorId: "",

      activity,

    });

  }

  return (

    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <h2 className="text-xl font-semibold">

        Activity Controls

      </h2>

      <p className="mt-2 mb-6 text-sm text-slate-500">

        Current Activity{" "}

        <strong>

          {current?.activity ?? "None"}

        </strong>

      </p>

      <div className="flex flex-wrap gap-3">

        <ActivityButton
          label="Arrived at Site"
          onClick={() =>
            start("Arrived at Site")
          }
        />

        <ActivityButton
          label="Operation"
          onClick={() =>
            start("Operation")
          }
        />

        <ActivityButton
          label="Idle"
          onClick={() =>
            start("Idle")
          }
        />

        <ActivityButton
          label="Meal Break"
          onClick={() =>
            start("Meal Break")
          }
        />

        <ActivityButton
          label="Preventive Maintenance"
          onClick={() =>
            start("Preventive Maintenance")
          }
        />

        <ActivityButton
          label="Corrective Maintenance"
          onClick={() =>
            start("Corrective Maintenance")
          }
        />

        <ActivityButton
          label="Demobilization"
          onClick={() =>
            start("Demobilization")
          }
        />

<ActivityButton
  label="End Activity"
  onClick={() =>
    endActivity(
      aggregate.rental.id
    )
  }
  disabled={!current}
/>

      </div>

    </div>

  );

}