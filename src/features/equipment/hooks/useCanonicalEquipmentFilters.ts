import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { CanonicalEquipmentCategory, CanonicalEquipmentSubcategory } from "@/features/masters/equipment-subcategory/canonical";
import type { EquipmentStatusRecord } from "@/features/masters/equipment-status/types";

type OptionsState<T> = { status: "loading" | "ready" | "error"; items: T[] };

export function useCanonicalEquipmentFilters(categoryId: string) {
  const { readRepositories, repositories } = useApplicationDependenciesCompatibility();
  const [categories, setCategories] = useState<OptionsState<CanonicalEquipmentCategory>>({ status: "loading", items: [] });
  const [statuses, setStatuses] = useState<OptionsState<EquipmentStatusRecord>>({ status: "loading", items: [] });
  const [subcategories, setSubcategories] = useState<OptionsState<CanonicalEquipmentSubcategory>>({ status: "ready", items: [] });

  useEffect(() => {
    let active = true;
    setCategories((state) => ({ ...state, status: "loading" }));
    setStatuses((state) => ({ ...state, status: "loading" }));
    void Promise.all([readRepositories.equipmentCategories.list(), repositories.equipmentStatusRead.list()]).then(([categoryResult, statusResult]) => {
      if (!active) return;
      setCategories(categoryResult.success ? { status: "ready", items: categoryResult.value.items } : { status: "error", items: [] });
      setStatuses(statusResult.success ? { status: "ready", items: statusResult.value.filter((item) => item.active && !item.deleted) } : { status: "error", items: [] });
    }).catch(() => {
      if (!active) return;
      setCategories({ status: "error", items: [] });
      setStatuses({ status: "error", items: [] });
    });
    return () => { active = false; };
  }, [readRepositories.equipmentCategories, repositories.equipmentStatusRead]);

  useEffect(() => {
    let active = true;
    if (!categoryId) {
      setSubcategories({ status: "ready", items: [] });
      return () => { active = false; };
    }
    setSubcategories({ status: "loading", items: [] });
    // The list RPC is the certified read boundary (masterData.read). The
    // assignable RPC is write-form specific and requires equipment.create.
    void Promise.resolve(readRepositories.equipmentSubcategories.list()).then((result) => {
      if (!active) return;
      setSubcategories(result.success ? { status: "ready", items: result.value.items.filter((item) => item.categoryId === categoryId && item.active) } : { status: "error", items: [] });
    }).catch(() => { if (active) setSubcategories({ status: "error", items: [] }); });
    return () => { active = false; };
  }, [categoryId, readRepositories.equipmentSubcategories]);

  return { categories, subcategories, statuses };
}
