import type { CreateProjectCommand } from "@/features/project/commands/contracts";

export interface CanonicalProjectFormState {
  projectCode: string;
  name: string;
  customerId: string;
  location: string;
}

export function buildCanonicalProjectCreateCommand(
  identity: Pick<CreateProjectCommand, "projectId" | "commandId" | "idempotencyKey">,
  form: CanonicalProjectFormState,
): CreateProjectCommand {
  const customerId = form.customerId.trim();
  const location = form.location.trim();
  return {
    ...identity,
    projectCode: form.projectCode.trim(),
    name: form.name.trim(),
    ...(customerId ? { customerId } : {}),
    ...(location ? { location } : {}),
  };
}
