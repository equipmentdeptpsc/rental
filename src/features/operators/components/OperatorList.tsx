import { useState } from 'react';
import { OperatorCard } from './OperatorCard';
import { type Operator } from '../types';
import type { Assignment } from "@/types/enterprise";

interface OperatorListProps {
    operators: Operator[];
    setOperators: React.Dispatch<React.SetStateAction<Operator[]>>;
    assignments: Assignment[]; // Added line
  }

  export function OperatorList({ operators, setOperators, assignments }: OperatorListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [isFormOpen, setIsFormOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newLicense, setNewLicense] = useState('');
  const [newCert, setNewCert] = useState<Operator['certificationType']>('Heavy Machinery');
  const [newStatus, setNewStatus] = useState<Operator['status']>('Active');

  const totalCount = operators.length;
  const activeCount = operators.filter(o => o.status === 'Active').length;
  const leaveCount = operators.filter(o => o.status === 'On Leave').length;

  const handleStatusChange = (id: string, updatedStatus: Operator['status']) => {
    // Check if this operator's ID exists in any active field dispatches
    const isDeployed = assignments.some(asgn => asgn.operatorId === id);

    if (isDeployed && updatedStatus !== 'Active') {
      alert("Guardrail Violation: This crew member is currently deployed to an active field dispatch. End their dispatch before altering operational availability.");
      return;
    }

    setOperators(prev => prev.map(op => op.id === id ? { ...op, status: updatedStatus } : op));
  };

  const handleAddOperator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newLicense) return alert('Please fill fields.');

    const newOperator: Operator = {
      id: `OP00${operators.length + 1}`,
      name: newName,
      email: newEmail,
      licenseNumber: newLicense,
      certificationType: newCert,
      status: newStatus,
      joinedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    };

    setOperators(prev => [newOperator, ...prev]);
    setNewName('');
    setNewEmail('');
    setNewLicense('');
    setIsFormOpen(false);
  };

  const filteredOperators = operators.filter(op => {
    return (op.name.toLowerCase().includes(searchQuery.toLowerCase()) || op.email.toLowerCase().includes(searchQuery.toLowerCase())) &&
           (statusFilter === 'All' || op.status === statusFilter);
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl"><p className="text-xs text-slate-400 uppercase tracking-wider">Total Fleet Crew</p><p className="text-3xl font-bold text-white mt-1">{totalCount}</p></div>
        <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl"><p className="text-xs text-emerald-400 uppercase tracking-wider">Active On-Site</p><p className="text-3xl font-bold text-emerald-400 mt-1">{activeCount}</p></div>
        <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl"><p className="text-xs text-amber-400 uppercase tracking-wider">On Authorized Leave</p><p className="text-3xl font-bold text-amber-400 mt-1">{leaveCount}</p></div>
      </div>
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
          <input type="text" placeholder="Search operators..." className="w-full sm:w-72 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <select className="w-full sm:w-44 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option><option value="Active">Active</option><option value="On Leave">On Leave</option><option value="Suspended">Suspended</option>
          </select>
        </div>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="w-full md:w-auto px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer">{isFormOpen ? 'Cancel Form' : '+ Add New Operator'}</button>
      </div>
      {isFormOpen && (
        <form onSubmit={handleAddOperator} className="bg-slate-900/80 border border-slate-800 p-6 rounded-xl space-y-4 max-w-2xl mx-auto">
          <h3 className="text-md font-bold text-slate-200 border-b border-slate-800 pb-2">New Operator Registration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Operator Name</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="e.g. Liam Cross" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Email Address</label><input type="email" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="l.cross@equipment.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">License Number</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="LC-88219-H" value={newLicense} onChange={(e) => setNewLicense(e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Certification Tier</label><select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" value={newCert} onChange={(e) => setNewCert(e.target.value as Operator['certificationType'])}><option value="Heavy Machinery">Heavy Machinery</option><option value="Forklift">Forklift</option><option value="Crane Logistics">Crane Logistics</option><option value="None">None</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Initial Duty Status</label><select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" value={newStatus} onChange={(e) => setNewStatus(e.target.value as Operator['status'])}><option value="Active">Active</option><option value="On Leave">On Leave</option><option value="Suspended">Suspended</option></select></div>
          </div>
          <div className="flex justify-end pt-2"><button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer">Save Operator Profile</button></div>
        </form>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOperators.map((operator) => (<OperatorCard key={operator.id} operator={operator} onStatusChange={handleStatusChange} />))}
      </div>
    </div>
  );
}