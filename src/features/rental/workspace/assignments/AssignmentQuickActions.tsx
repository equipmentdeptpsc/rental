export default function AssignmentQuickActions() {
    return (
      <div className="rounded-lg border bg-white p-6">
  
        <h3 className="mb-5 text-lg font-semibold">
          Quick Actions
        </h3>
  
        <div className="flex flex-wrap gap-3">
  
          <button
            className="rounded-lg border px-4 py-2 hover:bg-slate-50"
            type="button"
          >
            Replace Equipment
          </button>
  
          <button
            className="rounded-lg border px-4 py-2 hover:bg-slate-50"
            type="button"
          >
            Replace Operator
          </button>
  
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            type="button"
          >
            Complete Assignment
          </button>
  
        </div>
  
      </div>
    );
  }