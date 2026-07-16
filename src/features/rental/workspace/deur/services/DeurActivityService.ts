export interface ActivityLog {

    id: string;
  
    activity: string;
  
    startTime: string;
  
    endTime?: string;
  
  }
  
  export class DeurActivityService {
  
    static start(
  
      activity: string
  
    ): ActivityLog {
  
      return {
  
        id: crypto.randomUUID(),
  
        activity,
  
        startTime: new Date().toISOString(),
  
      };
  
    }
  
    static end(
  
      log: ActivityLog
  
    ): ActivityLog {
  
      return {
  
        ...log,
  
        endTime: new Date().toISOString(),
  
      };
  
    }
  
  }