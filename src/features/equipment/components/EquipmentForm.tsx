import { useEffect, useMemo, useState, type ComponentProps } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CanonicalSelect from "@/components/ui/Select";
import { useCostCodes } from "@/features/masters/cost-code/context/useCostCodes";
import { useEquipmentBrands } from "@/features/masters/equipment-brand/context/EquipmentBrandContext";
import { useEquipmentCategories } from "@/features/masters/equipment-category/context/EquipmentCategoryContext";
import { useEquipmentConditions } from "@/features/masters/equipment-condition/context/EquipmentConditionContext";
import { useEquipmentLocations } from "@/features/masters/equipment-location/context/EquipmentLocationContext";
import { useEquipmentModels } from "@/features/masters/equipment-model/context/EquipmentModelContext";
import { useEquipmentOwnerships } from "@/features/masters/equipment-ownership/context/EquipmentOwnershipContext";
import { useEquipmentStatuses } from "@/features/masters/equipment-status/context/EquipmentStatusContext";
import { useEquipmentSubcategories } from "@/features/masters/equipment-subcategory/context";
import { usePrefix } from "@/features/settings";
import { useEquipment } from "../context/EquipmentContext";
import { createInlineMasterValue } from "../services/inlineEquipmentMaster";
import { retainCompatibleSubcategory } from "../services/equipmentCategorySelection";
import { previewCategoryAssetNumber } from "../services/categoryAssetNumber";
import type { EquipmentCategory, EquipmentFormData } from "../types";
import { getActiveCostCodeOptions } from "../utils/equipmentCostCode";
import { useFormSubmission } from "@/components/form/useFormSubmission";

interface Props { initialData?: EquipmentFormData; mode?: "create" | "edit"; submitLabel?: string; onSubmit(data: EquipmentFormData): void | Promise<void>; onCancel?(): void }
const Select=(props:ComponentProps<typeof CanonicalSelect>)=><CanonicalSelect searchable clearable {...props}/>;

