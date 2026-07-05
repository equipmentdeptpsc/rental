import EquipmentStats from "@/features/equipment/components/EquipmentStats";
import EquipmentToolbar from "@/features/equipment/components/EquipmentToolbar";
import EquipmentTable from "@/features/equipment/components/EquipmentTable";

export default function Equipment() {
  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Equipment Dashboard
          </h1>

          <p className="text-slate-500">
            Monitor equipment availability, utilization, and maintenance.
          </p>
        </div>

        <button className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
          + Add Equipment
        </button>
      </div>

      <EquipmentStats />

      <EquipmentToolbar />

<EquipmentTable />
    </div>
  );
}