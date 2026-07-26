import { storage } from "@/core/storage";
import type { ManagerApproverConfiguration } from "./types";

export const MANAGER_APPROVER_CONFIGURATION_KEY = "equipment-rental-manager-approver-configuration";
const clone = <T>(value: T): T => structuredClone(value);

export const managerApproverRepository = {
  getAll(): ManagerApproverConfiguration[] {
    return clone(storage.get<ManagerApproverConfiguration[]>(MANAGER_APPROVER_CONFIGURATION_KEY) ?? []);
  },
  replace(record: ManagerApproverConfiguration): ManagerApproverConfiguration {
    storage.set(MANAGER_APPROVER_CONFIGURATION_KEY, [clone(record)]);
    return clone(record);
  },
};
