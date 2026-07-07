import type { RentalRecord } from "../types";

export interface CreateRentalRequest {
  rental: RentalRecord;
}

export interface UpdateRentalRequest {
  rental: RentalRecord;
}

export interface CloseRentalRequest {
  rentalId: string;

  actualReturn: string;

  remarks?: string;
}