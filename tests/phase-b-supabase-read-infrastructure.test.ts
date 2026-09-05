import { describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createApplicationDependencies, normalizePersistenceMode, PersistenceMode } from "@/app/composition";
import { createRemoteCore, LocalReadRepository } from "@/core/remote";
import { SupabaseReadRepository } from "@/integrations/supabase/SupabaseReadRepository";
import { SupabaseAuthenticationProvider } from "@/integrations/supabase/SupabaseAuthenticationProvider";
import { repositorySuccess } from "@/core/persistence";
import type { User } from "@/features/auth/domain/user";

class Query {
  constructor(private readonly response: { data: unknown; error: unknown }) {}
  select() { return this; } eq() { return this; } is() { return this; } or() { return this; } order() { return this; } range() { return this; }
  abortSignal() { return this; } maybeSingle() { return this; }
  then(resolve: (value: { data: unknown; error: unknown }) => unknown) { return Promise.resolve(this.response).then(resolve); }
}
function readClient(response: { data: unknown; error: unknown }): SupabaseClient {
  return { schema: vi.fn(() => ({ from: vi.fn(() => new Query(response)) })) } as unknown as SupabaseClient;
}

describe("Phase B Supabase read infrastructure", () => {
  it("keeps Local Mode as default and centralizes explicit Remote Mode selection", () => {
    const local = createApplicationDependencies({});
    const remote = createApplicationDependencies({
      persistenceMode: "remote", supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test_value",
    });
    expect(local.configuration.persistenceMode).toBe(PersistenceMode.Local);
    expect(local.readRepositories.equipment).toBeInstanceOf(LocalReadRepository);
    expect(remote.configuration.persistenceMode).toBe(PersistenceMode.Remote);
    expect(remote.readRepositories.equipment).toBeInstanceOf(SupabaseReadRepository);
    expect(remote.authentication.remoteAuthenticationProvider).toBeInstanceOf(SupabaseAuthenticationProvider);
  });

  it("normalizes environment mode safely with Local as the fallback", () => {
    expect(normalizePersistenceMode(undefined)).toBe(PersistenceMode.Local);
    expect(normalizePersistenceMode("unexpected")).toBe(PersistenceMode.Local);
    expect(normalizePersistenceMode("remote")).toBe(PersistenceMode.Remote);
  });

  it("maps remote rows and retains paging, filtering, search, and sorting operations", async () => {
    const client = readClient({ data: [{ id: "equipment-1", asset_no: "EQ-001", equipment_name: "Crane", legacy_payload: { active: true } }], error: null });
    const repository = new SupabaseReadRepository<{ id: string; assetNo: string; equipmentName: string; active: boolean }>(
      client, { repositoryName: "Equipment", table: "equipment", searchColumns: ["asset_no", "equipment_name"] }, createRemoteCore(),
    );
    const result = await repository.search("crane", { filters: { active: true }, ordering: [{ field: "asset_no" }], paging: { offset: 0, limit: 10 } });
    expect(result).toEqual(repositorySuccess({ items: [{ id: "equipment-1", assetNo: "EQ-001", equipmentName: "Crane", active: true }], nextCursor: undefined }));
  });

  it("translates null filters to Supabase IS NULL and omits undefined filters", async () => {
    const calls: string[] = [];
    class FilterQuery extends Query {
      override eq(field: string, value: unknown) { calls.push(`eq:${field}:${String(value)}`); return this; }
      override is(field: string, value: unknown) { calls.push(`is:${field}:${String(value)}`); return this; }
    }
    const client = { schema: vi.fn(() => ({ from: vi.fn(() => new FilterQuery({ data: [{ id: "equipment-1" }], error: null })) })) } as unknown as SupabaseClient;
    const repository = new SupabaseReadRepository<{ id: string }>(client, { repositoryName: "Equipment", table: "equipment" }, createRemoteCore());
    await repository.list({ filters: { project_id: null, customer_id: undefined, status_id: "status-1" } });
    expect(calls).toEqual(["is:project_id:null", "eq:status_id:status-1"]);
  });

  it("preserves canonical Assignment identity and maps its relationship and date fields", async () => {
    const client = readClient({ data: [{
      id: "c43b7841-8394-452f-b1fa-9823245fda46",
      equipment_id: "equipment-1",
      operator_id: "operator-1",
      project_id: "project-1",
      assigned_date: "2026-08-23",
      expected_return: "2026-08-24",
      status: "Active",
    }], error: null });
    const repository = new SupabaseReadRepository<{
      id: string; equipmentId: string; operatorId: string; projectId: string;
      assignedDate: string; expectedReturn: string; status: string;
    }>(client, { repositoryName: "Assignment", table: "assignments" }, createRemoteCore());

    await expect(repository.list()).resolves.toEqual(repositorySuccess({ items: [{
      id: "c43b7841-8394-452f-b1fa-9823245fda46",
      equipmentId: "equipment-1",
      operatorId: "operator-1",
      projectId: "project-1",
      assignedDate: "2026-08-23",
      expectedReturn: "2026-08-24",
      status: "Active",
    }], nextCursor: undefined }));
  });

  it("returns typed validation and authorization/transport failures", async () => {
    const malformed = new SupabaseReadRepository<{ id: string }>(readClient({ data: [{ name: "missing-id" }], error: null }), { repositoryName: "Customer", table: "customers" }, createRemoteCore());
    await expect(malformed.list()).resolves.toMatchObject({ success: false, error: { code: "REMOTE_ROW_MALFORMED" } });
    const denied = new SupabaseReadRepository<{ id: string }>(readClient({ data: null, error: { status: 403, message: "denied" } }), { repositoryName: "Project", table: "projects" }, createRemoteCore());
    await expect(denied.list()).resolves.toMatchObject({ success: false, error: { context: { failureKind: "Forbidden" } } });
    const transport = new SupabaseReadRepository<{ id: string }>(readClient({ data: null, error: { status: 503, message: "offline" } }), { repositoryName: "Rental", table: "rentals" }, createRemoteCore({ retryPolicy: { maximumRetries: 0, initialDelayMs: 0, multiplier: 1, maximumDelayMs: 0 } }));
    await expect(transport.list()).resolves.toMatchObject({ success: false, error: { context: { failureKind: "TransientFailure" } } });
    const missing = new SupabaseReadRepository<{ id: string }>(readClient({ data: null, error: null }), { repositoryName: "Operator", table: "operators" }, createRemoteCore());
    await expect(missing.getById("missing")).resolves.toMatchObject({ success: false, error: { code: "REPOSITORY_NOT_FOUND", context: { id: "missing" } } });
  });

  it("authenticates, restores application identity, permissions, and Operator linkage", async () => {
    const user: User = { id: "00000000-0000-4000-8000-000000000001", username: "operator@example.com", displayName: "UAT Operator", systemRoles: ["rental-operations"], status: "active", operatorId: "operator-1", createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" };
    const session = { access_token: "access-token-with-stable-session-identity", expires_at: 1785200000, user: { id: user.id, last_sign_in_at: "2026-07-28T00:00:00.000Z" } } as Session;
    const signOut = vi.fn(async () => ({ error: null }));
    const client = {
      auth: {
        signInWithPassword: vi.fn(async () => ({ data: { session }, error: null })),
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
        refreshSession: vi.fn(async () => ({ data: { session }, error: null })),
        signOut,
      },
      schema: vi.fn(() => ({ from: vi.fn(() => new Query({ data: [{ permission_code: "deur.manage-own" }], error: null })) })),
    } as unknown as SupabaseClient;
    const users = { getById: vi.fn(async () => repositorySuccess(user)), list: vi.fn(), search: vi.fn() };
    const provider = new SupabaseAuthenticationProvider(client, users);
    const loggedIn = await provider.login({ username: user.username, password: "development-only" });
    expect(loggedIn).toMatchObject({ success: true, value: { user: { operatorId: "operator-1", systemRoles: ["rental-operations"] }, permissions: ["deur.manage-own"] } });
    await expect(provider.restoreSession()).resolves.toMatchObject({ success: true, value: { user: { id: user.id } } });
    await expect(provider.refreshSession()).resolves.toMatchObject({ success: true, value: { session: { providerId: "supabase" } } });
    await expect(provider.logout()).resolves.toEqual(repositorySuccess(undefined));
    expect(signOut).toHaveBeenCalled();
  });
});
