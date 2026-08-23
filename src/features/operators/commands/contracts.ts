import type { OperationalCommandMetadata, OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

export const OPERATOR_CERTIFICATION_TYPES = ["None", "Heavy Machinery", "Forklift", "Crane Logistics"] as const;
export type OperatorCertificationType = typeof OPERATOR_CERTIFICATION_TYPES[number];

export interface CreateOperatorCommand extends OperationalCommandMetadata {
  operatorId: string;
  name: string;
  email?: string;
  licenseNumber?: string;
  certificationType?: OperatorCertificationType;
  joinedDate?: string;
}

export interface OperatorCreationProjection {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  licenseNumber: string | null;
  certificationType: OperatorCertificationType;
  status: "Active";
  joinedDate: string | null;
  deletedAt: null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface OperatorCommandRepository {
  createOperator(command: CreateOperatorCommand): Promise<OperationalCommandResult<OperatorCreationProjection>>;
}
