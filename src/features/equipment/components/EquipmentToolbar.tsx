export default function EquipmentToolbar() {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <input
          type="text"
          placeholder="🔍 Search equipment..."
          className="w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:border-blue-500 md:max-w-md"
        />
  
        <div className="flex gap-3">
          <select className="rounded-lg border border-slate-300 px-4 py-2">
            <option>All Status</option>
            <option>Available</option>
            <option>Assigned</option>
            <option>Maintenance</option>
            <option>Breakdown</option>
          </select>
  
          <select className="rounded-lg border border-slate-300 px-4 py-2">
            <option>All Categories</option>
            <option>Excavator</option>
            <option>Wheel Loader</option>
            <option>Bulldozer</option>
            <option>Dump Truck</option>
            <option>Grader</option>
            <option>Generator</option>
          </select>
        </div>
      </div>
    );
  }