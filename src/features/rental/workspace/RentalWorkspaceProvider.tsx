import {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
  } from "react";
  
  import { RentalQueries } from "@/features/rental/queries";
  
  import {
    buildRentalAggregate,
    type RentalAggregate,
  } from "@/features/rental/aggregate";
  
  interface RentalWorkspaceProviderProps {
    rentalId: string;
  
    children: ReactNode;
  }
  
  interface RentalWorkspaceContextValue {
    aggregate: RentalAggregate;
  }
  
  const RentalWorkspaceContext =
    createContext<
      RentalWorkspaceContextValue | undefined
    >(undefined);
  
  export default function RentalWorkspaceProvider({
    rentalId,
    children,
  }: RentalWorkspaceProviderProps) {
    const aggregate = useMemo(() => {
      const rental =
        RentalQueries.getRental(
          rentalId
        );
  
      if (!rental) {
        return undefined;
      }
  
      const assignment =
        RentalQueries.getAssignment(
          rentalId
        );
  
      const equipment =
        RentalQueries.getEquipment(
          rental.equipmentId
        );
  
      const operator =
        assignment
          ? RentalQueries.getOperator(
              assignment.operatorId
            )
          : undefined;
  
      const project =
        RentalQueries.getProject(
          rental.project
        );
  
      return buildRentalAggregate({
        rental,
        equipment,
        assignment,
        operator,
        project,
      });
    }, [rentalId]);
  
    if (!aggregate) {
      return (
        <div className="rounded-xl border bg-white p-8">
          Rental not found.
        </div>
      );
    }
  
    return (
      <RentalWorkspaceContext.Provider
        value={{
          aggregate,
        }}
      >
        {children}
      </RentalWorkspaceContext.Provider>
    );
  }
  
  export function useRentalWorkspaceAggregate() {
    const context =
      useContext(
        RentalWorkspaceContext
      );
  
    if (!context) {
      throw new Error(
        "useRentalWorkspaceAggregate must be used inside RentalWorkspaceProvider."
      );
    }
  
    return context.aggregate;
  }