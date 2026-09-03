import { Link } from "react-router-dom";
import { ChevronRight, PackageOpen } from "lucide-react";

import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";

import EquipmentTable from "@/features/equipment/components/EquipmentTable";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useState } from "react";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { filterEquipmentList, type EquipmentStatusFilter } from "@/features/equipment/services/equipmentListFilters";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getEquipmentRuntimeCapability } from "@/features/equipment/services/equipmentRuntimeCapability";
import { useCanonicalEquipmentData } from "@/features/equipment/hooks/useCanonicalEquipmentData";
import { useAuth } from "@/features/auth/AuthContext";
import FilterBar from "@/components/ui/FilterBar";
import EmptyState from "@/components/ui/EmptyState";
import { LoadingState, ErrorState } from "@/components/ui/AsyncState";
import StatusBadge from "@/components/ui/StatusBadge";
import { filterCanonicalEquipment } from "@/features/equipment/services/filterCanonicalEquipment";

export default function EquipmentPage() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return getEquipmentRuntimeCapability(configuration).canonicalReads ? <CanonicalEquipmentPage /> : <LocalEquipmentPage />;
}

function CanonicalEquipmentPage() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const data = useCanonicalEquipmentData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  if (data.status === "loading") return <div className="app-page"><LoadingState label="Loading canonical Equipment…" /></div>;
  if (data.status === "error") return <div className="app-page"><ErrorState message={data.message} onRetry={data.retry} /></div>;
  const visible = data.items.filter((item) => item.active && !item.deleted);
  const filtered = filterCanonicalEquipment(visible, { query, category, status });
  const categories = [...new Set(visible.map((item) => item.category).filter(Boolean))].sort() as string[];
  const statuses = [...new Set(visible.map((item) => item.statusLabel).filter(Boolean))].sort() as string[];
  const counts = new Map<string, number>();
  for (const item of visible) counts.set(item.statusLabel ?? "Unavailable", (counts.get(item.statusLabel ?? "Unavailable") ?? 0) + 1);
  const canCreate = getEquipmentRuntimeCapability(configuration, Boolean(commandRepositories.canonicalEquipment)).canonicalMutations && hasPermission("equipment.create");
  return <div className="app-page"><PageHeader title="Equipment" description="Canonical company equipment." actions={canCreate ? <Link to="/equipment/new"><Button className="bg-[#f0a93a] text-[#071a33] hover:bg-[#d99a2f]">Add Equipment</Button></Link> : undefined} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatusCard label="All" value={visible.length} /><>{[...counts].slice(0, 3).map(([label, value]) => <StatusCard key={label} label={label} value={value} />)}</></div>
    <FilterBar onClear={() => { setQuery(""); setCategory(""); setStatus(""); }} canClear={Boolean(query || category || status)}><label className="min-w-[15rem] flex-1 text-xs font-medium text-slate-600 dark:text-slate-300"><span className="block">Search</span><input aria-label="Search Equipment" className="app-control mt-1 w-full" placeholder="Search asset number, equipment, or category" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="min-w-40 text-xs font-medium text-slate-600 dark:text-slate-300"><span className="block">Category</span><select aria-label="Category" className="app-control mt-1 w-full" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All Categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label><label className="min-w-40 text-xs font-medium text-slate-600 dark:text-slate-300"><span className="block">Status</span><select aria-label="Status" className="app-control mt-1 w-full" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All Statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label></FilterBar>
    {!visible.length ? <EmptyState icon={<PackageOpen aria-hidden="true" size={22} />} title="No canonical Equipment found" description="Equipment will appear here when it is available through the canonical read model." action={canCreate ? <Link to="/equipment/new"><Button className="bg-[#f0a93a] text-[#071a33] hover:bg-[#d99a2f]">Add Equipment</Button></Link> : undefined} /> : <>{filtered.length === 0 ? <EmptyState title="No matching equipment" description="Try clearing a filter or adjusting your search." /> : <ResponsiveEquipmentTable items={filtered} />}</>}
  </div>;
}

function ResponsiveEquipmentTable({ items }: { items: ReturnType<typeof useCanonicalEquipmentData>["items"] }) {
  return <div className="app-card overflow-x-auto"><table className="app-table min-w-full table-fixed"><thead><tr><th className="w-[18%] px-4 py-3 text-left">Asset No.</th><th className="w-[34%] px-4 py-3 text-left">Equipment</th><th className="w-[20%] px-4 py-3 text-left">Category</th><th className="w-[16%] px-4 py-3 text-left">Status</th><th className="w-[12%] px-4 py-3 text-right">Action</th></tr></thead><tbody>{items.map((item) => <tr className="odd:bg-slate-50/40 hover:bg-amber-50/60 dark:odd:bg-slate-800/20 dark:hover:bg-amber-950/20" key={item.id}><td className="px-4 py-3 align-middle">{item.assetNo}</td><td className="px-4 py-3 align-middle">{item.equipmentName}</td><td className="px-4 py-3 align-middle">{item.category ?? "—"}</td><td className="px-4 py-3 align-middle whitespace-nowrap"><StatusBadge className={statusBadgeClass(item.statusLabel)} tone={statusBadgeTone(item.statusLabel)}>{item.statusLabel ?? "Unavailable"}</StatusBadge></td><td className="px-4 py-3 text-right align-middle"><Link aria-label={`View ${item.equipmentName}`} className="inline-flex rounded p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800" to={`/equipment/${item.id}`}><ChevronRight size={16} aria-hidden="true" /></Link></td></tr>)}</tbody></table></div>;
}

