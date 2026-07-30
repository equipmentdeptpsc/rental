import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type {
    BillingRecord,
  } from "../types";
  
  import {
    billingRepository,
  } from "../repository/BillingRepository";
  import { useOptionalAuth } from "@/features/auth/AuthContext";
  import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
  
  interface BillingContextType {
  
    billings: BillingRecord[];
  
    addBilling(
      billing: BillingRecord
    ): void;
  
    updateBilling(
      billing: BillingRecord
    ): void;
  
  }
  
  const BillingContext =
    createContext<
      BillingContextType | undefined
    >(undefined);
  
  export function BillingProvider({
  
    children,
  
  }: {
  
    children: ReactNode;
  
  }) {
    const auth = useOptionalAuth();
    const authorize = (permission: "billing.create" | "billing.update") => {
      if (auth && !auth.hasPermission(permission)) throw new AuthorizationError(permission);
    };
  
    const [
      billings,
      setBillings,
    ] = useState(
      billingRepository.getAll()
    );
  
    function save(
      records: BillingRecord[]
    ) {
  
      setBillings(records);
  
      billingRepository.saveAll(
        records
      );
  
    }
  
    function addBilling(
      billing: BillingRecord
    ) {
      authorize("billing.create");
  
      save([
        ...billings,
        billing,
      ]);
  
    }
  
    function updateBilling(
      billing: BillingRecord
    ) {
      authorize("billing.update");
  
      save(
        billings.map(
          b =>
            b.id === billing.id
              ? billing
              : b
        )
      );
  
    }
  
    const value =
      useMemo(
        () => ({
          billings,
  
          addBilling,
  
          updateBilling,
  
        }),
        [auth, billings]
      );
  
    return (
  
      <BillingContext.Provider
        value={value}
      >
  
        {children}
  
      </BillingContext.Provider>
  
    );
  
  }
  
  export function useBilling() {
  
    const context =
      useContext(
        BillingContext
      );
  
    if (!context) {
  
      throw new Error(
        "useBilling must be used within BillingProvider"
      );
  
    }
  
    return context;
  
  }
