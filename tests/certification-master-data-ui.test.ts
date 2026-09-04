import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("certification master-data UI boundary", () => {
  it("uses the canonical read and command RPCs without deprecated permissions", () => {
    const repository = readFileSync("src/integrations/supabase/SupabaseCertificationRepository.ts", "utf8");
    const page = readFileSync("src/features/masters/certification-type/pages/CertificationTypesPage.tsx", "utf8");
    expect(repository).toContain("list_certification_types");
    expect(repository).toContain("command_create_certification_type");
    expect(repository).toContain("command_update_certification_type");
    expect(repository).toContain("command_activate_certification_type");
    expect(repository).toContain("command_deactivate_certification_type");
    expect(page).not.toContain("masterData.manage");
    expect(page).not.toContain("Delete");
  });
  it("exposes the nested Settings route with granular read permission", () => {
    const router = readFileSync("src/app/router.tsx", "utf8");
    expect(router).toContain('path: "settings/certification-types"');
    expect(router).toContain('permitted("masterData.read"');
  });
});
