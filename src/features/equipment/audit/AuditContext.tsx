import {
  createContext,
  useContext,
  useEffect,
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

const STORAGE_KEY =
  "equipment-audit-logs";

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

  useEffect(() => {
    const stored =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!stored) {
      return;
    }

    try {
      setLogs(
        JSON.parse(stored)
      );
    } catch {
      console.warn(
        "Unable to load audit logs."
      );
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(logs)
    );
  }, [logs]);

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