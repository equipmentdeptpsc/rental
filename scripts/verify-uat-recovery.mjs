import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workerConfig = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8").replace(/^\uFEFF/, ""));
if (workerConfig.env?.uat?.name !== "psc-ed-uat" || workerConfig.env?.uat?.vars?.SUPABASE_URL !== "https://jtkctarqbwmqdcewthkn.supabase.co") {
  throw new Error("UAT Worker configuration no longer points to the isolated UAT target.");
}
const requiredAncestors = [
  "c7ccf3ebab6e756794694c516239fae872166290", // certified DEUR reconciliation
  "2129563af7df243c0daee3cb889c801efeb76edb", // approved UAT recovery base
];
const requiredFeatures = [
  ["src/pages/Dashboard/index.tsx", "ManagementTrendChart"],
  ["src/features/dashboard/services/canonicalDashboardRead.ts", "readRentalCollections"],
  ["src/features/booking/components/CanonicalBookingOperationsWorkspace.tsx", "recordNavigation(bookingRentalWorkspacePath"],
  ["src/pages/Equipment/index.tsx", "recordNavigation(`/equipment/"],
  ["src/pages/Rental/index.tsx", "recordNavigation(`/rentals/"],
  ["src/features/rental/components/RentalListPresentation.tsx", "recordNavigation(`/rentals/"],
  ["src/integrations/supabase/readRepositories.ts", "SupabaseCollectionReadRepository"],
  ["supabase/migrations/20261011000200_harden_collections_rental_read_permission.sql", "erp.current_user_has_permission('collections.read')"],
];
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
for (const commit of requiredAncestors) {
  try { execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: root, stdio: "ignore" }); }
  catch { throw new Error(`Required certified UAT ancestor is missing: ${commit}`); }
}
for (const [path, marker] of requiredFeatures) {
  if (!readFileSync(join(root, path), "utf8").includes(marker)) throw new Error(`Recovery feature marker is missing: ${path}`);
}

