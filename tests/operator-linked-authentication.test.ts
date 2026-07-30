import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import Header from "@/app/Header";
import {
  ApplicationDependencyProvider,
  createLocalApplicationDependencies,
  type ApplicationDependencies,
} from "@/app/composition";
import { storage } from "@/core/storage";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import type { User } from "@/features/auth/domain/user";
import {
  AUTH_SESSION_STORAGE_KEY,
  AUTH_USERS_STORAGE_KEY,
} from "@/features/auth/repository/localStorageSchema";
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";
import { evaluateOperatorDigitalDeurAccess } from "@/features/rental/deur/operator/evaluateOperatorDigitalDeurAccess";
import { resolveAuthenticatedOperator } from "@/features/rental/deur/operator/resolveAuthenticatedOperator";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";

const password = "OperatorPassword123!";
const operator: Operator = {
  id: "operator-1",
  name: "UAT operator 1",
  email: "",
  licenseNumber: "",
  certificationType: "None",
  status: "Active",
  joinedDate: "",
};
const canonicalUser: User = {
  id: "operator-user-1",
  username: "uat.operator.1",
  displayName: "UAT operator 1",
  systemRoles: ["rental-operations"],
  status: "active",
  operatorId: operator.id,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};
const assignment: AssignmentRecord = {
  id: "assignment-1",
  equipmentId: "equipment-1",
  operatorId: operator.id,
  projectId: "project-1",
  assignedDate: "2026-07-28",
  expectedReturn: "",
  remarks: "",
  status: "Active",
};
const rental: RentalRecord = {
  id: "rental-1",
  rentalNumber: "R-1",
  equipmentId: assignment.equipmentId,
  assignmentId: assignment.id,
  operatorId: operator.id,
  customer: "Customer",
  project: "Project",
  rentedBy: "",
  dateOut: "2026-07-28",
  statusId: "active",
  status: "Active",
  operationalMetadata: {
    costCode: { code: "RENT", name: "Rental" },
    activityCode: { code: "OPERATE", name: "Operate" },
  },
};
const line: RentalEquipmentLine = {
  id: "line-1",
  rentalId: rental.id,
  equipmentId: assignment.equipmentId,
  assignmentId: assignment.id,
  operatorId: operator.id,
  status: "Active",
  createdAt: "",
  updatedAt: "",
};

let mounted: { root: Root; container: HTMLDivElement } | undefined;

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  storage.clear();
});

function provisionDependencies() {
  const dependencies = createLocalApplicationDependencies();
  (dependencies.authentication.userRepository as LocalUserRepository)
    .createUser(canonicalUser, password);
  return dependencies;
}

async function mount(
  dependencies: ApplicationDependencies,
  child: (auth: ReturnType<typeof useAuth>) => ReactNode = () => null,
) {
  let auth!: ReturnType<typeof useAuth>;
  function Probe() {
    auth = useAuth();
    return child(auth);
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(createElement(
      ApplicationDependencyProvider,
      { dependencies },
      createElement(AuthProvider, null, createElement(Probe)),
    ));
  });
  return { auth: () => auth, container };
}

async function remount(
  dependencies: ApplicationDependencies,
  child?: (auth: ReturnType<typeof useAuth>) => ReactNode,
) {
  if (mounted) {
    await act(async () => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  return mount(dependencies, child);
}

describe("canonical operator-linked authentication", () => {
  it("preserves operatorId during canonical credential login", async () => {
    const dependencies = provisionDependencies();
    const rendered = await mount(dependencies);

    await act(async () => {
      await rendered.auth().login({
        username: canonicalUser.username,
        password,
      });
    });

    expect(rendered.auth().user).toMatchObject({
      id: canonicalUser.id,
      systemRoles: ["rental-operations"],
      operatorId: operator.id,
    });
    expect(rendered.auth().session?.providerId).toBe("local");
  });

  it("preserves operatorId through canonical session restoration", async () => {
    const dependencies = provisionDependencies();
    const first = await mount(dependencies);
    await act(async () => {
      await first.auth().login({ username: canonicalUser.username, password });
    });

    const restored = await remount(dependencies);

    expect(restored.auth().user).toMatchObject({
      id: canonicalUser.id,
      systemRoles: ["rental-operations"],
      operatorId: operator.id,
    });
    expect(restored.auth().session?.userId).toBe(canonicalUser.id);
  });

  it("gives canonical session restoration precedence and clears stale legacy identity", async () => {
    const dependencies = provisionDependencies();
    const first = await mount(dependencies);
    await act(async () => {
      await first.auth().login({ username: canonicalUser.username, password });
    });
    dependencies.authentication.legacyCompatibilityRepository.login(
      canonicalUser.displayName,
      "Admin",
    );

    const restored = await remount(dependencies);

    expect(restored.auth().user).toMatchObject({
      id: canonicalUser.id,
      operatorId: operator.id,
    });
    expect(storage.get("auth_user")).toBeNull();
    expect(storage.get("auth_token")).toBeNull();
  });

  it("renders the canonical friendly role instead of legacy Admin", async () => {
    const dependencies = provisionDependencies();
    const first = await mount(dependencies);
    await act(async () => {
      await first.auth().login({ username: canonicalUser.username, password });
    });

    const restored = await remount(
      dependencies,
      () => createElement(
        MemoryRouter,
        null,
        createElement(Header, { onMenu: () => undefined }),
      ),
    );

    expect(restored.container.textContent)
      .toContain("UAT operator 1 (Rental Operations)");
    expect(restored.container.textContent).not.toContain("(Admin)");
  });

  it("resolves only the matching linked Operator for DEUR ownership", () => {
    const identity = resolveAuthenticatedOperator(canonicalUser, [operator]);
    expect(identity).toMatchObject({
      status: "RESOLVED",
      operator: { id: operator.id },
    });
    expect(evaluateOperatorDigitalDeurAccess({
      actor: {
        id: canonicalUser.id,
        name: canonicalUser.displayName,
        role: "Admin",
      },
      authenticatedOperatorId: canonicalUser.operatorId,
      operator,
      assignment,
      rental,
      rentalEquipmentLine: line,
      deurs: [],
      evaluationTimestamp: "2026-07-28T08:00:00.000Z",
    })).toMatchObject({ allowed: true, operatorId: operator.id });

    expect(resolveAuthenticatedOperator(
      { ...canonicalUser, operatorId: undefined },
      [operator],
    )).toMatchObject({ status: "NOT_LINKED" });
  });

  it("logout clears canonical and legacy identities", async () => {
    const dependencies = provisionDependencies();
    const rendered = await mount(dependencies);
    await act(async () => {
      await rendered.auth().login({ username: canonicalUser.username, password });
    });
    dependencies.authentication.legacyCompatibilityRepository.login(
      "Legacy Operator",
      "Operator",
    );

    act(() => rendered.auth().logout());

    expect(storage.get(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(storage.get("auth_user")).toBeNull();
    expect(storage.get("auth_token")).toBeNull();
    expect(storage.get(AUTH_USERS_STORAGE_KEY)).not.toBeNull();
    expect(rendered.auth().user).toBeNull();
  });
});
