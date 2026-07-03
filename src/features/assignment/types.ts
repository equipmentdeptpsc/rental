export interface AssignmentRecord {
    id: string;
  
    equipmentId: string;
  
    operatorId: string;
  
    projectId: string;
  
    assignedDate: string;
  
    releasedDate?: string;
  
    status:
      | "Active"
      | "Completed";
  }