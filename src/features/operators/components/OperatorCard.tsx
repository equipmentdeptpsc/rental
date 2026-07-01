import { type Operator } from '../types';

interface OperatorCardProps {
  operator: Operator;
  onStatusChange: (id: string, newStatus: Operator['status']) => void;
}

export function OperatorCard({ operator, onStatusChange }: OperatorCardProps) {
  const statusStyles = {
    Active: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    'On Leave': 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    Suspended: 'bg-rose-500/10 text-rose-400 ring-rose-500/20',
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm transition-all hover:border-slate-700 hover:bg-slate-900/60 flex flex-col justify-between">
      <div>
        {/* Top Section: Name and Badge */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-100 text-lg tracking-tight">
              {operator.name}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              ID: {operator.id}
            </p>
          </div>
          
          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[operator.status]}`}>
            {operator.status}
          </span>
        </div>

        {/* Middle Section: Technical Metadata */}
        <div className="mt-4 space-y-2 border-t border-slate-800/60 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Certification:</span>
            <span className="font-medium text-slate-300">{operator.certificationType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">License:</span>
            <span className="font-mono text-xs text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/40">
              {operator.licenseNumber}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Section: Interactive Controls & Contact */}
      <div className="mt-5 border-t border-slate-800/40 pt-3">
        <div className="flex items-center justify-between gap-2 mb-3 bg-slate-950/40 p-1.5 rounded-lg border border-slate-800/50">
          <label className="text-[11px] text-slate-400 font-medium pl-1">Quick Action:</label>
          <select
            value={operator.status}
            onChange={(e) => onStatusChange(operator.id, e.target.value as Operator['status'])}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded md px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="Active">Active</option>
            <option value="On Leave">On Leave</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
        
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="truncate max-w-[130px]">{operator.email}</span>
          <span>Joined {operator.joinedDate}</span>
        </div>
      </div>
    </div>
  );
}