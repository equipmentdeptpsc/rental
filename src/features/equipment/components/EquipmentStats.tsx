import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function EquipmentStats() {
  const { equipment } = useEquipment();

  const total = equipment.length;

  const available = equipment.filter(
    (item) => item.status === "Available"
  ).length;

  const assigned = equipment.filter(
    (item) => item.status === "Assigned"
  ).length;

  const maintenance = equipment.filter(
    (item) => item.status === "Maintenance"
  ).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl">
        <p className="text-xs text-slate-400 uppercase tracking-wider">
          Total Equipment
        </p>
        <p className="text-3xl font-bold text-white mt-1">
          {total}
        </p>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl">
        <p className="text-xs text-emerald-400 uppercase tracking-wider">
          Available
        </p>
        <p className="text-3xl font-bold text-emerald-400 mt-1">
          {available}
        </p>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl">
        <p className="text-xs text-rose-400 uppercase tracking-wider">
          Assigned / Maintenance
        </p>
        <p className="text-3xl font-bold text-rose-400 mt-1">
          {assigned + maintenance}
        </p>
      </div>
    </div>
  );
}