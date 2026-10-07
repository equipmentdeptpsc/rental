import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { getSupabaseBrowserClient } from "@/integrations/supabase/browserClient";
import { SupabaseUatGroupedReviewCertification } from "@/integrations/supabase/SupabaseUatGroupedReviewCertification";

export default function UatSingleBillingCertification() {
  const { user, hasPermission } = useAuth();
  const service = useMemo(() => new SupabaseUatGroupedReviewCertification(getSupabaseBrowserClient({ url: import.meta.env.VITE_SUPABASE_URL, publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY })), []);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<Record<string, unknown> | null>(null); const [error, setError] = useState<string | null>(null);
  const admin = Boolean(user?.systemRoles.includes("system-administrator") && hasPermission("settings.update") && /(^|\.)uat\.pscequipment\.online$|workers\.dev$/.test(window.location.hostname));
  const inspect = async () => { if (busy) return; setBusy(true); setError(null); try { setResult(await service.inspectSingleBillingFixture()); } catch (e) { setError(e instanceof Error ? e.message : "INSPECTION_FAILED"); } finally { setBusy(false); } };
  const provision = async () => { if (busy) return; setBusy(true); setError(null); try { setResult(await service.provisionSingleBillingFixture()); } catch (e) { setError(e instanceof Error ? e.message : "PROVISIONING_FAILED"); } finally { setBusy(false); } };
  if (!admin) return <main className="p-8">UAT System Administrator access is required.</main>;
  return <main className="mx-auto max-w-3xl space-y-6 p-8"><h1 className="text-2xl font-semibold">Isolated UAT Billing Certification — Single Rental</h1><p>Fixture key <code>BILLING_SINGLE_RENTAL_V1</code>. Creates one synthetic rental with acknowledged review and positive billable evidence. It never creates a billing statement, invoice, payment, collection, or email delivery.</p><div className="flex gap-3"><button disabled={busy} onClick={inspect}>Inspect read-only state</button><button disabled={busy} onClick={provision}>Provision exactly once</button></div><p aria-live="polite">{error ?? (result ? JSON.stringify(result) : "Ready")}</p><p>Hard stop: after state READY, create billing separately only with a new explicit authorization.</p></main>;
}
