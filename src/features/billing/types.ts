export interface BillingLine {

    id: string;
  
    equipmentId: string;
  
    equipmentName: string;
  
    deurIds: string[];
  
    totalOperatingMinutes: number;
  
    totalOperatingHours: number;
  
    hourlyRate: number;
  
    amount: number;
  
  }
  
  export interface BillingRecord {
  
    id: string;
  
    statementNo: string;
  
    customerId: string;
  
    customerName: string;
  
    projectId: string;
  
    projectName: string;
  
    billingFrom: string;
  
    billingTo: string;
  
    lines: BillingLine[];
  
    totalAmount: number;
  
    remarks: string;
  
    status:
      | "Draft"
      | "Approved"
      | "Invoiced";
  
    createdAt: string;
  
    updatedAt: string;
  
  }