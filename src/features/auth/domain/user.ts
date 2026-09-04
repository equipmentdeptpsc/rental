export type UserStatus = "active" | "inactive";
export type CredentialMode = "PASSWORD" | "OPERATOR_PIN";

export interface User {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly email?: string;
  readonly companyId?: string;
  readonly systemRoles: readonly string[];
  readonly status: UserStatus;
  readonly operatorId?: string;
  readonly credentialMode?: CredentialMode;
  readonly createdAt: string;
  readonly updatedAt: string;
}
