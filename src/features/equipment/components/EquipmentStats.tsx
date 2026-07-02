type StatCardProps = {
    title: string;
    value: number;
  };
  
  function StatCard({ title, value }: StatCardProps) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">{title}</p>
        <h2 className="mt-3 text-3xl font-bold text-slate-800">{value}</h2>
      </div>
    );
  }
  
  export default function EquipmentStats() {
    return (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Equipment" value={48} />
        <StatCard title="Available" value={35} />
        <StatCard title="Rented / In Use" value={9} />
        <StatCard title="Maintenance" value={4} />
      </div>
    );
  }