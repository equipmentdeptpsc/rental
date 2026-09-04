import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "@/features/auth/domain/permission";

describe("Milestone 11.2B2 operator permission contract", () => {
  it("includes the existing Catalog 2.0 operator actions used by canonical certification flows", () => {
    expect(ALL_PERMISSIONS).toEqual(expect.arrayContaining(["operator.read", "operator.create", "operator.update"]));
  });
});
