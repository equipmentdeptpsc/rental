import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DetailsDrawer from "@/components/ui/DetailsDrawer";
import StatusBadge from "@/components/ui/StatusBadge";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { CanonicalBookingListItem } from "../canonical";
import { bookingRentalWorkspacePath } from "../bookingOperationsPresentation";

interface DetailLine {
  line: RentalEquipmentLine;
  equipment?: { assetNo: string; equipmentName: string };
  operator?: { name: string };
}
type DetailState = { status: "loading" | "error" } | { status: "ready"; rental?: RentalRecord; lines: DetailLine[] };

export default function BookingDetailsDrawer({ row, open, onClose }: { row: CanonicalBookingListItem; open: boolean; onClose: () => void }) {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const canReadEquipment = hasPermission("equipment.read");
  const canReadOperator = hasPermission("operator.read");
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  useEffect(() => {
    if (!open) return;
    let active = true;
    setDetail({ status: "loading" });
    void Promise.all([
      readRepositories.rentals.getById(row.rentalId),
      readRepositories.rentalEquipmentLines.list({ filters: { rental_id: row.rentalId }, paging: { limit: 100 } }),
    ]).then(async ([rentalResult, linesResult]) => {
      if (!active) return;
      if (!rentalResult.success || !linesResult.success) { setDetail({ status: "error" }); return; }
      const lines = linesResult.value.items;
      const details = await Promise.all(lines.map(async (line): Promise<DetailLine> => {
        const [equipment, operator] = await Promise.all([
          canReadEquipment ? readRepositories.equipment.getById(line.equipmentId) : Promise.resolve(null),
          canReadOperator && line.operatorId ? readRepositories.operators.getById(line.operatorId) : Promise.resolve(null),
        ]);
        return {
          line,
          equipment: equipment?.success ? equipment.value ?? undefined : undefined,
          operator: operator?.success ? operator.value ?? undefined : undefined,
        };
      }));
      if (active) setDetail({ status: "ready", rental: rentalResult.value ?? undefined, lines: details });
    }).catch(() => { if (active) setDetail({ status: "error" }); });
    return () => { active = false; };
  }, [open, row.rentalId, readRepositories, canReadEquipment, canReadOperator]);

  const rental = detail.status === "ready" ? detail.rental : undefined;
  const lines = detail.status === "ready" ? detail.lines : [];
  const terms = rental?.commercialSnapshot ?? rental?.billingTerms ?? (lines.length === 1 ? lines[0].line.commercialSnapshot : undefined);
  const field = (label: string, value?: string | number) => <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm dark:border-slate-800"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value ?? "—"}</dd></div>;
  return <DetailsDrawer title={row.rentalNumber ?? "Rental booking"} open={open} onClose={onClose}>
    <div className="space-y-5">
      <section><h3 className="font-semibold">Booking</h3><dl>{field("Rental number", row.rentalNumber)}{field("Status", row.rentalStatus)}{field("Customer", row.customerName)}{field("Project", row.projectName)}{field("Booked", row.createdAt.slice(0, 10))}{field("Scheduled start", row.dateOut.slice(0, 10))}{field("Expected return", row.expectedReturn?.slice(0, 10))}{rental?.approvalStatus === "Pending" && field("Approval", "Pending approval")}{rental?.remarks && field("Remarks", rental.remarks)}</dl></section>
      <section><h3 className="font-semibold">Equipment</h3>{detail.status === "loading" ? <p role="status" className="text-sm text-slate-500">Loading equipment lines…</p> : detail.status === "error" ? <p role="alert" className="text-sm text-rose-700">Booking details are unavailable.</p> : lines.length ? <div className="mt-2 space-y-3">{lines.map(({ line, equipment, operator }) => <article key={line.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><div className="flex items-start justify-between gap-2"><div><strong>{equipment?.assetNo ?? (line.id === row.rentalEquipmentLineId ? row.equipmentAssetNumber : undefined) ?? "Equipment"}</strong><p className="text-slate-500">{equipment?.equipmentName ?? (line.id === row.rentalEquipmentLineId ? row.equipmentName : undefined) ?? "Details unavailable"}</p></div><StatusBadge tone={line.status === "Returned" ? "success" : line.status === "Active" ? "warning" : "info"}>{line.status}</StatusBadge></div><dl className="mt-2">{field("Operator", operator?.name)}{field("Start", line.effectiveStartDate?.slice(0, 10) ?? row.dateOut.slice(0, 10))}{field("Expected return", rental?.expectedReturn?.slice(0, 10) ?? row.expectedReturn?.slice(0, 10))}{line.actualReturnDate && field("Actual return", line.actualReturnDate.slice(0, 10))}{field("Allocation", line.assignmentId ? "Assigned" : "Not assigned")}</dl></article>)}</div> : <p className="text-sm text-slate-500">No equipment lines available.</p>}</section>
      {hasPermission("rental.commercialTerms.read") && terms && <section><h3 className="font-semibold">Commercial summary</h3><dl>{field("Rate basis", rental?.billingMethod ?? rental?.commercialSnapshot?.billingMethod)}{field("Rate", terms.unitRate)}{field("Operation rate", terms.operatorRate)}{field("Idle rate", terms.idleRate)}{terms.discountType && terms.discountType !== "NONE" && field("Discount", `${terms.discountType} ${terms.discountValue ?? 0}`)}{field("VAT", terms.vatApplicability)}</dl></section>}
      <section><h3 className="font-semibold">Actions</h3><div className="mt-2 flex flex-wrap gap-2"><Link className="rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700" to={bookingRentalWorkspacePath(row.rentalId)}>View Full Rental Workspace</Link>{rental && <RentalQuickActions rental={rental} hideClose />}</div></section>
    </div>
  </DetailsDrawer>;
}
