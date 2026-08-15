import { Link } from "react-router-dom";

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

export default function EquipmentPage() {
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
          <Link to="/equipment/new"><Button>Add Equipment</Button></Link>
        </>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{fleet.map(([label,value,caption])=><button type="button" aria-pressed={status===label} onClick={()=>setStatus(label)} className={`app-card p-4 text-left transition focus-visible:ring-2 focus-visible:ring-blue-500 ${status===label?"border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-950/50":"hover:border-blue-300"}`} key={label}><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block text-2xl">{value}</strong><span className="text-xs text-slate-500">{caption}</span></button>)}</div>
      <section className="app-card grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5"><input aria-label="Search Equipment" className="app-control xl:col-span-2" placeholder="Search asset number, equipment, category..." value={query} onChange={event=>setQuery(event.target.value)}/>{[["Category",category,setCategory,values("category")],["Ownership",ownership,setOwnership,values("ownership")],["Location",location,setLocation,values("location")]].map(([label,value,setter,options])=><select key={label as string} aria-label={label as string} className="app-control" value={value as string} onChange={event=>(setter as (value:string)=>void)(event.target.value)}><option value="">All {label as string}</option>{(options as string[]).map(option=><option key={option}>{option}</option>)}</select>)}<Button variant="secondary" onClick={()=>{setQuery("");setStatus("All");setCategory("");setOwnership("");setLocation("")}}>Clear Filters</Button></section>
      <p className="text-sm text-slate-500">Showing {filtered.length} of {activeEquipment.length} equipment</p>
      <EquipmentTable
        equipment={filtered}
        onDelete={deleteEquipment}
        detailMode={status}
        deploymentByEquipment={deploymentByEquipment}
      />

    </div>
  );
}
