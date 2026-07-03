interface PMSDrawerProps {
    open: boolean;
    equipmentName: string;
    onClose: () => void;
  }
  
  export default function PMSDrawer({
    open,
    equipmentName,
    onClose,
  }: PMSDrawerProps) {
    if (!open) return null;
  
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
        <div className="h-full w-full max-w-md bg-white p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold">
              Preventive Maintenance
            </h2>
  
            <button
              onClick={onClose}
              className="rounded bg-slate-200 px-3 py-1"
            >
              ✕
            </button>
          </div>
  
          <div className="space-y-4">
            <p><strong>Equipment:</strong> {equipmentName}</p>
  
            <p><strong>Tracking:</strong> Engine Hours</p>
  
            <p><strong>Current Reading:</strong> 4,235</p>
  
            <p><strong>Next PMS:</strong> 4,500</p>
  
            <p><strong>Remaining:</strong> 265 Hours</p>
  
            <hr />
  
            <h3 className="font-semibold">
              Last Service
            </h3>
  
            <ul className="list-disc pl-6">
              <li>Engine Oil Change</li>
              <li>Hydraulic Filter</li>
              <li>Greasing</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }