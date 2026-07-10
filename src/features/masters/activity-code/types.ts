export interface ActivityCodeRecord {

    id: string;
  
    activityCode: string;
  
    description: string;
  
    active: boolean;
  
    remarks?: string;
  
    deleted: boolean;
  
    deletedAt?: number;
  
  }