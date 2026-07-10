import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { RentalRecord } from "../types";
import type { RentalContractRecord } from "../types/RentalContract";

import { rentalRepository } from "../repository";
import { rentalContractRepository } from "../repository/rentalContractRepository";

import type { EquipmentRecord } from "@/features/equipment/types";
import { validateRental } from "../utils/validateRental";

interface RentalContextType {
  rentals: RentalRecord[];

  addRental(
    item: RentalRecord,
    equipment?: EquipmentRecord
  ): {
    success: boolean;
    message?: string;
  };

  updateRental(
    item: RentalRecord
  ): void;

  deleteRental(
    id: string
  ): void;

  returnRental(
    id: string
  ): void;

  getRental(
    id: string
  ): RentalRecord | undefined;

  contracts: RentalContractRecord[];

  addContract(
    contract: RentalContractRecord
  ): void;

  updateContract(
    contract: RentalContractRecord
  ): void;

  deleteContract(
    id: string
  ): void;

  getContract(
    id: string
  ): RentalContractRecord | undefined;
}

const RentalContext =
  createContext<
    RentalContextType | undefined
  >(undefined);

export function RentalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [rentals, setRentals] =
    useState<RentalRecord[]>(
      rentalRepository.getAll()
    );

  const [contracts, setContracts] =
    useState<RentalContractRecord[]>(
      rentalContractRepository.getAll()
    );

  function refreshRentals() {
    setRentals([
      ...rentalRepository.getAll(),
    ]);
  }

  function refreshContracts() {
    setContracts([
      ...rentalContractRepository.getAll(),
    ]);
  }

  function addRental(
    item: RentalRecord,
    equipment?: EquipmentRecord
  ) {
    const validation =
      validateRental(equipment);

    if (!validation.valid) {
      return {
        success: false,
        message:
          validation.message,
      };
    }

    rentalRepository.create(item);

    refreshRentals();

    return {
      success: true,
    };
  }

  function updateRental(
    item: RentalRecord
  ) {
    rentalRepository.update(item);

    refreshRentals();
  }

  function deleteRental(
    id: string
  ) {
    rentalRepository.delete(id);

    refreshRentals();
  }

  function returnRental(
    id: string
  ) {
    const rental =
      rentalRepository.getById(id);

    if (!rental) return;

    rentalRepository.update({
      ...rental,
      actualReturn:
        new Date()
          .toISOString()
          .split("T")[0],
      status: "Returned",
    });

    refreshRentals();
  }

  function getRental(
    id: string
  ) {
    return rentalRepository.getById(id);
  }

  function addContract(
    contract: RentalContractRecord
  ) {
    rentalContractRepository.create(
      contract
    );

    refreshContracts();
  }

  function updateContract(
    contract: RentalContractRecord
  ) {
    rentalContractRepository.update(
      contract
    );

    refreshContracts();
  }

  function deleteContract(
    id: string
  ) {
    rentalContractRepository.delete(
      id
    );

    refreshContracts();
  }

  function getContract(
    id: string
  ) {
    return contracts.find(
      (c) => c.id === id
    );
  }

  const value = useMemo(
    () => ({
      rentals,
      addRental,
      updateRental,
      deleteRental,
      returnRental,
      getRental,

      contracts,
      addContract,
      updateContract,
      deleteContract,
      getContract,
    }),
    [rentals, contracts]
  );

  return (
    <RentalContext.Provider
      value={value}
    >
      {children}
    </RentalContext.Provider>
  );
}

export function useRental() {
  const context =
    useContext(RentalContext);

  if (!context) {
    throw new Error(
      "useRental must be used within RentalProvider"
    );
  }

  return context;
}