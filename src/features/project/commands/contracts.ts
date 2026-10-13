import type { OperationalCommandMetadata, OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

export interface CreateProjectCommand extends OperationalCommandMetadata {
  projectId: string;
  projectCode: string;
  name: string;
  location?: string;
  customerId?: string;
}

export interface ProjectCreationProjection {
  id: string;
  companyId: string;
  projectCode: string;
  name: string;
  customerId: string | null;
  location: string | null;
  active: true;
  deletedAt: null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface UpdateProjectCustomerCommand extends OperationalCommandMetadata {
  projectId: string;
  customerId: string;
  expectedVersion: number;
}

export interface ProjectCustomerLinkProjection {
  id: string;
  companyId: string;
  customerId: string;
  rowVersion: number;
}

export interface ProjectReviewRecipient { name: string; email: string }

export interface ProjectReviewRecipientProjection {
  projectId: string;
  recipients: ProjectReviewRecipient[];
  rowVersion: number;
}

export interface UpdateProjectReviewRecipientsCommand extends OperationalCommandMetadata {
  projectId: string;
  recipients: ProjectReviewRecipient[];
  expectedVersion: number;
}

export interface ProjectCommandRepository {
  createProject(command: CreateProjectCommand): Promise<OperationalCommandResult<ProjectCreationProjection>>;
  updateProjectCustomer?(command: UpdateProjectCustomerCommand): Promise<OperationalCommandResult<ProjectCustomerLinkProjection>>;
  readProjectReviewRecipients?(projectId: string): Promise<{ success: true; value: ProjectReviewRecipientProjection } | { success: false; message: string }>;
  updateProjectReviewRecipients?(command: UpdateProjectReviewRecipientsCommand): Promise<OperationalCommandResult<ProjectReviewRecipientProjection>>;
}