function StatusCard({ label, value }: { label: string; value: number }) { return <div className="app-card relative p-4"><span aria-hidden="true" className={`absolute left-4 top-5 h-2 w-2 rounded-full ${statusIndicator(label)}`} /><p className="pl-4 text-xs text-slate-500">{label}</p><strong className="font-display mt-1 block text-2xl">{value}</strong></div>; }
function statusIndicator(status: string) { return status === "Available" ? "bg-blue-600" : status === "Assigned" ? "bg-[#f0a93a]" : status === "Rented" || status === "Deployed" ? "bg-slate-800 dark:bg-slate-300" : "bg-slate-400"; }
function statusBadgeTone(status?: string): "neutral" | "info" | "warning" { return status === "Available" ? "info" : status === "Maintenance" ? "warning" : "neutral"; }
function statusBadgeClass(status?: string) { return status === "Assigned" ? "bg-[#f0a93a] text-[#071a33]" : status === "Rented" || status === "Deployed" ? "bg-slate-800 text-white dark:bg-slate-700" : ""; }

function LocalEquipmentPage() {
  const {
    equipment,
    deleteEquipment,
  } = useEquipment();
  const { assignments } = useAssignment();
  const { rentals, rentalEquipmentLines } = useRental();
  const { operators } = useOperator();
  const { projects } = useProject();
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState<EquipmentStatusFilter>("All");
  const [category,setCategory]=useState(""); const [ownership,setOwnership]=useState(""); const [location,setLocation]=useState("");
  const filtered=filterEquipmentList(equipment,{query,status,category,ownership,location});
  const activeEquipment=equipment.filter(item=>item.active!==false&&!item.deleted);
  const fleet=[
    ["All",activeEquipment.length,"All active fleet records"],
    ["Available",activeEquipment.filter(item=>item.status==="Available").length,"Ready for assignment"],
    ["Assigned",activeEquipment.filter(item=>item.status==="Assigned").length,"Booked to an assignment"],
    ["Deployed",activeEquipment.filter(item=>item.status==="Rented").length,"Active operation"],
    ["Maintenance",activeEquipment.filter(item=>item.status==="Maintenance").length,"Under maintenance"],
  ] as const;
  const values=(key:"category"|"ownership"|"location")=>[...new Set(activeEquipment.map(item=>item[key]).filter(Boolean))].sort() as string[];
  const deploymentByEquipment=Object.fromEntries(activeEquipment.map(item=>{const assignment=assignments.find(a=>a.equipmentId===item.id&&a.status==="Active");const line=rentalEquipmentLines.find(line=>line.equipmentId===item.id&&["Released","Active"].includes(line.status));const rental=rentals.find(r=>r.id===line?.rentalId&&["Released","Active"].includes(r.status));const project=projects.find(p=>p.id===(assignment?.projectId??rental?.projectId??item.projectId));const operator=operators.find(o=>o.id===(assignment?.operatorId??line?.operatorId??item.operatorId));return [item.id,{project:project?.projectName??rental?.project,operator:operator?.name,rentalNumber:rental?.rentalNumber,assignedDate:assignment?.assignedDate,dateDeployed:rental?.releasedAt??rental?.dateOut,hasAssignment:Boolean(assignment)}] }));

  return (
    <div className="app-page">
      <PageHeader
        title="Equipment"
        description="Manage company equipment."
        actions={<>
          <Link to="/equipment/trash"><Button variant="secondary">Trash</Button></Link>
          <Link to="/equipment/new"><Button className="bg-[#f0a93a] text-[#071a33] hover:bg-[#d99a2f]">Add Equipment</Button></Link>
        </>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{fleet.map(([label,value,caption])=><button type="button" aria-pressed={status===label} onClick={()=>setStatus(label)} className={`app-card relative p-4 text-left transition focus-visible:ring-2 focus-visible:ring-amber-400 ${status===label?"border-amber-400 bg-amber-50/60 ring-1 ring-amber-400 dark:bg-amber-950/30":"hover:border-amber-300"}`} key={label}><span aria-hidden="true" className={`absolute left-4 top-5 h-2 w-2 rounded-full ${statusIndicator(label)}`} /><p className="pl-4 text-xs text-slate-500">{label}</p><strong className="font-display mt-1 block text-2xl">{value}</strong><span className="text-xs text-slate-500">{caption}</span></button>)}</div>
      <FilterBar onClear={()=>{setQuery("");setStatus("All");setCategory("");setOwnership("");setLocation("")}} canClear={Boolean(query||category||ownership||location||status!=="All")}><label className="min-w-[15rem] flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">Search<input aria-label="Search Equipment" className="app-control mt-1" placeholder="Search asset number, equipment, category..." value={query} onChange={event=>setQuery(event.target.value)}/></label>{[["Category",category,setCategory,values("category")],["Ownership",ownership,setOwnership,values("ownership")],["Location",location,setLocation,values("location")]].map(([label,value,setter,options])=><label key={label as string} className="text-sm font-medium text-slate-700 dark:text-slate-200">{label as string}<select aria-label={label as string} className="app-control mt-1" value={value as string} onChange={event=>(setter as (value:string)=>void)(event.target.value)}><option value="">All {label as string}</option>{(options as string[]).map(option=><option key={option}>{option}</option>)}</select></label>)}</FilterBar>
      <p className="text-sm text-slate-500">Showing {filtered.length} of {activeEquipment.length} equipment</p>
      <EquipmentTable
        equipment={filtered}
        onDelete={deleteEquipment}
        detailMode={status}
        deploymentByEquipment={deploymentByEquipment}
        emptyStateAction={<Link to="/equipment/new"><Button className="bg-[#f0a93a] text-[#071a33] hover:bg-[#d99a2f]">Add Equipment</Button></Link>}
      />

    </div>
  );
}
