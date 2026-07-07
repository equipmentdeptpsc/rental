import type {
    DeurActivityLog,
    DeurRecord,
  } from "../types";
  
  export type DeurEventType =
    | "Arrived at Site"
    | "Daily Report Completed"
    | "Customer Acknowledged"
    | "Customer Rejected"
    | "Returned to Yard";
  
  export interface DeurEvent {
    id: string;
  
    type: DeurEventType;
  
    timestamp: string;
  
    userId?: string;
  
    remarks?: string;
  }
  
  export interface DeurSession {
    deur: DeurRecord;
  
    activities: DeurActivityLog[];
  
    events: DeurEvent[];
  }
  
  export function createDeurSession(
    deur: DeurRecord
  ): DeurSession {
    return {
      deur,
  
      activities: deur.logs,
  
      events: [],
    };
  }
  
  export function updateSession(
    session: DeurSession,
    changes: Partial<DeurRecord>
  ): DeurSession {
    return {
      ...session,
  
      deur: {
        ...session.deur,
  
        ...changes,
  
        updatedAt:
          new Date().toISOString(),
      },
    };
  }
  
  export function addEvent(
    session: DeurSession,
    type: DeurEventType,
    userId?: string,
    remarks?: string
  ): DeurSession {
    return {
      ...session,
  
      events: [
        ...session.events,
        {
          id: crypto.randomUUID(),
  
          type,
  
          timestamp:
            new Date().toISOString(),
  
          userId,
  
          remarks,
        },
      ],
    };
  }