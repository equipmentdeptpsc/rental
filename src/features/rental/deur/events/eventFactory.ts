import type {
    DeurEvent,
    DeurEventType,
  } from "../models";
  
  export function createEvent(
    type: DeurEventType,
    userId?: string,
    remarks?: string
  ): DeurEvent {
    return {
      id: crypto.randomUUID(),
  
      type,
  
      timestamp:
        new Date().toISOString(),
  
      userId,
  
      remarks,
    };
  }