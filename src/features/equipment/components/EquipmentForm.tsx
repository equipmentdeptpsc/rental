import { useEffect, useState } from "react";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

import type {
  EquipmentFormData,
  EquipmentCategory,
} from "../types";

import { usePrefix } from "@/features/settings";
import { useEquipmentCategories } from "@/features/masters/equipment-category";
import { useEquipmentStatuses,} from "@/features/masters/equipment-status";
import { useEquipmentOwnerships } from "@/features/masters/equipment-ownership/context/EquipmentOwnershipContext";
import {  useEquipmentConditions,} from "@/features/masters/equipment-condition";
import {  useEquipmentLocations,} from "@/features/masters/equipment-location";
import { useEquipmentBrands } from "@/features/masters/equipment-brand";
import { useEquipmentTypes } from "@/features/masters/equipment-type/context/EquipmentTypeContext";
import { useCostCodes } from "@/features/masters/cost-code/context/useCostCodes";
import { getActiveCostCodeOptions } from "../utils/equipmentCostCode";
import { useEquipment } from "../context/EquipmentContext";
import { previewCategoryAssetNumber } from "../services/categoryAssetNumber";

interface Props {
  initialData?: EquipmentFormData;

  submitLabel?: string;

  onSubmit(
    data: EquipmentFormData
  ): void;

  onCancel?(): void;
}

export default function EquipmentForm({
  initialData,
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: Props) {

  const { records: equipmentTypes } =
    useEquipmentTypes();

  const { costCodes } = useCostCodes();

  const { prefixes } = usePrefix();
  const { equipment } = useEquipment();

  const { records: equipmentBrands } =
  useEquipmentBrands();

  const {
    records: equipmentCategories,
  } = useEquipmentCategories();

  const {
    records: equipmentStatuses,
  } = useEquipmentStatuses();

  const {
    records: equipmentOwnerships,
  } = useEquipmentOwnerships();

  const {
    records: equipmentConditions,
  } = useEquipmentConditions();

  const {
    records: equipmentLocations,
  } = useEquipmentLocations();

  const [form, setForm] =
    useState<EquipmentFormData>({
      prefixId: "",
      assetNo: "",
      equipmentName: "",

      typeId: "",
      type: "",

      brandId: "",
      brand: "",

      costCodeId: "",

      manufacturer: "",
      model: "",
      serialNumber: "",
      engineNumber: "",
      chassisNumber: "",
      plateNumber: "",
      yearModel: "",
      capacity: "",

      category: "",

      maintenanceType:
        "Engine Hours",

      currentReading: "",

      projectId: "",

      operatorId: "",

      ...initialData,
    });

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    }
  }, [initialData]);

  function update<
    K extends keyof EquipmentFormData
  >(
    key: K,
    value: EquipmentFormData[K]
  ) {
    setForm(prev => ({
      ...prev,
      [key]: value,
    }));
  }

  useEffect(() => {
    if (initialData?.assetNo) return;
    if (!form.category) {
      update("assetNo", "");
      update("prefixId", "");
      return;
    }
    const preview = previewCategoryAssetNumber(form.category as EquipmentCategory, prefixes, equipment);
    if (!preview.success) {
      update("assetNo", "");
      update("prefixId", "");
      return;
    }
    update("prefixId", preview.prefixId);
    update("assetNo", preview.assetNo);
  }, [
    form.category,
    prefixes,
    equipment,
    initialData?.assetNo,
  ]);

  function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4">

        <Input
          label="Asset Number"
          value={form.assetNo}
          placeholder="Select an equipment category to generate the asset number."
          readOnly
        />

        <Input
          label="Equipment Name"
          value={form.equipmentName}
          onChange={(e) =>
            update(
              "equipmentName",
              e.target.value
            )
          }
        />

        <Select
          label="Equipment Type"
          value={form.typeId ?? ""}
          options={[
            {
              label:
                "-- Select Equipment Type --",
              value: "",
            },
            ...equipmentTypes
              .filter(
                (item) =>
                  item.active &&
                  !item.deleted
              )
              .map((item) => ({
                value: item.id,
                label: item.equipmentType,
              })),
          ]}
          onChange={(e) => {
            const selected =
              equipmentTypes.find(
                (item) =>
                  item.id ===
                  e.target.value
              );

            update(
              "typeId",
              e.target.value
            );

            update(
              "type",
              selected
                ?.equipmentType ?? ""
            );
          }}
        />

<Select
  label="Equipment Brand"
  value={form.brandId ?? ""}
  options={[
    {
      label: "-- Select Equipment Brand --",
      value: "",
    },
    ...equipmentBrands
      .filter(
        (item) =>
          item.active &&
          !item.deleted
      )
      .map((item) => ({
        value: item.id,
        label: item.brand,
      })),
  ]}
  onChange={(e) => {
    const selected =
      equipmentBrands.find(
        (item) =>
          item.id ===
          e.target.value
      );

    update(
      "brandId",
      e.target.value
    );

    update(
      "brand",
      selected?.brand ?? ""
    );
  }}
