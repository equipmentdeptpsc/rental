import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    DeurRecord,
    DeurActivityType,
  } from "../types";
  
  import {
    createDeurSession,
    type DeurSession,
  } from "../models";
  
  import {
    startActivity,
  } from "../engine/activityEngine";
  
  import {
    updateDeurTotals,
  } from "../calculator/durationCalculator";
  
  interface DeurContextType {
    session?: DeurSession;
  
    loadSession(
      record: DeurRecord
    ): void;
  
    start(
      activity: DeurActivityType
    ): void;
  
    updateRemarks(
      remarks: string
    ): void;
  
    completeDay(): void;
  
    clear(): void;
  }
  
  const DeurContext =
    createContext<
      DeurContextType | undefined
    >(undefined);
  
  export function DeurProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const [session, setSession] =
      useState<DeurSession>();
  
    function loadSession(
      record: DeurRecord
    ) {
      setSession(
        createDeurSession(record)
      );
    }
  
    function start(
      activity: DeurActivityType
    ) {
      setSession((current) => {
        if (!current) {
          return current;
        }
  
        const logs =
          startActivity(
            current.activities,
            activity
          );
  
        const updated =
          updateDeurTotals({
            ...current.deur,
            logs,
          });
  
        return {
          ...current,
          deur: updated,
          activities: logs,
        };
      });
    }
  
    function updateRemarks(
      remarks: string
    ) {
      setSession((current) => {
        if (!current) {
          return current;
        }
  
        return {
          ...current,
          deur: {
            ...current.deur,
            acknowledgementRemarks:
              remarks,
          },
        };
      });
    }
  
    function completeDay() {
      setSession((current) => {
        if (!current) {
          return current;
        }
  
        return {
          ...current,
          deur: {
            ...current.deur,
            status:
              "Pending Acknowledgement",
            endOfDay:
              new Date()
                .toTimeString()
                .slice(0, 5),
          },
        };
      });
    }
  
    function clear() {
      setSession(undefined);
    }
  
    const value = useMemo(
      () => ({
        session,
        loadSession,
        start,
        updateRemarks,
        completeDay,
        clear,
      }),
      [session]
    );
  
    return (
      <DeurContext.Provider
        value={value}
      >
        {children}
      </DeurContext.Provider>
    );
  }
  
  export function useDeur() {
    const context =
      useContext(DeurContext);
  
    if (!context) {
      throw new Error(
        "useDeur must be used inside DeurProvider."
      );
    }
  
    return context;
  }