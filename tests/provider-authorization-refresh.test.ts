import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationDependencyProvider,
  createLocalApplicationDependencies,
} from "@/app/composition";
import {
  AssignmentProvider,
  useAssignment,
} from "@/features/assignment/context/AssignmentContext";
import type { AssignmentRecord } from "@/features/assignment/types";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import type { AuthSession } from "@/features/auth/domain/session";
import type { User } from "@/features/auth/domain/user";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
import type { LoginResult } from "@/features/auth/services/AuthenticationService";
import {
  BillingProvider,
  useBilling,
} from "@/features/billing/context/BillingContext";
import { billingRepository } from "@/features/billing/repository/BillingRepository";
import type { BillingRecord } from "@/features/billing/types";
import {
  DailyLogProvider,
  useDailyLog,
} from "@/features/daily-log/context/DailyLogContext";
import { dailyLogRepository } from "@/features/daily-log/repository";
import type { DailyLogRecord } from "@/features/daily-log/types";
import {
  MaintenanceProvider,
  useMaintenance,
} from "@/features/maintenance/context/MaintenanceContext";
import { maintenanceRepository } from "@/features/maintenance/repository";
import type { MaintenanceRecord } from "@/features/maintenance/types";
import {
  ProjectProvider,
  useProject,
} from "@/features/project/context/ProjectContext";
import { projectRepository } from "@/features/project/repository";
import type { ProjectRecord } from "@/features/project/types";
import {
  DeurProvider,
  useDeur,
} from "@/features/rental/deur/context/DeurContext";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import type { DeurRecord } from "@/features/rental/deur/types";

const administrator: User = {
  id: "admin",
  username: "administrator",
  displayName: "Administrator",
  systemRoles: ["system-administrator"],
  status: "active",
  createdAt: "",
  updatedAt: "",
};

const management: User = {
  ...administrator,
  id: "management",
  username: "management",
  displayName: "Management",
  systemRoles: ["management"],
};

const project: ProjectRecord = {
  id: "project",
  projectCode: "PRJ-001",
  projectName: "Project",
  location: "",
  projectManager: "",
  status: "Active",
};
const assignment: AssignmentRecord = {
  id: "assignment",
  equipmentId: "equipment",
  operatorId: "operator",
  projectId: project.id,
  assignedDate: "2026-07-28",
  expectedReturn: "",
  remarks: "",
  status: "Active",
};
const maintenance: MaintenanceRecord = {
  id: "maintenance",
  equipmentId: "equipment",
  maintenanceType: "Preventive",
  scheduledReading: 0,
  currentReading: 0,
  scheduledDate: "2026-07-28",
  technician: "",
  remarks: "",
  status: "Scheduled",
};
const dailyLog: DailyLogRecord = {
  id: "daily-log",
  equipmentId: "equipment",
  operatorId: "operator",
  projectId: project.id,
  date: "2026-07-28",
  startReading: 0,
  endReading: 1,
  workingHours: 1,
  remarks: "",
};
const billing: BillingRecord = {
  id: "billing",
  statementNo: "BILL-001",
  customerId: "customer",
  customerName: "Customer",
  projectId: project.id,
  projectName: project.projectName,
  billingFrom: "2026-07-28",
  billingTo: "2026-07-28",
  lines: [],
  totalAmount: 0,
  remarks: "",
  status: "Draft",
  createdAt: "",
  updatedAt: "",
};
const deur: DeurRecord = {
  id: "deur",
  rentalId: "rental",
  equipmentId: "equipment",
  operatorId: "operator",
  workDate: "2026-07-28",
  logs: [],
  totalOperatingMinutes: 0,
  totalIdleMinutes: 0,
  totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0,
  totalMobilizationMinutes: 0,
  totalDemobilizationMinutes: 0,
  status: "Draft",
  createdAt: "",
  updatedAt: "",
};

class FakeAuthenticationService {
  constructor(
    private readonly user: User,
    private readonly restore: boolean,
  ) {}

  initialize() {
    return this.restore
      ? { session: this.session(), user: this.user }
      : { session: null, user: null };
  }

  login(): LoginResult {
    return { success: true, session: this.session(), user: this.user };
  }

  logout() {}

  private session(): AuthSession {
    return {
      id: `session-${this.user.id}`,
      userId: this.user.id,
      providerId: "local",
      createdAt: "",
    };
  }
}