/>

        <div>
          <Select
            label="Cost Code"
            value={form.costCodeId ?? ""}
            options={[
              { label: "-- Select Cost Code --", value: "" },
              ...getActiveCostCodeOptions(costCodes),
            ]}
            onChange={(event) => update("costCodeId", event.target.value)}
          />
          {!form.costCodeId && (
            <p className="mt-1 text-sm text-amber-700">
              Cost Code not configured
            </p>
          )}
        </div>

        <Input
          label="Manufacturer"
          value={form.manufacturer}
          onChange={(e) =>
            update(
              "manufacturer",
              e.target.value
            )
          }
        />

        <Input
          label="Model"
          value={form.model}
          onChange={(e) =>
            update(
              "model",
              e.target.value
            )
          }
        />

        <Input
          label="Serial Number"
          value={form.serialNumber}
          onChange={(e) =>
            update(
              "serialNumber",
              e.target.value
            )
          }
        />

        <Input
          label="Engine Number"
          value={form.engineNumber}
          onChange={(e) =>
            update(
              "engineNumber",
              e.target.value
            )
          }
        />

        <Input
          label="Chassis Number"
          value={form.chassisNumber}
          onChange={(e) =>
            update(
              "chassisNumber",
              e.target.value
            )
          }
        />

        <Input
          label="Plate Number"
          value={form.plateNumber}
          onChange={(e) =>
            update(
              "plateNumber",
              e.target.value
            )
          }
        />

        <Input
          label="Year Model"
          value={form.yearModel}
          onChange={(e) =>
            update(
              "yearModel",
              e.target.value
            )
          }
        />

        <Input
          label="Capacity"
          value={form.capacity}
          onChange={(e) =>
            update(
              "capacity",
              e.target.value
            )
          }
        />

<Select
  label="Equipment Category"
  value={form.categoryId ?? ""}
  options={[
    {
      label: "-- Select Equipment Category --",
      value: "",
    },
    ...equipmentCategories
      .filter(
        (item) =>
          item.active &&
          !item.deleted
      )
      .map((item) => ({
        value: item.id,
        label: item.category,
      })),
  ]}
  onChange={(e) => {
    const selected =
      equipmentCategories.find(
        (item) =>
          item.id ===
          e.target.value
      );

    update(
      "categoryId",
      e.target.value
    );

    update(
      "category",
      (selected?.category ??
        "") as EquipmentCategory
    );
  }}
/>

<Select
  label="Equipment Status"
  value={form.statusId ?? ""}
  options={[
    {
      label: "-- Select Equipment Status --",
      value: "",
    },
    ...equipmentStatuses
      .filter(
        item =>
          item.active &&
          !item.deleted
      )
      .map(item => ({
        value: item.id,
        label: item.status,
      })),
  ]}
  onChange={(e) => {

    const selected =
      equipmentStatuses.find(
        item =>
          item.id ===
          e.target.value
      );

    update(
      "statusId",
      e.target.value
    );

    update(
      "status",
      selected
        ?.status as any
    );

  }}
/>

<Select
  label="Equipment Ownership"
  value={form.ownershipId ?? ""}
  options={[
    {
      label: "-- Select Equipment Ownership --",
      value: "",
    },
    ...equipmentOwnerships
      .filter(
        item =>
          item.active &&
          !item.deleted
      )
      .map(item => ({
        value: item.id,
        label: item.ownership,
      })),
  ]}
  onChange={(e) => {

    const selected =
      equipmentOwnerships.find(
        item =>
          item.id ===
          e.target.value
      );

    update(
      "ownershipId",
      e.target.value
    );

    update(
      "ownership",
      selected?.ownership ?? ""
    );

  }}
/>

<Select
  label="Equipment Condition"
  value={form.conditionId ?? ""}
  options={[
    {
      label: "-- Select Equipment Condition --",
      value: "",
    },
    ...equipmentConditions
      .filter(
        item =>
          item.active &&
          !item.deleted
      )
      .map(item => ({
        value: item.id,
        label: item.condition,
      })),
  ]}
  onChange={(e) => {

    const selected =
      equipmentConditions.find(
        item =>
          item.id ===
          e.target.value
      );

    update(
      "conditionId",
      e.target.value
    );

    update(
      "condition",
      selected?.condition ?? ""
    );

  }}
/>

<Select
  label="Equipment Location"
  value={form.locationId ?? ""}
  options={[
    {
      label: "-- Select Equipment Location --",
      value: "",
    },
    ...equipmentLocations
      .filter(
        item =>
          item.active &&
          !item.deleted
      )
      .map(item => ({
        value: item.id,
        label: item.location,
      })),
  ]}
  onChange={(e) => {

    const selected =
      equipmentLocations.find(
        item =>
          item.id ===
          e.target.value
      );

    update(
      "locationId",
      e.target.value
    );

    update(
      "location",
      selected?.location ?? ""
    );

  }}
/>

        <Select
          label="Maintenance Type"
          value={form.maintenanceType}
          options={[
            {
              label:
                "Engine Hours",
              value:
                "Engine Hours",
            },
            {
              label:
                "Mileage",
              value:
                "Mileage",
            },
            {
              label:
                "Calendar Days",
              value:
                "Calendar Days",
            },
          ]}
          onChange={(e) =>
            update(
              "maintenanceType",
              e.target.value as EquipmentFormData["maintenanceType"]
            )
          }
        />

        <Input
          label="Current Reading"
          type="number"
          value={form.currentReading}
          onChange={(e) =>
            update(
              "currentReading",
              e.target.value
            )
          }
        />


      </div>

            <div className="flex justify-end gap-3">

        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}

        <Button type="submit">
          {submitLabel}
        </Button>

      </div>

    </form>
  );
}
