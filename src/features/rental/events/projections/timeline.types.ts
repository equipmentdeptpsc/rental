import type { RentalEventType } from "../types";

export interface TimelineItem {
  id: string;

  timestamp: string;

  title: string;

  description?: string;

  type: RentalEventType;

  source: string;

  status:
    | "Completed"
    | "Pending"
    | "Information";

  metadata?: Record<string, unknown>;
}