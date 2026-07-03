import {
  createContext,
  useContext,
  useState,
} from "react";

import type { ReactNode } from "react";

import type { EquipmentRecord } from "../types";

import { useAuth } from "@/features/auth/AuthContext";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE";

export interface AuditLog {
  action: AuditAction;

  equipmentId: string;

  before?: EquipmentRecord;

  after?: EquipmentRecord;

  user: string;

  timestamp: number;
}

interface AuditContextType {
  logs: AuditLog[];

  logAction: (
    log: Omit<
      AuditLog,
      "timestamp" | "user"
    >
  ) => void;
}

const AuditContext =
  createContext<AuditContextType | undefined>(
    undefined
  );

export function AuditProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();

  const [logs, setLogs] = useState<
    AuditLog[]
  >([]);

  function logAction(
    log: Omit<
      AuditLog,
      "timestamp" | "user"
    >
  ) {
    if (!user) return;

    setLogs((prev) => [
      {
        ...log,
        user: user.name,
        timestamp: Date.now(),
      },
      ...prev,
    ]);
  }

  return (
    <AuditContext.Provider
      value={{
        logs,
        logAction,
      }}
    >
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit() {
  const ctx =
    useContext(AuditContext);

  if (!ctx) {
    throw new Error(
      "useAudit must be used within AuditProvider"
    );
  }

  return ctx;
}