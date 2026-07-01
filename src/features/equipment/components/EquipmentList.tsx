import { useState } from 'react';
import { EquipmentCard } from './EquipmentCard';
import { type Equipment } from '../types';
import type { Assignment } from '../../assignment/AssignmentPanel';

interface EquipmentListProps {
    inventory: Equipment[];
    setInventory: React.Dispatch<React.SetStateAction<Equipment[]>>;
    assignments: Assignment[];
  }

  export function EquipmentList({ inventory, setInventory, assignments }: EquipmentListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('All');
    const [isFormOpen, setIsFormOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Equipment['type']>('Excavator');
  const [newSerial, setNewSerial] = useState('');
  const [newRate, setNewRate] = useState(50);
  const [newStatus, setNewStatus] = useState<Equipment['status']>('Available');

  const totalItems = inventory.length;
  const readyItems = inventory.filter(i => i.status === 'Available').length;
  const serviceItems = inventory.filter(i => i.status === 'Maintenance').length;

  const handleStatusChange = (id: string, updatedStatus: Equipment['status']) => {
    // Check if this machine's ID exists in any active field dispatches
    const isDeployed = assignments.some(asgn => asgn.equipmentId === id);

    if (isDeployed && updatedStatus !== 'Rented') {
      alert("Guardrail Violation: This asset is currently deployed on a live contract. You must terminate the dispatch run before shifting its service tier manually.");
      return;
    }

    setInventory(prev => prev.map(item => item.id === id ? { ...item, status: updatedStatus } : item));
  };

  const handleAddEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newSerial) return alert('Please enter requirements.');

    const newMachine: Equipment = {
      id: `EQ00${inventory.length + 1}`,
      name: newName,
      type: newType,
      serialNumber: newSerial,
      hourlyRate: Number(newRate) || 50,
      status: newStatus
    };

    setInventory(prev => [newMachine, ...prev]);
    setNewName('');
    setNewSerial('');
    setIsFormOpen(false);
  };

  const filteredInventory = inventory.filter(item => {
    return (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.serialNumber.toLowerCase().includes(searchQuery.toLowerCase())) &&
           (typeFilter === 'All' || item.type === typeFilter);
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl"><p className="text-xs text-slate-400 uppercase tracking-wider">Total Active Fleet</p><p className="text-3xl font-bold text-white mt-1">{totalItems}</p></div>
        <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl"><p className="text-xs text-emerald-400 uppercase tracking-wider">Available for Deploy</p><p className="text-3xl font-bold text-emerald-400 mt-1">{readyItems}</p></div>
        <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl"><p className="text-xs text-rose-400 uppercase tracking-wider">In Maintenance Bay</p><p className="text-3xl font-bold text-rose-400 mt-1">{serviceItems}</p></div>
      </div>
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
          <input type="text" placeholder="Search assets..." className="w-full sm:w-72 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <select className="w-full sm:w-44 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="All">All Categories</option><option value="Excavator">Excavators</option><option value="Forklift">Forklifts</option><option value="Crane">Cranes</option><option value="Other">Other Assets</option>
          </select>
        </div>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="w-full md:w-auto px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer">{isFormOpen ? 'Cancel Profile' : '+ Provision Machine'}</button>
      </div>
      {isFormOpen && (
        <form onSubmit={handleAddEquipment} className="bg-slate-900/80 border border-slate-800 p-6 rounded-xl space-y-4 max-w-2xl mx-auto">
          <h3 className="text-md font-bold text-slate-200 border-b border-slate-800 pb-2">Asset Fleet Intake</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Equipment / Model Name</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Komatsu PC210LC" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Serial Tracking Number (S/N)</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="EXC-KOM-1102" value={newSerial} onChange={(e) => setNewSerial(e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Equipment Category</label><select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" value={newType} onChange={(e) => setNewType(e.target.value as Equipment['type'])}><option value="Excavator">Excavator</option><option value="Forklift">Forklift</option><option value="Crane">Crane</option><option value="Other">Other</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Hourly Operational Rate ($)</label><input type="number" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" value={newRate} onChange={(e) => setNewRate(Number(e.target.value))} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Initial Status Tier</label><select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500" value={newStatus} onChange={(e) => setNewStatus(e.target.value as Equipment['status'])}><option value="Available">Available</option><option value="Rented">Rented</option><option value="Maintenance">Maintenance</option></select></div>
          </div>
          <div className="flex justify-end pt-2"><button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer">Log Asset to Fleet</button></div>
        </form>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredInventory.map(item => (<EquipmentCard key={item.id} item={item} onStatusChange={handleStatusChange} />))}
      </div>
    </div>
  );
}