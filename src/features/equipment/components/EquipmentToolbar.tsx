export default function EquipmentToolbar() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-medium text-slate-700">
          Equipment
        </h2>

        <p className="text-sm text-slate-500">
          Equipment list and monitoring.
        </p>
      </div>

      <div className="text-xs text-slate-500">
        Filtering will be available in a future update.
      </div>
    </div>
  );
}