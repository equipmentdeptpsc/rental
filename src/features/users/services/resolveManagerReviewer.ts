import type { User } from "@/features/auth/domain/user";
import { authorizationService } from "@/features/auth/services/AuthorizationService";
import { isValidBusinessEmail, normalizeBusinessEmail } from "@/shared/validation/email";

export type ManagerReviewerResolution =
  | { success: true; user: User; destination: string }
  | { success: false; code: "MANAGER_REVIEWER_NOT_CONFIGURED" | "MANAGER_EMAIL_REQUIRED" | "MULTIPLE_MANAGER_REVIEWERS" };

export function resolveManagerReviewer(users: readonly User[], companyId?: string): ManagerReviewerResolution {
  const eligible = users.filter((user) => user.status === "active"
    && (!companyId || user.companyId === companyId)
    && authorizationService.hasPermission(user, "rental.approval.decide"));
  if (eligible.length === 0) return { success: false, code: "MANAGER_REVIEWER_NOT_CONFIGURED" };
  if (eligible.length > 1) return { success: false, code: "MULTIPLE_MANAGER_REVIEWERS" };
  const [user] = eligible;
  if (!user.email || !isValidBusinessEmail(user.email)) return { success: false, code: "MANAGER_EMAIL_REQUIRED" };
  return { success: true, user, destination: normalizeBusinessEmail(user.email) };
}
