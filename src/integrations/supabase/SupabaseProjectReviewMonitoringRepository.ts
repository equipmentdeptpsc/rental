import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectReviewMonitoring, ProjectReviewMonitoringRepository } from "@/features/rental/customer-review/projectReviewMonitoring";

export class SupabaseProjectReviewMonitoringRepository implements ProjectReviewMonitoringRepository {
  constructor(private readonly client: SupabaseClient) {}

  async read(rentalId: string): Promise<ProjectReviewMonitoring> {
    const { data, error } = await this.client.schema("erp").rpc("read_project_customer_review_for_rental", {
      target_rental_id: rentalId,
    });
    if (error || !data || typeof data !== "object") {
      throw new Error(error?.code === "42501" ? "You do not have permission to view Project Customer Review." : "Project Customer Review could not be loaded.");
    }
    return data as unknown as ProjectReviewMonitoring;
  }
}
