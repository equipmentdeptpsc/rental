import type { Permission } from "../domain/permission";

export class AuthorizationError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor(
    readonly permission: Permission,
    message = "You do not have permission to perform this operation.",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}
