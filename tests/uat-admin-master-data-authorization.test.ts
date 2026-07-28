import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationDependencyProvider,
  createLocalApplicationDependencies,
} from "@/app/composition";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import type { AuthSession } from "@/features/auth/domain/session";
import type { User } from "@/features/auth/domain/user";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
import type { LoginResult } from "@/features/auth/services/AuthenticationService";
import {
  EquipmentProvider,
  useEquipment,
} from "@/features/equipment/context/EquipmentContext";
import type { EquipmentRecord } from "@/features/equipment/types";
import {
  OperatorProvider,
  useOperator,
} from "@/features/operators/context/OperatorContext";
import { operatorRepository } from "@/features/operators/repository";
import type { Operator } from "@/features/operators/types";

const administrator: User = {
  id: "local-user-system-administrator",
  username: "administrator",
  displayName: "Administrator",
  systemRoles: ["system-administrator"],
  status: "active",
  createdAt: "",
  updatedAt: "",
};

const management: User = {
  ...administrator,
  id: "local-user-management",
  username: "management",
  displayName: "Management",
  systemRoles: ["management"],
};

const equipment: EquipmentRecord = {
  id: "uat-equipment",
  prefixId: "",
  assetNo: "",
  equipmentName: "UAT Equipment",
  category: "Moving Equipment",
  maintenanceType: "Engine Hours",
  currentReading: 0,
  projectId: "",
  operatorId: "",
  status: "Available",
  deleted: false,
};

const operator: Operator = {
  id: "uat-operator",
  name: "UAT Operator",
  email: "",
  licenseNumber: "",
  certificationType: "None",
  status: "Active",
  joinedDate: "",
};

class FakeAuthenticationService {
  constructor(private readonly loginUser: User) {}

  initialize() {
    return { session: null, user: null };
  }

  login(): LoginResult {
    const session: AuthSession = {
      id: `session-${this.loginUser.id}`,
      userId: this.loginUser.id,
      providerId: "local",
      createdAt: "",
    };
    return { success: true, session, user: this.loginUser };
  }

  logout() {}
}

interface Harness {
  auth: ReturnType<typeof useAuth>;
  equipment: ReturnType<typeof useEquipment>;
  operator: ReturnType<typeof useOperator>;
}

let mounted: { root: Root; container: HTMLDivElement } | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (mounted) {
    await act(async () => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  localStorage.clear();
});

async function renderAuthenticated(user: User) {
  const equipmentCreate = vi.fn();
  const equipmentRepository = {
    getAll: () => [],
    getDeleted: () => [],
    getById: () => undefined,
    create: equipmentCreate,
    update: vi.fn(),
    delete: vi.fn(),
    restore: vi.fn(),
    permanentlyDelete: vi.fn(),
  };
  const dependencies = createLocalApplicationDependencies({
    repositories: { equipment: equipmentRepository },
    authentication: {
      authenticationService:
        new FakeAuthenticationService(user) as unknown as ReturnType<
          typeof createLocalApplicationDependencies
        >["authentication"]["authenticationService"],
    },
  });
  const operatorCreate = vi.spyOn(operatorRepository, "create").mockImplementation(() => {});
  const harness = {} as Harness;

  function Probe() {
    harness.auth = useAuth();
    harness.equipment = useEquipment();
    harness.operator = useOperator();
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(createElement(
      ApplicationDependencyProvider,
      { dependencies },
      createElement(
        AuthProvider,
        null,
        createElement(
          EquipmentProvider,
          null,
          createElement(OperatorProvider, null, createElement(Probe)),
        ),
      ),
    ));
  });
  await act(async () => {
    await harness.auth.login({ username: user.username, password: "local" });
  });
  return { harness, equipmentCreate, operatorCreate };
}

describe("UAT administrator master-data authorization", () => {
  it("lets the restored system-administrator create Equipment", async () => {
    const { harness, equipmentCreate } = await renderAuthenticated(administrator);

    expect(harness.auth.user?.systemRoles).toEqual(["system-administrator"]);
    expect(harness.auth.hasPermission("equipment.create")).toBe(true);
    expect(() => harness.equipment.addEquipment(equipment)).not.toThrow();
    expect(equipmentCreate).toHaveBeenCalledOnce();
  });

  it("lets the restored system-administrator create an Operator", async () => {
    const { harness, operatorCreate } = await renderAuthenticated(administrator);

    expect(harness.auth.hasPermission("operator.manage")).toBe(true);
    expect(() => harness.operator.addOperator(operator)).not.toThrow();
    expect(operatorCreate).toHaveBeenCalledOnce();
  });

  it("keeps unauthorized Equipment creation denied without persistence", async () => {
    const { harness, equipmentCreate } = await renderAuthenticated(management);

    expect(harness.auth.hasPermission("equipment.create")).toBe(false);
    expect(() => harness.equipment.addEquipment(equipment)).toThrow(AuthorizationError);
    expect(equipmentCreate).not.toHaveBeenCalled();
  });

  it("keeps unauthorized Operator creation denied without persistence", async () => {
    const { harness, operatorCreate } = await renderAuthenticated(management);

    expect(harness.auth.hasPermission("operator.manage")).toBe(false);
    expect(() => harness.operator.addOperator(operator)).toThrow(AuthorizationError);
    expect(operatorCreate).not.toHaveBeenCalled();
  });
});
