export type RentalEventType =
  | "Contract Created"
  | "Contract Updated"
  | "Equipment Assigned"
  | "Equipment Replaced"
  | "Operator Assigned"
  | "Operator Replaced"
  | "Mobilization Started"
  | "Arrived At Site"
  | "Operation Started"
  | "Operation Stopped"
  | "Idle Started"
  | "Meal Break Started"
  | "Corrective Maintenance Started"
  | "Preventive Maintenance Started"
  | "Demobilization Started"
  | "Shift Closed"
  | "Customer Acknowledged"
  | "Billing Generated"
  | "Invoice Generated"
  | "Payment Received"
  | "Contract Closed";

export type RentalEventSource =
  | "Contract"
  | "Assignment"
  | "DEUR"
  | "Billing"
  | "Invoice"
  | "Collection"
  | "System";

export interface RentalEvent {
  id: string;

  rentalId: string;

  assignmentId?: string;

  deurId?: string;

  timestamp: string;

  type: RentalEventType;

  source: RentalEventSource;

  title: string;

  description?: string;

  performedBy?: string;

  metadata?: Record<string, unknown>;
}