import { Link } from "react-router-dom";
import DetailsDrawer from "@/components/ui/DetailsDrawer";
import { useCanonicalEquipmentDetail } from "@/features/equipment/hooks/useCanonicalEquipmentDetail";
import { useAuth } from "@/features/auth/AuthContext";
import { useActivityCodes } from "@/features/masters/activity-code";
import { meterRequirementForMaintenanceType, type EquipmentMaintenanceType } from "@/features/equipment/services/maintenanceMeterPolicy";

export default function EquipmentQuickDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useCanonicalEquipmentDetail(id);
  const { hasPermission } = useAuth();
  const activityCodes = useActivityCodes().records ?? [];
  const equipment = detail.equipment.status === "ready" ? detail.equipment.value : null;
  const assignment = detail.assignment.status === "ready" ? detail.assignment.value : null;
  const rental = detail.rental.status === "ready" ? detail.rental.value : null;
  const maintenance = detail.maintenance.status === "ready" ? detail.maintenance.value : null;
  const value = (text?: string | number | null) => text === undefined || text === null || text === "" ? "—" : String(text);
  const row = (label: string, text?: string | number | null) => <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm dark:border-slate-800"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value(text)}</dd></div>;
  return <DetailsDrawer open title={equipment ? `${equipment.assetNo} · ${equipment.equipmentName}` : "Equipment details"} onClose={onClose}>
    {detail.equipment.status === "loading" ? <p role="status">Loading equipment…</p> : detail.equipment.status === "error" ? <div role="alert">Equipment details could not be loaded. <button className="underline" onClick={detail.retry}>Retry</button></div> : !equipment ? <p>Equipment not found.</p> : <div className="space-y-5">
      <section><h3 className="font-semibold">Identity</h3><dl>{row("Category", equipment.category)}{row("Subcategory", equipment.subcategoryName)}{row("Status", equipment.statusLabel)}{row("Condition", equipment.condition)}{row("Location", equipment.location)}</dl></section>
      {hasPermission("assignment.read") && <section><h3 className="font-semibold">Current assignment</h3>{detail.assignment.status === "loading" ? <p role="status">Loading assignment…</p> : detail.assignment.status === "error" ? <p role="alert">Assignment unavailable.</p> : <dl>{row("Operator", assignment?.operatorReadable ? assignment.operator?.name : undefined)}{row("Project", assignment?.projectReadable ? assignment.project?.projectName : undefined)}{row("Activity", activityCodes.find((item) => item.id === assignment?.assignment?.activityCodeId)?.activityCode)}{row("Assigned", assignment?.assignment?.assignedDate)}{row("Expected return", assignment?.assignment?.expectedReturn)}</dl>}</section>}
      {hasPermission("rental.read") && <section><h3 className="font-semibold">Current rental</h3>{detail.rental.status === "loading" ? <p role="status">Loading rental…</p> : detail.rental.status === "error" ? <p role="alert">Rental unavailable.</p> : <dl>{row("Rental", rental?.rental?.rentalNumber)}{row("Status", rental?.rental?.status)}{row("Customer", rental?.customerReadable ? rental.customer?.companyName : undefined)}{row("Expected return", rental?.rental?.expectedReturn)}</dl>}</section>}
      {hasPermission("maintenance.read") && <section><h3 className="font-semibold">Maintenance</h3>{detail.maintenance.status === "loading" ? <p role="status">Loading maintenance…</p> : detail.maintenance.status === "error" ? <p role="alert">Maintenance unavailable.</p> : <dl>{row("Type", equipment.maintenanceType)}{row("Meter requirement", meterRequirementForMaintenanceType(equipment.maintenanceType as EquipmentMaintenanceType))}{row("Current reading", equipment.currentReading)}{row("Open records", maintenance?.openRecords.length)}</dl>}</section>}
      <Link className="inline-flex rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900" to={`/equipment/${id}`}>View full equipment</Link>
    </div>}
  </DetailsDrawer>;
}