interface Harness {
  assignment: ReturnType<typeof useAssignment>;
  auth: ReturnType<typeof useAuth>;
  billing: ReturnType<typeof useBilling>;
  dailyLog: ReturnType<typeof useDailyLog>;
  deur: ReturnType<typeof useDeur>;
  maintenance: ReturnType<typeof useMaintenance>;
  project: ReturnType<typeof useProject>;
}

interface WriteSpies {
  assignment: ReturnType<typeof vi.fn>;
  billing: ReturnType<typeof vi.spyOn>;
  dailyLog: ReturnType<typeof vi.spyOn>;
  deur: ReturnType<typeof vi.spyOn>;
  maintenance: ReturnType<typeof vi.spyOn>;
  project: ReturnType<typeof vi.spyOn>;
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

function providers(children: ReactNode) {
  return createElement(
    ProjectProvider,
    null,
    createElement(
      AssignmentProvider,
      null,
      createElement(
        MaintenanceProvider,
        null,
        createElement(
          DailyLogProvider,
          null,
          createElement(
            BillingProvider,
            null,
            createElement(DeurProvider, null, children),
          ),
        ),
      ),
    ),
  );
}

async function renderAuthenticated(
  user: User,
  authentication: "login" | "restore",
) {
  const assignmentWrite = vi.fn();
  const assignmentRepository = {
    getAll: () => [],
    getById: () => undefined,
    getActive: () => [],
    create: assignmentWrite,
    update: vi.fn(),
    delete: vi.fn(),
  };
  const dependencies = createLocalApplicationDependencies({
    repositories: { assignment: assignmentRepository },
    authentication: {
      authenticationService:
        new FakeAuthenticationService(user, authentication === "restore") as unknown as ReturnType<
          typeof createLocalApplicationDependencies
        >["authentication"]["authenticationService"],
    },
  });
  const writes: WriteSpies = {
    assignment: assignmentWrite,
    billing: vi.spyOn(billingRepository, "saveAll").mockImplementation(() => {}),
    dailyLog: vi.spyOn(dailyLogRepository, "create").mockImplementation(() => {}),
    deur: vi.spyOn(deurRepository, "create").mockImplementation(() => deur),
    maintenance: vi.spyOn(maintenanceRepository, "create").mockImplementation(() => {}),
    project: vi.spyOn(projectRepository, "create").mockImplementation(() => {}),
  };
  vi.spyOn(deurRepository, "getById").mockReturnValue(undefined);
  const harness = {} as Harness;

  function Probe() {
    harness.assignment = useAssignment();
    harness.auth = useAuth();
    harness.billing = useBilling();
    harness.dailyLog = useDailyLog();
    harness.deur = useDeur();
    harness.maintenance = useMaintenance();
    harness.project = useProject();
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
      createElement(AuthProvider, null, providers(createElement(Probe))),
    ));
  });
  if (authentication === "login") {
    await act(async () => {
      await harness.auth.login({ username: user.username, password: "local" });
    });
  }
  return { harness, writes };
}

function expectNoWrites(writes: WriteSpies) {
  Object.values(writes).forEach((write) => expect(write).not.toHaveBeenCalled());
}

describe("authorization-capturing provider refresh", () => {
  it.each(["login", "restore"] as const)(
    "refreshes all affected create mutations after administrator %s",
    async (authentication) => {
      const { harness, writes } = await renderAuthenticated(
        administrator,
        authentication,
      );

      await act(async () => {
        harness.project.addProject(project);
        harness.assignment.addAssignment(assignment);
        harness.maintenance.addMaintenance(maintenance);
        harness.dailyLog.addLog(dailyLog);
        harness.billing.addBilling(billing);
        harness.deur.loadSession(deur);
      });
      await act(async () => harness.deur.start("Operation"));

      Object.values(writes).forEach((write) => expect(write).toHaveBeenCalledOnce());
    },
  );

  it("keeps Management denied and performs zero persistence writes", async () => {
    const { harness, writes } = await renderAuthenticated(management, "login");

    expect(() => harness.project.addProject(project)).toThrow(AuthorizationError);
    expect(() => harness.assignment.addAssignment(assignment)).toThrow(AuthorizationError);
    expect(() => harness.maintenance.addMaintenance(maintenance)).toThrow(AuthorizationError);
    expect(() => harness.dailyLog.addLog(dailyLog)).toThrow(AuthorizationError);
    expect(() => harness.billing.addBilling(billing)).toThrow(AuthorizationError);
    await act(async () => harness.deur.loadSession(deur));
    expect(() => harness.deur.start("Operation")).toThrow(AuthorizationError);
    expectNoWrites(writes);
  });
});
