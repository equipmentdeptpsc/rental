import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { useFormSubmission } from "@/components/form/useFormSubmission";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { EQUIPMENT_MAINTENANCE_TYPES, type EquipmentMasterReference, type EquipmentReferenceData } from "@/features/equipment/commands/contracts";
import { requestCanonicalEquipmentRefresh } from "@/features/equipment/remote/canonicalEquipmentRefresh";
import type { CanonicalEquipmentCategory, CanonicalEquipmentSubcategory } from "@/features/masters/equipment-subcategory/canonical";
import { EquipmentSubcategoryDrawer } from "@/features/masters/equipment-subcategory/EquipmentSubcategoryDrawer";

type Form = {
  equipmentName: string; categoryId: string; subcategoryId: string; legacyEquipmentNumber: string;
  brandId: string; modelId: string; serialNumber: string; yearModel: string;
  ownershipId: string; locationId: string; conditionId: string;
  maintenanceType: typeof EQUIPMENT_MAINTENANCE_TYPES[number]; costCodeId: string;
  currentReading: string; remarks: string;
};
const initialForm: Form = {
  equipmentName: "", categoryId: "", subcategoryId: "", legacyEquipmentNumber: "",
  brandId: "", modelId: "", serialNumber: "", yearModel: "", ownershipId: "", locationId: "", conditionId: "",
  maintenanceType: "Engine Hours", costCodeId: "", currentReading: "", remarks: "",
};

function MasterSelect({ label, value, options, onChange }: { label: string; value: string; options: EquipmentMasterReference[]; onChange(value: string): void }) {
  return <label className="block text-sm font-medium">{label}<select aria-label={label} className="app-control mt-1 w-full" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Not specified</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
}

