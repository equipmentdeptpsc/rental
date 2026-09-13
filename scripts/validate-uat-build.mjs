const expectedProjectRef = "jtkctarqbwmqdcewthkn";
const required = ["VITE_SUPABASE_URL"];
const expectedFlags = {
  VITE_PERSISTENCE_MODE: "remote",
  VITE_REMOTE_RENTAL_CREATE_ENABLED: "true",
  VITE_REMOTE_RENTAL_CANCEL_ENABLED: "true",
  VITE_REMOTE_ASSIGNMENT_CREATE_ENABLED: "true",
  VITE_REMOTE_ASSIGNMENT_CANCEL_ENABLED: "true",
  VITE_REMOTE_OPERATOR_CREATE_ENABLED: "true",
  VITE_REMOTE_OPERATIONAL_WRITES_ENABLED: "false",
};
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const supportedPublishableKey = /^(?:sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(publishableKey ?? "");
const missing = required.filter((key) => !process.env[key]?.trim());
const invalidFlags = Object.entries(expectedFlags).filter(([key, expected]) => process.env[key] !== expected);
if (!publishableKey) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY");
else if (!supportedPublishableKey) missing.push("a supported Supabase publishable-key shape");
if (missing.length || invalidFlags.length) {
  const invalid = invalidFlags.map(([key, expected]) => `${key} must be ${expected}`).join(", ");
  console.error(`UAT build configuration invalid: ${missing.length ? `missing ${missing.join(", ")}` : invalid}.`);
  process.exit(1);
}
try {
  const url = new URL(process.env.VITE_SUPABASE_URL);
  if (url.protocol !== "https:" || url.hostname !== `${expectedProjectRef}.supabase.co`) throw new Error();
} catch {
  console.error(`UAT build configuration invalid: VITE_SUPABASE_URL must target ${expectedProjectRef}.supabase.co over HTTPS.`);
  process.exit(1);
}
console.log("PASS UAT build configuration");
