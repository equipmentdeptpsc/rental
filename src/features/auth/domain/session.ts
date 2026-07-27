export interface AuthSession {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
}
