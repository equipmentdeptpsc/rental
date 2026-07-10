import {
    useMemo,
    useState,
  } from "react";
  
  import {
    billingStatementRepository,
  } from "@/features/rental/billingstatement/repository";
  
  import {
    deurRepository,
  } from "@/features/rental/deur/repository/deurRepository";
  
  export function useBillingDrafts() {
  
    const [
      keyword,
      setKeyword,
    ] = useState("");
  
    const [
      version,
      setVersion,
    ] = useState(0);
  
    const drafts =
      useMemo(
  
        () =>
  
          billingStatementRepository.search(
            keyword
          ),
  
        [
          keyword,
          version,
        ]
  
      );
  
    function refresh() {
  
      setVersion(
        value => value + 1
      );
  
    }
  
    function deleteDraft(
      id: string
    ) {
  
      const confirmed =
        window.confirm(
          "Delete this Billing Statement?"
        );
  
      if (!confirmed) {
        return;
      }
  
      const deleted =
        billingStatementRepository.delete(
          id
        );
  
      if (!deleted) {
        return;
      }
  
      deurRepository.unlockBilling(
        deleted.id
      );
  
      refresh();
  
    }
  
    return {
  
      drafts,
  
      keyword,
  
      setKeyword,
  
      refresh,
  
      deleteDraft,
  
    };
  
  }