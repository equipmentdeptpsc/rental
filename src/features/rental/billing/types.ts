export interface BillingLine {
    id: string;
  
    deurId: string;
  
    workDate: string;
  
    activity: string;
  
    costCode?: string;
  
    description: string;
  
    operatorName: string;
  
    operatingHours: number;
  
    actualHours: number;
  
    hourlyRate: number;
  
    amount: number;
  }
  
  export type BillingStatus =
    | "Draft"
    | "Approved"
    | "Invoiced"
    | "Paid";
  
  export interface BillingStatement {
    id: string;
  
    billingNo: string;
  
    rentalId: string;
  
    equipmentId: string;
  
    customerId: string;
  
    projectId: string;
  
    billingPeriodFrom: string;
  
    billingPeriodTo: string;
  
    generatedDate: string;
  
    lines: BillingLine[];
  
    totalOperatingHours: number;
  
    totalActualHours: number;
  
    subtotal: number;
  
    vat: number;
  
    grandTotal: number;
  
    /**
     * Financial lock.
     * Once approved,
     * billing lines can
     * no longer be edited.
     */
    locked: boolean;
  
    status: BillingStatus;
  }