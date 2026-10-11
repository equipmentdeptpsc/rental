const expectedProjectRef = "jtkctarqbwmqdcewthkn";
const required = ["VITE_SUPABASE_URL"];
const profile = process.env.UAT_BUILD_PROFILE?.trim() || "manual-deur";
const profileRequirements = {
  "manual-deur": {
    VITE_PERSISTENCE_MODE: "remote",
    VITE_REMOTE_OPERATIONAL_WRITES_ENABLED: "false",
    VITE_REMOTE_MANUAL_DEUR_CREATE_ENABLED: "true",
    VITE_REMOTE_MANUAL_DEUR_RECORD_ENABLED: "true",
    VITE_REMOTE_DEUR_CORRECTION_ENABLED: "true",
  },
  operations: {
    VITE_PERSISTENCE_MODE: "remote",
    VITE_REMOTE_OPERATIONAL_WRITES_ENABLED: "false",
    VITE_REMOTE_CUSTOMER_CREATE_ENABLED: "true",
    VITE_REMOTE_PROJECT_CREATE_ENABLED: "true",
    VITE_REMOTE_PROJECT_CUSTOMER_LINK_ENABLED: "true",
    VITE_REMOTE_EQUIPMENT_CREATE_ENABLED: "true",
    VITE_REMOTE_OPERATOR_CREATE_ENABLED: "true",
    VITE_REMOTE_ASSIGNMENT_CREATE_ENABLED: "true",
    VITE_REMOTE_ASSIGNMENT_CANCEL_ENABLED: "true",
    VITE_REMOTE_RENTAL_CREATE_ENABLED: "true",
    VITE_REMOTE_RENTAL_COMMERCIAL_TERMS_ENABLED: "true",
    VITE_REMOTE_RENTAL_APPROVAL_ENABLED: "true",
    VITE_REMOTE_RENTAL_RESERVE_ENABLED: "true",
    VITE_REMOTE_RENTAL_RELEASE_ENABLED: "true",
    VITE_REMOTE_RENTAL_ACTIVATE_ENABLED: "true",
    VITE_REMOTE_RENTAL_RETURN_ENABLED: "true",
    VITE_REMOTE_RENTAL_CANCEL_ENABLED: "true",
    VITE_REMOTE_RENTAL_LINE_RESERVE_ENABLED: "true",
    VITE_REMOTE_RENTAL_LINE_RELEASE_ENABLED: "true",
    VITE_REMOTE_RENTAL_LINE_ACTIVATE_ENABLED: "true",
    VITE_REMOTE_RENTAL_LINE_CANCEL_ENABLED: "true",
    VITE_REMOTE_RENTAL_LINE_RETURN_ENABLED: "true",
    VITE_REMOTE_RENTAL_LINE_ASSIGNMENT_ENABLED: "true",
    VITE_REMOTE_RENTAL_CLOSE_ENABLED: "true",
    VITE_REMOTE_MANUAL_DEUR_CREATE_ENABLED: "true",
    VITE_REMOTE_MANUAL_DEUR_RECORD_ENABLED: "true",
    VITE_REMOTE_DEUR_CORRECTION_ENABLED: "true",
    VITE_REMOTE_CUSTOMER_REVIEW_CREATE_ENABLED: "true",
    VITE_REMOTE_BILLING_FINANCIAL_ENABLED: "true",
  },
};
const expectedFlags = profileRequirements[profile];
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const supportedPublishableKey = /^(?:sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(publishableKey ?? "");
const missing = required.filter((key) => !process.env[key]?.trim());
if (!expectedFlags) {
  console.error(`UAT build configuration invalid: unsupported UAT_BUILD_PROFILE ${profile}.`);
  process.exit(1);
}
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
