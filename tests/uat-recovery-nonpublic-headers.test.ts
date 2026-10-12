import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const verifier = readFileSync("scripts/verify-uat-recovery.mjs", "utf8");

describe("UAT deployed asset verification", () => {
  it("retains _headers in local and deployed manifest integrity checks", () => {
    expect(verifier).toContain('files.push({ path: relative(dist, path)');
    expect(verifier).toContain('JSON.stringify(manifest.assets) !== JSON.stringify(candidate.assets)');
    expect(verifier).toContain('JSON.stringify(deployed.assets) !== JSON.stringify(manifest.assets)');
    expect(verifier).toContain('asset.path === "_headers"');
  });

  it("skips only the non-public _headers URL and checks both live rules", () => {
    expect(verifier).toContain('if (asset.path === "_headers") continue;');
    expect(verifier).toContain('fetch(`${base}/index.html`, { cache: "no-store", redirect: "manual" })');
    expect(verifier).toContain('indexResponse.headers.get("cache-control") !== "no-cache"');
    expect(verifier).toContain('assetResponse.headers.get("cache-control") !== "public, max-age=31536000, immutable"');
    expect(verifier).toContain('if (digest !== asset.sha256)');
  });

  it("allows an undeployed verifier correction only when the deployed release is its ancestor", () => {
    expect(verifier).toContain('manifest.sourceCommit, "HEAD"');
    expect(verifier).toContain('changed.some((path) => !verifierOnlyPaths.has(path))');
    expect(verifier).toContain('git("status", "--porcelain", "--untracked-files=no")');
  });
});
