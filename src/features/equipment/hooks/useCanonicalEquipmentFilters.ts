import { useEffect, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import type { CanonicalEquipmentCategory, CanonicalEquipmentSubcategory } from "@/features/masters/equipment-subcategory/canonical";
import type { EquipmentStatusRecord } from "@/features/masters/equipment-status/types";
import type { ProjectRecord } from "@/features/project/types";
import type { CustomerRecord } from "@/features/customer/types";

type OptionsState<T> = { status: "loading" | "ready" | "error"; items: T[] };

export function useCanonicalEquipmentFilters(categoryId: string, canReadProjects = true, canReadCustomers = true) {
  const { readRepositories, repositories } = useApplicationDependenciesCompatibility();
  const [categories, setCategories] = useState<OptionsState<CanonicalEquipmentCategory>>({ status: "loading", items: [] });
  const [statuses, setStatuses] = useState<OptionsState<EquipmentStatusRecord>>({ status: "loading", items: [] });
  const [subcategories, setSubcategories] = useState<OptionsState<CanonicalEquipmentSubcategory>>({ status: "ready", items: [] });
  const [projects, setProjects] = useState<OptionsState<ProjectRecord>>({ status: canReadProjects ? "loading" : "ready", items: [] });
  const [customers, setCustomers] = useState<OptionsState<CustomerRecord>>({ status: canReadCustomers ? "loading" : "ready", items: [] });

  useEffect(() => {
    let active = true;
    setCategories((state) => ({ ...state, status: "loading" }));
    setStatuses((state) => ({ ...state, status: "loading" }));
    setProjects(canReadProjects ? { status: "loading", items: [] } : { status: "ready", items: [] });
    setCustomers(canReadCustomers ? { status: "loading", items: [] } : { status: "ready", items: [] });
    const projectResult = canReadProjects ? readRepositories.projects.list() : Promise.resolve({ success: true as const, value: { items: [] as ProjectRecord[] } });
    const customerResult = canReadCustomers ? readRepositories.customers.list() : Promise.resolve({ success: true as const, value: { items: [] as CustomerRecord[] } });
    void Promise.all([readRepositories.equipmentCategories.list(), repositories.equipmentStatusRead.list(), projectResult, customerResult]).then(([categoryResult, statusResult, projectsResult, customersResult]) => {
      if (!active) return;
      setCategories(categoryResult.success ? { status: "ready", items: categoryResult.value.items } : { status: "error", items: [] });
      setStatuses(statusResult.success ? { status: "ready", items: statusResult.value.filter((item) => item.active && !item.deleted) } : { status: "error", items: [] });
      setProjects(projectsResult.success ? { status: "ready", items: projectsResult.value.items.filter((item) => item.status === "Active" && !item.deleted) } : { status: "error", items: [] });
      setCustomers(customersResult.success ? { status: "ready", items: customersResult.value.items.filter((item) => item.active) } : { status: "error", items: [] });
    }).catch(() => {
      if (!active) return;
      setCategories({ status: "error", items: [] });
      setStatuses({ status: "error", items: [] });
      setProjects({ status: "error", items: [] });
      setCustomers({ status: "error", items: [] });
    });
    return () => { active = false; };
  }, [canReadCustomers, canReadProjects, readRepositories.customers, readRepositories.equipmentCategories, readRepositories.projects, repositories.equipmentStatusRead]);

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

  return { categories, subcategories, statuses, projects, customers };
}
