import { describe, expect, it } from "vitest";

import {
  evaluateAssignmentActivityCodeConfiguration,
  getActiveAssignmentActivityCodeOptions,
} from "@/features/assignment/utils/assignmentActivityCode";
import type { ActivityCodeRecord } from "@/features/masters/activity-code";

const code = (overrides: Partial<ActivityCodeRecord> = {}): ActivityCodeRecord => ({
  id: "ldc",
  activityCode: "LDC",
  description: "LAUCHANCO DEVELOPMENT CORPORATION",
  active: true,
  deleted: false,
  ...overrides,
});

describe("Assignment Activity Code configuration", () => {
  const records = [
    code(),
    code({ id: "scm", activityCode: "SCM", description: "SUPPLY CHAIN MANAGEMENT" }),
    code({ id: "inactive", activityCode: "OLD", active: false }),
    code({ id: "deleted", activityCode: "ARCHIVE", deleted: true }),
  ];

  it("builds readable options from active, non-deleted records only", () => {
    expect(getActiveAssignmentActivityCodeOptions(records)).toEqual([
      { value: "ldc", label: "LDC — LAUCHANCO DEVELOPMENT CORPORATION" },
      { value: "scm", label: "SCM — SUPPLY CHAIN MANAGEMENT" },
    ]);
  });

  it("evaluates configured and missing references", () => {
    expect(evaluateAssignmentActivityCodeConfiguration("ldc", records)).toEqual({
      status: "configured",
      record: records[0],
    });
    expect(evaluateAssignmentActivityCodeConfiguration(undefined, records)).toEqual({
      status: "missing",
      message: "Activity Code not configured",
    });
  });

  it("keeps inactive and deleted references resolvable", () => {
    expect(evaluateAssignmentActivityCodeConfiguration("inactive", records)).toEqual({
      status: "inactive",
      record: records[2],
    });
    expect(evaluateAssignmentActivityCodeConfiguration("deleted", records)).toEqual({
      status: "deleted",
      record: records[3],
    });
  });

  it("reports unknown references without exposing or crashing on the ID", () => {
    expect(evaluateAssignmentActivityCodeConfiguration("unknown-internal-id", records)).toEqual({
      status: "not-found",
      message: "Activity Code not found",
    });
  });
});
