import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";

export const canonicalBookingStatuses = ["Draft", "Assigned", "Reserved", "Released", "Active", "Returned", "Closed", "Cancelled"] as const;
export type CanonicalBookingStatus = typeof canonicalBookingStatuses[number];
export type CanonicalBookingSort = "createdAt" | "dateOut" | "expectedReturn" | "rentalStatus";

export interface CanonicalBookingListItem {
  rentalId: string;
  rentalNumber?: string;
  rentalStatus: CanonicalBookingStatus;
  rentalEquipmentLineId: string;
  equipmentId: string;
  equipmentAssetNumber?: string;
  equipmentName?: string;
  customerId?: string;
  customerName?: string;
  projectId?: string;
  projectName?: string;
  dateOut: string;
  expectedReturn?: string;
  actualReturn?: string;
  createdAt: string;
  reservedAt?: string;
  releasedAt?: string;
  activatedAt?: string;
  returnedAt?: string;
  closedAt?: string;
  cancelledAt?: string;
}

export interface CanonicalBookingSearchInput {
  status?: CanonicalBookingStatus;
  customerId?: string;
  projectId?: string;
  equipmentId?: string;
  rentalNumberSearch?: string;
  sort?: CanonicalBookingSort;
  ascending?: boolean;
  offset?: number;
  limit?: number;
}

export interface CanonicalBookingPage {
  rows: readonly CanonicalBookingListItem[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface CanonicalBookingReadRepository {
  searchCanonicalBookingRows(input?: CanonicalBookingSearchInput): Promise<RepositoryResult<CanonicalBookingPage>>;
}

/** Local compatibility mode intentionally has no Rental-backed Booking projection. */
export class LocalCanonicalBookingReadRepository implements CanonicalBookingReadRepository {
  async searchCanonicalBookingRows(): Promise<RepositoryResult<CanonicalBookingPage>> {
    return repositoryFailure("REMOTE_BOOKING_READ_UNAVAILABLE", "Canonical Rental Bookings are available only in remote mode.", {
      context: { repository: "CanonicalBooking" }, recoverability: "USER_ACTION_REQUIRED", recommendedAction: "Use the existing local Assignment compatibility view.",
    });
  }
}

export function emptyCanonicalBookingPage(limit = 25): RepositoryResult<CanonicalBookingPage> {
  return repositorySuccess({ rows: [], totalCount: 0, offset: 0, limit, hasMore: false });
}
