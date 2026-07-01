export interface Equipment {
    id: string;
    name: string;
    type: 'Excavator' | 'Forklift' | 'Crane' | 'Other';
    status: 'Available' | 'Rented' | 'Maintenance';
    serialNumber: string;
    hourlyRate: number;
  }