import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import {
  assertSafeSupabaseTestConfiguration,
  readSupabasePhaseC2TestConfiguration,
} from "./support/supabasePhaseC2Harness";
import { executePhaseC4bPrivilegedSql } from "./support/phaseC4bPrivilegedSql";

const configuration = readSupabasePhaseC2TestConfiguration();
const enabled = configuration.enabled && process.env.RUN_PHASE_C12_RETAINED_REVIEW_DIAGNOSTIC === "true";
const tenant = "TENANT-UAT-C12-CUSTOMER-EMAIL-001";

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

describe.skipIf(!enabled)("C12 retained customer-review read-only diagnostic", () => {
  it("traces the exact delivered credential without exposing or consuming it", async () => {
    assertSafeSupabaseTestConfiguration(configuration);
    const readbackKey = process.env.RESEND_READBACK_API_KEY?.trim();
    const expectedBase = process.env.REVIEW_PUBLIC_BASE_URL?.trim();
    if (!readbackKey || !expectedBase) throw new Error("Readback or public review configuration is missing.");

    const sql = `SELECT jsonb_build_object(
      'requestCount', count(*),
      'requestId', min(id::text),
      'status', min(status),
      'outcomes', (SELECT count(*) FROM erp.customer_review_outcomes o WHERE o.company_id='${tenant}'),
      'correctionRequests', (SELECT count(*) FROM erp.customer_correction_requests c WHERE c.company_id='${tenant}'),
      'notificationIntents', (SELECT count(*) FROM erp.notification_outbox n WHERE n.company_id='${tenant}'),
      'providerAttempts', (SELECT count(*) FROM erp.notification_delivery_attempts a WHERE a.company_id='${tenant}'),
      'superseded', bool_or(superseded_at IS NOT NULL),
      'revoked', bool_or(revoked_at IS NOT NULL),
      'consumed', bool_or(consumed_at IS NOT NULL),
      'futureExpiry', bool_and(expires_at > clock_timestamp()),
      'tokenHash', min(token_hash),
      'providerMessageId', (
        SELECT provider_message_id FROM erp.notification_delivery_attempts
        WHERE company_id='${tenant}' AND status='ProviderAccepted'
        ORDER BY completed_at DESC LIMIT 1
      ),
      'deurStatus', (SELECT status FROM erp.deurs WHERE company_id='${tenant}' LIMIT 1),
      'revision', (SELECT coalesce(revision_number,1) FROM erp.deurs WHERE company_id='${tenant}' LIMIT 1),
      'identityMatch', bool_and(
        deur_id=revision_id
        AND rental_id='RENT-UAT-C12-CUSTOMER-EMAIL-001'
        AND rental_equipment_line_id='LINE-UAT-C12-CUSTOMER-EMAIL-001'
        AND deur_id='DEUR-UAT-C12-CUSTOMER-EMAIL-001'
      )
    ) FROM erp.customer_review_requests WHERE company_id='${tenant}';`;
    const output = executePhaseC4bPrivilegedSql(configuration, { tenantIds: [tenant], sql });
    const evidence = JSON.parse(output).rows[0].jsonb_build_object as Record<string, unknown>;
    expect(evidence).toMatchObject({
      requestCount: 1,
      status: "Pending",
      outcomes: 0,
      correctionRequests: 0,
      notificationIntents: 1,
      providerAttempts: 1,
      superseded: false,
      revoked: false,
      consumed: false,
      futureExpiry: true,
      deurStatus: "Submitted",
      revision: 1,
      identityMatch: true,
    });

    const messageId = String(evidence.providerMessageId ?? "");
    const tokenHash = String(evidence.tokenHash ?? "");
    expect(messageId).toBeTruthy();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${readbackKey}` },
    });
    expect(response.status).toBe(200);
    const message = await response.json() as { html?: string; text?: string };
    const content = `${message.html ?? ""}\n${message.text ?? ""}`;
    const matches = [...content.matchAll(/https:\/\/[^\s"'<>]+\/review\/deur\/([0-9a-fA-F]{64})/g)];
    expect(matches.length).toBeGreaterThan(0);
    const deliveredUrl = new URL(decodeHtml(matches[0][0]));
    const credential = matches[0][1];
    const expectedOrigin = new URL(expectedBase).origin;
    const hashMatches = createHash("sha256").update(credential, "utf8").digest("hex") === tokenHash;
    expect(deliveredUrl.origin).toBe(expectedOrigin);
    expect(deliveredUrl.pathname).toBe(`/review/deur/${credential}`);
    expect(deliveredUrl.search).toBe("");
    expect(deliveredUrl.hash).toBe("");
    expect(hashMatches).toBe(true);

    const anonymous = createClient(configuration.url!, configuration.publishableKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const lookup = await anonymous.schema("erp").rpc("get_public_customer_review", {
      command: { token: credential },
    });
    expect(lookup.error).toBeNull();
    expect(lookup.data).toMatchObject({ success: true, disposition: "AVAILABLE" });
    const shell = await fetch(deliveredUrl.origin);
    expect(shell.status).toBe(200);
    const html = await shell.text();
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => new URL(match[1], deliveredUrl.origin));
    expect(scripts.length).toBeGreaterThan(0);
    const bundles = await Promise.all(scripts.map(async (url) => (await fetch(url)).text()));
    const configuredForIsolatedProject = bundles.some((bundle) => bundle.includes(configuration.projectRef!));
    const deployedProjectRefs = [...new Set(bundles.flatMap((bundle) =>
      [...bundle.matchAll(/https:\/\/([a-z]{20})\.supabase\.co/g)].map((match) => match[1]),
    ))];

    console.info(JSON.stringify({
      requestState: "PENDING",
      outcomeCount: 0,
      correctionRequestCount: evidence.correctionRequests,
      notificationIntentCount: evidence.notificationIntents,
      providerAttemptCount: evidence.providerAttempts,
      credentialShapeValid: true,
      deliveredOriginMatchesConfiguredOrigin: true,
      deliveredHashMatchesPersistedHash: hashMatches,
      anonymousLookup: "AVAILABLE",
      deployedBundleTargetsIsolatedProject: configuredForIsolatedProject,
      deployedSupabaseProjectCount: deployedProjectRefs.length,
      deployedBundleHasDifferentProject: deployedProjectRefs.some((ref) => ref !== configuration.projectRef),
    }));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors: unknown[] = [];
    const consoleErrors: unknown[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message); });
    let browserEvidence: Record<string, boolean | number>;
    try {
      const rpcResponse = page.waitForResponse((candidate) =>
        candidate.url().includes("/rest/v1/rpc/get_public_customer_review"),
      );
      const navigation = await page.goto(deliveredUrl.toString(), { waitUntil: "domcontentloaded" });
      const lookupResponse = await rpcResponse;
      await page.getByRole("heading", { name: "Daily Equipment Utilization Report" }).waitFor();
      const pageText = await page.locator("main").innerText();
      const normalizedPageText = pageText.toLowerCase();
      browserEvidence = {
        navigationOk: navigation?.ok() === true,
        anonymousRpcOk: lookupResponse.ok(),
        rentalPresent: pageText.includes("C12-CUSTOMER-EMAIL-001"),
        projectPresent: pageText.includes("C12 Customer Email Project"),
        deurRevisionPresent: pageText.includes("DEUR-2026-000001 R1"),
        equipmentPresent: pageText.includes("C12 Controlled Equipment"),
        assetPresent: pageText.includes("C12-EMAIL-001"),
        operatorPresent: pageText.includes("C12 Controlled Operator"),
        workDatePresent: normalizedPageText.includes("work date"),
        shiftEvidencePresent: normalizedPageText.includes("shift start") && normalizedPageText.includes("shift end"),
        totalsPresent: pageText.includes("Operation:") && pageText.includes("Idle:"),
        acknowledgePresent: await page.getByRole("button", { name: "Acknowledge DEUR" }).count() === 1,
        correctionPresent: await page.getByRole("button", { name: "Request Correction" }).count() === 1,
        companyFieldPresent: normalizedPageText.includes("company"),
        pageErrorCount: pageErrors.length,
        consoleErrorCount: consoleErrors.length,
      };
    } catch {
      throw new Error("Retained-link browser rendering failed without exposing the credential.");
    } finally {
      await browser.close();
    }
    console.info(JSON.stringify({ retainedLinkBrowser: browserEvidence }));
    expect(browserEvidence).toMatchObject({
      navigationOk: true,
      anonymousRpcOk: true,
      rentalPresent: true,
      projectPresent: true,
      deurRevisionPresent: true,
      equipmentPresent: true,
      assetPresent: true,
      operatorPresent: true,
      workDatePresent: true,
      shiftEvidencePresent: true,
      totalsPresent: true,
      acknowledgePresent: true,
      correctionPresent: true,
      pageErrorCount: 0,
      consoleErrorCount: 0,
    });
  }, 60_000);
});
