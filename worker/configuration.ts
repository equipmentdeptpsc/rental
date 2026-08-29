export interface WorkerAssetsBinding { fetch(request: Request): Promise<Response> }
export interface RateLimitBinding { limit(input:{key:string}):Promise<{success:boolean}> }

export interface GroupedReviewWorkerEnvironment {
  ASSETS: WorkerAssetsBinding;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_UAT_RECIPIENT_OVERRIDE?: string;
  GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1?: string;
  REVIEW_PUBLIC_BASE_URL?: string;
  RESEND_FROM_ADDRESS?: string;
  SCHEDULER_JOB_CRON?: string;
  NOTIFICATION_JOB_CRON?: string;
  NOTIFICATION_WORKER_BATCH_LIMIT?: string;
  SCHEDULER_BATCH_LIMIT?: string;
  ENABLE_UAT_RECIPIENT_OVERRIDE_VERIFIER?: string;
  ENABLE_UAT_SYNTHETIC_PROVISIONER?: string;
  USERNAME_LOGIN_ALLOWED_ORIGIN?: string;
  USERNAME_LOGIN_NETWORK_BURST?: RateLimitBinding;
  USERNAME_LOGIN_NETWORK_SUSTAINED?: RateLimitBinding;
  USERNAME_LOGIN_IDENTIFIER_BURST?: RateLimitBinding;
  USERNAME_LOGIN_IDENTIFIER_SUSTAINED?: RateLimitBinding;
}

export type ScheduledJob = "DAILY_GROUPED_REVIEW_SCHEDULER" | "NOTIFICATION_RETRY_WORKER";

function required(environment: GroupedReviewWorkerEnvironment, name: keyof GroupedReviewWorkerEnvironment): string {
  const value=environment[name];
  if(typeof value!=="string"||!value.trim())throw new Error(`Missing Worker configuration: ${name}`);
  return value.trim();
}

export interface ParsedWorkerConfiguration {
  supabaseUrl:string;supabaseServiceRoleKey:string;supabasePublishableKey:string;resendApiKey:string;encryptionKey:Buffer;
  publicBaseUrl:string;fromAddress:string;uatRecipientOverride?:string;notificationBatchLimit:number;schedulerBatchLimit:number;
}

export function parseWorkerConfiguration(environment:GroupedReviewWorkerEnvironment,job:ScheduledJob):ParsedWorkerConfiguration{
 const supabaseUrl=required(environment,"SUPABASE_URL");let supabase:URL;
 try{supabase=new URL(supabaseUrl);}catch{throw new Error("SUPABASE_URL must be a valid absolute URL.");}
 if(supabase.protocol!=="https:"||supabase.username||supabase.password)throw new Error("SUPABASE_URL must be credential-free HTTPS.");
 const encoded=required(environment,"GROUPED_REVIEW_DELIVERY_ENCRYPTION_KEY_V1");const encryptionKey=Buffer.from(encoded,"base64");
 if(encryptionKey.length!==32||encryptionKey.toString("base64")!==encoded)throw new Error("Grouped-review encryption key must be canonical base64 for 32 bytes.");
 const publicBaseUrl=required(environment,"REVIEW_PUBLIC_BASE_URL");let publicUrl:URL;
 try{publicUrl=new URL(publicBaseUrl);}catch{throw new Error("REVIEW_PUBLIC_BASE_URL must be a valid absolute URL.");}
 if(publicUrl.protocol!=="https:"||publicUrl.username||publicUrl.password||publicUrl.search||publicUrl.hash)throw new Error("REVIEW_PUBLIC_BASE_URL must be a credential-free HTTPS origin.");
 const limit=Number(environment.NOTIFICATION_WORKER_BATCH_LIMIT??"10");
 if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error("NOTIFICATION_WORKER_BATCH_LIMIT must be between 1 and 50.");
 const rawOverride=environment.EMAIL_UAT_RECIPIENT_OVERRIDE?.trim();const uatRecipientOverride=rawOverride?.toLowerCase();
 if(rawOverride&&(rawOverride!==uatRecipientOverride||/[\r\n]/.test(rawOverride)||!/^\S+@\S+\.\S+$/.test(rawOverride)))throw new Error("EMAIL_UAT_RECIPIENT_OVERRIDE must be a normalized header-safe email address.");
 const publicKey=required(environment,"SUPABASE_PUBLISHABLE_KEY");
 if(publicKey&&(/\s/.test(publicKey)||!(publicKey.startsWith("sb_publishable_")||publicKey.split(".").length===3)))throw new Error("SUPABASE_PUBLISHABLE_KEY must be a browser-safe Supabase publishable or anon key.");
 return{supabaseUrl:supabase.toString(),supabaseServiceRoleKey:required(environment,"SUPABASE_SERVICE_ROLE_KEY"),supabasePublishableKey:publicKey,
  resendApiKey:job==="NOTIFICATION_RETRY_WORKER"?required(environment,"RESEND_API_KEY"):environment.RESEND_API_KEY?.trim()??"",
  encryptionKey,publicBaseUrl:publicUrl.toString(),fromAddress:job==="NOTIFICATION_RETRY_WORKER"?required(environment,"RESEND_FROM_ADDRESS"):environment.RESEND_FROM_ADDRESS?.trim()??"",...(uatRecipientOverride?{uatRecipientOverride}:{}),
  notificationBatchLimit:limit,schedulerBatchLimit:(()=>{const value=Number(environment.SCHEDULER_BATCH_LIMIT??"25");if(!Number.isInteger(value)||value<1||value>100)throw new Error("SCHEDULER_BATCH_LIMIT must be between 1 and 100.");return value;})()};
}

export function selectScheduledJob(cron:string,environment:GroupedReviewWorkerEnvironment):ScheduledJob{
 if(environment.SCHEDULER_JOB_CRON&&cron===environment.SCHEDULER_JOB_CRON)return"DAILY_GROUPED_REVIEW_SCHEDULER";
 if(environment.NOTIFICATION_JOB_CRON&&cron===environment.NOTIFICATION_JOB_CRON)return"NOTIFICATION_RETRY_WORKER";
 throw new Error("Scheduled invocation does not match a configured job.");
}
