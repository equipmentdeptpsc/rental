export interface DailyLogRecord {
    id: string;
  
    equipmentId: string;
  
    operatorId: string;
  
    projectId: string;
  
    date: string;
  
    startReading: number;
  
    endReading: number;
  
    workingHours: number;
  
    remarks: string;
  }