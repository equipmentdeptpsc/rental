import type { Operator } from './types';

export const mockOperators: Operator[] = [
  {
    id: 'OP001',
    name: 'Alex Rivera',
    email: 'alex.rivera@equipmentdept.com',
    licenseNumber: 'LIC-2024-8932',
    certificationType: 'Heavy Machinery',
    status: 'Active',
    joinedDate: '2024-03-15',
  },
  {
    id: 'OP002',
    name: 'Sarah Chen',
    email: 'sarah.chen@equipmentdept.com',
    licenseNumber: 'LIC-2023-4110',
    certificationType: 'Crane Logistics',
    status: 'On Leave',
    joinedDate: '2023-08-22',
  },
  {
    id: 'OP003',
    name: 'Marcus Vance',
    email: 'marcus.vance@equipmentdept.com',
    licenseNumber: 'LIC-2025-0071',
    certificationType: 'Forklift',
    status: 'Suspended',
    joinedDate: '2025-01-10',
  },
];