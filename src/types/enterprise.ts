export type { Booking };
export interface Customer {
    id: string;
    name: string;
    companyName: string;
    email: string;
    address: string;
  }
  
  export interface Project {
    id: string;
    name: string;
    location: string;
    clientId: string;
  }
  
  export interface Equipment {
    id: string;
    name: string;
    status: 'Available' | 'Rented/In-Use' | 'Maintenance';
    hourlyRate: number;
    qrCode?: string;
  }
  
  export interface Operator {
    id: string;
    name: string;
    status: string;
  }
  
  export interface Assignment {
    id: string;
    operatorId: string;
    operatorName: string;
    equipmentId: string;
    equipmentName: string;
    hourlyRate: number;
    idlePercent: number;
    opHours: number;
    idleHours: number;
    downHours: number;
    status: string;
    endedAt?: string;
    assignedDate?: string;
    totalBilling?: number;
  }
  
  export interface Booking {
    id: string;
    equipmentId: string;
    equipmentName: string;
    operatorId: string;
    operatorName: string;
    projectName?: string;
    billingType: string;
    hourlyRate: number;
    status: string;
    date?: string;
  }
  
  export interface FieldLog {
    id: string;
    operatorId: string;
    operatorName: string;
    fuelConsumed: number;
    tripsCompleted: number;
    volumeMoved: number;
    remarks: string;
    status: 'Pending' | 'Approved';
  }
  // Concrete value to force the bundler to recognize exports at runtime
export const ENTERPRISE_SCHEMA_VERSION = "1.0.0";

export const DummyBookingPlaceholder: Booking = {
  id: "EX-EMPTY",
  equipmentId: "",
  equipmentName: "",
  operatorId: "",
  operatorName: "",
  billingType: "Hourly",
  hourlyRate: 0,
  status: "Inactive"
};