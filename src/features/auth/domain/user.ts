export type UserStatus = "active" | "inactive";

export interface User {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly email?: string;
  readonly companyId?: string;
  readonly systemRoles: readonly string[];
  readonly status: UserStatus;
  readonly operatorId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
