export interface ContractSummary {
  contractNo: string;

  customerName: string;

  projectName: string;

  projectLocation: string;

  rentalType: string;

  billingMethod: string;

  contractStatus: string;

  contractStart: string;

  contractEnd: string;

  totalDays: number;

  daysRemaining: number;
}

export interface EquipmentAssignmentSummary {
  equipmentId: string;

  assetNo: string;

  equipmentName: string;

  equipmentStatus: string;
}

export interface OperatorAssignmentSummary {
  operatorId: string;

  operatorName: string;

  operatorStatus: string;
}

export interface TodayOperationsSummary {
  currentStatus: string;

  currentActivity: string;

  operator: string;

  activityStarted: string;

  operatingMinutes: number;

  idleMinutes: number;

  mealBreakMinutes: number;

  correctiveMaintenanceMinutes: number;

  preventiveMaintenanceMinutes: number;

  endOfShiftSubmitted: boolean;
}

export interface FinancialSummary {
  operatingCharges: number;

  idleCharges: number;

  mobilizationCharges: number;

  demobilizationCharges: number;

  adjustments: number;

  subtotal: number;

  invoiced: number;

  collected: number;

  outstanding: number;
}

export interface TimelineEvent {
  id: string;

  dateTime: string;

  description: string;
}

export interface AlertItem {
  id: string;

  severity:
    | "info"
    | "warning"
    | "critical";

  message: string;
}

export interface RentalOverviewModel {
  contract: ContractSummary;

  equipment: EquipmentAssignmentSummary;

  operator: OperatorAssignmentSummary;

  today: TodayOperationsSummary;

  financial: FinancialSummary;

  timeline: TimelineEvent[];

  alerts: AlertItem[];
}