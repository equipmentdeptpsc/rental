import { storage } from "@/core/storage";
import { localUatUserId } from "@/features/auth/user";
import type { Operator } from "./types";

export const OPERATOR_USER_LINK_STORAGE_KEY = "equipment-rental-operator-user-links";

export interface OperatorUserLink {
  userId: string;
  loginName: string;
  operatorId: string;
  createdAt: string;
  updatedAt: string;
}

function all(): OperatorUserLink[] {
  const value = storage.get<unknown>(OPERATOR_USER_LINK_STORAGE_KEY);
  return Array.isArray(value) ? structuredClone(value as OperatorUserLink[]) : [];
}

export const operatorUserLinkRepository = {
  getAll: all,
  getByUserId(userId: string) {
    return all().find((link) => link.userId === userId);
  },
  getByOperatorId(operatorId: string) {
    return all().find((link) => link.operatorId === operatorId);
  },
  link(loginName: string, operatorId: string, now = new Date().toISOString()) {
    const name = loginName.trim();
    if (!name) throw new Error("A local UAT Operator login name is required.");
    const userId = localUatUserId(name, "Operator");
    const records = all();
    const existing = records.find((item) => item.operatorId === operatorId);
    const conflicting = records.find((item) => item.userId === userId && item.operatorId !== operatorId);
    if (conflicting) throw new Error("That local Operator login is already linked to another Operator.");
    const next: OperatorUserLink = {
      userId,
      loginName: name,
      operatorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    storage.set(
      OPERATOR_USER_LINK_STORAGE_KEY,
      [...records.filter((item) => item.operatorId !== operatorId), next],
    );
    return structuredClone(next);
  },
  unlinkOperator(operatorId: string) {
    storage.set(OPERATOR_USER_LINK_STORAGE_KEY, all().filter((item) => item.operatorId !== operatorId));
  },
};

export function resolveOperatorUserLink(
  userId: string,
  operators: Operator[],
  links = all(),
) {
  const link = links.find((item) => item.userId === userId);
  if (!link) {
    return {
      status: "NOT_LINKED" as const,
      message: "This login has no Operator mapping.",
    };
  }
  const operator = operators.find((item) => item.id === link.operatorId);
  if (!operator) {
    return {
      status: "MAPPED_OPERATOR_MISSING" as const,
      message: "The Operator mapped to this login no longer exists.",
    };
  }
  return { status: "RESOLVED" as const, operator, link: structuredClone(link) };
}