export default function EquipmentForm({ initialData, mode = "edit", submitLabel = "Save", onSubmit, onCancel }: Props) {
  const submission = useFormSubmission("Equipment", onSubmit);
  const { equipment } = useEquipment(); const { prefixes } = usePrefix(); const { costCodes } = useCostCodes();
  const { records: categories } = useEquipmentCategories(); const { records: subcategories } = useEquipmentSubcategories();
  const brands = useEquipmentBrands(); const models = useEquipmentModels(); const locations = useEquipmentLocations();
  const { records: ownerships } = useEquipmentOwnerships(); const { records: statuses } = useEquipmentStatuses(); const { records: conditions } = useEquipmentConditions();
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<EquipmentFormData>(() => ({ prefixId: "", assetNo: "", equipmentName: "", typeId: "", type: "", brandId: "", brand: "", costCodeId: "", manufacturer: "", model: "", serialNumber: "", engineNumber: "", chassisNumber: "", plateNumber: "", yearModel: "", capacity: "", category: "", categoryId: "", subcategoryId: "", subcategoryName: "", maintenanceType: "Engine Hours", currentReading: "", projectId: "", operatorId: "", ...initialData }));
  useEffect(() => { if (initialData) setForm(initialData); }, [initialData]);
  const update = <K extends keyof EquipmentFormData>(key: K, value: EquipmentFormData[K]) => setForm((current) => ({ ...current, [key]: value }));
  const availableSubcategories = useMemo(() => subcategories.filter((item) => item.active && item.categoryId === form.categoryId), [form.categoryId, subcategories]);

  useEffect(() => {
    if (mode === "edit" && initialData?.assetNo) return;
    if (!form.category) { update("assetNo", ""); update("prefixId", ""); return; }
    const preview = previewCategoryAssetNumber(form.category as EquipmentCategory, prefixes, equipment);
    update("assetNo", preview.success ? preview.assetNo : ""); update("prefixId", preview.success ? preview.prefixId : "");
  }, [equipment, form.category, initialData?.assetNo, mode, prefixes]);

  function addMaster(kind: "brand" | "model" | "location") {
    const raw = window.prompt(`Add ${kind === "brand" ? "Manufacturer" : kind === "model" ? "Model" : "Location"}`); if (raw === null) return;
    const existing = kind === "brand" ? brands.records.map((item) => item.brand) : kind === "model" ? models.records.map((item) => item.equipmentModel) : locations.records.map((item) => item.location);
    const result = createInlineMasterValue(raw, existing, kind); if (!result.success) { setMessage(result.message); return; }
    const id = result.id;
    if (kind === "brand") { brands.create({ id, brand: result.value, description: "Added from Equipment registration", active: true, deleted: false }); update("brandId", id); update("brand", result.value); update("manufacturer", result.value); }
    if (kind === "model") { models.create({ id, equipmentModel: result.value, description: "Added from Equipment registration", active: true, deleted: false }); update("model", result.value); }
    if (kind === "location") { locations.create({ id, location: result.value, description: "Added from Equipment registration", active: true, deleted: false }); update("locationId", id); update("location", result.value); }
    setMessage(`${result.value} added and selected.`);
  }

  return <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); void submission.submit(form); }}>
    {submission.feedback}
    {message && <p className="rounded border p-3" role="status">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <Select label="Equipment Category" required value={form.categoryId ?? ""} options={[{ label: "-- Select Equipment Category --", value: "" }, ...categories.filter((item) => item.active && !item.deleted).map((item) => ({ label: item.category, value: item.id }))]} onChange={(event) => { const selected = categories.find((item) => item.id === event.target.value); const compatible = retainCompatibleSubcategory(event.target.value, form.subcategoryId, subcategories); update("categoryId", event.target.value); update("category", (selected?.category ?? "") as EquipmentCategory | ""); if (!compatible) { update("subcategoryId", ""); update("subcategoryName", ""); } }} />
      <Select label="Equipment Sub-category" required disabled={!form.categoryId} value={form.subcategoryId ?? ""} options={[{ label: "-- Select Equipment Sub-category --", value: "" }, ...availableSubcategories.map((item) => ({ label: item.name, value: item.id }))]} onChange={(event) => { const selected = subcategories.find((item) => item.id === event.target.value); update("subcategoryId", event.target.value); update("subcategoryName", selected?.name ?? ""); }} />
      <Input label="Equipment Code" required value={form.equipmentName} onChange={(event) => update("equipmentName", event.target.value)} />
      <Select label="Cost Code" value={form.costCodeId ?? ""} options={[{ label: "-- Select Cost Code --", value: "" }, ...getActiveCostCodeOptions(costCodes)]} onChange={(event) => update("costCodeId", event.target.value)} />
      <Input label="Asset Number" readOnly value={form.assetNo || "AUTO-GENERATED"} />
    </div>
    <details className="rounded-xl border p-4" open={mode === "edit" ? true : undefined}><summary className="cursor-pointer font-semibold">Additional Equipment Details</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><Select label="Manufacturer" value={form.brandId ?? ""} options={[{ label: "-- Select Manufacturer --", value: "" }, ...brands.records.filter((item) => item.active && !item.deleted).map((item) => ({ label: item.brand, value: item.id }))]} onChange={(event) => { const selected = brands.records.find((item) => item.id === event.target.value); update("brandId", event.target.value); update("brand", selected?.brand ?? ""); update("manufacturer", selected?.brand ?? ""); }} /><button className="mt-1 text-sm text-blue-700" type="button" onClick={() => addMaster("brand")}>+ Add Manufacturer</button></div>
        <div><Select label="Model" value={models.records.find((item) => item.equipmentModel === form.model)?.id ?? ""} options={[{ label: "-- Select Model --", value: "" }, ...models.records.filter((item) => item.active && !item.deleted).map((item) => ({ label: item.equipmentModel, value: item.id }))]} onChange={(event) => update("model", models.records.find((item) => item.id === event.target.value)?.equipmentModel ?? "")} /><button className="mt-1 text-sm text-blue-700" type="button" onClick={() => addMaster("model")}>+ Add Model</button></div>
        <Input label="Serial Number" value={form.serialNumber} onChange={(event) => update("serialNumber", event.target.value)} />
        <Select label="Ownership Type" value={form.ownershipId ?? ""} options={[{ label: "-- Select Ownership Type --", value: "" }, ...ownerships.filter((item) => item.active && !item.deleted).map((item) => ({ label: item.ownership, value: item.id }))]} onChange={(event) => { const selected = ownerships.find((item) => item.id === event.target.value); update("ownershipId", event.target.value); update("ownership", selected?.ownership ?? ""); }} />
        <div><Select label="Initial Location" value={form.locationId ?? ""} options={[{ label: "-- Select Initial Location --", value: "" }, ...locations.records.filter((item) => item.active && !item.deleted).map((item) => ({ label: item.location, value: item.id }))]} onChange={(event) => { const selected = locations.records.find((item) => item.id === event.target.value); update("locationId", event.target.value); update("location", selected?.location ?? ""); }} /><button className="mt-1 text-sm text-blue-700" type="button" onClick={() => addMaster("location")}>+ Add Location</button></div>
        <Input label="Notes" value={form.remarks ?? ""} onChange={(event) => update("remarks", event.target.value)} />
        <Select label="Maintenance Type" value={form.maintenanceType} options={["Engine Hours", "Kilometers", "Mileage", "Calendar Days"].map((value) => ({ label: value, value }))} onChange={(event) => update("maintenanceType", event.target.value as EquipmentFormData["maintenanceType"])} />
        <Input label="Current Reading" type="number" value={form.currentReading} onChange={(event) => update("currentReading", event.target.value)} />
        {mode === "edit" && <Select label="Equipment Status" value={form.status ?? ""} options={statuses.filter((item) => item.active && !item.deleted).map((item) => ({ label: item.status, value: item.status }))} onChange={(event) => update("status", event.target.value as EquipmentFormData["status"])} />}
        {mode === "edit" && <Select label="Equipment Condition" value={form.conditionId ?? ""} options={[{ label: "-- Select Equipment Condition --", value: "" }, ...conditions.filter((item) => item.active && !item.deleted).map((item) => ({ label: item.condition, value: item.id }))]} onChange={(event) => { const selected = conditions.find((item) => item.id === event.target.value); update("conditionId", event.target.value); update("condition", selected?.condition ?? ""); }} />}
      </div>
    </details>
    <div className="flex justify-end gap-3">{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}<Button type="submit" disabled={submission.busy}>{submission.busy ? "Saving..." : submitLabel}</Button></div>
  </form>;
}
