import type {
    RentalEvent,
    RentalEventSource,
    RentalEventType,
  } from "./types";
  
  export interface CreateRentalEventParams {
    rentalId: string;
  
    type: RentalEventType;
  
    source: RentalEventSource;
  
    title: string;
  
    description?: string;
  
    assignmentId?: string;
  
    deurId?: string;
  
    performedBy?: string;
  
    metadata?: Record<string, unknown>;
  }
  
  export function createRentalEvent(
    params: CreateRentalEventParams
  ): RentalEvent {
    return {
      id: crypto.randomUUID(),
  
      rentalId: params.rentalId,
  
      assignmentId: params.assignmentId,
  
      deurId: params.deurId,
  
      timestamp: new Date().toISOString(),
  
      type: params.type,
  
      source: params.source,
  
      title: params.title,
  
      description: params.description,
  
      performedBy: params.performedBy,
  
      metadata: params.metadata,
    };
  }