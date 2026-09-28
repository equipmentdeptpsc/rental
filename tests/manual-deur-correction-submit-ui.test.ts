import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const action = readFileSync(resolve(process.cwd(), "src/features/rental/workspace/deur/SubmitDeurCorrectionAction.tsx"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/features/rental/workspace/deur/DeurPanel.tsx"), "utf8");

describe("hosted correction resubmission action", () => {
  it("submits only an existing manual correction revision", () => {
    expect(action).toContain('deur.creationSource === "MANUAL_WEB"');
    expect(action).toContain('deur.status === "In Progress"');
    expect(action).toContain("deur.revision?.previousRevisionId");
    expect(action).toContain("submitManualDeur");
    expect(action).toContain("The corrected DEUR version could not be read");
    expect(action).not.toContain("createCorrection");
  });

  it("preserves the MANUAL_WEB source required by the hosted workspace", () => {
    const canonical = readFileSync(resolve(process.cwd(), "src/features/rental/deur/services/canonicalDeur.ts"), "utf8");
    expect(canonical).toContain('record.creationSource === "MANUAL_WEB"');
  });

  it("exposes the action in the multi-line selected equipment workflow", () => {
    expect(panel).toContain("SubmitDeurCorrectionAction");
    expect(panel).toContain("renderSelectedDeurAction");
  });
});
