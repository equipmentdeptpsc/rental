/**
 * ==========================================
 * Rental Status
 * ==========================================
 */

import type {
  RentalLifecycleStatus,
} from "@/features/rental/types";

export interface RentalStatusRecord {
  id: string;

  status: RentalLifecycleStatus | "Reserved";

  description: string;

  active: boolean;

  deleted: boolean;

  deletedAt?: number;
}

/**
 * ==========================================
 * Form Model
 * ==========================================
 */

export interface RentalStatusFormValues {
  status: RentalLifecycleStatus | "Reserved";

  description: string;

  active: boolean;
}

/**
 * ==========================================
 * Search Filter
 * ==========================================
 */

export interface RentalStatusFilter {
  keyword: string;

  includeDeleted?: boolean;
}