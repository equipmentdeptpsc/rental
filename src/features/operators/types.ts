export interface Operator {
    id: string;
    name: string;
    email: string;
    licenseNumber: string;
    certificationType: 'Heavy Machinery' | 'Forklift' | 'Crane Logistics' | 'None';
    status: 'Active' | 'On Leave' | 'Suspended';
    joinedDate: string;
  }