import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
  } from "react";
  
  import type { CustomerRecord } from "../types";
  
  import { customerRepository } from "../repository";
  import { guardCustomerDeletion } from "@/features/relationships/deletionGuards";
  import { useOptionalAuth } from "@/features/auth/AuthContext";
  import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
  
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
    ): { success: boolean; message?: string };
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
    const auth = useOptionalAuth();
    const authorize = () => {
      if (auth && !auth.hasPermission("customer.manage")) throw new AuthorizationError("customer.manage");
    };
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
      authorize();
      customerRepository.create(customer);
      refresh();
    }
  
    function updateCustomer(
      customer: CustomerRecord
    ) {
      authorize();
      customerRepository.update(customer);
      refresh();
    }
  
    function deleteCustomer(
      id: string
    ) {
      authorize();
      const result = guardCustomerDeletion(id);

      if (!result.success) return result;

      customerRepository.delete(id);
      refresh();

      return result;
    }
  
    const value = useMemo(
      () => ({
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
      }),
      [auth, customers]
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
