export interface NotificationServerConfiguration {
  publicBaseUrl: string;
  resendApiKey: string;
  fromAddress: string;
  uatRecipientOverride?: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing server-only notification configuration: ${name}`);
  return value;
}

export function parseNotificationServerConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): NotificationServerConfiguration {
  const rawBaseUrl = required(environment, "REVIEW_PUBLIC_BASE_URL");
  let url: URL;
  try { url = new URL(rawBaseUrl); }
  catch { throw new Error("REVIEW_PUBLIC_BASE_URL must be a valid absolute URL."); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.hostname.endsWith(".invalid") || url.search || url.hash) {
    throw new Error("REVIEW_PUBLIC_BASE_URL must be a credential-free HTTPS application origin.");
  }
  url.pathname = "/";
  return {
    publicBaseUrl: url.toString(),
    resendApiKey: required(environment, "RESEND_API_KEY"),
    fromAddress: required(environment, "RESEND_FROM_ADDRESS"),
    ...(environment.EMAIL_UAT_RECIPIENT_OVERRIDE?.trim()
      ? { uatRecipientOverride: environment.EMAIL_UAT_RECIPIENT_OVERRIDE.trim() } : {}),
  };
}
