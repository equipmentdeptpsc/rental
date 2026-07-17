export type DeurQueueOperation = "create" | "update" | "delete" | "submit" | "acknowledge" | "reject" | "reopen";
export type DeurQueueStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";
export interface DeurQueueItem { id:string; aggregateId:string; aggregateType:string; operation:DeurQueueOperation; payload:unknown; createdAt:string; retryCount:number; status:DeurQueueStatus; error?:string; }
