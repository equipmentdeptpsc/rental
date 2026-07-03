interface Props {
    search: string;
    setSearch: (value: string) => void;
  
    status: string;
    setStatus: (value: string) => void;
  
    category: string;
    setCategory: (value: string) => void;
  
    equipment: any[];
  }
  
  export default function EquipmentToolbar({
    search,
    setSearch,
    status,
    setStatus,
    category,
    setCategory,
    equipment,
  }: Props) {
    const categories = [
      "All",
      ...new Set(equipment.map((e) => e.category)),
    ];
  
    const statuses = ["All", "Available", "Assigned", "Maintenance"];
  
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
  
        {/* SEARCH */}
        <input
          type="text"
          placeholder="Search asset or equipment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-1/3 rounded border px-3 py-2 text-sm"
        />
  
        {/* CATEGORY */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
  
        {/* STATUS */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
  
        {/* INFO */}
        <div className="text-xs text-slate-500">
          Live filtering enabled
        </div>
      </div>
    );
  }