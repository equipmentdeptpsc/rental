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
  } from "../repository";
  
  interface ActivityCodeContextType {
  
    records:
      ActivityCodeRecord[];
  
    create(
      record:
        ActivityCodeRecord
    ): void;
  
    update(
      record:
        ActivityCodeRecord
    ): void;
  
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
  
            activityCodeRepository.create(
              record
            );
  
            refresh();
  
          },
  
          update(
            record
          ) {
  
            activityCodeRepository.update(
              record
            );
  
            refresh();
  
          },
  
          softDelete(
            id
          ) {
  
            activityCodeRepository.softDelete(
              id
            );
  
            refresh();
  
          },
  
          restore(
            id
          ) {
  
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