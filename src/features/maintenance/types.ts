export type MaintenanceStatus =
  | "Scheduled"
  | "In Progress"
  | "Completed";

export interface MaintenanceRecord {
  id: string;

  equipmentId: string;

  maintenanceType: string;

  scheduledReading: number;

  currentReading: number;

  scheduledDate: string;

  completedDate?: string;

  technician: string;

  remarks: string;

  status: MaintenanceStatus;
}