import { managerApproverRepository } from "./managerApproverRepository";
import type { ManagerApproverConfiguration } from "./types";

export type ManagerApproverResult =
  | { success: true; configuration: ManagerApproverConfiguration }
  | { success: false; code: string; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateManagerApproverConfiguration(configuration: Pick<ManagerApproverConfiguration, "name" | "email" | "active">): ManagerApproverResult {
  if (!configuration.name.trim()) return { success: false, code: "MANAGER_APPROVER_NAME_REQUIRED", message: "Manager approver name is required." };
  if (!EMAIL_PATTERN.test(configuration.email.trim())) return { success: false, code: "MANAGER_APPROVER_EMAIL_INVALID", message: "Enter a valid Manager approver email address." };
  const now = new Date().toISOString();
  return { success: true, configuration: { id: "manager-approver-default", name: configuration.name.trim(), email: configuration.email.trim().toLowerCase(), active: configuration.active, createdAt: now, updatedAt: now } };
}

export function saveManagerApproverConfiguration(input: Pick<ManagerApproverConfiguration, "name" | "email" | "active">, timestamp = new Date().toISOString()): ManagerApproverResult {
  const validated = validateManagerApproverConfiguration(input);
  if (!validated.success) return validated;
  const existing = managerApproverRepository.getAll()[0];
  const configuration = { ...validated.configuration, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
  managerApproverRepository.replace(configuration);
  return { success: true, configuration };
}

export function resolveActiveManagerApprover(): ManagerApproverResult {
  const active = managerApproverRepository.getAll().filter((configuration) => configuration.active);
  if (active.length === 0) return { success: false, code: "MANAGER_APPROVER_NOT_CONFIGURED", message: "Configure an active Manager approver in Settings before sending this Rental for approval." };
  if (active.length > 1) return { success: false, code: "MANAGER_APPROVER_MULTIPLE_ACTIVE", message: "Only one active Manager approver may be configured." };
  return validateManagerApproverConfiguration(active[0]);
}
