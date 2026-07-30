import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync("src/app/router.tsx", "utf8");
const worker = readFileSync("wrangler.jsonc", "utf8");
const index = readFileSync("index.html", "utf8");
const customer = readFileSync("src/pages/CustomerDeurReview/index.tsx", "utf8");
const manager = readFileSync("src/pages/ManagerDeurReview/index.tsx", "utf8");

describe("Phase C5C.2A public review deployment routes", () => {
  it("publishes credential and credential-free completion routes before authenticated ERP routes", () => {
    for (const route of [
      "/review/deur/:credential", "/review/manager/:credential",
      "/review/deur/completed", "/review/manager/completed",
    ]) expect(router).toContain(`path: "${route}"`);
    expect(router.indexOf('path: "/review/deur/completed"')).toBeLessThan(router.indexOf('path: "/review/deur/:credential"'));
    expect(router.indexOf('path: "/review/manager/completed"')).toBeLessThan(router.indexOf('path: "/review/manager/:credential"'));
    expect(router.indexOf('path: "/review/deur/:credential"')).toBeLessThan(router.indexOf('path: "/"'));
  });

  it("retains the frozen customer and manager action boundaries", () => {
    expect(customer).toContain("Acknowledge");
    expect(customer).toContain("Request Correction");
    expect(customer).not.toContain(">Reject<");
    expect(manager).toContain("Approve");
    expect(manager).toContain("Reject");
    expect(manager).toContain("Request Correction");
    expect(manager).not.toContain(">Acknowledge<");
  });

  it("keeps completed routes stable while consumed credential replays are unavailable", () => {
    for (const page of [customer, manager]) {
      expect(page).toMatch(
        /if \(result\.disposition === "ALREADY_COMPLETED"\) \{\s*setState\("unavailable"\)/,
      );
    }
    expect(router).toContain('path: "/review/deur/completed"');
    expect(router).toContain('path: "/review/manager/completed"');
  });

  it("targets only the isolated UAT Worker with SPA fallback and no-referrer policy", () => {
    expect(worker).toContain('"name": "psc-ed"');
    expect(worker).toContain('"not_found_handling": "single-page-application"');
    expect(index).toContain('<meta name="referrer" content="no-referrer" />');
  });
});
