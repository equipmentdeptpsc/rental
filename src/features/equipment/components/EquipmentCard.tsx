import { type Equipment } from '../types';

interface EquipmentCardProps {
  item: Equipment;
  onStatusChange: (id: string, newStatus: Equipment['status']) => void;
}

export function EquipmentCard({ item, onStatusChange }: EquipmentCardProps) {
  const statusStyles = {
    Available: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    Rented: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    Maintenance: 'bg-rose-500/10 text-rose-400 ring-rose-500/20',
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm transition-all hover:border-slate-700 hover:bg-slate-900/60 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-100 text-lg tracking-tight truncate max-w-[180px]">
              {item.name}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {item.id}</p>
          </div>
          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[item.status]}`}>
            {item.status}
          </span>
        </div>

        <div className="mt-4 space-y-2 border-t border-slate-800/60 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Category:</span>
            <span className="font-medium text-slate-300">{item.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">S/N:</span>
            <span className="font-mono text-xs text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/40">
              {item.serialNumber}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-slate-800/40 pt-3">
        <div className="flex items-center justify-between gap-2 mb-3 bg-slate-950/40 p-1.5 rounded-lg border border-slate-800/50">
          <label className="text-[11px] text-slate-400 font-medium pl-1">Operational State:</label>
          <select
            value={item.status}
            onChange={(e) => onStatusChange(item.id, e.target.value as Equipment['status'])}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="Available">Available</option>
            <option value="Rented">Rented</option>
            <option value="Maintenance">Maintenance</option>
          </select>
        </div>
        
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>Rate Structure:</span>
          <span className="text-emerald-400">${item.hourlyRate}/hr</span>
        </div>
      </div>
    </div>
  );
}