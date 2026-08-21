import type { IStorageService } from "@/core/storage/IStorageService";
import type { AuthSession } from "@/features/auth/domain/session";
import type { User } from "@/features/auth/domain/user";
import type { AuthRepository } from "@/features/auth/repository/AuthRepository";
import type { UserRepository } from "@/features/auth/repository/UserRepository";
import type { Operator } from "@/features/operators/types";

export const OPERATOR_PIN_CREDENTIAL_STORAGE_KEY = "equipment-rental.auth.v1.operator-pin-credentials";
const ITERATIONS = 120_000;

interface StoredPinCredential {
  userId: string;
  salt: string;
  verifier: string;
  iterations: number;
  updatedAt: string;
}

export interface OperatorPinDirectory {
  getAll(): readonly Operator[];
  getById(id: string): Operator | undefined;
}

export type OperatorPinAuthenticationResult =
  | { success: true; user: User; session: AuthSession }
  | { success: false; reason: "INVALID_CREDENTIALS" | "INACTIVE_USER" | "NO_ASSIGNMENT"; message: string };

export class OperatorPinCredentialService {
  constructor(
    private readonly storage: IStorageService,
    private readonly users: UserRepository,
    private readonly operators: OperatorPinDirectory,
    private readonly sessions: AuthRepository,
    private readonly hasAssignment: (operatorId: string) => boolean,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async setPin(userId: string, pin: string, confirmation: string): Promise<void> {
    this.validatePin(pin, confirmation);
    const user = this.users.getUserById(userId);
    if (!user?.operatorId || !this.operators.getById(user.operatorId)) throw new Error("PIN credentials require a linked Operator user.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await deriveVerifier(pin, salt, ITERATIONS);
    const records = this.records().filter((record) => record.userId !== userId);
    records.push({ userId, salt: encode(salt), verifier: encode(verifier), iterations: ITERATIONS, updatedAt: this.now() });
    this.storage.set(OPERATOR_PIN_CREDENTIAL_STORAGE_KEY, records);
  }

  validatePinInput(pin: string, confirmation: string): void { this.validatePin(pin, confirmation); }

  async authenticate(operatorCode: string, pin: string): Promise<OperatorPinAuthenticationResult> {
    const normalized = operatorCode.trim().toLocaleLowerCase();
    const operator = this.operators.getAll().find((item) => item.licenseNumber.trim().toLocaleLowerCase() === normalized);
    const user = operator ? this.users.getUsers().find((item) => item.operatorId === operator.id) : undefined;
    const credential = user ? this.records().find((item) => item.userId === user.id) : undefined;
    if (!operator || !user || !credential || !(await verify(pin, credential))) return invalid();
    if (operator.status !== "Active" || user.status !== "active") return { success: false, reason: "INACTIVE_USER", message: "This Operator account is inactive." };
    if (!this.hasAssignment(operator.id)) return { success: false, reason: "NO_ASSIGNMENT", message: "This Operator has no active assignment." };
    const session: AuthSession = { id: this.createId(), userId: user.id, providerId: "local-operator-pin", createdAt: this.now() };
    this.sessions.persistSession(session);
    return { success: true, user, session };
  }

  hasCredential(userId: string): boolean { return this.records().some((record) => record.userId === userId); }

  private validatePin(pin: string, confirmation: string): void {
    if (pin !== confirmation) throw new Error("PIN and Confirm PIN do not match.");
    if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must contain 4 to 6 numeric digits.");
    if (/^(\d)\1+$/.test(pin) || ["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "4321", "3210"].some((value) => pin.includes(value))) {
      throw new Error("Choose a PIN that is not repeated or sequential.");
    }
  }

  private records(): StoredPinCredential[] {
    const value = this.storage.get<unknown>(OPERATOR_PIN_CREDENTIAL_STORAGE_KEY);
    if (!Array.isArray(value)) return [];
    return value.filter(isCredential).map((record) => ({ ...record }));
  }
}

function invalid(): OperatorPinAuthenticationResult { return { success: false, reason: "INVALID_CREDENTIALS", message: "Invalid Operator code or PIN." }; }
function isCredential(value: unknown): value is StoredPinCredential { return Boolean(value && typeof value === "object" && typeof (value as StoredPinCredential).userId === "string" && typeof (value as StoredPinCredential).salt === "string" && typeof (value as StoredPinCredential).verifier === "string" && typeof (value as StoredPinCredential).iterations === "number"); }
async function verify(pin: string, credential: StoredPinCredential): Promise<boolean> {
  const actual = await deriveVerifier(pin, decode(credential.salt), credential.iterations);
  const expected = decode(credential.verifier);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  actual.forEach((value, index) => { difference |= value ^ expected[index]; });
  return difference === 0;
}
async function deriveVerifier(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = Uint8Array.from(salt);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, material, 256);
  return new Uint8Array(bits);
}
function encode(value: Uint8Array): string { return btoa(String.fromCharCode(...value)); }
function decode(value: string): Uint8Array { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
