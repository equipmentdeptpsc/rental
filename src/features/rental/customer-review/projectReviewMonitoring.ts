export interface ProjectReviewMonitoring {
  rentalId: string;
  customerId: string;
  customerName: string;
  projectId: string;
  projectName: string;
  configuredReviewers: Array<{ name: string; email: string }>;
  batches: Array<{
    batchId: string;
    scope: "PROJECT" | "RENTAL";
    reviewDate: string;
    businessTimezone: string;
    finalizedAt?: string;
    supersededAt?: string;
    supersededByBatchId?: string;
    recipientSnapshot: Array<{ name: string; email: string }>;
    recipientVersion: number;
    notifications: Array<{ recipient: string; state: string; createdAt: string; sentAt?: string }>;
    items: Array<{
      rentalId: string;
      rentalLineId: string;
      deurId?: string;
      deurNumber?: string;
      deurStatus?: string;
      revisionId?: string;
      workDate?: string;
      reviewStatus: string;
      submittedAt?: string;
      acknowledgedAt?: string;
      requestIssuedAt?: string;
      requestConsumedAt?: string;
    }>;
  }>;
}

export interface ProjectReviewMonitoringRepository {
  read(rentalId: string): Promise<ProjectReviewMonitoring>;
}
