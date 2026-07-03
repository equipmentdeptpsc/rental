export interface ProjectRecord {
    id: string;
  
    projectCode: string;
  
    projectName: string;
  
    client: string;
  
    location: string;
  
    projectManager: string;
  
    startDate: string;
  
    targetCompletion: string;
  
    status:
      | "Planning"
      | "Active"
      | "Completed"
      | "On Hold";
  }