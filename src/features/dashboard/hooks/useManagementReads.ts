import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/integrations/supabase/browserClient";
import { comparisonPeriod, type DashboardComparison, type DashboardDateRange } from "../services/managementPeriods";

export interface ManagementFinancialSummary {
  revenue: number; priorRevenue: number; collections: number; priorCollections: number; outstanding: number;
  trend: Array<{ label: string; revenue: number; collections: number }>;
  topEquipment: Array<{ label: string; amount: number }>;
  topCustomers: Array<{ label: string; amount: number }>;
  topProjects: Array<{ label: string; amount: number }>;
}
export interface PendingManagementApprovals {
  rentalCount: number; billingCount: number;
  billingItems: Array<{ id: string; statement_no: string; rental_id: string; customer_snapshot: string; project_snapshot: string; grand_total: number; row_version: number; billing_from: string; billing_to: string; line_count: number; lines: Array<{ description: string; workDate: string; amount: number }> }>;
}
type ReadState<T> = { status: "idle" | "loading" | "error"; data?: T };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFinancialSummary = (value: unknown): value is ManagementFinancialSummary => isRecord(value)
  && value.success === true && typeof value.revenue === "number" && typeof value.collections === "number"
  && typeof value.outstanding === "number" && Array.isArray(value.trend)
  && Array.isArray(value.topEquipment) && Array.isArray(value.topCustomers) && Array.isArray(value.topProjects);
const isPendingApprovals = (value: unknown): value is PendingManagementApprovals => isRecord(value)
  && value.success === true && typeof value.rentalCount === "number" && typeof value.billingCount === "number"
  && Array.isArray(value.billingItems) && value.billingItems.every((item: unknown) => isRecord(item) && Array.isArray(item.lines));

export function useManagementReads(period: DashboardDateRange, comparison: DashboardComparison, refreshKey: number, financialEnabled: boolean, approvalsEnabled: boolean) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const [financial, setFinancial] = useState<ReadState<ManagementFinancialSummary>>({ status: "idle" });
  const [approvals, setApprovals] = useState<ReadState<PendingManagementApprovals>>({ status: "idle" });
  useEffect(() => {
    if (!supabaseUrl || !supabasePublishableKey) return;
    const client = getSupabaseBrowserClient({ url: supabaseUrl, publishableKey: supabasePublishableKey });
    const previous = comparisonPeriod(period, comparison);
    let active = true;
    if (financialEnabled) {
      setFinancial({ status: "loading" });
      void client.schema("erp").rpc("read_dashboard_management_financial_summary", {
        period_from: period.from, period_to: period.to, compare_from: previous.from, compare_to: previous.to,
      }).then(({ data, error }) => {
        if (!active) return;
        if (error || !isFinancialSummary(data)) {
          console.error("Dashboard financial summary read failed", error ?? data);
          setFinancial((current) => ({ ...current, status: "error" }));
        } else setFinancial({ status: "idle", data });
      });
    }
    if (approvalsEnabled) {
      setApprovals({ status: "loading" });
      void client.schema("erp").rpc("read_pending_management_approvals").then(({ data, error }) => {
        if (!active) return;
        if (error || !isPendingApprovals(data)) {
          console.error("Dashboard approval summary read failed", error ?? data);
          setApprovals((current) => ({ ...current, status: "error" }));
        } else setApprovals({ status: "idle", data });
      });
    }
    return () => { active = false; };
  }, [supabaseUrl, supabasePublishableKey, period.from, period.to, comparison, refreshKey, financialEnabled, approvalsEnabled]);
  return { financial, approvals };
}