const dist = join(root, "dist");
if (!existsSync(join(dist, "index.html"))) throw new Error("Build dist/index.html before verifying the recovery release.");
if (process.argv.includes("--require-uat")) {
  const expected = "https://jtkctarqbwmqdcewthkn.supabase.co";
  if (process.env.VITE_SUPABASE_URL !== expected || process.env.VITE_PERSISTENCE_MODE !== "remote" || !(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error("UAT build configuration is incomplete or points outside the isolated UAT project.");
  }
  if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Refusing a UAT recovery manifest from an uncommitted source tree.");
  const runReport = /^\.artifacts\/automation\/runs\/\d{8}T\d{9}Z-\d+-[0-9a-f]{32}\/reports\/(?:git-status|last-deployed-commit)\.txt$/;
  const allowedUntracked = (path) => path.startsWith(".artifacts/automation/reports/") || runReport.test(path) || path === "docs/uat/checkpoints/current.md";
  if (git("ls-files", "--others", "--exclude-standard").split(/\r?\n/).filter(Boolean).some((path) => !allowedUntracked(path))) {
    throw new Error("Unreviewed untracked files are present in the UAT release checkout.");
  }
}
const configKeys = ["UAT_BUILD_PROFILE", "VITE_PERSISTENCE_MODE", ...Object.keys(process.env).filter((key) => key.startsWith("VITE_REMOTE_") && key.endsWith("_ENABLED"))].sort();
const configuration = Object.fromEntries(configKeys.map((key) => [key, process.env[key] ?? null]));
configuration.supabaseProjectRef = process.env.VITE_SUPABASE_URL === "https://jtkctarqbwmqdcewthkn.supabase.co" ? "jtkctarqbwmqdcewthkn" : null;
configuration.publishableKeyPresent = Boolean(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);

const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && entry.name !== "uat-recovery-manifest.json") {
      files.push({ path: relative(dist, path).replaceAll("\\", "/"), sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });
    }
  }
}
collect(dist);
files.sort((a, b) => a.path.localeCompare(b.path));
const candidate = {
  schemaVersion: 1,
  sourceCommit: git("rev-parse", "HEAD"),
  sourceBranch: git("branch", "--show-current"),
  intendedWorker: workerConfig.env.uat.name,
  intendedHostname: "uat.pscequipment.online",
  configuration,
  assets: files,
};
const manifestPath = join(dist, "uat-recovery-manifest.json");
const verifyDeployed = process.argv.includes("--verify-deployed");
const manifest = verifyDeployed ? JSON.parse(readFileSync(manifestPath, "utf8")) : candidate;
if (verifyDeployed) {
  if (JSON.stringify(manifest.assets) !== JSON.stringify(candidate.assets)) {
    throw new Error("Local UAT manifest does not match the current build assets.");
  }
  if (manifest.sourceCommit !== candidate.sourceCommit) {
    const verifierOnlyPaths = new Set(["scripts/verify-uat-recovery.mjs", "tests/uat-recovery-nonpublic-headers.test.ts"]);
    try { execFileSync("git", ["merge-base", "--is-ancestor", manifest.sourceCommit, "HEAD"], { cwd: root, stdio: "ignore" }); }
    catch { throw new Error("Deployed UAT source commit is not an ancestor of this verifier checkout."); }
    const changed = git("diff", "--name-only", manifest.sourceCommit, "HEAD").split(/\r?\n/).filter(Boolean);
    if (git("status", "--porcelain", "--untracked-files=no") || changed.length === 0 || changed.some((path) => !verifierOnlyPaths.has(path))) {
      throw new Error("Deployed UAT source differs by more than the committed verifier correction.");
    }
  }
}
if (!verifyDeployed) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PASS UAT recovery lineage and build manifest (${manifest.sourceCommit.slice(0, 8)}, ${files.length} assets)`);

if (verifyDeployed) {
  const base = "https://uat.pscequipment.online";
  const response = await fetch(`${base}/uat-recovery-manifest.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Deployed manifest unavailable: HTTP ${response.status}`);
  const deployed = await response.json();
  if (deployed.sourceCommit !== manifest.sourceCommit || JSON.stringify(deployed.configuration) !== JSON.stringify(manifest.configuration) || JSON.stringify(deployed.assets) !== JSON.stringify(manifest.assets)) {
    throw new Error("Deployed UAT manifest differs from this source build.");
  }
  const headersConfig = manifest.assets.find((asset) => asset.path === "_headers");
  if (!headersConfig || readFileSync(join(dist, "_headers"), "utf8").replaceAll("\r\n", "\n").trim() !== "/index.html\n  Cache-Control: no-cache\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable") {
    throw new Error("Expected UAT static header configuration is missing or changed.");
  }
  const indexResponse = await fetch(`${base}/index.html`, { cache: "no-store", redirect: "manual" });
  if (indexResponse.status !== 307 || indexResponse.headers.get("cache-control") !== "no-cache") {
    throw new Error("Deployed UAT /index.html does not apply the configured no-cache header.");
  }
  let publicAssets = 0;
  for (const asset of manifest.assets) {
    if (asset.path === "_headers") continue; // Cloudflare consumes this configuration file; it is not publicly served.
    const assetResponse = await fetch(`${base}/${asset.path}`, { cache: "no-store" });
    if (!assetResponse.ok) throw new Error(`Deployed asset unavailable: ${asset.path}`);
    if (asset.path.startsWith("assets/") && assetResponse.headers.get("cache-control") !== "public, max-age=31536000, immutable") {
      throw new Error(`Deployed UAT asset does not apply the configured cache header: ${asset.path}`);
    }
    const digest = createHash("sha256").update(Buffer.from(await assetResponse.arrayBuffer())).digest("hex");
    if (digest !== asset.sha256) throw new Error(`Deployed UAT asset differs: ${asset.path}`);
    publicAssets++;
  }
  console.log(`PASS deployed UAT manifest, _headers configuration, and ${publicAssets} public asset hashes`);
}
