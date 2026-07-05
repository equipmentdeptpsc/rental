import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { RentalRecord } from "../types";
import { rentalRepository } from "../repository";

interface RentalContextType {
  rentals: RentalRecord[];

  addRental(item: RentalRecord): void;

  updateRental(item: RentalRecord): void;

  deleteRental(id: string): void;

  returnRental(id: string): void;

  getRental(id: string): RentalRecord | undefined;
}

const RentalContext = createContext<
  RentalContextType | undefined
>(undefined);

export function RentalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [rentals, setRentals] = useState<RentalRecord[]>(
    rentalRepository.getAll()
  );

  function refresh() {
    setRentals([...rentalRepository.getAll()]);
  }

  function addRental(item: RentalRecord): void {
    rentalRepository.create(item);
    refresh();
  }

  function updateRental(item: RentalRecord): void {
    rentalRepository.update(item);
    refresh();
  }

  function deleteRental(id: string): void {
    rentalRepository.delete(id);
    refresh();
  }

  function returnRental(id: string): void {
    const rental = rentalRepository.getById(id);

    if (!rental) return;

    rentalRepository.update({
      ...rental,
      actualReturn: new Date().toISOString().split("T")[0],
      status: "Returned",
    });

    refresh();
  }

  function getRental(id: string): RentalRecord | undefined {
    return rentalRepository.getById(id);
  }

  const value = useMemo(
    () => ({
      rentals,
      addRental,
      updateRental,
      deleteRental,
      returnRental,
      getRental,
    }),
    [rentals]
  );

  return (
    <RentalContext.Provider value={value}>
      {children}
    </RentalContext.Provider>
  );
}

export function useRental() {
  const context = useContext(RentalContext);

  if (!context) {
    throw new Error(
      "useRental must be used within RentalProvider"
    );
  }

  return context;
}