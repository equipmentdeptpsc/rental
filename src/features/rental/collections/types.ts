export interface CollectionTransaction {
  id: string;
  statementId: string;
  rentalId: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string;
  paymentMethod?: string;
  remarks?: string;
  recordedBy: string;
  recordedByUserId?: string;
  recordedAt: string;
}
