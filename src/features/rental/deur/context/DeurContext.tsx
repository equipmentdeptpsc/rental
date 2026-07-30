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
    deurRepository,
  } from "../repository/deurRepository";
  
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
  import { useOptionalAuth } from "@/features/auth/AuthContext";
  import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
  
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
    const auth = useOptionalAuth();
    const authorize = (permission: "deur.create" | "deur.review") => {
      if (auth && !auth.hasPermission(permission)) throw new AuthorizationError(permission);
    };
    const [session, setSession] =
      useState<DeurSession>();
  
    function loadSession(
      record: DeurRecord
    ) {
      const existing =
  deurRepository.getById(
    record.id
  );

setSession(
  createDeurSession(
    existing ?? record
  )
);
    }
  
    function start(
      activity: DeurActivityType
    ) {
      authorize("deur.create");
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

          const existing =
  deurRepository.getById(
    updated.id
  );

if (existing) {
  deurRepository.update(
    updated
  );
} else {
  deurRepository.create(
    updated
  );
}
  
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
      authorize("deur.create");
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
      authorize("deur.review");
      setSession((current) => {
        if (!current) {
          return current;
        }
    
        const updated = {
          ...current,
          deur: {
            ...current.deur,
            status:
  "Pending Acknowledgement" as const,
            endOfDay:
              new Date()
                .toTimeString()
                .slice(0, 5),
          },
        };
    
        const existing =
          deurRepository.getById(
            updated.deur.id
          );
    
        if (existing) {
          deurRepository.update(
            updated.deur
          );
        } else {
          deurRepository.create(
            updated.deur
          );
        }
    
        return updated;
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
      [auth, session]
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
