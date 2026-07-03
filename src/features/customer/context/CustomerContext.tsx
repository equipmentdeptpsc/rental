import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type { CustomerRecord } from "../types";
  
  import { customerRepository } from "../repository";
  
  interface CustomerContextType {
    customers: CustomerRecord[];
  
    addCustomer(
      customer: CustomerRecord
    ): void;
  
    updateCustomer(
      customer: CustomerRecord
    ): void;
  
    deleteCustomer(
      id: string
    ): void;
  }
  
  const CustomerContext =
    createContext<
      CustomerContextType | undefined
    >(undefined);
  
  export function CustomerProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    const [customers, setCustomers] =
      useState(
        customerRepository.getAll()
      );
  
    function refresh() {
      setCustomers(
        customerRepository.getAll()
      );
    }
  
    function addCustomer(
      customer: CustomerRecord
    ) {
      customerRepository.create(customer);
      refresh();
    }
  
    function updateCustomer(
      customer: CustomerRecord
    ) {
      customerRepository.update(customer);
      refresh();
    }
  
    function deleteCustomer(
      id: string
    ) {
      customerRepository.delete(id);
      refresh();
    }
  
    const value = useMemo(
      () => ({
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
      }),
      [customers]
    );
  
    return (
      <CustomerContext.Provider
        value={value}
      >
        {children}
      </CustomerContext.Provider>
    );
  }
  
  export function useCustomer() {
    const context =
      useContext(CustomerContext);
  
    if (!context) {
      throw new Error(
        "useCustomer must be used inside CustomerProvider"
      );
    }
  
    return context;
  }