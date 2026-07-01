import React, { useState } from 'react';

interface AssignmentPanelProps {
  operators: any[];
  equipment: any[];
  assignments: any[];
  setEquipment: React.Dispatch<React.SetStateAction<any[]>>;
  setAssignments: React.Dispatch<React.SetStateAction<any[]>>;
  pastAssignments: any[];
  setPastAssignments: React.Dispatch<React.SetStateAction<any[]>>;
}

export function AssignmentPanel({
  operators,
  equipment,
  assignments,
  setEquipment,
  setAssignments,
  pastAssignments,
  setPastAssignments,
}: AssignmentPanelProps) {
  const [selectedOperator, setSelectedOperator] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [idlePercent, setIdlePercent] = useState('50');

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperator || !selectedEquipment) {
      alert('Please select both an operator and a machinery unit.');
      return;
    }

    const op = operators.find((o) => o.id === selectedOperator);
    const eq = equipment.find((e) => e.id === selectedEquipment);

    const newAssignment = {
      id: `ASGN-${Date.now().toString().slice(-6)}`,
      operatorId: selectedOperator,
      operatorName: op ? op.name : 'Crew Personnel',
      equipmentId: selectedEquipment,
      equipmentName: eq ? eq.name : 'Fleet Machinery Heavy',
      hourlyRate: eq ? eq.hourlyRate : 125,
      idlePercent: parseFloat(idlePercent) || 50,
      opHours: 0,
      idleHours: 0,
      downHours: 0,
      status: 'Operating',
    };

    setAssignments((prev) => [...prev, newAssignment]);
    setEquipment((prev) =>
      prev.map((item) =>
        item.id === selectedEquipment ? { ...item, status: 'Rented/In-Use' } : item
      )
    );

    setSelectedOperator('');
    setSelectedEquipment('');
  };

  const incrementHours = (id: string, type: 'op' | 'idle' | 'down') => {
    setAssignments((prev) =>
      prev.map((asgn) => {
        if (asgn.id !== id) return asgn;
        return {
          ...asgn,
          opHours: type === 'op' ? asgn.opHours + 1 : asgn.opHours,
          idleHours: type === 'idle' ? asgn.idleHours + 1 : asgn.idleHours,
          downHours: type === 'down' ? asgn.downHours + 1 : asgn.downHours,
        };
      })
    );
  };

  const handleEndDispatch = (id: string) => {
    const target = assignments.find((a) => a.id === id);
    if (!target) return;

    const rate = target.hourlyRate || 125;
    const pct = (target.idlePercent || 50) / 100;
    const billing = (target.opHours * rate) + (target.idleHours * rate * pct);

    const concludedRecord = {
      ...target,
      endedAt: new Date().toLocaleString(),
      assignedDate: new Date().toLocaleDateString(),
      totalBilling: billing,
    };

    setPastAssignments((prev) => [concludedRecord, ...prev]);
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setEquipment((prev) =>
      prev.map((item) =>
        item.id === target.equipmentId ? { ...item, status: 'Available' } : item
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. DISPATCH REGISTRATION CONTROL FORM */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
        <h3 className="text-md font-bold text-white mb-4">Deploy Fleet Machinery Dispatch</h3>
        <form onSubmit={handleCreateAssignment} className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="text-xs text-slate-400 block mb-1">Select Available Active Crew</label>
            <select
              className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm w-full text-white"
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
            >
              <option value="">-- Choose Operator --</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 w-full">
            <label className="text-xs text-slate-400 block mb-1">Select Available Field Machinery</label>
            <select
              className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm w-full text-white"
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
            >
              <option value="">-- Choose Equipment --</option>
              {equipment
                .filter((e) => e.status === 'Available')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} (₱{e.hourlyRate || 125}/hr)
                  </option>
                ))}
            </select>
          </div>

          <div className="w-full lg:w-32">
            <label className="text-xs text-slate-400 block mb-1">Negotiated Idle %</label>
            <input
              type="number"
              className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm w-full text-white"
              value={idlePercent}
              onChange={(e) => setIdlePercent(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm p-2.5 px-6 whitespace-nowrap w-full lg:w-auto"
          >
            Submit Dispatch
          </button>
        </form>
      </div>

      {/* 2. REAL-TIME ACTIVE SITE TELEMATICS MONITORING LAYER */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active Site Telematics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-xs tracking-wider">
                <th className="p-3">Dispatch ID</th>
                <th className="p-3">Deployment Targets</th>
                <th className="p-3">Telemetry Status</th>
                <th className="p-3">Accumulated Breakdown Hours</th>
                <th className="p-3">Calculated Billing</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500 italic">
                    No active machinery dispatches currently running field work.
                  </td>
                </tr>
              ) : (
                assignments.map((asgn) => {
                  const rate = asgn.hourlyRate || 125;
                  const currentBilling = (asgn.opHours * rate) + (asgn.idleHours * rate * ((asgn.idlePercent || 50) / 100));

                  return (
                    <tr key={asgn.id} className="hover:bg-slate-900/20">
                      <td className="p-3 font-mono text-xs text-amber-500">{asgn.id}</td>
                      <td className="p-3">
                        <div className="font-bold text-white">{asgn.operatorName}</div>
                        <div className="text-xs text-slate-400">
                          {asgn.equipmentName} (₱{rate}/hr)
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900 rounded text-xs font-medium uppercase tracking-wider">
                          {asgn.status}
                        </span>
                      </td>
                      <td className="p-3 space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">⚡ Op: {asgn.opHours}h</span>
                          <button
                            onClick={() => incrementHours(asgn.id, 'op')}
                            className="bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded text-[10px] text-blue-400 font-bold"
                          >
                            +1h
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">⏳ Idle: {asgn.idleHours}h</span>
                          <button
                            onClick={() => incrementHours(asgn.id, 'idle')}
                            className="bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded text-[10px] text-amber-400 font-bold"
                          >
                            +1h
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">🛠️ Down: {asgn.downHours}h</span>
                          <button
                            onClick={() => incrementHours(asgn.id, 'down')}
                            className="bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded text-[10px] text-red-400 font-bold"
                          >
                            +1h
                          </button>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-blue-400 font-bold">
                        ₱{currentBilling.toLocaleString()}
                        <div className="text-[10px] text-slate-500 font-normal">
                          Idle at {asgn.idlePercent}%
                        </div>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => handleEndDispatch(asgn.id)}
                          className="bg-red-950 hover:bg-red-900 text-red-400 border border-red-900/60 px-3 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-colors"
                        >
                          End Dispatch
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. CONCLUDED HISTORICAL WORK LOGS LEDGER */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Historical Dispatch Ledger
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-xs tracking-wider">
                <th className="p-3">Dispatch ID</th>
                <th className="p-3">Operator / Asset</th>
                <th className="p-3">Final Time Metrics</th>
                <th className="p-3">Total Invoiced Amount</th>
                <th className="p-3">Concluded Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-400">
              {pastAssignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-600 italic">
                    No historical logs captured on the site database yet.
                  </td>
                </tr>
              ) : (
                pastAssignments.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-900/10">
                    <td className="p-3 font-mono text-xs text-slate-500">{record.id}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-300">{record.operatorName}</div>
                      <div className="text-xs text-slate-500">{record.equipmentName}</div>
                    </td>
                    <td className="p-3 text-xs font-mono text-slate-400">
                      Op: {record.opHours}h | Idle: {record.idleHours}h | Down: {record.downHours}h
                    </td>
                    <td className="p-3 font-mono text-emerald-400 font-bold">
                      ₱{(record.totalBilling || 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-xs text-gray-500 font-medium">{record.endedAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Global Export Aliases to cover all import combinations
export { AssignmentPanel as AssignmentsPanel };
export default AssignmentPanel;