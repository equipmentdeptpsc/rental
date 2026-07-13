import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    RentalStatusRecord,
  } from "../types";
  
  import {
    rentalStatusRepository,
  } from "../repository/RentalStatusRepository";
  
  interface RentalStatusContextType {
  
    records: RentalStatusRecord[];
  
    create(
      record: RentalStatusRecord
    ): void;
  
    update(
      record: RentalStatusRecord
    ): void;
  
    remove(
      id: string
    ): void;
  
    restore(
      id: string
    ): void;
  
    refresh(): void;
  
  }
  
  const RentalStatusContext =
    createContext<
      RentalStatusContextType | undefined
    >(undefined);
  
  export function RentalStatusProvider({
    children,
  }: {
    children: ReactNode;
  }) {
  
    const [records, setRecords] =
      useState<RentalStatusRecord[]>([]);
  
    function refresh() {
  
      setRecords(
        rentalStatusRepository.getAll()
      );
  
    }
  
    useEffect(() => {
  
      refresh();
  
    }, []);
  
    function create(
      record: RentalStatusRecord
    ) {
  
      rentalStatusRepository.create(
        record
      );
  
      refresh();
  
    }
  
    function update(
      record: RentalStatusRecord
    ) {
  
      rentalStatusRepository.update(
        record
      );
  
      refresh();
  
    }
  
    function remove(
      id: string
    ) {
  
      rentalStatusRepository.softDelete(
        id
      );
  
      refresh();
  
    }
  
    function restore(
      id: string
    ) {
  
      rentalStatusRepository.restore(
        id
      );
  
      refresh();
  
    }
  
    return (
      <RentalStatusContext.Provider
        value={{
          records,
          create,
          update,
          remove,
          restore,
          refresh,
        }}
      >
        {children}
      </RentalStatusContext.Provider>
    );
  
  }
  
  export function useRentalStatuses() {
  
    const context =
      useContext(
        RentalStatusContext
      );
  
    if (!context) {
  
      throw new Error(
        "useRentalStatuses must be used inside RentalStatusProvider."
      );
  
    }
  
    return context;
  
  }