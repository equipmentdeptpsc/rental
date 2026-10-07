import type { AuthenticationDependencies } from "@/app/composition/ApplicationDependencies";
import type { User } from "../domain/user";
import { LocalUserRepository } from "../repository/LocalUserRepository";

export async function changeOwnPassword(authentication: AuthenticationDependencies, user: User, currentPassword: string, newPassword: string, confirmation: string): Promise<{ success: boolean; message: string }> {
  if (user.credentialMode === "OPERATOR_PIN") return { success: false, message: "Password change is unavailable for Operator PIN accounts." };
  if (newPassword !== confirmation) return { success: false, message: "New passwords do not match." };
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return { success: false, message: "Use at least 8 characters, including a letter and a number." };
  if (authentication.remoteAuthenticationProvider) {
    const result = await authentication.remoteAuthenticationProvider.changePassword(currentPassword, newPassword);
    return result.success ? { success: true, message: "Password changed." } : { success: false, message: "Password could not be changed. Check your current password and try again." };
  }
  const repository = authentication.userRepository;
  if (!(repository instanceof LocalUserRepository) || !repository.validateLocalCredentials(user.username, currentPassword)) return { success: false, message: "Password could not be changed. Check your current password and try again." };
  repository.replaceLocalPassword(user.id, newPassword);
  return { success: true, message: "Password changed." };
}
