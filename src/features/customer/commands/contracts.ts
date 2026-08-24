import type { OperationalCommandMetadata, OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

export interface CreateCustomerCommand extends OperationalCommandMetadata {
  customerId: string;
  customerCode: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface CustomerCreationProjection {
  id: string;
  companyId: string;
  customerCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  active: true;
  deletedAt: null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface CustomerCommandRepository {
  createCustomer(command: CreateCustomerCommand): Promise<OperationalCommandResult<CustomerCreationProjection>>;
}
