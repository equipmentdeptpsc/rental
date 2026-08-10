import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    ActivityCodeRecord,
  } from "../types";
  
  import {
    activityCodeRepository,
    type ActivityCodeMutationResult,
  } from "../repository";
  import { useOptionalAuth } from "@/features/auth/AuthContext";
  import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
  
  interface ActivityCodeContextType {
  
    records:
      ActivityCodeRecord[];
  
    create(
      record:
        ActivityCodeRecord
    ): ActivityCodeMutationResult;
  
    update(
      record:
        ActivityCodeRecord
    ): ActivityCodeMutationResult;
  
    softDelete(
      id: string
    ): void;
  
    restore(
      id: string
    ): void;
  
    refresh(): void;
  
  }
  
  const ActivityCodeContext =
  createContext<
    ActivityCodeContextType
  >(
    {} as ActivityCodeContextType
  );
  
  export function
  ActivityCodeProvider({
  
    children,
  
  }: {
  
    children:
      ReactNode;
  
  }) {
    const auth = useOptionalAuth();
    const authorize = () => { if (auth && !auth.hasPermission("masterData.manage")) throw new AuthorizationError("masterData.manage"); };
  
    const [
  
      version,
  
      setVersion,
  
    ] =
    useState(0);
  
    const records =
      useMemo(
  
        () =>
  
          activityCodeRepository.getAll(),
  
        [
  
          version,
  
        ]
  
      );
  
    function refresh() {
  
      setVersion(
  
        value =>
          value + 1
  
      );
  
    }
  
    return (
  
      <ActivityCodeContext.Provider
  
        value={{
  
          records,
  
          create(
            record
          ) {
            authorize();
  
            const result = activityCodeRepository.create(
              record
            );
  
            if (result.success) refresh();
            return result;
  
          },
  
          update(
            record
          ) {
            authorize();
  
            const result = activityCodeRepository.update(
              record
            );
  
            if (result.success) refresh();
            return result;
  
          },
  
          softDelete(
            id
          ) {
            authorize();
  
            activityCodeRepository.softDelete(
              id
            );
  
            refresh();
  
          },
  
          restore(
            id
          ) {
            authorize();
  
            activityCodeRepository.restore(
              id
            );
  
            refresh();
  
          },
  
          refresh,
  
        }}
  
      >
  
        {children}
  
      </ActivityCodeContext.Provider>
  
    );
  
  }
  
  export function
  useActivityCodes() {
  
    return useContext(
      ActivityCodeContext
    );
  
  }
