import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/features/auth/domain/user";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
import { assertMutationPermission } from "@/features/auth/services/assertMutationPermission";
import { recordCollection } from "@/features/rental/collections/collectionService";
import { collectionRepository } from "@/features/rental/collections/repository";

const managementUser: User = {
  id: "management-user",
  username: "management",
  displayName: "Management",
  systemRoles: ["management"],
  status: "active",
  createdAt: "2026-07-28T00:00:00Z",
  updatedAt: "2026-07-28T00:00:00Z",
};

describe("remaining mutation authorization boundaries", () => {
  beforeEach(() => localStorage.clear());

  it("returns a typed denial through AuthorizationService", () => {
    expect(() =>
      assertMutationPermission(managementUser, "assignment.manage"),
    ).toThrow(AuthorizationError);
  });

  it("rejects Collection recording before any persistence write", () => {
    const before = collectionRepository.getAll();

    expect(() =>
      recordCollection({
        statementId: "statement-1",
        mode: "full",
        paymentDate: "2026-07-28",
        referenceNumber: "PAY-1",
        actor: { id: managementUser.id, name: managementUser.displayName },
        authenticatedUser: managementUser,
      }),
    ).toThrow(AuthorizationError);

    expect(collectionRepository.getAll()).toEqual(before);
  });
});
