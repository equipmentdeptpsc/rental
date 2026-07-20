export interface ActivityCodeRecord {

    id: string;
  
    activityCode: string;
  
    description: string;
  
    active: boolean;

    sortOrder?: number;

    createdAt?: string;

    updatedAt?: string;
  
    remarks?: string;
  
    deleted: boolean;
  
    deletedAt?: number;
  
  }
