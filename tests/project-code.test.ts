import { describe, expect, it } from "vitest";
import { generateProjectCode } from "@/features/project/utils/generateProjectCode";
import type { ProjectRecord } from "@/features/project/types";

function project(projectCode: string): ProjectRecord {
  return { id: projectCode, projectCode, projectName: "Test", client: "", location: "", projectManager: "", startDate: "", targetCompletion: "", status: "Planning" };
}

describe("generateProjectCode", () => {
  it("creates sequential unique codes without reusing deleted records", () => {
    expect(generateProjectCode([])).toBe("PRJ-000001");
    expect(generateProjectCode([project("PRJ-000001"), { ...project("PRJ-000003"), deleted: true }])).toBe("PRJ-000004");
  });
});
