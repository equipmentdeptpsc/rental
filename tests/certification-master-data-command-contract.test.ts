import { describe, expect, it, vi } from "vitest";
import { SupabaseCertificationCommandRepository } from "@/integrations/supabase/SupabaseCertificationRepository";

describe("certification type command contract", () => {
  it("sends the RPC-required expectedRowVersion unchanged for activation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const repository = new SupabaseCertificationCommandRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const command = { commandId: "command-1", idempotencyKey: "command-1", certificationTypeId: "certification-1", expectedRowVersion: 7 };

    await repository.setActive(command, true);

    expect(rpc).toHaveBeenCalledWith("command_activate_certification_type", { command });
    expect(rpc.mock.calls[0][1].command).not.toHaveProperty("expectedVersion");
  });

  it("keeps the RPC-required expectedRowVersion unchanged for deactivation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const repository = new SupabaseCertificationCommandRepository({ schema: vi.fn(() => ({ rpc })) } as never);
    const command = { commandId: "command-2", idempotencyKey: "command-2", certificationTypeId: "certification-1", expectedRowVersion: 8 };

    await repository.setActive(command, false);

    expect(rpc).toHaveBeenCalledWith("command_deactivate_certification_type", { command });
  });
});
