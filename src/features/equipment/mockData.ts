import { type Equipment } from './types';

export const mockEquipment: Equipment[] = [
  { id: 'EQ001', name: 'CAT 320 Hydraulic Excavator', type: 'Excavator', status: 'Available', serialNumber: 'EXC-CAT-9921', hourlyRate: 125 },
  { id: 'EQ002', name: 'Toyota 8FGU25 Forklift', type: 'Forklift', status: 'Rented', serialNumber: 'FORK-TOY-4412', hourlyRate: 45 },
  { id: 'EQ003', name: 'Liebherr LTM 1050 Mobile Crane', type: 'Crane', status: 'Maintenance', serialNumber: 'CRAN-LIE-0081', hourlyRate: 275 },
];