export default function RemoteEquipmentForm() {
  const deps = useApplicationDependenciesCompatibility();
  const repository = deps.commandRepositories.canonicalEquipment!;
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [reference, setReference] = useState<{ loading: boolean; data?: EquipmentReferenceData; error?: string }>({ loading: true });
  const [categories, setCategories] = useState<CanonicalEquipmentCategory[]>([]);
  const [subcategory, setSubcategory] = useState<{ loading: boolean; items: CanonicalEquipmentSubcategory[]; error?: string }>({ loading: false, items: [] });
  const [subcategoryDrawerOpen, setSubcategoryDrawerOpen] = useState(false);
  const [subcategoryRefresh, setSubcategoryRefresh] = useState(0);
  const [form, setForm] = useState<Form>(initialForm);
  const identity = useRef<{ equipmentId: string; commandId: string; idempotencyKey: string } | undefined>(undefined);
  const update = <K extends keyof Form>(key: K, value: Form[K]) => { identity.current = undefined; setForm((current) => ({ ...current, [key]: value })); };

  useEffect(() => {
    let active = true;
    void Promise.all([repository.readReferenceData(), deps.readRepositories.equipmentCategories.list()]).then(([referenceResult, categoriesResult]) => {
      if (!active) return;
      setReference(referenceResult.success ? { loading: false, data: referenceResult } : { loading: false, error: referenceResult.message });
      if (categoriesResult.success) setCategories(categoriesResult.value.items);
      else setReference({ loading: false, error: "Equipment Categories could not be loaded." });
    });
    return () => { active = false; };
  }, [deps.readRepositories.equipmentCategories, repository]);
  useEffect(() => {
    let active = true;
    if (!form.categoryId) { setSubcategory({ loading: false, items: [] }); return; }
    setSubcategory({ loading: true, items: [] });
    void deps.readRepositories.equipmentSubcategories.listAssignable(form.categoryId).then((result) => {
      if (active) setSubcategory(result.success ? { loading: false, items: result.value } : { loading: false, items: [], error: result.error.message });
    });
    return () => { active = false; };
  }, [deps.readRepositories.equipmentSubcategories, form.categoryId, subcategoryRefresh]);

  const submission = useFormSubmission("Equipment", async () => {
    const command = identity.current ??= { equipmentId: crypto.randomUUID(), commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
    const result = await repository.createEquipment({
      ...command, equipmentName: form.equipmentName.trim(), categoryId: form.categoryId, subcategoryId: form.subcategoryId,
      maintenanceType: form.maintenanceType, costCodeId: form.costCodeId,
      ...(form.legacyEquipmentNumber.trim() ? { legacyEquipmentNumber: form.legacyEquipmentNumber.trim() } : {}),
      ...(form.brandId ? { brandId: form.brandId } : {}), ...(form.modelId ? { modelId: form.modelId } : {}),
      ...(form.serialNumber.trim() ? { serialNumber: form.serialNumber.trim() } : {}),
      ...(form.yearModel.trim() ? { yearModel: Number(form.yearModel) } : {}),
      ...(form.ownershipId ? { ownershipId: form.ownershipId } : {}),
      ...(form.locationId ? { locationId: form.locationId } : {}),
      ...(form.conditionId ? { conditionId: form.conditionId } : {}),
      ...(form.currentReading.trim() ? { currentReading: Number(form.currentReading) } : {}),
      ...(form.remarks.trim() ? { remarks: form.remarks.trim() } : {}),
    });
    if (!result.success) throw new Error(result.message);
    requestCanonicalEquipmentRefresh();
    navigate("/equipment");
  });
  if (reference.loading) return <div className="p-8 text-slate-500">Loading Equipment reference data…</div>;
  if (!reference.data) return <div className="p-8" role="alert">{reference.error ?? "Equipment reference data could not be loaded."}</div>;
  if (!reference.data.costCodes.length) return <div className="mx-auto max-w-3xl space-y-3 p-8" role="status"><h1 className="text-3xl font-bold">New Equipment</h1><p>No active Cost Codes are available. A canonical Cost Code must be configured before Equipment can be created.</p></div>;
  const noCategories = !categories.length;
  const missingMasters = ([
    ["Manufacturer / Brand", reference.data.brands], ["Model", reference.data.models],
    ["Ownership Type", reference.data.ownerships], ["Initial Location", reference.data.locations],
    ["Equipment Condition", reference.data.conditions],
  ] as const).filter(([, records]) => records.length === 0).map(([label]) => label);
  return <div className="mx-auto max-w-3xl space-y-6 p-8">
    <div><h1 className="text-3xl font-bold">New Equipment</h1><p className="mt-2 text-gray-500">Create canonical remote Equipment.</p></div>
    {noCategories && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">Create or activate an Equipment Category before creating Equipment.</p>}
    {missingMasters.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">No active canonical records for {missingMasters.join(", ")}. Optional fields may remain unspecified. {hasPermission("masterData.create") && <Link className="underline" to="/settings">Manage Equipment Reference Masters in Settings</Link>}</p>}
    <form className="space-y-5" onSubmit={(event) => {
      event.preventDefault();
      if (!form.equipmentName.trim() || !form.costCodeId || !form.categoryId || !form.subcategoryId) return submission.fail("Select a Category, Sub-Category, Equipment Name, and Cost Code.");
      if (form.currentReading.trim() && (!Number.isFinite(Number(form.currentReading)) || Number(form.currentReading) < 0)) return submission.fail("Current Reading must be zero or greater.");
      if (form.yearModel.trim() && (!Number.isInteger(Number(form.yearModel)) || Number(form.yearModel) < 1900 || Number(form.yearModel) > 2200)) return submission.fail("Year Model must be between 1900 and 2200.");
      void submission.submit(undefined);
    }}>
      {submission.feedback}
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Equipment Name" required value={form.equipmentName} onChange={(event) => update("equipmentName", event.target.value)} />
        <Input label="Asset Number" readOnly value="Generated from category when saved" />
        <Input label="Legacy Equipment Number" maxLength={70} value={form.legacyEquipmentNumber} onChange={(event) => update("legacyEquipmentNumber", event.target.value)} />
        <label className="block text-sm font-medium">Equipment Category<select required aria-label="Equipment Category" className="app-control mt-1 w-full" value={form.categoryId} onChange={(event) => { identity.current = undefined; setForm((current) => ({ ...current, categoryId: event.target.value, subcategoryId: "" })); }}><option value="">Select Equipment Category</option>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div><label className="block text-sm font-medium">Equipment Sub-Category<select required aria-label="Equipment Sub-Category" disabled={!form.categoryId || subcategory.loading} className="app-control mt-1 w-full" value={form.subcategoryId} onChange={(event) => update("subcategoryId", event.target.value)}><option value="">{subcategory.loading ? "Loading Sub-Categories…" : form.categoryId ? "Select Equipment Sub-Category" : "Select a Category first"}</option>{subcategory.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{subcategory.error && <p className="mt-1 text-sm text-red-700" role="alert">Equipment Sub-Categories could not be loaded.</p>}{hasPermission("masterData.create") && <button type="button" className="mt-2 text-sm text-blue-700 underline" onClick={() => setSubcategoryDrawerOpen(true)}>+ Add new sub-category</button>}</div>
        <MasterSelect label="Manufacturer / Brand" value={form.brandId} options={reference.data.brands} onChange={(value) => update("brandId", value)} />
        <MasterSelect label="Model" value={form.modelId} options={reference.data.models} onChange={(value) => update("modelId", value)} />
        <Input label="Serial Number" value={form.serialNumber} onChange={(event) => update("serialNumber", event.target.value)} />
        <Input label="Year Model" type="number" min="1900" max="2200" value={form.yearModel} onChange={(event) => update("yearModel", event.target.value)} />
        <MasterSelect label="Ownership Type" value={form.ownershipId} options={reference.data.ownerships} onChange={(value) => update("ownershipId", value)} />
        <MasterSelect label="Initial Location" value={form.locationId} options={reference.data.locations} onChange={(value) => update("locationId", value)} />
        <MasterSelect label="Equipment Condition" value={form.conditionId} options={reference.data.conditions} onChange={(value) => update("conditionId", value)} />
        <label className="block text-sm font-medium">Maintenance Type<select className="app-control mt-1 w-full" value={form.maintenanceType} onChange={(event) => update("maintenanceType", event.target.value as Form["maintenanceType"])}>{EQUIPMENT_MAINTENANCE_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-sm font-medium">Cost Code<select required className="app-control mt-1 w-full" value={form.costCodeId} onChange={(event) => update("costCodeId", event.target.value)}><option value="">Select Cost Code</option>{reference.data.costCodes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
        <Input label="Current Reading" type="number" min="0" value={form.currentReading} onChange={(event) => update("currentReading", event.target.value)} />
      </div>
      <Input label="Remarks" value={form.remarks} onChange={(event) => update("remarks", event.target.value)} />
      <div className="flex justify-end"><Button type="submit" disabled={submission.busy || noCategories}>{submission.busy ? "Saving..." : "Create Equipment"}</Button></div>
    </form>
    <EquipmentSubcategoryDrawer open={subcategoryDrawerOpen} onClose={() => setSubcategoryDrawerOpen(false)} categories={categories} initialCategoryId={form.categoryId} onSaved={() => setSubcategoryRefresh((value) => value + 1)} />
  </div>;
}
