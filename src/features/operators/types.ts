export interface Operator {
    id: string;
    name: string;
    email: string;
    licenseNumber: string;
    certificationType: 'Heavy Machinery' | 'Forklift' | 'Crane Logistics' | 'None';
    certificationTypes?: Array<'Heavy Machinery' | 'Forklift' | 'Crane Logistics'>;
    status: 'Active' | 'On Leave' | 'Suspended';
    joinedDate: string;
  }
