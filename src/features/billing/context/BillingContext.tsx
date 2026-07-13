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
  
      save([
        ...billings,
        billing,
      ]);
  
    }
  
    function updateBilling(
      billing: BillingRecord
    ) {
  
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
        [billings]
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