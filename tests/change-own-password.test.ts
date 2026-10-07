import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeOwnPassword } from "@/features/auth/services/changeOwnPassword";
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";
import { createLocalApplicationDependencies } from "@/app/composition";

describe("authenticated password change", () => {
  beforeEach(() => localStorage.clear());
  it("requires the current password and changes only the signed-in local password", async () => {
    const dependencies = createLocalApplicationDependencies();
    const repository = dependencies.authentication.userRepository as LocalUserRepository;
    const user = repository.getUserByUsername("administrator")!;
    const oldPassword = "Administrator123!";
    expect((await changeOwnPassword(dependencies.authentication, user, "wrong", "NewPassword123", "NewPassword123")).success).toBe(false);
    expect(repository.validateLocalCredentials(user.username, oldPassword)).toBeDefined();
    expect((await changeOwnPassword(dependencies.authentication, user, oldPassword, "NewPassword123", "NewPassword123")).success).toBe(true);
    expect(repository.validateLocalCredentials(user.username, oldPassword)).toBeUndefined();
    expect(repository.validateLocalCredentials(user.username, "NewPassword123")?.id).toBe(user.id);
  });

  it("rejects Operator PIN accounts and invalid new passwords", async () => {
    const dependencies = createLocalApplicationDependencies();
    const user = dependencies.authentication.userRepository.getUserByUsername("administrator")!;
    expect((await changeOwnPassword(dependencies.authentication, { ...user, credentialMode: "OPERATOR_PIN" }, "old", "NewPassword123", "NewPassword123")).success).toBe(false);
    expect((await changeOwnPassword(dependencies.authentication, user, "old", "short", "short")).success).toBe(false);
    expect((await changeOwnPassword(dependencies.authentication, user, "old", "NewPassword123", "different")).success).toBe(false);
  });

  it("delegates remote verification and mutation to the provider", async () => {
    const dependencies = createLocalApplicationDependencies();
    const user = dependencies.authentication.userRepository.getUserByUsername("administrator")!;
    const changePassword = vi.fn(async () => ({ success: true, value: undefined }));
    const authentication = { ...dependencies.authentication, remoteAuthenticationProvider: { changePassword } as never };
    expect((await changeOwnPassword(authentication, user, "Current123", "NewPassword123", "NewPassword123")).success).toBe(true);
    expect(changePassword).toHaveBeenCalledWith("Current123", "NewPassword123");
  });
});
