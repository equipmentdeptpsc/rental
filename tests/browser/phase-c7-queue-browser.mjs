import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 4179;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(), stdio: ["ignore", "ignore", "ignore"], windowsHide: true,
});
const profile = await mkdtemp(join(tmpdir(), "equipment-rental-c7-browser-"));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(origin)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("C7_BROWSER_HARNESS_SERVER_UNAVAILABLE");
}

const command = (id, line, createdAt) => ({
  id, tenantId: "TENANT-UAT-C7-BROWSER", userId: "user-browser", operatorId: "operator-browser",
  rentalId: "rental-browser", rentalLineId: line, deurId: `deur-${line}`,
  commandType: "DEUR_START_OR_CHANGE_ACTIVITY", payload: { action: "START_OPERATION" },
  idempotencyKey: `idem-${id}`, clientCreatedAt: createdAt, attemptCount: 0,
  status: "PENDING", schemaVersion: 1,
});

async function openProfile() {
  const context = await chromium.launchPersistentContext(profile, { headless: true });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  return { context, page };
}

try {
  await waitForServer();
  let browser = await openProfile();
  const initial = await browser.page.evaluate(async ({ commands }) => {
    const { IndexedDbOfflineOperationalCommandQueue } = await import("/src/features/rental/realtime/IndexedDbOfflineOperationalCommandQueue.ts");
    const queue = new IndexedDbOfflineOperationalCommandQueue(indexedDB, "equipment-rental.c7-browser-certification");
    for (const item of commands) await queue.enqueue(item);
    const count = (await queue.listPending({ tenantId: "TENANT-UAT-C7-BROWSER", operatorId: "operator-browser" })).length;
    queue.close();
    return count;
  }, { commands: [command("TENANT-UAT-C7-BROWSER-1", "line-a", "2026-07-30T00:00:01.000Z"), command("TENANT-UAT-C7-BROWSER-2", "line-a", "2026-07-30T00:00:02.000Z"), command("TENANT-UAT-C7-BROWSER-3", "line-b", "2026-07-30T00:00:01.500Z")] });
  if (initial !== 3) throw new Error("C7_BROWSER_ENQUEUE_FAILED");
  await browser.context.close();

  browser = await openProfile();
  const afterRestart = await browser.page.evaluate(async () => {
    const { IndexedDbOfflineOperationalCommandQueue } = await import("/src/features/rental/realtime/IndexedDbOfflineOperationalCommandQueue.ts");
    const queue = new IndexedDbOfflineOperationalCommandQueue(indexedDB, "equipment-rental.c7-browser-certification");
    const ids = (await queue.listPending({ tenantId: "TENANT-UAT-C7-BROWSER", operatorId: "operator-browser" })).map((item) => item.id);
    queue.close(); return ids;
  });
  if (afterRestart.length !== 3) throw new Error("C7_BROWSER_RESTART_DURABILITY_FAILED");
  if (afterRestart.indexOf("TENANT-UAT-C7-BROWSER-1") >= afterRestart.indexOf("TENANT-UAT-C7-BROWSER-2")) throw new Error("C7_BROWSER_AGGREGATE_ORDER_FAILED");

  const secondPage = await browser.context.newPage();
  await secondPage.goto(origin, { waitUntil: "domcontentloaded" });
  const claim = (page, owner) => page.evaluate(async ({ owner }) => {
    const { IndexedDbOfflineOperationalCommandQueue } = await import("/src/features/rental/realtime/IndexedDbOfflineOperationalCommandQueue.ts");
    const queue = new IndexedDbOfflineOperationalCommandQueue(indexedDB, "equipment-rental.c7-browser-certification");
    const result = await queue.claimForReplay("TENANT-UAT-C7-BROWSER-1", owner, "2026-07-30T00:01:00.000Z", "2026-07-30T00:00:00.000Z");
    queue.close(); return Boolean(result);
  }, { owner });
  const claims = await Promise.all([claim(browser.page, "tab-a"), claim(secondPage, "tab-b")]);
  if (claims.filter(Boolean).length !== 1) throw new Error("C7_BROWSER_MULTI_TAB_CLAIM_FAILED");

  const cleanup = await browser.page.evaluate(async () => {
    const { IndexedDbOfflineOperationalCommandQueue } = await import("/src/features/rental/realtime/IndexedDbOfflineOperationalCommandQueue.ts");
    const queue = new IndexedDbOfflineOperationalCommandQueue(indexedDB, "equipment-rental.c7-browser-certification");
    const removed = await queue.clearTestFixtures({ tenantId: "TENANT-UAT-C7-BROWSER", operatorId: "operator-browser" }, "TENANT-UAT-C7-BROWSER-");
    const residue = (await queue.listPending({ tenantId: "TENANT-UAT-C7-BROWSER", operatorId: "operator-browser" })).length;
    queue.close(); return { removed, residue };
  });
  if (cleanup.removed !== 3 || cleanup.residue !== 0) throw new Error("C7_BROWSER_CLEANUP_FAILED");

  await browser.page.evaluate(async ({ item }) => {
    const { IndexedDbOfflineOperationalCommandQueue } = await import("/src/features/rental/realtime/IndexedDbOfflineOperationalCommandQueue.ts");
    const queue = new IndexedDbOfflineOperationalCommandQueue(indexedDB, "equipment-rental.c7-browser-certification");
    await queue.enqueue(item); queue.close();
    localStorage.setItem("c7-browser-execution-count", "0");
  }, { item: command("TENANT-UAT-C7-BROWSER-replay", "line-a", "2026-07-30T00:00:04.000Z") });
  const replay = (page, owner) => page.evaluate(async ({ owner }) => {
    const { IndexedDbOfflineOperationalCommandQueue } = await import("/src/features/rental/realtime/IndexedDbOfflineOperationalCommandQueue.ts");
    const { OfflineCommandReplayEngine } = await import("/src/features/rental/realtime/OfflineCommandReplayEngine.ts");
    const { BrowserReplayCoordinator } = await import("/src/features/rental/realtime/BrowserReplayCoordinator.ts");
    const queue = new IndexedDbOfflineOperationalCommandQueue(indexedDB, "equipment-rental.c7-browser-certification");
    const engine = new OfflineCommandReplayEngine(queue, {
      execute: async () => {
        const count = Number(localStorage.getItem("c7-browser-execution-count") ?? "0");
        localStorage.setItem("c7-browser-execution-count", String(count + 1));
        return { success: true };
      },
    }, new BrowserReplayCoordinator(navigator.locks), owner);
    const report = await engine.replay(
      { tenantId: "TENANT-UAT-C7-BROWSER", operatorId: "operator-browser" },
      { tenantId: "TENANT-UAT-C7-BROWSER", userId: "user-browser", operatorId: "operator-browser", authenticated: true, assignmentValid: true },
    );
    queue.close(); return report;
  }, { owner });
  const replayReports = await Promise.all([replay(browser.page, "replay-tab-a"), replay(secondPage, "replay-tab-b")]);
  const executionCount = await browser.page.evaluate(() => Number(localStorage.getItem("c7-browser-execution-count") ?? "0"));
  if (executionCount !== 1 || replayReports.filter((report) => report?.succeeded === 1).length !== 1) throw new Error("C7_BROWSER_SINGLE_REPLAY_FAILED");
  const finalResidue = await browser.page.evaluate(async () => {
    const { IndexedDbOfflineOperationalCommandQueue } = await import("/src/features/rental/realtime/IndexedDbOfflineOperationalCommandQueue.ts");
    const queue = new IndexedDbOfflineOperationalCommandQueue(indexedDB, "equipment-rental.c7-browser-certification");
    const count = (await queue.listPending({ tenantId: "TENANT-UAT-C7-BROWSER", operatorId: "operator-browser" })).length;
    queue.close(); localStorage.removeItem("c7-browser-execution-count"); return count;
  });
  if (finalResidue !== 0) throw new Error("C7_BROWSER_REPLAY_RESIDUE_FAILED");
  await browser.context.close();
  console.log(JSON.stringify({ enqueue: initial, restart: afterRestart.length, ordering: "passed", successfulClaims: claims.filter(Boolean).length, replayExecutions: executionCount, cleanup: cleanup.removed, residue: finalResidue }));
} finally {
  server.kill();
}
