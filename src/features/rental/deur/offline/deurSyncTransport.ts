import type { DeurQueueItem } from "./types";
export interface DeurSyncTransportResult { success:boolean; error?:string; conflict?:boolean; classification?:string; retryable?:boolean; }
export interface DeurSyncTransport { push(item:DeurQueueItem):Promise<DeurSyncTransportResult> }
export const NoopDeurSyncTransport:DeurSyncTransport={async push(){return{success:true}}};
