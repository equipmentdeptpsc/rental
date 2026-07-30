import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type { DailyLogRecord } from "../types";
  import { dailyLogRepository } from "../repository";
  import { useOptionalAuth } from "@/features/auth/AuthContext";
  import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
  
  interface DailyLogContextType {
    logs: DailyLogRecord[];
  
    addLog(
      log: DailyLogRecord
    ): void;
  
    updateLog(
      log: DailyLogRecord
    ): void;
  
    deleteLog(
      id: string
    ): void;
  
    getLog(
      id: string
    ): DailyLogRecord | undefined;
  }
  
  const DailyLogContext =
    createContext<
      DailyLogContextType | undefined
    >(undefined);
  
  export function DailyLogProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const auth = useOptionalAuth();
    const authorize = () => { if (auth && !auth.hasPermission("dailyLog.manage")) throw new AuthorizationError("dailyLog.manage"); };
    const [logs, setLogs] =
      useState(
        dailyLogRepository.getAll()
      );
  
    function refresh() {
      setLogs(
        dailyLogRepository.getAll()
      );
    }
  
    function addLog(
      log: DailyLogRecord
    ) {
      authorize();
      dailyLogRepository.create(log);
      refresh();
    }
  
    function updateLog(
      log: DailyLogRecord
    ) {
      authorize();
      dailyLogRepository.update(log);
      refresh();
    }
  
    function deleteLog(
      id: string
    ) {
      authorize();
      dailyLogRepository.delete(id);
      refresh();
    }
  
    function getLog(
      id: string
    ) {
      return logs.find(
        (log) => log.id === id
      );
    }
  
    const value = useMemo(
      () => ({
        logs,
        addLog,
        updateLog,
        deleteLog,
        getLog,
      }),
      [auth, logs]
    );
  
    return (
      <DailyLogContext.Provider
        value={value}
      >
        {children}
      </DailyLogContext.Provider>
    );
  }
  
  export function useDailyLog() {
    const context =
      useContext(
        DailyLogContext
      );
  
    if (!context) {
      throw new Error(
        "useDailyLog must be used inside DailyLogProvider"
      );
    }
  
    return context;
  }
